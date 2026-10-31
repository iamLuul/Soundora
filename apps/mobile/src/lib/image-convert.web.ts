import type { ProfileImageKind } from './api';
import { AppError } from './errors';
import {
  JPEG_QUALITIES,
  WEBP_QUALITIES,
  POST_PHOTO_MAX,
  PROFILE_IMAGE_OUTPUT,
  VIBE_PHOTO_MAX,
  planPostPhoto,
  planProfileImage,
  planVibePhoto,
  type ImagePlan,
} from './image-plan';

/**
 * Web: converte direto num canvas do tamanho final (o expo-image-manipulator da Web quebra
 * com "createImageData: Invalid width or height" e reamostra pixel a pixel, lento em fotos
 * grandes). Sai um WebP do tamanho exato do perfil, sem metadados (JPEG só no navegador que
 * não gera WebP, como o Safari antigo).
 */
export function convertProfileImage(kind: ProfileImageKind, uri: string, _width?: number, _height?: number): Promise<Uint8Array> {
  return convertImage(uri, (w, h) => planProfileImage(kind, w, h), PROFILE_IMAGE_OUTPUT[kind].maxBytes);
}

/** Foto de vibe: imagem inteira, até 1080 × 1920, WebP sem metadados. */
export function convertVibePhoto(uri: string, _width?: number, _height?: number): Promise<Uint8Array> {
  return convertImage(uri, planVibePhoto, VIBE_PHOTO_MAX.maxBytes);
}

/** Foto de post: imagem inteira, até 1440 × 1440, WebP sem metadados. */
export function convertPostPhoto(uri: string, _width?: number, _height?: number): Promise<Uint8Array> {
  return convertImage(uri, planPostPhoto, POST_PHOTO_MAX.maxBytes);
}

async function convertImage(uri: string, planFor: (w: number, h: number) => ImagePlan, maxBytes: number): Promise<Uint8Array> {
  const image = await decode(uri);
  const plan = planFor(image.width, image.height);

  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('invalid_image', 'canvas indisponível');
  // Fundo branco: PNG transparente não fica preto (nem vazado no WebP).
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const { originX, originY, width, height } = plan.crop;
  ctx.drawImage(image.source, originX, originY, width, height, 0, 0, plan.width, plan.height);
  image.close();

  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // O navegador que não sabe gerar WebP devolve PNG: aí vai de JPEG.
  const first = await encode('image/webp', WEBP_QUALITIES[0]!);
  const webp = first?.type === 'image/webp';
  const [type, qualities] = webp ? ['image/webp', WEBP_QUALITIES] : ['image/jpeg', JPEG_QUALITIES];
  for (const [i, quality] of qualities.entries()) {
    const blob = webp && i === 0 ? first : await encode(type, quality);
    if (!blob) throw new AppError('invalid_image', 'falha ao gerar a imagem');
    if (blob.size <= maxBytes) return new Uint8Array(await blob.arrayBuffer());
  }
  throw new AppError('payload_too_large');
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/** Abre a imagem respeitando a rotação do EXIF. Formato que o navegador não lê (HEIC no Chrome) = unsupported_image. */
async function decode(uri: string): Promise<Decoded> {
  try {
    const blob = await (await fetch(uri)).blob();
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    throw new AppError('unsupported_image', err instanceof Error ? err.message : String(err));
  }
}
