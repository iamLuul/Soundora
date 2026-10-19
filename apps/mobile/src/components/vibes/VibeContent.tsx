import { PLATFORM_LABELS, type Platform } from '@soundhora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VibeKind, VibeStyle, VibeTextItem } from '../../lib/api';
import { colors, fonts, space } from '../../theme';
import { PlatformLogo, RingAvatar } from '../figma';
import { VIBE_BACKGROUND } from './colors';
import { VibeTextOverlay } from './VibeText';
import { VibeVideo } from './VibeVideo';
import { Spinner } from '../Spinner';

export interface VibeMusic {
  url: string;
  platform: string;
  title: string;
  artist: string | null;
  imageUrl: string | null;
}

export interface VibeSharedPost {
  id: string;
  username: string;
  avatarUrl: string | null;
  body: string | null;
  music: VibeMusic | null;
}

export interface VibeContentProps {
  kind: VibeKind;
  /** Foto/vídeo: arquivo local (ao criar) ou URL assinada (ao ver). null = ainda carregando. */
  mediaUri?: string | null;
  /** Os textos da vibe, cada um no seu lugar e com a sua fonte, cor e fundo. */
  textItems?: VibeTextItem[];
  style: VibeStyle;
  music?: VibeMusic | null;
  post?: VibeSharedPost | null;
  paused?: boolean;
  /** Prévia na tela de criar: vídeo em loop, sem abrir links. */
  preview?: boolean;
  onVideoEnd?: () => void;
  /** Tela de criar: onde o card da música ficou (para tocar nele e trocar o link). */
  onMusicLayout?: (rect: { x: number; y: number; width: number; height: number }) => void;
}

/** O conteúdo de uma vibe em 9:16. Igual na criação e na visualização. */
export function VibeContent({ kind, mediaUri, textItems = [], style, music, post, paused = false, preview = false, onVideoEnd, onMusicLayout }: VibeContentProps) {
  const { t } = useTranslation();

  if (kind === 'photo' || kind === 'video') {
    return (
      <View style={[styles.fill, { backgroundColor: '#000' }]}>
        {!mediaUri ? (
          <Spinner color={colors.text} style={styles.center} />
        ) : kind === 'photo' ? (
          <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityIgnoresInvertColors />
        ) : (
          <VibeVideo uri={mediaUri} paused={paused} loop={preview} onEnd={onVideoEnd} />
        )}
        {textItems.length ? <VibeTextOverlay items={textItems} kind={kind} /> : null}
      </View>
    );
  }

  return (
    <View style={[styles.fill, styles.padded, { backgroundColor: VIBE_BACKGROUND[style] }]}>

      {kind === 'music' && music ? (
        <>
          <MusicBlock music={music} disabled={preview} onLayout={onMusicLayout} />
        </>
      ) : null}

      {kind === 'post' && post ? (
        <>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('vibes.openPost', { username: post.username })}
            disabled={preview}
            onPress={() => router.push(`/post/${post.id}`)}
            style={styles.postCard}
          >
            <View style={styles.postHeader}>
              <RingAvatar uri={post.avatarUrl} name={post.username} size={32} />
              <Text style={styles.postUser}>@{post.username}</Text>
            </View>
            {post.body ? (
              <Text style={styles.postBody} numberOfLines={4}>
                {post.body}
              </Text>
            ) : null}
            {post.music ? <MiniMusic music={post.music} /> : null}
          </Pressable>
        </>
      ) : null}

      {textItems.length ? <VibeTextOverlay items={textItems} kind={kind} /> : null}
    </View>
  );
}

function MusicBlock({ music, disabled, onLayout }: { music: VibeMusic; disabled: boolean; onLayout?: VibeContentProps['onMusicLayout'] }) {
  const { t } = useTranslation();
  const label = PLATFORM_LABELS[music.platform as Platform] ?? music.platform;
  return (
    <View testID="vibe-music-card" style={styles.musicBlock} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout) : undefined}>
      {music.imageUrl ? (
        <Image source={{ uri: music.imageUrl }} style={styles.bigCover} contentFit="cover" />
      ) : (
        <View style={[styles.bigCover, { backgroundColor: colors.card }]} />
      )}
      <Text style={styles.musicTitle} numberOfLines={2}>
        {music.title}
      </Text>
      {music.artist ? <Text style={styles.musicArtist}>{music.artist}</Text> : null}
      <Pressable
        accessibilityRole="link"
        disabled={disabled}
        onPress={() => Linking.openURL(music.url)}
        style={({ pressed }) => [styles.listen, pressed && { opacity: 0.85 }]}
      >
        <PlatformLogo platform={music.platform as Platform} size={18} />
        <Text style={styles.listenText}>{t('feed.listenOn', { platform: label })}</Text>
      </Pressable>
    </View>
  );
}

function MiniMusic({ music }: { music: VibeMusic }) {
  return (
    <View style={styles.mini}>
      {music.imageUrl ? <Image source={{ uri: music.imageUrl }} style={styles.miniCover} contentFit="cover" /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.miniTitle} numberOfLines={1}>
          {music.title}
        </Text>
        {music.artist ? (
          <Text style={styles.miniArtist} numberOfLines={1}>
            {music.artist}
          </Text>
        ) : null}
      </View>
      <PlatformLogo platform={music.platform as Platform} size={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  padded: { padding: space.xl, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  center: { flex: 1 },
  musicBlock: { alignItems: 'center', gap: space.sm, width: '100%' },
  bigCover: { width: 220, height: 220, borderRadius: 12 },
  musicTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center', marginTop: space.sm },
  musicArtist: { fontFamily: fonts.regular, fontSize: 14, color: colors.text, opacity: 0.85 },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.text,
    borderRadius: 20,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    marginTop: space.sm,
  },
  listenText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.background },
  postCard: { width: '100%', backgroundColor: colors.background, borderRadius: 14, padding: space.lg, gap: space.md },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  postUser: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  postBody: { fontFamily: fonts.regular, fontSize: 14, color: colors.text, lineHeight: 20 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: 10, padding: space.sm },
  miniCover: { width: 44, height: 44, borderRadius: 6 },
  miniTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  miniArtist: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
