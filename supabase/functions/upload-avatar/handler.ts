// Lógica da Edge Function upload-avatar, separada do Deno.serve para poder ser testada
// com o Supabase simulado (handler.test.ts).
//
// Ordem das checagens, da mais barata para a mais cara:
//   1. login (antes de ler qualquer byte do arquivo)
//   2. limite de envios por pessoa
//   3. tamanho declarado (Content-Length) e tamanho real lido, com corte no meio
//   4. tipo real pelos bytes, dimensões e dados escondidos (image.ts)
// Só então grava no Storage e no perfil.
import { readLimited } from '../_shared/body.ts';
import { CONTENT_TYPES, EXTENSIONS, IMAGE_LIMITS, inspectImage } from './image.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

/** Trocas de foto por pessoa: 10 por hora. */
export const AVATAR_RATE = { max: 10, windowSeconds: 3600 };

export interface Deps {
  getUserId(authHeader: string): Promise<string | null>;
  /** true = dentro do limite. */
  rateLimit(userId: string): Promise<boolean>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Grava o novo caminho (ou null) no perfil e devolve o caminho anterior. */
  setAvatar(userId: string, avatarPath: string | null): Promise<string | null>;
  remove(paths: string[]): Promise<void>;
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

/** "avatars/{id}/avatar-1.jpg" → "{id}/avatar-1.jpg" (caminho dentro do bucket). */
const inBucket = (avatarPath: string) => avatarPath.replace(/^avatars\//, '');

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const now = deps.now ?? Date.now;

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'method_not_allowed' }, 405);

    let userId: string | null;
    try {
      userId = await deps.getUserId(req.headers.get('Authorization') ?? '');
    } catch (err) {
      log('upload-avatar: falha ao validar o usuário', err);
      userId = null;
    }
    if (!userId) {
      await req.body?.cancel().catch(() => {});
      return json({ error: 'not_authenticated' }, 401);
    }

    try {
      if (!(await deps.rateLimit(userId))) {
        await req.body?.cancel().catch(() => {});
        return json({ error: 'rate_limited' }, 429);
      }

      if (req.method === 'DELETE') {
        const previous = await deps.setAvatar(userId, null);
        if (previous) await deps.remove([inBucket(previous)]).catch((err) => log('upload-avatar: não apagou a foto antiga', err));
        return json({ avatar_url: null });
      }

      const declared = Number(req.headers.get('Content-Length') ?? '0');
      if (declared > IMAGE_LIMITS.maxBytes) {
        await req.body?.cancel().catch(() => {});
        return json({ error: 'payload_too_large' }, 413);
      }
      const bytes = await readLimited(req.body, IMAGE_LIMITS.maxBytes);
      if (bytes === 'too_large') return json({ error: 'payload_too_large' }, 413);
      if (bytes.byteLength === 0) return json({ error: 'invalid_image' }, 400);

      const image = inspectImage(bytes);
      if (!image.ok) return json({ error: image.error }, image.error === 'unsupported_image' ? 415 : 422);

      // Nome gerado aqui: nada do nome do arquivo original chega ao Storage.
      const path = `${userId}/avatar-${now()}.${EXTENSIONS[image.type]}`;
      await deps.upload(path, bytes, CONTENT_TYPES[image.type]);
      const avatarPath = `avatars/${path}`;
      const previous = await deps.setAvatar(userId, avatarPath);
      if (previous && previous !== avatarPath) {
        await deps.remove([inBucket(previous)]).catch((err) => log('upload-avatar: não apagou a foto antiga', err));
      }
      return json({ avatar_url: avatarPath, width: image.width, height: image.height });
    } catch (err) {
      log('upload-avatar: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }
  };
}
