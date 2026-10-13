import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopTabs } from '../../components/figma';
import { FollowingRow } from '../../components/FollowingRow';
import { PostList } from '../../components/PostList';
import { SuggestedAccounts } from '../../components/SuggestedAccounts';
import { SuspendedBanner } from '../../components/SuspendedBanner';
import { useFeed, useFollowingFeed, useSuggestedAccounts } from '../../lib/queries';
import { colors, space, text } from '../../theme';
import { formatError } from '../../lib/errors';

type FeedTab = 'feed' | 'following';

/** Contas sugeridas entram depois deste tanto de posts no Para você. */
const SUGGESTIONS_AFTER = 4;

/**
 * Início (Figma: Home page/For You): abas do topo com o sino, a fila de vibes e o feed.
 * - Para você: posts pelo seu gosto (gêneros, curtidas, comentários, posts e Descobrir), com
 *   o botão Seguir em quem você ainda não segue e contas sugeridas no meio.
 * - Seguindo: só quem você segue, do mais novo ao mais velho, sem sugestões.
 */
export default function FeedScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<FeedTab>('feed');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <TopTabs
        tabs={[
          { value: 'feed', label: t('tabs.feed') },
          { value: 'following', label: t('tabs.following') },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginHorizontal: space.lg }}
      />
      <SuspendedBanner />
      {/* As duas ficam montadas: trocar de aba não perde a rolagem nem busca de novo. */}
      <View style={{ flex: 1, display: tab === 'feed' ? 'flex' : 'none' }}>
        <ForYou />
      </View>
      <View style={{ flex: 1, display: tab === 'following' ? 'flex' : 'none' }}>
        <Following active={tab === 'following'} />
      </View>
    </View>
  );
}

function ForYou() {
  const { t } = useTranslation();
  const feed = useFeed();
  const items = feed.data?.pages.flat() ?? [];
  return (
    <PostList
      header={<FollowingRow />}
      items={items}
      loading={feed.isLoading}
      onRefresh={() => feed.refetch()}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      loadingMore={feed.isFetchingNextPage}
      emptyText={t('feed.empty')}
      errorText={feed.isError ? formatError(t, feed.error) : null}
      followable
      interstitial={{ after: SUGGESTIONS_AFTER, element: <SuggestedAccounts /> }}
    />
  );
}

function Following({ active }: { active: boolean }) {
  const { t } = useTranslation();
  // Só busca quando a aba é aberta pela primeira vez.
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const feed = useFollowingFeed(opened);
  const suggested = useSuggestedAccounts(opened);
  const items = feed.data?.pages.flat() ?? [];
  const hasSuggestions = (suggested.data?.length ?? 0) > 0;
  return (
    <PostList
      header={<FollowingRow />}
      items={items}
      loading={feed.isLoading || !opened}
      onRefresh={() => feed.refetch()}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      loadingMore={feed.isFetchingNextPage}
      emptyText={t('feed.followingEmptyNoSuggestions')}
      errorText={feed.isError ? formatError(t, feed.error) : null}
      empty={
        feed.isError || !hasSuggestions ? undefined : (
          <View style={{ gap: space.md, marginTop: space.xl }}>
            <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', paddingHorizontal: space.lg }]}>{t('feed.followingEmpty')}</Text>
            <SuggestedAccounts testID="suggested-following-empty" />
          </View>
        )
      }
    />
  );
}
