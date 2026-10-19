import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView, useNativeAd } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeAdUnitId, VIBE_AD_REQUEST } from '../../lib/ads-sdk';
import { colors, fonts, radius, space } from '../../theme';
import { Spinner } from '../Spinner';
import { SponsoredBadge } from './SponsoredBadge';

/** Tempo da vibe anunciada (imagem). Vídeo: a duração dele, até 15 s. */
export const AD_VIBE_MS = 8000;
const AD_VIDEO_MAX_MS = 15_000;
/** Sem anúncio depois deste tempo: segue para a próxima pessoa (ninguém fica preso esperando). */
export const AD_LOAD_TIMEOUT_MS = 5000;
const TICK_MS = 50;

/**
 * Vibe anunciada: um anúncio nativo do AdMob em tela cheia, entre as vibes de duas pessoas.
 * Os controles do app (barra de tempo, selo "Patrocinado", fechar, voltar e pular) ficam fora da
 * área do anúncio, como pede a política do AdMob: nada do app por cima do anúncio, que só abre
 * quando a pessoa toca nele (no botão de ação, na imagem ou no título).
 * Sem anúncio (sem estoque, erro ou demora), pula sozinha para a próxima pessoa.
 */
export function AdVibe({
  slot,
  hasPrevious,
  onDone,
  onPrevious,
  onClose,
}: {
  slot: number;
  hasPrevious: boolean;
  onDone: () => void;
  onPrevious: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const unit = nativeAdUnitId();
  const ad = useNativeAd({ adUnitId: unit, requestOptions: VIBE_AD_REQUEST });
  const failed = !unit || ad.status === 'no-fill' || ad.status === 'error';

  // Sem anúncio: segue. Demorou demais para carregar: segue também.
  useEffect(() => {
    if (failed) {
      const id = setTimeout(onDone, 0);
      return () => clearTimeout(id);
    }
    if (ad.status === 'loaded') return;
    const id = setTimeout(onDone, AD_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [failed, ad.status, onDone]);

  const media = ad.status === 'loaded' ? ad.nativeAd.mediaContent : null;
  const duration = media?.hasVideoContent && media.duration > 0 ? Math.min(AD_VIDEO_MAX_MS, media.duration * 1000) : AD_VIBE_MS;
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  useEffect(() => {
    if (ad.status !== 'loaded') return;
    const id = setInterval(() => {
      elapsedRef.current += TICK_MS;
      if (elapsedRef.current >= duration) onDone();
      else setElapsed(elapsedRef.current);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [ad.status, duration, onDone]);

  return (
    <View style={styles.screen} testID={`ad-vibe-${slot}`}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.min(100, (elapsed / duration) * 100)}%` }]} />
        </View>
        <View style={styles.row}>
          <SponsoredBadge testID="ad-vibe-sponsored" />
          <View style={{ flex: 1 }} />
          <Pressable testID="vibe-close" accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {ad.status === 'loaded' ? (
        <NativeAdView nativeAd={ad.nativeAd} style={styles.ad} accessibilityLabel={t('ads.a11yVibe', { name: ad.nativeAd.advertiser ?? ad.nativeAd.headline })}>
          <NativeMediaView style={styles.media} resizeMode="contain" />
          <View style={styles.panel}>
            <View style={styles.who}>
              {ad.nativeAd.icon ? (
                <NativeAsset assetType={NativeAssetType.ICON}>
                  <Image source={{ uri: ad.nativeAd.icon.url }} style={styles.icon} accessibilityIgnoresInvertColors />
                </NativeAsset>
              ) : null}
              <View style={{ flex: 1, gap: 2 }}>
                <NativeAsset assetType={NativeAssetType.HEADLINE}>
                  <Text style={styles.headline} numberOfLines={2}>
                    {ad.nativeAd.headline}
                  </Text>
                </NativeAsset>
                {ad.nativeAd.advertiser ? (
                  <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                    <Text style={styles.advertiser} numberOfLines={1}>
                      {ad.nativeAd.advertiser}
                    </Text>
                  </NativeAsset>
                ) : null}
              </View>
            </View>
            {ad.nativeAd.body ? (
              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text style={styles.body} numberOfLines={3}>
                  {ad.nativeAd.body}
                </Text>
              </NativeAsset>
            ) : null}
            {ad.nativeAd.callToAction ? (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Text style={styles.cta}>{ad.nativeAd.callToAction}</Text>
              </NativeAsset>
            ) : null}
          </View>
        </NativeAdView>
      ) : (
        <Spinner color={colors.text} style={{ flex: 1 }} />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {hasPrevious ? (
          <Pressable
            testID="ad-vibe-prev"
            accessibilityRole="button"
            accessibilityLabel={t('vibes.previous')}
            onPress={onPrevious}
            hitSlop={8}
            style={styles.nav}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
            <Text style={styles.navText}>{t('ads.back')}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable testID="ad-vibe-skip" accessibilityRole="button" accessibilityLabel={t('ads.skip')} onPress={onDone} hitSlop={8} style={styles.nav}>
          <Text style={styles.navText}>{t('ads.skip')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.sm },
  bar: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ad: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, marginHorizontal: space.sm, overflow: 'hidden' },
  media: { flex: 1, width: '100%', minHeight: 160 },
  panel: { padding: space.lg, gap: space.md },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 40, height: 40, borderRadius: 8 },
  headline: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  advertiser: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  cta: {
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: space.sm },
  navText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});
