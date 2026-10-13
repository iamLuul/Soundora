import { carouselOptions, dragOffset, swipeNeighbors, swipeTarget } from '../src/components/SwipeTabs';

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

describe('carrossel das abas', () => {
  test('vizinhas de cada aba (o + fica de fora)', () => {
    expect(swipeNeighbors('index')).toEqual({ left: null, right: 'discover' });
    expect(swipeNeighbors('discover')).toEqual({ left: 'index', right: 'music' });
    expect(swipeNeighbors('me')).toEqual({ left: 'music', right: null });
    expect(swipeNeighbors('compose')).toEqual({ left: null, right: null });
  });
  test('a tela acompanha o dedo depois da ativação e vira elástico nas pontas', () => {
    expect(dragOffset('discover', -130)).toBe(-100);
    expect(dragOffset('discover', 130)).toBe(100);
    expect(dragOffset('discover', 20)).toBe(0);
    // Início não tem aba à esquerda: anda só um quarto.
    expect(dragOffset('index', 130)).toBe(25);
    expect(dragOffset('index', -130)).toBe(-100);
  });
  test('o + abre e fecha sem deslizar; as outras abas usam o carrossel', () => {
    expect(carouselOptions('compose')).toEqual({});
    expect(carouselOptions('music').sceneStyleInterpolator).toBeInstanceOf(Function);
  });
});
