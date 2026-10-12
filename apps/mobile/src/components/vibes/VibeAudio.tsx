import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

// Toca mesmo com o celular no silencioso (iOS), como as músicas dos Stories.
setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);

// O player é um objeto nativo (fora do React): estas funções só repassam a configuração.
function configure(player: AudioPlayer, opts: { loop: boolean; muted: boolean }) {
  player.loop = opts.loop;
  player.muted = opts.muted;
}

export interface VibeAudioProps {
  url: string;
  paused: boolean;
  muted: boolean;
  loop?: boolean;
  /** Posição e duração (s), algumas vezes por segundo enquanto toca. */
  onProgress?: (position: number, duration: number) => void;
  /** Chegou ao fim (sem loop). */
  onEnded?: () => void;
  /** Não deu para tocar (link vencido, formato). */
  onError?: () => void;
}

/**
 * Prévia de 30 s da música (oficial da Apple Music ou da Deezer), tocando direto do servidor
 * da loja. Não aparece na tela: só toca, pausa junto com a vibe e respeita o mudo.
 */
export function VibeAudio({ url, paused, muted, loop = false, onProgress, onEnded, onError }: VibeAudioProps) {
  const player = useAudioPlayer(url, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    configure(player, { loop, muted });
  }, [player, loop, muted]);

  useEffect(() => {
    if (paused) player.pause();
    else {
      // Prévia indisponível (loja fora do ar, link vencido) não pode derrubar a vibe: fica sem som.
      try {
        const result = player.play() as unknown;
        if (result instanceof Promise) result.catch(() => onError?.());
      } catch {
        onError?.();
      }
    }
  }, [player, paused, onError]);

  useEffect(() => {
    if (status.playing || status.currentTime > 0) onProgress?.(status.currentTime, status.duration);
  }, [status.currentTime, status.duration, status.playing, onProgress]);

  useEffect(() => {
    if (status.didJustFinish) onEnded?.();
  }, [status.didJustFinish, onEnded]);

  useEffect(() => {
    if (/fail|error/i.test(status.playbackState ?? '')) onError?.();
  }, [status.playbackState, onError]);

  return null;
}
