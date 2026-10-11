import { PROFILE_IMAGE_OUTPUT, planProfileImage } from '../src/lib/image-plan';

describe('conversão da foto e do banner no aparelho', () => {
  test.each([
    ['foto de celular em pé', 'avatar', 3024, 4032],
    ['panorâmica', 'avatar', 8000, 1000],
    ['minúscula', 'avatar', 10, 10],
    ['1 px de altura', 'banner', 4000, 1],
    ['banner em pé', 'banner', 1080, 1920],
    ['tamanho estranho', 'banner', 1501, 499],
  ] as const)('%s: recorte dentro da imagem e tamanho final fixo', (_name, kind, w, h) => {
    const plan = planProfileImage(kind, w, h);
    const out = PROFILE_IMAGE_OUTPUT[kind];
    expect([plan.width, plan.height]).toEqual([out.width, out.height]);
    const { originX, originY, width, height } = plan.crop;
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(originX).toBeGreaterThanOrEqual(0);
    expect(originY).toBeGreaterThanOrEqual(0);
    expect(originX + width).toBeLessThanOrEqual(w);
    expect(originY + height).toBeLessThanOrEqual(h);
  });

  test('recorte central na proporção certa', () => {
    expect(planProfileImage('avatar', 3000, 2000).crop).toEqual({ originX: 500, originY: 0, width: 2000, height: 2000 });
    expect(planProfileImage('banner', 3000, 2000).crop).toEqual({ originX: 0, originY: 500, width: 3000, height: 1000 });
  });

  test('tamanho final cabe nos limites do servidor (profile-image)', () => {
    expect(PROFILE_IMAGE_OUTPUT.avatar).toMatchObject({ width: 512, height: 512, maxBytes: 1024 * 1024 });
    expect(PROFILE_IMAGE_OUTPUT.banner).toMatchObject({ width: 1500, height: 500, maxBytes: 2 * 1024 * 1024 });
  });
});
