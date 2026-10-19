import { render, screen } from '@testing-library/react-native';
import { BootSkeleton } from '../src/components/desktop/DesktopSkeleton';
import * as layout from '../src/lib/layout';
import { AppSkeleton, PostSkeleton, TrackListSkeleton } from '../src/components/Skeleton';
import i18n from '../src/lib/i18n';

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

test('esqueleto avisa o leitor de tela que está carregando', async () => {
  await render(<PostSkeleton count={2} />);
  const s = screen.getByTestId('skeleton-posts');
  expect(s.props.accessibilityLabel).toBe('Carregando…');
  expect(s.props.accessibilityState).toEqual({ busy: true });
});

test('telas: app inteiro e lista de músicas', async () => {
  await render(
    <>
      <AppSkeleton />
      <TrackListSkeleton count={4} rank />
    </>,
  );
  expect(screen.getByTestId('skeleton-app')).toBeTruthy();
  expect(screen.getByTestId('skeleton-tracks')).toBeTruthy();
});

describe('esqueleto do app por largura da janela', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    ['mobile', 'skeleton-app', 'skeleton-app-desktop'],
    ['desktop', 'skeleton-app-desktop', 'skeleton-app'],
    ['wide', 'skeleton-app-desktop', 'skeleton-app'],
  ])('%s', async (name, present, absent) => {
    jest.spyOn(layout, 'useWebLayout').mockReturnValue(name as layout.WebLayout);
    await render(<BootSkeleton />);
    expect(screen.getByTestId(present)).toBeTruthy();
    expect(screen.queryByTestId(absent)).toBeNull();
  });
});
