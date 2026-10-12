import { useEffect, useRef, useState } from 'react';
import type { VibeAudioProps } from './VibeAudio';

// O <audio> é um objeto do navegador (fora do React): estas funções só repassam a configuração.
function load(audio: HTMLAudioElement, url: string) {
  audio.preload = 'auto';
  audio.src = url;
}
function unload(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}
/** Já tocou até o fim: volta para o começo (para o play tocar de novo). */
function rewindIfEnded(audio: HTMLAudioElement) {
  if (audio.ended) audio.currentTime = 0;
}
function configure(audio: HTMLAudioElement, opts: { loop: boolean; muted: boolean }) {
  audio.loop = opts.loop;
  audio.muted = opts.muted;
}

/**
 * Web: prévia de 30 s com o <audio> do navegador. O expo-audio na web chama play() e ignora a
 * promessa, então um link que o navegador não toca (prévia vencida, formato) virava erro solto.
 * Aqui o erro é tratado e avisado (onError), para o app renovar a prévia.
 */
export function VibeAudio({ url, paused, muted, loop = false, onProgress, onEnded, onError }: VibeAudioProps) {
  const [audio] = useState(() => (typeof Audio === 'undefined' ? null : new Audio()));
  // Os avisos mais recentes, sem religar os eventos a cada render.
  const handlers = useRef({ onProgress, onEnded, onError });
  useEffect(() => {
    handlers.current = { onProgress, onEnded, onError };
  });

  useEffect(() => {
    if (!audio) return;
    const time = () => handlers.current.onProgress?.(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0);
    const ended = () => handlers.current.onEnded?.();
    const failed = () => handlers.current.onError?.();
    audio.addEventListener('timeupdate', time);
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', failed);
    return () => {
      audio.removeEventListener('timeupdate', time);
      audio.removeEventListener('ended', ended);
      audio.removeEventListener('error', failed);
    };
  }, [audio]);

  // Troca de música: novo endereço; ao sair, para e solta o arquivo.
  useEffect(() => {
    if (!audio) return;
    load(audio, url);
    return () => unload(audio);
  }, [audio, url]);

  useEffect(() => {
    if (audio) configure(audio, { loop, muted });
  }, [audio, loop, muted]);

  useEffect(() => {
    if (!audio) return;
    if (paused) audio.pause();
    else {
      rewindIfEnded(audio);
      audio.play().catch((err: unknown) => {
        // Autoplay bloqueado pelo navegador (sem toque antes) não é link ruim: só não toca.
        if ((err as { name?: string })?.name !== 'NotAllowedError' && (err as { name?: string })?.name !== 'AbortError') handlers.current.onError?.();
      });
    }
  }, [audio, paused, url]);

  return null;
}
