import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView, useNativeAd } from 'react-native-google-mobile-ads';
import { FEED_AD_REQUEST, nativeAdUnitId } from '../../lib/ads-sdk';
import { colors, fonts, radius, space } from '../../theme';
import { SponsoredBadge } from './SponsoredBadge';

/**
 * Post anunciado (anúncio nativo do AdMob no feed). Parecido com um post, mas nunca igual:
 * cartão com fundo próprio, selo "Patrocinado" ao lado do anunciante e botão de ação do anúncio
 * (a política do AdMob exige que o anúncio seja claramente diferente do conteúdo).
 * Sem anúncio (sem estoque, erro ou desligado), não ocupa espaço nenhum.
 */
export function AdPostCardNative({ slot }: { slot: number }) {
  const { t } = useTranslation();
  const ad = useNativeAd({ adUnitId: nativeAdUnitId(), requestOptions: FEED_AD_REQUEST });
  if (ad.status !== 'loaded') return null;
  const n = ad.nativeAd;
  return (
    <View style={styles.wrap}>
      <NativeAdView nativeAd={n} style={styles.card} testID={`ad-post-${slot}`} accessibilityLabel={t('ads.a11yPost', { name: n.advertiser ?? n.headline })}>
        <View style={styles.header}>
          {n.icon ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: n.icon.url }} style={styles.icon} accessibilityIgnoresInvertColors />
            </NativeAsset>
          ) : (
            <View style={[styles.icon, styles.iconEmpty]} />
          )}
          <View style={styles.titles}>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={styles.headline} numberOfLines={1}>
                {n.headline}
              </Text>
            </NativeAsset>
            <View style={styles.byline}>
              <SponsoredBadge />
              {n.advertiser ? (
                <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                  <Text style={styles.advertiser} numberOfLines={1}>
                    {n.advertiser}
                  </Text>
                </NativeAsset>
              ) : null}
            </View>
          </View>
        </View>
        {n.body ? (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} numberOfLines={3}>
              {n.body}
            </Text>
          </NativeAsset>
        ) : null}
        <NativeMediaView style={styles.media} resizeMode="cover" />
        {n.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={styles.cta}>{n.callToAction}</Text>
          </NativeAsset>
        ) : null}
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Mesmo espaçamento e linha de baixo de um post, para o feed seguir no mesmo ritmo.
  wrap: { paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  // Fundo de cartão e borda: o anúncio não se confunde com um post.
  card: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  // Espaço à direita para o ícone AdChoices, que o SDK põe no canto de cima.
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: 24 },
  icon: { width: 38, height: 38, borderRadius: 8 },
  iconEmpty: { backgroundColor: colors.surface },
  titles: { flex: 1, gap: 3 },
  headline: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  byline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  advertiser: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  media: { width: '100%', minHeight: 120, borderRadius: 10, overflow: 'hidden' },
  cta: {
    alignSelf: 'stretch',
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
  },
});
