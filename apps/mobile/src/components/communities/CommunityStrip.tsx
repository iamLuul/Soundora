import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { joinCommunity, type CommunityCard } from '../../lib/api';
import { notify } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { genreLabel, useGenres, useRecommendedCommunities } from '../../lib/queries';
import { colors, fonts, glass, space } from '../../theme';
import { Carousel } from '../Carousel';
import { showToast } from '../Toast';
import { CommunityAvatar } from './CommunityAvatar';

/**
 * "Comunidades para você" no meio do Para você: parecidas com o seu gosto (gêneros, artistas,
 * palavras e o gosto médio dos membros). Entrar direto do cartão.
 */
export function CommunityStrip() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const recommended = useRecommendedCommunities();
  const genres = useGenres();
  const [joined, setJoined] = useState<Record<string, 'active' | 'pending'>>({});
  const list = recommended.data ?? [];
  if (!list.length) return null;

  const reason = (c: CommunityCard) => {
    if (c.reason === 'genres' && c.genres?.length) return c.genres.map((g) => genreLabel(genres.data, g, i18n.language) ?? g).join(', ');
    return t(`communities.reason.${c.reason ?? 'popular'}`);
  };
  const join = async (c: CommunityCard) => {
    try {
      const status = await joinCommunity(c.id);
      setJoined((j) => ({ ...j, [c.id]: status === 'pending' ? 'pending' : 'active' }));
      showToast(status === 'pending' ? t('communities.requestSent') : t('communities.joined', { name: c.name }));
      void qc.invalidateQueries({ queryKey: ['communities', 'mine'] });
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  return (
    <View style={styles.wrap} testID="community-strip">
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {t('communities.forYou')}
        </Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/communities')} hitSlop={8}>
          <Text style={styles.more}>{t('communities.seeAll')}</Text>
        </Pressable>
      </View>
      <Carousel contentStyle={styles.row} arrowTestID="community-strip" previousLabel={t('suggest.previous')} nextLabel={t('suggest.next')}>
        {list.map((c) => {
          const state = joined[c.id];
          return (
            <View key={c.id} style={styles.card}>
              <Pressable accessibilityRole="link" accessibilityLabel={c.name} onPress={() => router.push(`/c/${c.slug}`)} style={styles.who}>
                <CommunityAvatar name={c.name} color={c.color} size={56} closed={c.visibility === 'closed'} />
                <Text style={styles.name} numberOfLines={2}>
                  {c.name}
                </Text>
                <Text style={styles.meta}>{t('communities.members', { count: c.member_count })}</Text>
                <Text style={styles.reason} numberOfLines={2}>
                  {reason(c)}
                </Text>
              </Pressable>
              <Pressable
                testID={`strip-join-${c.slug}`}
                accessibilityRole="button"
                disabled={!!state}
                onPress={() => void join(c)}
                style={({ pressed }) => [styles.button, !!state && styles.buttonDone, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.buttonText}>
                  {state === 'active'
                    ? t('communities.memberShort')
                    : state === 'pending'
                      ? t('communities.requested')
                      : c.visibility === 'closed'
                        ? t('communities.askToJoin')
                        : t('communities.join')}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </Carousel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -space.lg, paddingVertical: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  more: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  row: { gap: space.md, paddingHorizontal: space.lg },
  card: { width: 156, ...glass.card, borderRadius: 18, padding: space.md, gap: space.sm, alignItems: 'center' },
  who: { alignItems: 'center', gap: 3, alignSelf: 'stretch' },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text, textAlign: 'center', marginTop: space.xs },
  meta: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  reason: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center', minHeight: 28 },
  button: { alignSelf: 'stretch', height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.surface },
  buttonText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
});
