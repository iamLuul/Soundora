import { adsSdk } from '../../lib/ads-sdk';
import type { AdPostCardNative as Native } from './AdPostCardNative';

/**
 * Post anunciado (veja AdPostCardNative). O componente com o SDK só é carregado quando o módulo
 * nativo do AdMob está no app; no Expo Go, não há anúncio e nada do SDK é importado.
 */
export function AdPostCard({ slot }: { slot: number }) {
  if (!adsSdk()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- só com o módulo nativo presente
  const { AdPostCardNative } = require('./AdPostCardNative') as { AdPostCardNative: typeof Native };
  return <AdPostCardNative slot={slot} />;
}
