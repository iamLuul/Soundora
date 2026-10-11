// Confere um vídeo MP4/MOV só lendo a estrutura (caixas ISO BMFF), sem decodificar nada:
// tipo real, duração, que tem trilha de vídeo e que nada foi colado depois do fim.

export interface VideoLimits {
  maxBytes: number;
  maxDurationMs: number;
  maxSide: number;
}

/** Vibe de vídeo: até 30 MB e 30 s (com folga de 1 s para o arredondamento do celular). */
export const VIDEO_LIMITS: VideoLimits = {
  maxBytes: 30 * 1024 * 1024,
  maxDurationMs: 31_000,
  maxSide: 4096,
};

export type VideoCheck =
  | { ok: true; durationMs: number; width: number; height: number }
  | { ok: false; error: 'unsupported_video' | 'invalid_video' | 'video_too_long' | 'video_dimensions' };

// Marcas do "ftyp" aceitas: MP4 comum, gravações do iPhone (QuickTime) e do Android.
const BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'qt  ', 'MSNV', 'dash', '3gp4', '3gp5', '3gp6']);
// Caixas que podem aparecer no nível de cima de um MP4.
const TOP = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'uuid', 'meta', 'pdin', 'udta', 'moof', 'mfra', 'sidx', 'styp', 'prft', 'emsg']);

const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

interface Box {
  type: string;
  start: number; // início do conteúdo
  end: number; // fim da caixa
}

/** Caixas filhas em [from, to). null se alguma caixa estiver quebrada. */
function boxes(b: Uint8Array, from: number, to: number): Box[] | null {
  const out: Box[] = [];
  let i = from;
  while (i < to) {
    if (i + 8 > to) return null;
    let size = u32(b, i);
    const type = ascii(b, i + 4, 4);
    let header = 8;
    if (size === 1) {
      if (i + 16 > to) return null;
      const hi = u32(b, i + 8);
      if (hi > 0x1f) return null; // > 128 GB: impossível aqui
      size = hi * 0x100000000 + u32(b, i + 12);
      header = 16;
    } else if (size === 0) {
      size = to - i; // vai até o fim
    }
    if (size < header || i + size > to) return null;
    out.push({ type, start: i + header, end: i + size });
    i += size;
  }
  return out;
}

const child = (b: Uint8Array, box: Box, type: string) => boxes(b, box.start, box.end)?.find((c) => c.type === type) ?? null;

export function inspectVideo(bytes: Uint8Array, limits: VideoLimits = VIDEO_LIMITS): VideoCheck {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return { ok: false, error: 'unsupported_video' };
  if (!BRANDS.has(ascii(bytes, 8, 4))) return { ok: false, error: 'unsupported_video' };

  // As caixas do nível de cima têm que cobrir o arquivo exatamente: nada escondido depois.
  const top = boxes(bytes, 0, bytes.length);
  if (!top || top.some((x) => !TOP.has(x.type))) return { ok: false, error: 'invalid_video' };
  const moovs = top.filter((x) => x.type === 'moov');
  if (moovs.length !== 1 || !top.some((x) => x.type === 'mdat')) return { ok: false, error: 'invalid_video' };
  const moov = moovs[0]!;

  const mvhd = child(bytes, moov, 'mvhd');
  if (!mvhd) return { ok: false, error: 'invalid_video' };
  const version = bytes[mvhd.start]!;
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (mvhd.start + 32 > mvhd.end) return { ok: false, error: 'invalid_video' };
    timescale = u32(bytes, mvhd.start + 20);
    duration = u32(bytes, mvhd.start + 24) * 0x100000000 + u32(bytes, mvhd.start + 28);
  } else {
    if (mvhd.start + 20 > mvhd.end) return { ok: false, error: 'invalid_video' };
    timescale = u32(bytes, mvhd.start + 12);
    duration = u32(bytes, mvhd.start + 16);
  }
  if (!timescale) return { ok: false, error: 'invalid_video' };
  const durationMs = Math.round((duration * 1000) / timescale);
  if (durationMs <= 0) return { ok: false, error: 'invalid_video' };
  if (durationMs > limits.maxDurationMs) return { ok: false, error: 'video_too_long' };

  // Precisa de uma trilha de vídeo; as dimensões vêm do "tkhd" dela.
  let size: { width: number; height: number } | null = null;
  for (const trak of boxes(bytes, moov.start, moov.end)?.filter((x) => x.type === 'trak') ?? []) {
    const mdia = child(bytes, trak, 'mdia');
    const hdlr = mdia && child(bytes, mdia, 'hdlr');
    if (!hdlr || hdlr.start + 12 > hdlr.end || ascii(bytes, hdlr.start + 8, 4) !== 'vide') continue;
    const tkhd = child(bytes, trak, 'tkhd');
    if (!tkhd || tkhd.end - tkhd.start < 84) return { ok: false, error: 'invalid_video' };
    // Largura e altura em ponto fixo 16.16, nos últimos 8 bytes do tkhd.
    size = { width: u32(bytes, tkhd.end - 8) >>> 16, height: u32(bytes, tkhd.end - 4) >>> 16 };
    break;
  }
  if (!size) return { ok: false, error: 'invalid_video' };
  if (size.width < 16 || size.height < 16 || size.width > limits.maxSide || size.height > limits.maxSide) {
    return { ok: false, error: 'video_dimensions' };
  }
  return { ok: true, durationMs, ...size };
}
