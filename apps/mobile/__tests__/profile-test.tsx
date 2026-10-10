import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { compactNumber, ProfileHeader, PROFILE_LAYOUT } from '../src/components/ProfileView';
import i18n from '../src/lib/i18n';
import type { ProfileSummary } from '../src/lib/types';
import { nextUsernameChange } from '../src/lib/username';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock não aceita import
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() } }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ refreshProfile: jest.fn() }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/pick-image', () => ({ pickAndUploadProfileImage: jest.fn(async () => null) }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

const me: ProfileSummary = {
  id: '0b4c1d2e-0000-4000-8000-000000000001',
  username: 'luul',
  display_name: 'Luul',
  bio: 'Music enthusiast with a passion for beats and melodies.',
  avatar_url: null,
  banner_url: 'banners/0b4c1d2e-0000-4000-8000-000000000001/banner-1760000000000.jpg',
  followers: 1700,
  following: 253,
  posts: 12,
  likes: 139,
  is_me: true,
  i_follow: false,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  mockPush.mockReset();
  await i18n.changeLanguage('pt-BR');
});

describe('<ProfileHeader /> (layout do Figma)', () => {
  test('nome, @, números dos lados e bio', async () => {
    await render(<ProfileHeader profile={me} />, { wrapper });
    expect(screen.getByText('Luul')).toBeTruthy();
    expect(screen.getByText('@luul')).toBeTruthy();
    expect(screen.getByLabelText('Seguidores: 1,7k')).toBeTruthy();
    expect(screen.getByLabelText('Seguindo: 253')).toBeTruthy();
    expect(screen.getByLabelText('Posts: 12')).toBeTruthy();
    expect(screen.getByLabelText('Curtidas: 139')).toBeTruthy();
    expect(screen.getByText(me.bio!)).toBeTruthy();
  });

  test('foto centralizada: anel de 88 px que sobe 44 px sobre o banner de 120', async () => {
    await render(<ProfileHeader profile={me} />, { wrapper });
    const ring = StyleSheet.flatten(screen.getByTestId('profile-avatar').props.style);
    expect(ring).toMatchObject({ width: 88, height: 88, borderRadius: 44 });
    const banner = StyleSheet.flatten(screen.getByTestId('profile-banner').props.style);
    expect(banner.height).toBe(PROFILE_LAYOUT.banner);
  });

  test('meu perfil: foto e banner trocam com um toque; menu ⋮ leva às Configurações', async () => {
    await render(<ProfileHeader profile={me} />, { wrapper });
    expect(screen.getByLabelText('Trocar foto')).toBeTruthy();
    expect(screen.getByLabelText('Trocar banner')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('profile-menu'));
    expect(screen.getByText('Configurações')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('option-settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
    await fireEvent.press(screen.getByTestId('edit-profile'));
    expect(mockPush).toHaveBeenCalledWith('/settings/profile');
  });

  test('perfil de outra pessoa: botão seguir, sem edição de foto', async () => {
    await render(<ProfileHeader profile={{ ...me, is_me: false, i_follow: true, banner_url: null }} />, { wrapper });
    expect(screen.getByTestId('follow-button')).toBeTruthy();
    expect(screen.getAllByText('Seguindo')).toHaveLength(2); // cartão "Seguindo" e o botão
    expect(screen.queryByTestId('edit-profile')).toBeNull();
    expect(screen.queryByLabelText('Trocar foto')).toBeNull();
  });
});

describe('utilitários do perfil', () => {
  test('números compactos como no Figma', () => {
    expect(compactNumber(989, 'en')).toBe('989');
    expect(compactNumber(1700, 'en')).toBe('1.7k');
    expect(compactNumber(16_600, 'pt-BR')).toBe('16,6k');
    expect(compactNumber(2_500_000, 'en')).toBe('2.5M');
  });

  test('troca de @: liberada sem troca anterior ou depois de 30 dias', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(nextUsernameChange(null, now)).toBeNull();
    expect(nextUsernameChange('2026-09-01T12:00:00Z', now)).toBeNull();
    expect(nextUsernameChange('2026-10-01T12:00:00Z', now)?.toISOString()).toBe('2026-10-31T12:00:00.000Z');
  });
});
