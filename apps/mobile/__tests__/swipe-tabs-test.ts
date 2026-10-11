import { swipeTarget } from '../src/components/SwipeTabs';

describe('arrastar para os lados troca de aba', () => {
  test('dedo para a esquerda: aba da direita; para a direita: volta', () => {
    expect(swipeTarget('index', -120, 0)).toBe('discover');
    expect(swipeTarget('discover', -120, 0)).toBe('music'); // pula o +
    expect(swipeTarget('music', 120, 0)).toBe('discover');
    expect(swipeTarget('discover', 120, 0)).toBe('index');
  });
  test('arrasto curto e lento não troca; rápido troca', () => {
    expect(swipeTarget('index', -40, -100)).toBeNull();
    expect(swipeTarget('index', -40, -900)).toBe('discover');
  });
  test('nas pontas e no + fica onde está', () => {
    expect(swipeTarget('index', 200, 0)).toBeNull();
    expect(swipeTarget('me', -200, 0)).toBeNull();
    expect(swipeTarget('compose', -200, 0)).toBeNull();
  });
});
