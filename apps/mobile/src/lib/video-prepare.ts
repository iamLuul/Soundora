import { VIBE_VIDEO_MAX } from './api';
import { AppError } from './errors';
import { readLocalFile } from './local-file';

/**
 * Android e iOS: o vídeo vai como veio da galeria (no iPhone o seletor já entrega em 720p,
 * H.264). Arquivo grande demais nem é lido.
 */
export async function prepareVideo(uri: string, fileSize?: number | null, _onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  if (fileSize && fileSize > VIBE_VIDEO_MAX.bytes) throw new AppError('video_too_large');
  const bytes = await readLocalFile(uri);
  if (bytes.byteLength > VIBE_VIDEO_MAX.bytes) throw new AppError('video_too_large');
  return bytes;
}
