import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchLikedSongs, swipeDiscover, trackLink } from '../lib/api';
import { uniqueBy } from '../lib/hooks';
import type { LikedSong } from '../lib/types';
import { colors, fonts, space, text } from '../theme';
import { LikedSongRow } from './LikedSongRow';
import { TrackListSkeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { useStreamingOpener } from './StreamingOpener';

/** Quantas curtidas aparecem de cada vez (a lista chega com até 100; montar todas de uma vez pesava a tela). */
const PAGE = 20;

/**
 * Figma: "Liked songs" do Descobrir — tocar abre na plataforma da pessoa; a estrela descurte.
 * Fica embaixo da pilha no celular e na coluna da direita no desktop (mesma lista em cache:
 * curtir na pilha já aparece aqui).
 */
export function DiscoverLiked({ panel = false }: { panel?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [shown, setShown] = useState(PAGE);
  const liked = useQuery({ queryKey: ['discover-liked'], queryFn: fetchLikedSongs });
  const { open, opening, message, chooser } = useStreamingOpener((target, choice) => trackLink(target.key, choice));

  const openSong = (s: LikedSong) => open({ key: s.link_preview_id, title: s.title, artist: s.artist ?? '' });
  const unlike = (song: LikedSong) => {
    qc.setQueryData<LikedSong[]>(['discover-liked'], (list) => list?.filter((s) => s.link_preview_id !== song.link_preview_id));
    swipeDiscover({ link_preview_id: song.link_preview_id, post_id: null }, false)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['profile'] });
        void qc.invalidateQueries({ queryKey: ['liked-songs'] });
      })
      .catch(() => void qc.invalidateQueries({ queryKey: ['discover-liked'] }));
  };

  return (
    <View style={[styles.wrap, panel ? null : styles.divider]} testID="discover-liked">
      <Text style={panel ? styles.panelTitle : styles.title} accessibilityRole="header">
        {t('discover.likedSongs')}
      </Text>
      {liked.isLoading ? (
        <TrackListSkeleton count={3} cover={56} />
      ) : !liked.data?.length ? (
        <Text style={[text.small, { color: colors.textMuted }]}>{t('discover.likedEmpty')}</Text>
      ) : (
        <>
          {uniqueBy(liked.data, (s) => s.link_preview_id, 'curtidas do Descobrir')
            .slice(0, shown)
            .map((s) => (
              <LikedSongRow key={s.link_preview_id} song={s} onOpen={openSong} onUnlike={unlike} />
            ))}
          {liked.data.length > shown ? (
            <Pressable testID="liked-more" accessibilityRole="button" onPress={() => setShown((n) => n + PAGE)} hitSlop={8}>
              <Text style={[text.small, { color: colors.textMuted }]}>{t('discover.likedMore')}</Text>
            </Pressable>
          ) : null}
        </>
      )}
      {opening ? <Spinner /> : null}
      {message ? <Text style={[text.small, { color: colors.danger }]}>{message}</Text> : null}
      {chooser}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.tabBar, paddingTop: space.md },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  panelTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, marginTop: space.sm },
});
