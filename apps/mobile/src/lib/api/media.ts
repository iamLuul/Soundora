// Fotos e vídeos de posts e vibes: envio pela Edge Function media-upload e links assinados para ver.
import { AppError } from '../errors';
import { imageContentType } from '../image-plan';
import { supabase } from '../supabase';
import { functionError, invokeFunction } from './client';

/** URLs temporárias (1 h) da mídia dos posts, de uma vez só. */
export async function postMediaUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from('post-media').createSignedUrls(paths, 3600);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

/**
 * Assina mídias em lote: os posts que aparecem juntos (uma página do feed) pedem as URLs no
 * mesmo instante, e isto junta tudo numa chamada só ao Storage (em vez de uma por post).
 */
const MEDIA_BATCH_MS = 16;

const MEDIA_BATCH_MAX = 100;

let mediaQueue: { paths: string[]; resolve: (urls: Record<string, string>) => void; reject: (err: unknown) => void }[] = [];

let mediaTimer: ReturnType<typeof setTimeout> | null = null;

function flushMediaQueue() {
  const batch = mediaQueue;
  mediaQueue = [];
  mediaTimer = null;
  const all = [...new Set(batch.flatMap((b) => b.paths))];
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += MEDIA_BATCH_MAX) chunks.push(all.slice(i, i + MEDIA_BATCH_MAX));
  Promise.all(chunks.map((c) => postMediaUrls(c)))
    .then((parts) => {
      const urls = Object.assign({}, ...parts) as Record<string, string>;
      for (const b of batch) b.resolve(Object.fromEntries(b.paths.filter((p) => urls[p]).map((p) => [p, urls[p]!])));
    })
    .catch((err: unknown) => batch.forEach((b) => b.reject(err)));
}

export function signPostMedia(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    mediaQueue.push({ paths, resolve, reject });
    mediaTimer ??= setTimeout(flushMediaQueue, MEDIA_BATCH_MS);
  });
}

export interface UploadedMedia {
  path: string;
  width: number;
  height: number;
  durationMs?: number;
}

/** Envia a foto (já convertida) ou o vídeo para a Edge Function media-upload, que confere e grava. */
export async function uploadMedia(target: 'vibe' | 'post', type: 'photo' | 'video', bytes: Uint8Array): Promise<UploadedMedia> {
  // ArrayBuffer (não Uint8Array): com Content-Type próprio, o supabase-js transformaria em JSON.
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const { data, error } = await invokeFunction<UploadedMedia>(`media-upload?for=${target}&type=${type}`, {
    body,
    headers: { 'Content-Type': type === 'photo' ? imageContentType(bytes) : 'video/mp4' },
  });
  if (error) throw await functionError('media-upload', error, 'generic');
  if (!data?.path) throw new AppError('generic');
  return data;
}
