// Lógica da Edge Function profile-image (foto e banner do perfil), separada do Deno.serve
// para poder ser testada com o Supabase simulado (handler.test.ts).
//
//   POST   /profile-image?kind=avatar|banner   corpo = bytes da imagem
//   DELETE /profile-image?kind=avatar|banner   remove a imagem do perfil
//   POST   /profile-image?kind=community&community={id}   foto da comunidade (só a dona)
//   DELETE /profile-image?kind=community&community={id}   tira a foto da comunidade
//
// Ordem das checagens, da mais barata para a mais cara:
//   1. login (antes de ler qualquer byte do arquivo)
//   2. comunidade: a pessoa é a dona (o banco confere de novo ao gravar)
//   3. limite de envios por pessoa
//   4. tamanho declarado (Content-Length) e tamanho real lido, com corte no meio
//   5. tipo real pelos bytes, dimensões e dados escondidos (image.ts)
// Só então grava no Storage e no perfil.
import { readLimited } from '../_shared/body.ts';
import { BANNER_LIMITS, CONTENT_TYPES, EXTENSIONS, IMAGE_LIMITS, inspectImage, type ImageLimits } from './image.ts';
import { corsFor, describeError, jsonWith } from '../_shared/http.ts';

export const corsHeaders = corsFor('POST, DELETE, OPTIONS');

export type ImageKind = 'avatar' | 'banner' | 'community';

/** prefix = começo do nome do arquivo (avatar-123.webp, banner-123.webp). */
export const KINDS: Record<ImageKind, { bucket: string; limits: ImageLimits; prefix: string }> = {
  avatar: { bucket: 'avatars', limits: IMAGE_LIMITS, prefix: 'avatar' },
  banner: { bucket: 'banners', limits: BANNER_LIMITS, prefix: 'banner' },
  community: { bucket: 'community-avatars', limits: IMAGE_LIMITS, prefix: 'avatar' },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Trocas por pessoa e tipo: 10 por hora. */
export const IMAGE_RATE = { max: 10, windowSeconds: 3600 };

export interface Deps {
  getUserId(authHeader: string): Promise<string | null>;
  /** true = dentro do limite. */
  rateLimit(userId: string, kind: ImageKind): Promise<boolean>;
  /** Grava no bucket do tipo (path relativo ao bucket). */
  upload(kind: ImageKind, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** true = a pessoa é a dona da comunidade. */
  isCommunityOwner(userId: string, communityId: string): Promise<boolean>;
  /**
   * Grava o novo caminho (ou null) no perfil (ou na comunidade, para kind=community) e devolve
   * o caminho anterior.
   */
  setImage(userId: string, kind: ImageKind, storedPath: string | null, communityId: string | null): Promise<string | null>;
  remove(kind: ImageKind, paths: string[]): Promise<void>;
  now?: () => number;
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

const json = jsonWith(corsHeaders);

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

    const params = new URL(req.url).searchParams;
    const kindParam = params.get('kind') ?? 'avatar';
    if (kindParam !== 'avatar' && kindParam !== 'banner' && kindParam !== 'community') {
      await discard();
      return json({ error: 'invalid_body' }, 400);
    }
    const kind: ImageKind = kindParam;
    const { bucket, limits, prefix } = KINDS[kind];
    // Comunidade: o id vira a pasta no bucket, então só um uuid de verdade passa.
    const communityId = kind === 'community' ? (params.get('community') ?? '').toLowerCase() : null;
    if (communityId !== null && !UUID.test(communityId)) {
      await discard();
      return json({ error: 'invalid_body' }, 400);
    }
    /** Pasta do arquivo: a pessoa (foto e banner) ou a comunidade. */
    const folder = communityId ?? userId;
    /** "banners/{id}/banner-1.jpg" → "{id}/banner-1.jpg" (caminho dentro do bucket). */
    const inBucket = (stored: string) => stored.slice(bucket.length + 1);

    try {
      if (communityId && !(await deps.isCommunityOwner(userId, communityId))) {
        await discard();
        return json({ error: 'forbidden' }, 403);
      }
      if (!(await deps.rateLimit(userId, kind))) {
        await discard();
        return json({ error: 'rate_limited' }, 429);
      }

      if (req.method === 'DELETE') {
        const previous = await deps.setImage(userId, kind, null, communityId);
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
      const path = `${folder}/${prefix}-${now()}.${EXTENSIONS[image.type]}`;
      await deps.upload(kind, path, bytes, CONTENT_TYPES[image.type]);
      const stored = `${bucket}/${path}`;
      const previous = await deps.setImage(userId, kind, stored, communityId);
      if (previous && previous !== stored) {
        await deps.remove(kind, [inBucket(previous)]).catch((err) => log('profile-image: não apagou a imagem antiga', err));
      }
      return json({ path: stored, width: image.width, height: image.height });
    } catch (err) {
      log('profile-image: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describeError(err) } : {}) }, 500);
    }
  };
}
