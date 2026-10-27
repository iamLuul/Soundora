import Ionicons from '@expo/vector-icons/Ionicons';
import { reportReasonSchema } from '@soundhora/core';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RingAvatar } from '../../components/figma';
import { OptionsSheet, type SheetOption } from '../../components/OptionsSheet';
import { VibeContent } from '../../components/vibes/VibeContent';
import { vibeCanvas } from '../../lib/vibe-canvas';
import { deleteVibe, fetchVibesOf, fetchVibeViewers, markVibeSeen, report, vibeMediaUrl, type Vibe } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatError } from '../../lib/errors';
import { relativeTime } from '../../lib/i18n';
import { keys, useVibeMedia, useVibesOf, useVibesTray } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';
import { uniqueBy } from '../../lib/hooks';
import { PeopleSkeleton } from '../../components/Skeleton';
import { Spinner } from '../../components/Spinner';
import { SheetBackdrop } from '../../components/ui';
import { webTouch } from '../../lib/touch';
import { Verified } from '../../components/Verified';
import { confirmAction, notify } from '../../lib/dialogs';
import { showToast } from '../../components/Toast';
import { CoachMarks, useFirstTimeTip } from '../../components/CoachMarks';
import { itemsOf } from '../../components/vibes/textStyle';
import { AdVibe } from '../../components/ads/AdVibe';
import { useAds, withAds } from '../../lib/ads';

/** Tempo de cada vibe sem vídeo. */
const STILL_MS = 5000;
/** Vibe de música com prévia: 15 s tocando, como nos Stories. */
const TICK_MS = 50;

type Params = { author: string; queue?: string; username?: string; avatar?: string };

/**
 * Ver vibes em tela cheia. Toque à direita avança, à esquerda volta, segurar pausa.
 * A tela abre uma vez para a fila toda (a pessoa tocada e as seguintes): quando as vibes de
 * alguém acabam, as da próxima pessoa entram na hora, sem fechar e abrir de novo. Voltar na
 * primeira vibe de alguém leva à pessoa anterior. No fim da fila, fecha.
 * Com os anúncios ligados, uma vibe anunciada entra entre duas pessoas a cada N pessoas (nunca
 * no fim). A fila (com os anúncios) é montada ao abrir e não muda enquanto a tela está aberta.
 */
export default function VibeViewerScreen() {
  const { author, queue, username, avatar } = useLocalSearchParams<Params>();
  const qc = useQueryClient();
  const ads = useAds();
  const [slots] = useState(() => withAds([...new Set([author, ...(queue ?? '').split(',')].filter(Boolean))], ads.vibesEvery));
  const [pos, setPos] = useState(0);

  const close = useCallback(() => {
    void qc.invalidateQueries({ queryKey: keys.vibesTray });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [qc]);

  const next = useCallback(() => {
    if (pos >= slots.length - 1) close();
    else setPos(pos + 1);
  }, [pos, slots.length, close]);
  const previous = useCallback(() => setPos((p) => Math.max(0, p - 1)), []);

  // Já busca as vibes (e a primeira mídia) da próxima pessoa, para a troca ser imediata.
  const upcoming = slots.slice(pos + 1).find((s) => s.kind === 'item')?.item;
  useEffect(() => {
    if (upcoming) void prefetchAuthor(qc, upcoming);
  }, [qc, upcoming]);

  // Arrastar para baixo fecha (como no Story); a tela acompanha o dedo.
  const drag = useSharedValue(0);
  const swipe = Gesture.Pan()
    .withTestId('vibe-swipe')
    .activeOffsetY(18)
    .failOffsetX([-18, 18])
    .onUpdate((e) => {
      'worklet';
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) scheduleOnRN(close);
      else drag.value = withTiming(0, { duration: 180 });
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }, { scale: 1 - Math.min(drag.value / 2000, 0.12) }],
    borderRadius: drag.value > 0 ? 20 : 0,
  }));

  const slot = slots[pos]!;
  return (
    <GestureDetector gesture={swipe}>
      <Animated.View style={[styles.screen, dragStyle]}>
        <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        {slot.kind === 'ad' ? (
          <AdVibe key={`ad-${slot.slot}`} slot={slot.slot} hasPrevious={pos > 0} onDone={next} onPrevious={previous} onClose={close} />
        ) : (
          <AuthorVibes
            key={slot.item}
            author={slot.item}
            // Nome e foto vindos da Home só valem para a primeira pessoa (as outras vêm da fila de vibes).
            fallbackUsername={pos === 0 ? username : undefined}
            fallbackAvatar={pos === 0 ? avatar : undefined}
            hasPrevious={pos > 0}
            onDone={next}
            onPrevious={previous}
            onClose={close}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

async function prefetchAuthor(qc: QueryClient, authorId: string) {
  const list = await qc.fetchQuery({ queryKey: keys.vibesOf(authorId), queryFn: () => fetchVibesOf(authorId), staleTime: 30_000 }).catch(() => null);
  const first = list?.find((v) => !v.seen) ?? list?.[0];
  if (!first?.media_path) return;
  const path = first.media_path;
  const url = await qc.fetchQuery({ queryKey: ['vibe-media', path], queryFn: () => vibeMediaUrl(path), staleTime: 50 * 60_000 }).catch(() => null);
  if (url && first.kind === 'photo') void Image.prefetch(url).catch(() => undefined);
}

/** As vibes de uma pessoa. Muda de pessoa trocando a key (o resto da tela continua aberto). */
function AuthorVibes({
  author,
  fallbackUsername,
  fallbackAvatar,
  hasPrevious,
  onDone,
  onPrevious,
  onClose: close,
}: {
  author: string;
  fallbackUsername?: string;
  fallbackAvatar?: string;
  hasPrevious: boolean;
  onDone: () => void;
  onPrevious: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Primeira vez vendo vibes: tocar para passar, segurar para pausar (a vibe espera a dica fechar).
  const [tipOpen, closeTip] = useFirstTimeTip('vibe-view');
  const insets = useSafeAreaInsets();
  const canvas = vibeCanvas(useWindowDimensions(), insets);
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tray = useVibesTray();
  const vibes = useVibesOf(author);
  const list = useMemo(() => uniqueBy(vibes.data ?? [], (v) => v.id, 'vibes'), [vibes.data]);
  const isMine = profile?.id === author;
  const who = tray.data?.find((x) => x.author_id === author);
  const username = who?.username ?? (isMine ? profile?.username : fallbackUsername) ?? '';
  const avatar = who?.avatar_url ?? (isMine ? profile?.avatar_url : fallbackAvatar) ?? null;

  // Começa na primeira que eu ainda não vi (as minhas: do começo). Fica fixo depois de calculado,
  // para uma nova busca (com as vistas já marcadas) não pular a vibe que está na tela.
  const [frozenStart, setFrozenStart] = useState<number | null>(null);
  const firstUnseen = vibes.data ? (isMine ? -1 : vibes.data.findIndex((v) => !v.seen)) : null;
  const computedStart = firstUnseen === null ? null : Math.max(0, firstUnseen);
  if (frozenStart === null && computedStart !== null) setFrozenStart(computedStart);
  const startIndex = frozenStart ?? computedStart;
  const [chosen, setChosen] = useState<number | null>(null);
  const index = chosen ?? startIndex;
  const setIndex = (update: (i: number | null) => number | null) => setChosen((c) => update(c ?? startIndex));
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [holding, setHolding] = useState(false);
  const [menu, setMenu] = useState<null | 'options' | 'report'>(null);
  const [viewersFor, setViewersFor] = useState<string | null>(null);

  const current: Vibe | undefined = index !== null ? list[index] : undefined;
  const media = useVibeMedia(current?.media_path ?? null);
  const mediaReady = !current?.media_path || !!media.data;
  // Vibe de música não toca prévia (as licenças das lojas não cobrem esse uso): é só o cartão.
  const duration = current?.kind === 'video' ? (current.duration_ms ?? STILL_MS) : STILL_MS;
  const paused = holding || !!menu || !!viewersFor || !mediaReady || tipOpen;

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
    else onDone();
  }, [chosen, startIndex, list.length, onDone]);

  const goPrev = () => {
    resetClock();
    if ((index ?? 0) === 0 && hasPrevious) return onPrevious();
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
    const id = setTimeout(onDone, 0);
    return () => clearTimeout(id);
  }, [empty, onDone]);

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
    if (!(await confirmAction(t('confirm.deleteVibe'), t('confirm.delete'), t('common.cancel')))) return;
    try {
      await deleteVibe(current.id);
      showToast(t('toast.vibeDeleted'));
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
        showToast(t('feed.reported'));
      } catch (err) {
        notify(formatError(t, err));
      }
    },
  }));

  return (
    <>
      <CoachMarks
        testID="coach-vibe-view"
        visible={tipOpen}
        onClose={closeTip}
        steps={[{ icon: 'hand-left-outline', title: t('tips.vibeViewTitle'), body: t('tips.vibeViewBody') }]}
      />
      {!current ? (
        <Spinner color={colors.text} style={{ flex: 1 }} />
      ) : (
        <View style={[styles.card, { top: canvas.top, left: canvas.left, width: canvas.width, height: canvas.height }]}>
          <VibeContent
            key={current.id}
            kind={current.kind}
            mediaUri={media.data ?? null}
            textItems={itemsOf(current)}
            style={current.style}
            paused={paused}
            onVideoEnd={goNext}
            post={
              current.kind === 'post' && current.post_id
                ? {
                    id: current.post_id,
                    username: current.post_author_username ?? '',
                    avatarUrl: current.post_author_avatar_url,
                    body: current.post_body,
                    music: current.preview_url
                      ? {
                          url: current.preview_url,
                          platform: current.preview_platform ?? '',
                          title: current.preview_title ?? '',
                          artist: current.preview_artist,
                          imageUrl: current.preview_image_url,
                        }
                      : null,
                  }
                : null
            }
          />

          {/* Faixas de toque: esquerda volta, direita avança. O meio fica livre para os botões da vibe. */}
          <Pressable
            testID="vibe-prev"
            accessibilityRole="button"
            accessibilityLabel={t('vibes.previous')}
            style={[styles.zone, { left: 0 }]}
            onPress={goPrev}
            {...hold}
          />
          <Pressable
            testID="vibe-next"
            accessibilityRole="button"
            accessibilityLabel={t('vibes.next')}
            style={[styles.zone, { right: 0 }]}
            onPress={goNext}
            {...hold}
          />

          {/* Segurando: a interface some e fica só a vibe (como no Story). */}
          <View style={[styles.header, holding && { opacity: 0 }]} pointerEvents="box-none">
            <Svg width="100%" height={110} style={styles.shade} pointerEvents="none">
              <Defs>
                <LinearGradient id="vibe-shade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity={0.45} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="110" fill="url(#vibe-shade)" />
            </Svg>
            <View style={styles.bars}>
              {list.map((v, i) => (
                <View key={v.id} style={styles.bar}>
                  <View style={[styles.barFill, { width: i < (index ?? 0) ? '100%' : i === index ? `${Math.min(100, (elapsed / duration) * 100)}%` : '0%' }]} />
                </View>
              ))}
            </View>
            <View style={styles.who}>
              <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${username}`)} style={styles.whoLeft}>
                <RingAvatar uri={avatar} name={username} size={34} />
                <Text style={styles.username}>@{username}</Text>
                <Verified username={username} />
                <Text style={styles.time}>{relativeTime(current.created_at)}</Text>
              </Pressable>
              <Pressable
                testID="vibe-menu"
                accessibilityRole="button"
                accessibilityLabel={t('vibes.options')}
                onPress={() => setMenu('options')}
                hitSlop={10}
                style={webTouch(10)}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                testID="vibe-close"
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={close}
                hitSlop={10}
                style={webTouch(10)}
              >
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {current ? (
        <>
          {isMine ? (
            <Pressable
              testID="vibe-viewers"
              accessibilityRole="button"
              onPress={() => setViewersFor(current.id)}
              style={[styles.viewersButton, { top: canvas.top + canvas.height + space.md }]}
            >
              <Ionicons name="eye-outline" size={18} color={colors.text} />
              <Text style={styles.viewersText}>{t('vibes.views', { count: current.view_count ?? 0 })}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <OptionsSheet visible={menu === 'options'} options={options} onClose={() => setMenu(null)} />
      <OptionsSheet visible={menu === 'report'} title={t('report.title')} options={reasons} onClose={() => setMenu(null)} />
      <ViewersSheet vibeId={viewersFor} onClose={() => setViewersFor(null)} />
    </>
  );
}

function ViewersSheet({ vibeId, onClose }: { vibeId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const viewers = useQuery({ queryKey: ['vibe-viewers', vibeId], queryFn: () => fetchVibeViewers(vibeId!), enabled: !!vibeId });
  return (
    <Modal visible={!!vibeId} transparent animationType="slide" onRequestClose={onClose}>
      <SheetBackdrop style={styles.backdrop} onClose={onClose} label={t('common.close')}>
        <View style={styles.sheet}>
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
        </View>
      </SheetBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  card: { position: 'absolute', borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  zone: { position: 'absolute', top: 90, bottom: 0, width: '30%' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm },
  shade: { position: 'absolute', top: 0, left: 0, right: 0 },
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
