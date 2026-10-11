import type { ProfileImageKind } from './api';

/**
 * Tamanho final de cada imagem, já dentro dos limites da Edge Function profile-image
 * (supabase/functions/profile-image/image.ts): foto 512 × 512 (até 1 MB), banner 1500 × 500 (até 2 MB).
 */
export const PROFILE_IMAGE_OUTPUT: Record<ProfileImageKind, { width: number; height: number; maxBytes: number }> = {
  avatar: { width: 512, height: 512, maxBytes: 1024 * 1024 },
  banner: { width: 1500, height: 500, maxBytes: 2 * 1024 * 1024 },
};

/** Qualidades do JPEG tentadas em ordem, até o arquivo caber no limite. */
export const JPEG_QUALITIES = [0.85, 0.72, 0.6, 0.45];

export interface ImagePlan {
  /** Recorte central, em pixels da imagem original. */
  crop: { originX: number; originY: number; width: number; height: number };
  width: number;
  height: number;
}

/**
 * Recorte central na proporção certa (quadrado para a foto, 3:1 para o banner) e o tamanho
 * final fixo. Qualquer imagem vira exatamente o mesmo tamanho, então o servidor nunca recusa
 * por dimensão: imagens grandes são reduzidas e as pequenas, ampliadas.
 */
export function planProfileImage(kind: ProfileImageKind, sourceWidth: number, sourceHeight: number): ImagePlan {
  const out = PROFILE_IMAGE_OUTPUT[kind];
  const w = Math.max(1, Math.floor(sourceWidth));
  const h = Math.max(1, Math.floor(sourceHeight));
  const aspect = out.width / out.height;
  let cropWidth = Math.min(w, Math.round(h * aspect));
  let cropHeight = Math.round(cropWidth / aspect);
  if (cropHeight > h) {
    cropHeight = h;
    cropWidth = Math.min(w, Math.round(h * aspect));
  }
  cropWidth = Math.max(1, cropWidth);
  cropHeight = Math.max(1, cropHeight);
  return {
    crop: {
      originX: Math.floor((w - cropWidth) / 2),
      originY: Math.floor((h - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    },
    width: out.width,
    height: out.height,
  };
}

/** Foto de vibe: a imagem inteira, sem recorte, cabendo em 1080 × 1920 (até 3 MB no servidor). */
export const VIBE_PHOTO_MAX = { width: 1080, height: 1920, maxBytes: 3 * 1024 * 1024 };

export function planVibePhoto(sourceWidth: number, sourceHeight: number): ImagePlan {
  const w = Math.max(1, Math.floor(sourceWidth));
  const h = Math.max(1, Math.floor(sourceHeight));
  // Só reduz (nunca amplia); imagens minúsculas sobem até 32 px, o mínimo do servidor.
  const scale = Math.min(1, VIBE_PHOTO_MAX.width / w, VIBE_PHOTO_MAX.height / h);
  let width = Math.round(w * scale);
  let height = Math.round(h * scale);
  if (width < 32 || height < 32) {
    const up = 32 / Math.min(width, height);
    width = Math.min(VIBE_PHOTO_MAX.width, Math.round(width * up));
    height = Math.min(VIBE_PHOTO_MAX.height, Math.round(height * up));
  }
  return { crop: { originX: 0, originY: 0, width: w, height: h }, width, height };
}
