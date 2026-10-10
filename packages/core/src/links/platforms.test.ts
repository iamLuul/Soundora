import { describe, expect, it } from 'vitest';
import { extractFirstUrl, isAllowedFetchHost, parseStreamingUrl, safeImageUrl } from './platforms.ts';

describe('parseStreamingUrl', () => {
  it.each([
    [
      'https://open.spotify.com/intl-pt/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123',
      { platform: 'spotify', kind: 'track', id: '4uLU6hMCjMI75M1A2tKUQC', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' },
    ],
    [
      'https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx',
      { platform: 'spotify', kind: 'album', id: '1GbtB4zTqAsyfZEsm1RZfx' },
    ],
    [
      'https://music.apple.com/br/album/bohemian-rhapsody/1440650428?i=1440650711',
      { platform: 'apple_music', kind: 'track', id: '1440650711', url: 'https://music.apple.com/br/album/bohemian-rhapsody/1440650428?i=1440650711' },
    ],
    ['https://music.apple.com/us/album/a-night-at-the-opera/1440650428', { platform: 'apple_music', kind: 'album', id: '1440650428' }],
    ['https://music.apple.com/us/song/bohemian-rhapsody/1440650711', { platform: 'apple_music', kind: 'track', id: '1440650711' }],
    ['https://music.apple.com/br/playlist/indie-br/pl.u-abc123', { platform: 'apple_music', kind: 'playlist', id: 'pl.u-abc123' }],
    ['https://www.deezer.com/br/track/3135556', { platform: 'deezer', kind: 'track', id: '3135556', url: 'https://www.deezer.com/track/3135556' }],
    ['https://music.youtube.com/watch?v=fJ9rUzIMcZQ&feature=share', { platform: 'youtube_music', kind: 'track', id: 'fJ9rUzIMcZQ' }],
    ['https://music.youtube.com/playlist?list=OLAK5uy_abc', { platform: 'youtube_music', kind: 'album', id: 'OLAK5uy_abc' }],
    ['https://youtu.be/fJ9rUzIMcZQ?t=10', { platform: 'youtube', kind: 'video', id: 'fJ9rUzIMcZQ', url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ' }],
    ['https://m.youtube.com/watch?v=fJ9rUzIMcZQ', { platform: 'youtube', kind: 'video' }],
    ['https://soundcloud.com/artista/faixa-nova?utm_source=x', { platform: 'soundcloud', kind: 'track', url: 'https://soundcloud.com/artista/faixa-nova' }],
    ['https://soundcloud.com/artista/sets/meu-ep', { platform: 'soundcloud', kind: 'playlist' }],
    ['https://tidal.com/browse/track/77646169', { platform: 'tidal', kind: 'track', id: '77646169' }],
    ['https://music.amazon.com.br/albums/B07ABC?trackAsin=B07XYZ', { platform: 'amazon_music', kind: 'track', id: 'B07XYZ' }],
    ['https://artista.bandcamp.com/track/faixa', { platform: 'bandcamp', kind: 'track' }],
    ['http://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', { url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' }],
  ])('reconhece %s', (input, expected) => {
    expect(parseStreamingUrl(input)).toMatchObject({ isShortLink: false, ...expected });
  });

  it.each(['https://spotify.link/AbCdEf', 'https://link.deezer.com/s/30abc', 'https://on.soundcloud.com/xyz'])(
    'marca link curto: %s',
    (input) => {
      expect(parseStreamingUrl(input)).toMatchObject({ isShortLink: true, kind: 'unknown' });
    },
  );

  it.each([
    'https://example.com/track/123',
    'https://open.spotify.com/track/curto',
    'https://open.spotify.com/',
    'https://soundcloud.com/discover',
    'https://bandcamp.com/',
    'ftp://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'javascript:alert(1)',
    'não é um link',
  ])('recusa %s', (input) => {
    expect(parseStreamingUrl(input)).toBeNull();
  });
});

describe('extractFirstUrl', () => {
  it('acha o link no meio do texto e tira a pontuação do fim', () => {
    expect(extractFirstUrl('ouve isso: https://youtu.be/fJ9rUzIMcZQ!')).toBe('https://youtu.be/fJ9rUzIMcZQ');
  });
  it('devolve null sem link', () => {
    expect(extractFirstUrl('sem link aqui')).toBeNull();
  });
});

describe('isAllowedFetchHost', () => {
  it('libera os provedores conhecidos', () => {
    expect(isAllowedFetchHost('api.deezer.com')).toBe(true);
    expect(isAllowedFetchHost('artista.bandcamp.com')).toBe(true);
    expect(isAllowedFetchHost('music.amazon.com.br')).toBe(true);
  });
  it('bloqueia hosts internos e desconhecidos', () => {
    for (const h of ['localhost', '127.0.0.1', '169.254.169.254', 'example.com', 'spotify.com.evil.io']) {
      expect(isAllowedFetchHost(h)).toBe(false);
    }
  });
  it('não aceita domínios que só começam como os da Amazon ou terminam como o Bandcamp', () => {
    for (const h of ['music.amazon.evil.com', 'music.amazon.com.attacker.net', 'music.amazon.com.br.evil.io', 'evil.bandcamp.com.attacker.net', 'a.b.bandcamp.com']) {
      expect(isAllowedFetchHost(h)).toBe(false);
    }
    expect(parseStreamingUrl('https://music.amazon.attacker.net/albums/B0X?trackAsin=B0Y')).toBeNull();
  });
});

describe('safeImageUrl', () => {
  it('aceita só https de CDNs conhecidos', () => {
    expect(safeImageUrl('https://i.scdn.co/image/abc')).toBe('https://i.scdn.co/image/abc');
    expect(safeImageUrl('https://f4.bcbits.com/img/a.jpg')).toBe('https://f4.bcbits.com/img/a.jpg');
    expect(safeImageUrl('http://i.scdn.co/image/abc')).toBeNull();
    expect(safeImageUrl('https://scdn.co.evil.io/x.jpg')).toBeNull();
    expect(safeImageUrl('https://169.254.169.254/x')).toBeNull();
    expect(safeImageUrl('lixo')).toBeNull();
  });
});
