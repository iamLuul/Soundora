import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ProfileImageKind } from './api';
import { AppError } from './errors';
import { readLocalFile } from './local-file';
import {
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
 * Android e iOS: converte qualquer imagem da galeria (HEIC, PNG, JPEG, foto de 48 MP...) num
 * WebP do tamanho exato do perfil, sem metadados (EXIF/GPS saem na recodificação). O WebP fica
 * bem menor que o JPEG: ocupa menos espaço e carrega mais rápido.
 * Só esse arquivo vai para o servidor, que ainda confere tudo de novo.
 */
export function convertProfileImage(kind: ProfileImageKind, uri: string, width: number, height: number): Promise<Uint8Array> {
  return convertImage(uri, width, height, (w, h) => planProfileImage(kind, w, h), PROFILE_IMAGE_OUTPUT[kind].maxBytes);
}

/** Foto de vibe: imagem inteira, até 1080 × 1920, WebP sem metadados. */
export function convertVibePhoto(uri: string, width: number, height: number): Promise<Uint8Array> {
  return convertImage(uri, width, height, planVibePhoto, VIBE_PHOTO_MAX.maxBytes);
}

/** Foto de post: imagem inteira, até 1440 × 1440, WebP sem metadados. */
export function convertPostPhoto(uri: string, width: number, height: number): Promise<Uint8Array> {
  return convertImage(uri, width, height, planPostPhoto, POST_PHOTO_MAX.maxBytes);
}

async function convertImage(uri: string, width: number, height: number, planFor: (w: number, h: number) => ImagePlan, maxBytes: number): Promise<Uint8Array> {
  let w = width;
  let h = height;
  if (!(w > 0 && h > 0)) {
    // A galeria às vezes não informa o tamanho: lê da própria imagem.
    const probe = await ImageManipulator.manipulate(uri).renderAsync();
    w = probe.width;
    h = probe.height;
  }
  if (!(w > 0 && h > 0)) throw new AppError('invalid_image', 'imagem sem tamanho');

  const plan = planFor(w, h);
  const context = ImageManipulator.manipulate(uri);
  context.crop(plan.crop);
  context.resize({ width: plan.width, height: plan.height });
  const rendered = await context.renderAsync();

  for (const compress of WEBP_QUALITIES) {
    const saved = await rendered.saveAsync({ format: SaveFormat.WEBP, compress });
    const bytes = await readLocalFile(saved.uri);
    if (bytes.byteLength <= maxBytes) return bytes;
  }
  throw new AppError('payload_too_large');
}
