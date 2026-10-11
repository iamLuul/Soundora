import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EditProfileScreen from '../src/app/settings/profile';
import i18n from '../src/lib/i18n';

const mockSetGenres = jest.fn(async (_g: string[]) => undefined);
const mockUpdate = jest.fn(async (_p: unknown) => undefined);
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() } }));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', username: 'raul', display_name: 'Raul', bio: null, avatar_url: null, banner_url: null }, refreshProfile: jest.fn() }),
}));
jest.mock('../src/lib/pick-image', () => ({ pickAndUploadProfileImage: jest.fn(async () => null) }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../src/lib/supabase', () => ({
  supabaseUrl: 'http://localhost:54321',
  supabase: {
    rpc: jest.fn(async (_fn: string, args: { p_query: string }) => ({
      data: args.p_query.startsWith('vapor') ? [{ slug: 'vaporwave', name_pt: 'Vaporwave', name_en: 'Vaporwave', featured: false }] : [],
      error: null,
    })),
    from: () => ({
      select: () => {
        const q = { eq: () => q, order: async () => ({
          data: ['indie', 'pop', 'rock', 'jazz'].map((slug) => ({ slug, name_pt: slug.toUpperCase(), name_en: slug })),
          error: null,
        }) };
        return q;
      },
    }),
  },
}));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  getMyGenres: async () => ['indie', 'pop', 'rock'],
  setMyGenres: (g: string[]) => mockSetGenres(g),
  updateProfile: (p: unknown) => mockUpdate(p),
}));

async function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <EditProfileScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
});

describe('Editar perfil › gêneros', () => {
  test('mostra os gêneros do perfil, pede o mínimo e salva os novos', async () => {
    await wrap();
    await waitFor(() => expect(screen.getByTestId('genre-selected-rock')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('genre-selected-rock'));
    await fireEvent.press(screen.getByTestId('save-profile'));
    expect(screen.getByText('Escolha pelo menos 3 gêneros.')).toBeTruthy();
    expect(mockSetGenres).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('genre-option-jazz'));
    await fireEvent.press(screen.getByTestId('save-profile'));
    await waitFor(() => expect(mockSetGenres).toHaveBeenCalledWith(['indie', 'pop', 'jazz']));
  });

  test('pesquisa no catálogo inteiro e adiciona um gênero que não está em destaque', async () => {
    await wrap();
    await waitFor(() => expect(screen.getByTestId('genre-selected-rock')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('genre-search'), 'vapor');
    await waitFor(() => expect(screen.getByTestId('genre-option-vaporwave')).toBeTruthy(), { timeout: 2000 });
    await fireEvent.press(screen.getByTestId('genre-option-vaporwave'));
    expect(screen.getByTestId('genre-selected-vaporwave')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('save-profile'));
    await waitFor(() => expect(mockSetGenres).toHaveBeenCalledWith(['indie', 'pop', 'rock', 'vaporwave']));
  });
});
