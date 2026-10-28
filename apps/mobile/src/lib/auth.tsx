import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { canAddAccount, forgetAccount, listAccounts, nextParked, parkCurrent, rememberCurrent, tokenOf, type AccountInfo } from './accounts';
import { getMyProfile } from './api';
import { AppError } from './errors';
import i18n from './i18n';
import { disablePush, enablePush, pushEnabled } from './push';
import { supabase } from './supabase';
import type { Profile } from './types';

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  /** true até a sessão salva ser lida no primeiro carregamento. */
  loading: boolean;
  session: Session | null;
  /** null quando a pessoa entrou mas ainda não fez o onboarding. */
  profile: Profile | null;
  /**
   * Entrou, mas o perfil não carregou (rede, servidor). Não dá para saber se falta o onboarding:
   * o app mostra "tentar de novo" em vez de mandar uma conta pronta para o cadastro.
   */
  profileFailed: boolean;
  refreshProfile: () => Promise<void>;
  /**
   * Sai da conta. Se houver outra conta salva neste aparelho, ela abre no lugar (como trocar);
   * senão, volta para a tela de entrar.
   */
  signOut: () => Promise<void>;
  /** Contas salvas neste aparelho (a aberta incluída), para trocar sem sair. */
  accounts: AccountInfo[];
  /** Abre outra conta salva. Se o login dela venceu, ela sai da lista e a atual continua. */
  switchAccount: (userId: string) => Promise<void>;
  /** Guarda a conta aberta e vai para a tela de entrar, para entrar em mais uma. */
  addAccount: () => Promise<void>;
  /** Tira uma conta (que não é a aberta) da lista deste aparelho. */
  forgetSavedAccount: (userId: string) => Promise<void>;
  /** Na tela de entrar: entra direto numa conta salva no aparelho. */
  signInSaved: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFailed, setProfileFailed] = useState(false);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const reloadAccounts = useCallback(async () => setAccounts(await listAccounts()), []);
  const qc = useQueryClient();
  // Conta da sessão atual. Mudou (saiu, entrou, trocou de conta): apaga o cache das consultas,
  // senão a conta nova veria dados da anterior (sugestões do Descobrir, curtidas, plataforma...).
  const userRef = useRef<string | null | undefined>(undefined);
  const switchUser = useCallback(
    (s: Session | null) => {
      const id = s?.user.id ?? null;
      if (userRef.current !== undefined && userRef.current !== id) qc.clear();
      userRef.current = id;
    },
    [qc],
  );
  // Cada troca de sessão ganha um número; uma resposta atrasada de uma troca antiga é ignorada.
  const seq = useRef(0);

  /**
   * Aplica uma sessão. Conta nova (login, troca de conta): a sessão e o perfil passam a valer
   * JUNTOS, só depois de o perfil chegar. Antes, a sessão valia na hora e, até o perfil chegar,
   * o app via "logado sem perfil" e mostrava o cadastro por um instante. Mesma conta (token
   * renovado, perfil editado): a sessão troca na hora e o perfil atualiza por trás.
   */
  const applySession = useCallback(
    async (s: Session | null) => {
      const mine = ++seq.current;
      const id = s?.user.id ?? null;
      const sameUser = userRef.current === id;
      if (!s) {
        switchUser(null);
        setSession(null);
        setProfile(null);
        setProfileFailed(false);
        return;
      }
      if (sameUser) setSession(s);
      let next: Profile | null = null;
      let failed = false;
      try {
        next = await getMyProfile();
        if (next && next.locale !== i18n.language) await i18n.changeLanguage(next.locale);
      } catch {
        failed = true;
      }
      if (mine !== seq.current) return;
      // Mesma conta e falhou: mantém o que já aparece (perfil, ou o aviso de falha).
      if (failed && sameUser) return;
      switchUser(s);
      setSession(s);
      setProfile(failed ? null : next);
      setProfileFailed(failed);
      // Conta pronta: entra na lista de contas do aparelho (sem token; ver accounts.ts).
      if (next) await rememberCurrent(accountInfo(next)).catch(() => undefined);
      await reloadAccounts();
    },
    [switchUser, reloadAccounts],
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      // A sessão salva pode ser de uma conta que não existe mais (banco local recriado com
      // db reset, conta excluída). O token continua "válido" até vencer, então confere no
      // servidor; se a conta sumiu, sai e volta para o login em vez de travar no onboarding.
      if (data.session && (await accountGone())) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        if (!active) return;
        await applySession(null);
        setLoading(false);
        return;
      }
      await applySession(data.session);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Não chamar o Supabase direto dentro do callback (evita travas); agenda.
      setTimeout(() => applySession(s), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  /**
   * Entra numa conta salva com o token guardado dela. Se não der (o login dela venceu ou foi
   * encerrado), ela sai da lista e, se havia uma conta aberta, ela volta.
   */
  const enterSaved = useCallback(
    async (userId: string, current: Session | null) => {
      const token = await tokenOf(userId);
      const { data, error } = token ? await supabase.auth.refreshSession({ refresh_token: token }) : { data: { session: null }, error: null };
      if (!error && data.session && data.session.user.id === userId) return;
      await forgetAccount(userId);
      if (current) {
        const { data: now } = await supabase.auth.getSession();
        if (now.session?.user.id !== current.user.id) {
          await supabase.auth.setSession({ access_token: current.access_token, refresh_token: current.refresh_token }).catch(() => undefined);
        }
      }
      await reloadAccounts();
      throw new AppError('account_expired');
    },
    [reloadAccounts],
  );

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      profileFailed,
      accounts,
      refreshProfile: () => applySession(session),
      signOut: async () => {
        const leaving = session?.user.id ?? null;
        // Este aparelho para de receber push da conta que está saindo (precisa da sessão ainda).
        await disablePush().catch(() => undefined);
        await supabase.auth.signOut();
        if (leaving) await forgetAccount(leaving).catch(() => undefined);
        switchUser(null);
        qc.clear();
        // Outra conta salva no aparelho: abre ela em vez da tela de entrar.
        const next = await nextParked(leaving).catch(() => null);
        if (next) await enterSaved(next.userId, null).catch(() => undefined);
        await reloadAccounts();
      },
      switchAccount: async (userId: string) => {
        if (!session || userId === session.user.id) return;
        const pushWasOn = pushEnabled();
        // O push deste aparelho é da conta aberta: sai dela e (se estava ligado) vai para a nova.
        await disablePush().catch(() => undefined);
        if (profile) await parkCurrent(accountInfo(profile), session);
        await enterSaved(userId, session);
        if (pushWasOn) await enablePush().catch(() => undefined);
      },
      addAccount: async () => {
        if (!session) return;
        if (!(await canAddAccount(session.user.id))) throw new AppError('too_many_accounts');
        await disablePush().catch(() => undefined);
        if (profile) await parkCurrent(accountInfo(profile), session);
        // Só neste aparelho: o login da conta guardada continua valendo para voltar a ela.
        await supabase.auth.signOut({ scope: 'local' });
        await reloadAccounts();
      },
      signInSaved: (userId: string) => enterSaved(userId, null),
      forgetSavedAccount: async (userId: string) => {
        if (userId === session?.user.id) return;
        await forgetAccount(userId);
        await reloadAccounts();
      },
    }),
    [loading, session, profile, profileFailed, accounts, applySession, switchUser, qc, enterSaved, reloadAccounts],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function accountInfo(p: Profile): AccountInfo {
  return { userId: p.id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url };
}

/** true só quando o servidor diz que a conta da sessão não existe (sem internet = false). */
export async function accountGone(): Promise<boolean> {
  const { error } = await supabase.auth.getUser();
  if (!error) return false;
  const status = (error as { status?: number }).status;
  const code = (error as { code?: string }).code;
  return status === 401 || status === 403 || code === 'user_not_found' || code === 'session_not_found' || code === 'bad_jwt';
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}

/** Login com Google ou Apple pelo navegador (funciona em Android, iOS e Web). */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) throw error;
    return;
  }
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('missing_code');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export type LoginProvider = 'google' | 'apple';

/** Contas de login ligadas à conta (e-mail, Google, Apple). */
export async function fetchIdentities() {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return data.identities;
}

/**
 * Conecta Google ou Apple à conta logada (Configurações › Segurança). Mesmo caminho do login:
 * navegador do sistema e volta para o app com o código (na web, volta para a mesma página).
 */
export async function linkProvider(provider: LoginProvider): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo: window.location.href } });
    if (error) throw error;
    return;
  }
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('missing_code');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function unlinkProvider(provider: LoginProvider): Promise<void> {
  const identities = await fetchIdentities();
  const identity = identities.find((i) => i.provider === provider);
  if (!identity) return;
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw error;
}
