import { useEffect, useState } from 'react';

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
function configure(audio: HTMLAudioElement, opts: { loop: boolean; muted: boolean }) {
  audio.loop = opts.loop;
  audio.muted = opts.muted;
}

/**
 * Web: prévia de 30 s com o <audio> do navegador. O expo-audio na web chama play() e ignora a
 * promessa, então um link que o navegador não toca (prévia vencida, formato) virava erro solto.
 * Aqui o erro é tratado: a vibe/cartão segue, só sem som.
 */
export function VibeAudio({ url, paused, muted, loop = false }: { url: string; paused: boolean; muted: boolean; loop?: boolean }) {
  const [audio] = useState(() => (typeof Audio === 'undefined' ? null : new Audio()));

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
    // Navegador recusou (autoplay bloqueado, link inválido): fica sem som.
    else audio.play().catch(() => undefined);
  }, [audio, paused, url]);

  return null;
}
