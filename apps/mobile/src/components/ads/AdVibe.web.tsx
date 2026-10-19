import { useEffect } from 'react';

// Web: sem anúncios (o AdMob é só para apps). Se um espaço de anúncio aparecer, segue direto.
export function AdVibe({ onDone }: { slot: number; hasPrevious: boolean; onDone: () => void; onPrevious: () => void; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 0);
    return () => clearTimeout(id);
  }, [onDone]);
  return null;
}
