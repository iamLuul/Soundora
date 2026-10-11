import type { ProfileImageKind } from './api';
import { AppError } from './errors';
import { JPEG_QUALITIES, PROFILE_IMAGE_OUTPUT, planProfileImage } from './image-plan';

/**
 * Web: converte direto num canvas do tamanho final (o expo-image-manipulator da Web quebra
 * com "createImageData: Invalid width or height" e reamostra pixel a pixel, lento em fotos
 * grandes). Sai um JPEG do tamanho exato do perfil, sem metadados.
 */
export async function convertProfileImage(kind: ProfileImageKind, uri: string, _width?: number, _height?: number): Promise<Uint8Array> {
  const image = await decode(uri);
  const plan = planProfileImage(kind, image.width, image.height);

  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('invalid_image', 'canvas indisponível');
  // Fundo branco: PNG transparente não fica preto no JPEG.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const { originX, originY, width, height } = plan.crop;
  ctx.drawImage(image.source, originX, originY, width, height, 0, 0, plan.width, plan.height);
  image.close();

  const { maxBytes } = PROFILE_IMAGE_OUTPUT[kind];
  for (const quality of JPEG_QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new AppError('invalid_image', 'falha ao gerar o JPEG');
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
