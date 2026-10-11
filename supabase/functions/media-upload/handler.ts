// Lógica da Edge Function media-upload (foto e vídeo das Vibes e dos posts), separada do
// Deno.serve para poder ser testada com o Supabase simulado (handler.test.ts).
//
//   POST /media-upload?for=vibe|post&type=photo   corpo = JPEG (o app já converte)
//   POST /media-upload?for=vibe|post&type=video   corpo = MP4/MOV de até 30 s e 30 MB
//
// Ordem das checagens, da mais barata para a mais cara:
//   1. login (antes de ler qualquer byte)
//   2. limite de envios por pessoa
//   3. tamanho declarado e tamanho real lido, com corte no meio
//   4. tipo real pelos bytes, dimensões/duração e dados escondidos
// Só então grava no bucket privado ("vibes" ou "post-media"). Quem cria a vibe ou o post é o
// app (vibe_create / post_create), que confere que o arquivo é da pessoa e existe no bucket.
import { readLimited } from '../_shared/body.ts';
import { inspectImage, type ImageLimits } from '../profile-image/image.ts';
import { inspectVideo, VIDEO_LIMITS } from './video.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type MediaType = 'photo' | 'video';
export type Target = 'vibe' | 'post';

/** Bucket de cada destino. */
export const BUCKETS: Record<Target, string> = { vibe: 'vibes', post: 'post-media' };

/** Foto: o app manda no máximo 1080 × 1920 (vibe) ou 1440 × 1440 (post). */
export const PHOTO_LIMITS: ImageLimits = {
  maxBytes: 3 * 1024 * 1024,
  minSide: 32,
  maxSide: 1920,
  maxPixels: 1080 * 1920,
};

/** Envios por pessoa: 100 por dia somando vibes e posts (criar vibe e post têm limites próprios). */
export const UPLOAD_RATE = { max: 100, windowSeconds: 86_400 };

export interface Deps {
  getUserId(authHeader: string): Promise<string | null>;
  rateLimit(userId: string): Promise<boolean>;
  upload(target: Target, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Arquivos da pessoa que já podem sair (vencidos, apagados ou nunca usados). */
  garbage(target: Target, userId: string): Promise<string[]>;
  remove(target: Target, paths: string[]): Promise<void>;
  newId?: () => string;
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === 'object') return JSON.stringify(err);
  return String(err);
}

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const discard = () => req.body?.cancel().catch(() => {});

    let userId: string | null;
    try {
      userId = await deps.getUserId(req.headers.get('Authorization') ?? '');
    } catch (err) {
      log('media-upload: falha ao validar o usuário', err);
      userId = null;
    }
    if (!userId) {
      await discard();
      return json({ error: 'not_authenticated' }, 401);
    }

    const params = new URL(req.url).searchParams;
    const type = params.get('type');
    const target = params.get('for') ?? 'vibe';
    if ((type !== 'photo' && type !== 'video') || (target !== 'vibe' && target !== 'post')) {
      await discard();
      return json({ error: 'invalid_body' }, 400);
    }
    const maxBytes = type === 'photo' ? PHOTO_LIMITS.maxBytes : VIDEO_LIMITS.maxBytes;

    try {
      if (!(await deps.rateLimit(userId))) {
        await discard();
        return json({ error: 'rate_limited' }, 429);
      }
      if (Number(req.headers.get('Content-Length') ?? '0') > maxBytes) {
        await discard();
        return json({ error: 'payload_too_large' }, 413);
      }
      const bytes = await readLimited(req.body, maxBytes);
      if (bytes === 'too_large') return json({ error: 'payload_too_large' }, 413);
      if (bytes.byteLength === 0) return json({ error: type === 'photo' ? 'invalid_image' : 'invalid_video' }, 400);

      let result: { path: string; width: number; height: number; durationMs?: number };
      if (type === 'photo') {
        const image = inspectImage(bytes, PHOTO_LIMITS);
        if (!image.ok) return json({ error: image.error }, image.error === 'unsupported_image' ? 415 : 422);
        if (image.type !== 'jpeg') return json({ error: 'unsupported_image' }, 415);
        // Nome gerado aqui: nada do arquivo original chega ao Storage.
        const path = `${userId}/${newId()}.jpg`;
        await deps.upload(target, path, bytes, 'image/jpeg');
        result = { path, width: image.width, height: image.height };
      } else {
        const video = inspectVideo(bytes);
        if (!video.ok) return json({ error: video.error }, video.error === 'unsupported_video' ? 415 : 422);
        const path = `${userId}/${newId()}.mp4`;
        await deps.upload(target, path, bytes, 'video/mp4');
        result = { path, width: video.width, height: video.height, durationMs: video.durationMs };
      }

      // Faxina: apaga os arquivos vencidos ou sem uso desta pessoa. Falha aqui não atrapalha o envio.
      try {
        const old = await deps.garbage(target, userId);
        if (old.length) await deps.remove(target, old);
      } catch (err) {
        log('media-upload: limpeza falhou', err);
      }
      return json(result);
    } catch (err) {
      log('media-upload: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }
  };
}
