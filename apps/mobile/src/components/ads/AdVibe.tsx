import { useEffect } from 'react';
import { adsSdk } from '../../lib/ads-sdk';
import type { AdVibeNative as Native } from './AdVibeNative';

type Props = { slot: number; hasPrevious: boolean; onDone: () => void; onPrevious: () => void; onClose: () => void };

/**
 * Vibe anunciada (veja AdVibeNative). O componente com o SDK só é carregado quando o módulo
 * nativo do AdMob está no app; no Expo Go, o espaço do anúncio é pulado na hora.
 */
export function AdVibe(props: Props) {
  if (!adsSdk()) return <SkipAd onDone={props.onDone} />;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- só com o módulo nativo presente
  const { AdVibeNative } = require('./AdVibeNative') as { AdVibeNative: typeof Native };
  return <AdVibeNative {...props} />;
}

function SkipAd({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 0);
    return () => clearTimeout(id);
  }, [onDone]);
  return null;
}
