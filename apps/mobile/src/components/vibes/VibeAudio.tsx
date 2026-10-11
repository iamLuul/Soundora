import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

// Toca mesmo com o celular no silencioso (iOS), como as músicas dos Stories.
setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);

// O player é um objeto nativo (fora do React): estas funções só repassam a configuração.
function configure(player: AudioPlayer, opts: { loop: boolean; muted: boolean }) {
  player.loop = opts.loop;
  player.muted = opts.muted;
}

/**
 * Prévia de 30 s da música (oficial da Apple Music ou da Deezer), tocando direto do servidor
 * da loja. Não aparece na tela: só toca, pausa junto com a vibe e respeita o mudo.
 */
export function VibeAudio({ url, paused, muted, loop = false }: { url: string; paused: boolean; muted: boolean; loop?: boolean }) {
  const player = useAudioPlayer(url);

  useEffect(() => {
    configure(player, { loop, muted });
  }, [player, loop, muted]);

  useEffect(() => {
    if (paused) player.pause();
    else {
      // Prévia indisponível (loja fora do ar, link vencido) não pode derrubar a vibe: fica sem som.
      try {
        const result = player.play() as unknown;
        if (result instanceof Promise) result.catch(() => undefined);
      } catch {
        // sem som
      }
    }
  }, [player, paused]);

  return null;
}
