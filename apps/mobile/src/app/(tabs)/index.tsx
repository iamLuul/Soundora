import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppState, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopTabs } from '../../components/figma';
import { FollowingRow } from '../../components/FollowingRow';
import { PostList } from '../../components/PostList';
import { ReviewStrip, reviewStrips } from '../../components/ReviewStrip';
import { SuggestedAccounts } from '../../components/SuggestedAccounts';
import { SuspendedBanner } from '../../components/SuspendedBanner';
import { renewFeed, useFeed, useFollowingFeed, useReviewsForYou, useSuggestedAccounts } from '../../lib/queries';
import { markSeen } from '../../lib/seen-posts';
import { useHomeReturn } from '../../lib/tab-focus';
import { colors, space, text } from '../../theme';
import { formatError } from '../../lib/errors';
import { useAds } from '../../lib/ads';
import { CoachMarks, useFirstTimeTip } from '../../components/CoachMarks';

type FeedTab = 'feed' | 'following';

/** Contas sugeridas entram depois deste tanto de posts no Para você. */
const SUGGESTIONS_AFTER = 4;
/** Faixas de reviews populares: a primeira depois de 10 posts, depois a cada 15. */
const REVIEWS_FIRST = 10;
const REVIEWS_EVERY = 15;
/** App de volta da segunda tela depois de tanto tempo: o Para você abre de novo. */
const RENEW_AFTER_BACKGROUND_MS = 10 * 60_000;

/**
 * Início (Figma: Home page/For You): abas do topo com o sino, a fila de vibes e o feed.
 * - Para você: posts pelo seu gosto (gêneros, artistas e palavras do que você curte, posta,
 *   comenta, pesquisa e curte no Descobrir, e o nicho de quem você segue), com o botão Seguir
 *   em quem você ainda não segue, contas sugeridas e faixas de reviews populares no meio.
 * - Seguindo: só quem você segue, do mais novo ao mais velho, sem sugestões.
 */
export default function FeedScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<FeedTab>('feed');
  const ads = useAds();
  // Antes do primeiro anúncio, o aviso de que eles existem (prometido na página de Anúncios).
  const [adsTip, closeAdsTip] = useFirstTimeTip('ads-intro');

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
      <CoachMarks
        testID="coach-ads"
        visible={ads.ready && adsTip}
        onClose={closeAdsTip}
        steps={[{ icon: 'megaphone-outline', title: t('ads.introTitle'), body: t('ads.introBody') }]}
      />
      {/* As duas ficam montadas: trocar de aba não perde a rolagem nem busca de novo. */}
      <View style={{ flex: 1, display: tab === 'feed' ? 'flex' : 'none' }}>
        <ForYou adsEvery={ads.feedEvery} />
      </View>
      <View style={{ flex: 1, display: tab === 'following' ? 'flex' : 'none' }}>
        <Following active={tab === 'following'} adsEvery={ads.feedEvery} />
      </View>
    </View>
  );
}

function ForYou({ adsEvery }: { adsEvery: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const feed = useFeed();
  const reviews = useReviewsForYou();
  // Conteúdo novo sempre que a pessoa volta para o Início (de outra aba) ou puxa para atualizar:
  // o feed abre de novo, sem o que ela já viu e numa ordem diferente, e a lista volta ao topo.
  const [opening, setOpening] = useState(0);
  const renew = async () => {
    setOpening((n) => n + 1);
    try {
      await renewFeed(qc);
    } catch {
      // sem conexão: fica a lista que já estava (a tela de erro aparece se não houver nada)
    }
  };
  useHomeReturn(() => void renew());
  // App fechado na segunda tela por um tempo: ao voltar, conteúdo novo também.
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') hiddenAt.current ??= Date.now();
      else if (hiddenAt.current !== null) {
        const away = Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (away >= RENEW_AFTER_BACKGROUND_MS) void renew();
      }
    });
    return () => sub.remove();
    // renew usa só o qc (estável) e setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const items = feed.data?.pages.flat() ?? [];
  const strips = reviewStrips(reviews.data ?? []).map((list, i) => <ReviewStrip key={i} index={i} reviews={list} />);
  return (
    <PostList
      header={<FollowingRow />}
      items={items}
      loading={feed.isLoading}
      onRefresh={renew}
      onSeen={markSeen}
      scrollTopKey={opening}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      loadingMore={feed.isFetchingNextPage}
      emptyText={t('feed.empty')}
      errorText={feed.isError ? formatError(t, feed.error) : null}
      followable
      interstitial={{ after: SUGGESTIONS_AFTER, element: <SuggestedAccounts /> }}
      strips={{ first: REVIEWS_FIRST, every: REVIEWS_EVERY, elements: strips }}
      adsEvery={adsEvery}
    />
  );
}

function Following({ active, adsEvery }: { active: boolean; adsEvery: number }) {
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
      adsEvery={adsEvery}
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
