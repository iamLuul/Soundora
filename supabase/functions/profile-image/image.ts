// Confere uma imagem pelos bytes, sem confiar no nome nem no Content-Type que o app mandou.
//
// - Só aceita JPEG, PNG e WebP, reconhecidos pela assinatura (magic bytes). ZIP, SVG, GIF,
//   HTML ou qualquer outra coisa com extensão trocada é recusado.
// - Lê a largura e a altura do cabeçalho, sem decodificar a imagem. Assim uma "bomba de
//   pixels" (arquivo pequeno que vira 50.000 x 50.000 px ao abrir) é recusada antes.
// - Recusa arquivos com dados depois do fim da imagem (ex.: um ZIP colado no fim de um JPEG)
//   e WebP animado.

export type ImageType = 'jpeg' | 'png' | 'webp';

export interface ImageLimits {
  maxBytes: number;
  minSide: number;
  maxSide: number;
  maxPixels: number;
}

/** Foto de perfil: chega com 512 px. */
export const IMAGE_LIMITS: ImageLimits = {
  maxBytes: 1024 * 1024,
  minSide: 32,
  maxSide: 2048,
  maxPixels: 2048 * 2048,
};

/** Banner (capa do perfil): chega com 1500 px de largura. */
export const BANNER_LIMITS: ImageLimits = {
  maxBytes: 2 * 1024 * 1024,
  minSide: 32,
  maxSide: 3000,
  maxPixels: 3000 * 1500,
};

export const CONTENT_TYPES: Record<ImageType, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXTENSIONS: Record<ImageType, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export type ImageCheck =
  | { ok: true; type: ImageType; width: number; height: number }
  | { ok: false; error: 'unsupported_image' | 'invalid_image' | 'image_dimensions' };

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32le = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)) + b[i + 3]! * 0x1000000;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
const startsWith = (b: Uint8Array, sig: number[]) => b.length >= sig.length && sig.every((v, i) => b[i] === v);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

export function sniffType(b: Uint8Array): ImageType | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(b, PNG_SIG)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return null;
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 + PNG_IEND.length || ascii(b, 12, 4) !== 'IHDR') return null;
  // Termina exatamente no chunk IEND: nada escondido depois.
  const tail = b.subarray(b.length - PNG_IEND.length);
  if (!PNG_IEND.every((v, i) => tail[i] === v)) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

// Marcadores SOF (início do quadro), onde ficam as dimensões do JPEG.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  // Termina no marcador EOI (FF D9): nada escondido depois.
  if (b.length < 4 || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff && i < b.length) i++; // bytes de preenchimento
    const marker = b[i]!;
    i++;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // sem tamanho
    if (marker === 0xd9 || marker === 0xda) return null; // fim ou dados antes do SOF
    if (i + 2 > b.length) return null;
    const len = u16be(b, i);
    if (len < 2 || i + len > b.length) return null;
    if (SOF.has(marker)) {
      if (len < 7) return null;
      return { height: u16be(b, i + 3), width: u16be(b, i + 5) };
    }
    i += len;
  }
  return null;
}

function webpSize(b: Uint8Array): { width: number; height: number; animated: boolean } | null {
  if (b.length < 30) return null;
  // O tamanho declarado no RIFF tem que bater com o arquivo: nada escondido depois.
  if (u32le(b, 4) + 8 !== b.length) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, animated: false };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const b0 = b[21]!, b1 = b[22]!, b2 = b[23]!, b3 = b[24]!;
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), animated: false };
  }
  if (chunk === 'VP8X') {
    return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27), animated: (b[20]! & 0x02) !== 0 };
  }
  return null;
}

export function inspectImage(bytes: Uint8Array, limits: ImageLimits = IMAGE_LIMITS): ImageCheck {
  const type = sniffType(bytes);
  if (!type) return { ok: false, error: 'unsupported_image' };
  const size = type === 'png' ? pngSize(bytes) : type === 'jpeg' ? jpegSize(bytes) : webpSize(bytes);
  if (!size) return { ok: false, error: 'invalid_image' };
  if ('animated' in size && size.animated) return { ok: false, error: 'unsupported_image' };
  const { width, height } = size;
  const { minSide, maxSide, maxPixels } = limits;
  if (width < minSide || height < minSide || width > maxSide || height > maxSide || width * height > maxPixels) {
    return { ok: false, error: 'image_dimensions' };
  }
  return { ok: true, type, width, height };
}
