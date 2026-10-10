// Lógica da Edge Function profile-image (foto e banner do perfil), separada do Deno.serve
// para poder ser testada com o Supabase simulado (handler.test.ts).
//
//   POST   /profile-image?kind=avatar|banner   corpo = bytes da imagem
//   DELETE /profile-image?kind=avatar|banner   remove a imagem do perfil
//
// Ordem das checagens, da mais barata para a mais cara:
//   1. login (antes de ler qualquer byte do arquivo)
//   2. limite de envios por pessoa
//   3. tamanho declarado (Content-Length) e tamanho real lido, com corte no meio
//   4. tipo real pelos bytes, dimensões e dados escondidos (image.ts)
// Só então grava no Storage e no perfil.
import { readLimited } from '../_shared/body.ts';
import { BANNER_LIMITS, CONTENT_TYPES, EXTENSIONS, IMAGE_LIMITS, inspectImage, type ImageLimits } from './image.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

export type ImageKind = 'avatar' | 'banner';

export const KINDS: Record<ImageKind, { bucket: string; limits: ImageLimits }> = {
  avatar: { bucket: 'avatars', limits: IMAGE_LIMITS },
  banner: { bucket: 'banners', limits: BANNER_LIMITS },
};

/** Trocas por pessoa e tipo: 10 por hora. */
export const IMAGE_RATE = { max: 10, windowSeconds: 3600 };

export interface Deps {
  getUserId(authHeader: string): Promise<string | null>;
  /** true = dentro do limite. */
  rateLimit(userId: string, kind: ImageKind): Promise<boolean>;
  /** Grava no bucket do tipo (path relativo ao bucket). */
  upload(kind: ImageKind, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Grava o novo caminho (ou null) no perfil e devolve o caminho anterior. */
  setImage(userId: string, kind: ImageKind, storedPath: string | null): Promise<string | null>;
  remove(kind: ImageKind, paths: string[]): Promise<void>;
  now?: () => number;
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
  const now = deps.now ?? Date.now;

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'method_not_allowed' }, 405);

    const discard = () => req.body?.cancel().catch(() => {});

    let userId: string | null;
    try {
      userId = await deps.getUserId(req.headers.get('Authorization') ?? '');
    } catch (err) {
      log('profile-image: falha ao validar o usuário', err);
      userId = null;
    }
    if (!userId) {
      await discard();
      return json({ error: 'not_authenticated' }, 401);
    }

    const kindParam = new URL(req.url).searchParams.get('kind') ?? 'avatar';
    if (kindParam !== 'avatar' && kindParam !== 'banner') {
      await discard();
      return json({ error: 'invalid_body' }, 400);
    }
    const kind: ImageKind = kindParam;
    const { bucket, limits } = KINDS[kind];
    /** "banners/{id}/banner-1.jpg" → "{id}/banner-1.jpg" (caminho dentro do bucket). */
    const inBucket = (stored: string) => stored.slice(bucket.length + 1);

    try {
      if (!(await deps.rateLimit(userId, kind))) {
        await discard();
        return json({ error: 'rate_limited' }, 429);
      }

      if (req.method === 'DELETE') {
        const previous = await deps.setImage(userId, kind, null);
        if (previous) await deps.remove(kind, [inBucket(previous)]).catch((err) => log('profile-image: não apagou a imagem antiga', err));
        return json({ path: null });
      }

      const declared = Number(req.headers.get('Content-Length') ?? '0');
      if (declared > limits.maxBytes) {
        await discard();
        return json({ error: 'payload_too_large' }, 413);
      }
      const bytes = await readLimited(req.body, limits.maxBytes);
      if (bytes === 'too_large') return json({ error: 'payload_too_large' }, 413);
      if (bytes.byteLength === 0) return json({ error: 'invalid_image' }, 400);

      const image = inspectImage(bytes, limits);
      if (!image.ok) return json({ error: image.error }, image.error === 'unsupported_image' ? 415 : 422);

      // Nome gerado aqui: nada do nome do arquivo original chega ao Storage.
      const path = `${userId}/${kind}-${now()}.${EXTENSIONS[image.type]}`;
      await deps.upload(kind, path, bytes, CONTENT_TYPES[image.type]);
      const stored = `${bucket}/${path}`;
      const previous = await deps.setImage(userId, kind, stored);
      if (previous && previous !== stored) {
        await deps.remove(kind, [inBucket(previous)]).catch((err) => log('profile-image: não apagou a imagem antiga', err));
      }
      return json({ path: stored, width: image.width, height: image.height });
    } catch (err) {
      log('profile-image: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }
  };
}
