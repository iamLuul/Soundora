import { Ionicons } from '@expo/vector-icons';
import { reportReasonSchema } from '@soundora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RingAvatar } from '../../components/figma';
import { OptionsSheet, type SheetOption } from '../../components/OptionsSheet';
import { VibeAudio } from '../../components/vibes/VibeAudio';
import { VibeContent } from '../../components/vibes/VibeContent';
import { deleteVibe, fetchVibeViewers, markVibeSeen, report, type Vibe } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatError } from '../../lib/errors';
import { relativeTime } from '../../lib/i18n';
import { keys, useVibeMedia, useVibesOf, useVibesTray } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';
import { uniqueBy } from '../../lib/hooks';
import { PeopleSkeleton } from '../../components/Skeleton';

/** Tempo de cada vibe sem vídeo. */
const STILL_MS = 5000;
/** Vibe de música com prévia: 15 s tocando, como nos Stories. */
const MUSIC_MS = 15_000;
const TICK_MS = 50;

function notify(message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Soundora', message);
}

type Params = { author: string; queue?: string; username?: string; avatar?: string };

/**
 * Ver as vibes de uma pessoa em tela cheia. Toque à direita avança, à esquerda volta,
 * segurar pausa. No fim, passa para a próxima pessoa da fila (queue) ou fecha.
 */
export default function VibeViewerScreen() {
  const { t } = useTranslation();
  const { author, queue, username: paramUsername, avatar: paramAvatar } = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tray = useVibesTray();
  const vibes = useVibesOf(author);
  const list = useMemo(() => uniqueBy(vibes.data ?? [], (v) => v.id, 'vibes'), [vibes.data]);
  const isMine = profile?.id === author;
  const who = tray.data?.find((x) => x.author_id === author);
  const username = who?.username ?? (isMine ? profile?.username : paramUsername) ?? '';
  const avatar = who?.avatar_url ?? (isMine ? profile?.avatar_url : paramAvatar) ?? null;

  // Começa na primeira que eu ainda não vi (as minhas: do começo).
  const startIndex = useMemo(() => {
    if (!vibes.data) return null;
    const firstUnseen = isMine ? -1 : vibes.data.findIndex((v) => !v.seen);
    return firstUnseen >= 0 ? firstUnseen : 0;
  }, [vibes.data, isMine]);
  const [chosen, setChosen] = useState<number | null>(null);
  const index = chosen ?? startIndex;
  const setIndex = (update: (i: number | null) => number | null) => setChosen((c) => update(c ?? startIndex));
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [holding, setHolding] = useState(false);
  const [muted, setMuted] = useState(false);
  const [menu, setMenu] = useState<null | 'options' | 'report'>(null);
  const [viewersFor, setViewersFor] = useState<string | null>(null);

  const current: Vibe | undefined = index !== null ? list[index] : undefined;
  const media = useVibeMedia(current?.media_path ?? null);
  const mediaReady = !current?.media_path || !!media.data;
  const audioUrl = current?.kind === 'music' ? current.preview_audio_url : null;
  const duration = current?.kind === 'video' ? (current.duration_ms ?? STILL_MS) : audioUrl ? MUSIC_MS : STILL_MS;
  const paused = holding || !!menu || !!viewersFor || !mediaReady;

  const close = useCallback(() => {
    void qc.invalidateQueries({ queryKey: keys.vibesTray });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [qc]);

  const nextAuthor = useCallback(() => {
    const rest = (queue ?? '').split(',').filter(Boolean);
    if (!rest.length) return close();
    const [next, ...others] = rest;
    void qc.invalidateQueries({ queryKey: keys.vibesTray });
    router.replace({ pathname: '/vibes/[author]', params: { author: next!, queue: others.join(',') } });
  }, [queue, close, qc]);

  const resetClock = () => {
    elapsedRef.current = 0;
    setElapsed(0);
  };

  const goNext = useCallback(() => {
    elapsedRef.current = 0;
    setElapsed(0);
    const i = chosen ?? startIndex;
    if (i === null) return;
    if (i < list.length - 1) setChosen(i + 1);
    else nextAuthor();
  }, [chosen, startIndex, list.length, nextAuthor]);

  const goPrev = () => {
    resetClock();
    setIndex((i) => (i === null ? i : Math.max(0, i - 1)));
  };

  // Marca como vista ao aparecer.
  const seenRef = useRef(new Set<string>());
  useEffect(() => {
    if (!current || isMine || seenRef.current.has(current.id)) return;
    seenRef.current.add(current.id);
    markVibeSeen(current.id).catch(() => undefined);
  }, [current, isMine]);

  // Relógio da barra de progresso. No vídeo, quem manda é o fim real (onVideoEnd); o relógio
  // tem 1 s de folga só para não travar se o aviso não chegar.
  const limit = duration + (current?.kind === 'video' ? 1000 : 0);
  useEffect(() => {
    if (!current || paused) return;
    const id = setInterval(() => {
      elapsedRef.current += TICK_MS;
      if (elapsedRef.current >= limit) goNext();
      else setElapsed(elapsedRef.current);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [current, paused, limit, goNext]);

  // Ninguém tem vibe ativa (venceu ou foi apagada): segue para a próxima pessoa.
  const empty = vibes.isSuccess && list.length === 0;
  useEffect(() => {
    if (!empty) return;
    const id = setTimeout(nextAuthor, 0);
    return () => clearTimeout(id);
  }, [empty, nextAuthor]);

  // Toque curto navega (onPress); segurar pausa (onLongPress cancela o onPress).
  const hold = {
    onPressIn: () => setHolding(true),
    onPressOut: () => setHolding(false),
    onLongPress: () => setHolding(true),
    delayLongPress: 250,
  };

  const remove = async () => {
    if (!current) return;
    setMenu(null);
    try {
      await deleteVibe(current.id);
      await qc.invalidateQueries({ queryKey: ['vibes'] });
      if (list.length <= 1) close();
      else {
        resetClock();
        setIndex((i) => Math.min(i ?? 0, list.length - 2));
      }
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  const options: SheetOption[] = isMine
    ? [{ key: 'delete', label: t('vibes.delete'), icon: 'trash-outline', danger: true, onPress: remove }]
    : [
        { key: 'profile', label: t('vibes.viewProfile'), icon: 'person-outline', onPress: () => (setMenu(null), router.push(`/u/${username}`)) },
        { key: 'report', label: t('feed.report'), icon: 'flag-outline', onPress: () => setMenu('report') },
      ];
  const reasons: SheetOption[] = reportReasonSchema.options.map((reason) => ({
    key: reason,
    label: t(`report.${reason}`),
    icon: 'flag-outline',
    onPress: async () => {
      setMenu(null);
      if (!current) return;
      try {
        await report('vibe', current.id, reason);
        notify(t('feed.reported'));
      } catch (err) {
        notify(formatError(t, err));
      }
    },
  }));

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />

      {!current ? (
        <ActivityIndicator color={colors.text} style={{ flex: 1 }} />
      ) : (
        <>
          <VibeContent
            key={current.id}
            kind={current.kind}
            mediaUri={media.data ?? null}
            text={current.text}
            textPos={current.text_x != null && current.text_y != null ? { x: current.text_x, y: current.text_y } : null}
            style={current.style}
            paused={paused}
            onVideoEnd={goNext}
            music={
              current.kind === 'music' && current.preview_url
                ? { url: current.preview_url, platform: current.preview_platform ?? '', title: current.preview_title ?? '', artist: current.preview_artist, imageUrl: current.preview_image_url }
                : null
            }
            post={
              current.kind === 'post' && current.post_id
                ? {
                    id: current.post_id,
                    username: current.post_author_username ?? '',
                    avatarUrl: current.post_author_avatar_url,
                    body: current.post_body,
                    music: current.preview_url
                      ? { url: current.preview_url, platform: current.preview_platform ?? '', title: current.preview_title ?? '', artist: current.preview_artist, imageUrl: current.preview_image_url }
                      : null,
                  }
                : null
            }
          />

          {/* Prévia de 30 s da loja, de fundo (a key recomeça a música a cada vibe). */}
          {audioUrl ? <VibeAudio key={`audio-${current.id}`} url={audioUrl} paused={paused} muted={muted} /> : null}

          {/* Faixas de toque: esquerda volta, direita avança. O meio fica livre para os botões da vibe. */}
          <Pressable testID="vibe-prev" accessibilityRole="button" accessibilityLabel={t('vibes.previous')} style={[styles.zone, { left: 0 }]} onPress={goPrev} {...hold} />
          <Pressable testID="vibe-next" accessibilityRole="button" accessibilityLabel={t('vibes.next')} style={[styles.zone, { right: 0 }]} onPress={goNext} {...hold} />

          <View style={[styles.header, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
            <View style={styles.bars}>
              {list.map((v, i) => (
                <View key={v.id} style={styles.bar}>
                  <View
                    style={[
                      styles.barFill,
                      { width: i < (index ?? 0) ? '100%' : i === index ? `${Math.min(100, (elapsed / duration) * 100)}%` : '0%' },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.who}>
              <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${username}`)} style={styles.whoLeft}>
                <RingAvatar uri={avatar} name={username} size={34} />
                <Text style={styles.username}>@{username}</Text>
                <Text style={styles.time}>{relativeTime(current.created_at)}</Text>
              </Pressable>
              {audioUrl ? (
                <Pressable
                  testID="vibe-mute"
                  accessibilityRole="button"
                  accessibilityLabel={muted ? t('vibes.unmute') : t('vibes.mute')}
                  onPress={() => setMuted((m) => !m)}
                  hitSlop={10}
                >
                  <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={colors.text} />
                </Pressable>
              ) : null}
              <Pressable testID="vibe-menu" accessibilityRole="button" accessibilityLabel={t('vibes.options')} onPress={() => setMenu('options')} hitSlop={10}>
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </Pressable>
              <Pressable testID="vibe-close" accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} hitSlop={10}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
          </View>

          {isMine ? (
            <Pressable
              testID="vibe-viewers"
              accessibilityRole="button"
              onPress={() => setViewersFor(current.id)}
              style={[styles.viewersButton, { bottom: insets.bottom + space.lg }]}
            >
              <Ionicons name="eye-outline" size={18} color={colors.text} />
              <Text style={styles.viewersText}>{t('vibes.views', { count: current.view_count ?? 0 })}</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <OptionsSheet visible={menu === 'options'} options={options} onClose={() => setMenu(null)} />
      <OptionsSheet visible={menu === 'report'} title={t('report.title')} options={reasons} onClose={() => setMenu(null)} />
      <ViewersSheet vibeId={viewersFor} onClose={() => setViewersFor(null)} />
    </View>
  );
}

function ViewersSheet({ vibeId, onClose }: { vibeId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const viewers = useQuery({ queryKey: ['vibe-viewers', vibeId], queryFn: () => fetchVibeViewers(vibeId!), enabled: !!vibeId });
  return (
    <Modal visible={!!vibeId} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>{t('vibes.viewersTitle')}</Text>
          {viewers.isLoading ? (
            <PeopleSkeleton count={4} avatar={36} />
          ) : (
            <FlatList
              data={viewers.data ?? []}
              keyExtractor={(v) => v.username}
              ListEmptyComponent={<Text style={styles.empty}>{t('vibes.noViewers')}</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.viewerRow}
                  accessibilityRole="link"
                  onPress={() => {
                    onClose();
                    router.push(`/u/${item.username}`);
                  }}
                >
                  <RingAvatar uri={item.avatar_url} name={item.display_name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewerName}>{item.display_name}</Text>
                    <Text style={styles.viewerHandle}>@{item.username}</Text>
                  </View>
                  <Text style={styles.time}>{relativeTime(item.viewed_at)}</Text>
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  zone: { position: 'absolute', top: 90, bottom: 90, width: '30%' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md, gap: space.sm },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: colors.text },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  whoLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  username: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  time: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, opacity: 0.8 },
  viewersButton: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  viewersText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '60%', backgroundColor: colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: space.lg, gap: space.md },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, textAlign: 'center' },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: space.lg },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  viewerName: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  viewerHandle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
});
