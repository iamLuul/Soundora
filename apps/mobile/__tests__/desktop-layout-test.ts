import { DESKTOP_MIN, layoutFor, WIDE_MIN } from '../src/lib/layout';

describe('layout desktop na web', () => {
  it('celular e app nativo ficam sempre no layout de celular', () => {
    expect(layoutFor(1920, 'ios')).toBe('mobile');
    expect(layoutFor(1920, 'android')).toBe('mobile');
    expect(layoutFor(DESKTOP_MIN - 1, 'web')).toBe('mobile');
  });

  it('web larga: barra lateral; mais larga: também a coluna da direita', () => {
    expect(layoutFor(DESKTOP_MIN, 'web')).toBe('desktop');
    expect(layoutFor(WIDE_MIN - 1, 'web')).toBe('desktop');
    expect(layoutFor(WIDE_MIN, 'web')).toBe('wide');
    expect(layoutFor(1440, 'web')).toBe('wide');
  });
});
