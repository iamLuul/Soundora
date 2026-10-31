import { VIBE_VIDEO_MAX } from './api';
import { AppError } from './errors';

/** Maior lado do vídeo enviado (720p, o mesmo que o iPhone já entrega). */
export const VIDEO_MAX_SIDE = 1280;
/** Arquivo que nem tenta otimizar (o navegador teria que segurar tudo na memória). */
const READ_LIMIT = 400 * 1024 * 1024;

/**
 * Web: antes de enviar, o próprio navegador refaz o vídeo em MP4 (H.264) de até 720p, com
 * compressão média e o índice no começo do arquivo (começa a tocar antes de baixar tudo).
 * Fica bem menor que o vídeo da câmera e continua tocando em Android, iPhone e web.
 *
 * O conversor (WebCodecs) só é baixado aqui, na hora de enviar um vídeo: não pesa na abertura
 * do site. Navegador sem WebCodecs, ou qualquer falha: vai o original, se couber no limite.
 */
export async function prepareVideo(uri: string, _fileSize?: number | null, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > READ_LIMIT) throw new AppError('video_too_large');
  let best: Blob = blob;
  try {
    const smaller = await compress(blob, onProgress);
    if (smaller && smaller.size < blob.size) best = smaller;
  } catch {
    // Segue com o original.
  }
  if (best.size > VIBE_VIDEO_MAX.bytes) throw new AppError('video_too_large');
  return new Uint8Array(await best.arrayBuffer());
}

async function compress(file: Blob, onProgress?: (fraction: number) => void): Promise<Blob | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return null;
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const conversion = await mb.Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: async (track) => {
      const w = await track.getDisplayWidth();
      const h = await track.getDisplayHeight();
      const scale = Math.min(1, VIDEO_MAX_SIDE / Math.max(w, h));
      // Lados pares: o H.264 exige.
      const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
      // Vídeo de 60 quadros por segundo cai para 30 (metade do peso, a diferença quase não aparece).
      const { averagePacketRate } = await track.computePacketStats(90);
      return {
        codec: 'avc',
        width: even(w),
        height: even(h),
        fit: 'fill',
        quality: mb.QUALITY_MEDIUM,
        ...(averagePacketRate > 31 ? { frameRate: 30 } : null),
      } as const;
    },
    // Áudio: copiado como está quando já é AAC (o normal); senão, convertido.
  });
  // Faltou o vídeo ou o som (ex.: o navegador não sabe gerar o áudio): melhor mandar o original.
  const hadAudio = (await input.getPrimaryAudioTrack()) !== null;
  const kept = conversion.utilizedTracks;
  if (!conversion.isValid || !kept.some((t) => t.isVideoTrack()) || (hadAudio && !kept.some((t) => t.isAudioTrack()))) return null;
  if (onProgress) conversion.onProgress = onProgress;
  await conversion.execute();
  const buffer = target.buffer;
  return buffer ? new Blob([buffer], { type: 'video/mp4' }) : null;
}
