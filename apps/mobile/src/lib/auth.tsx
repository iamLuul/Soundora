import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { getMyProfile } from './api';
import i18n from './i18n';
import { disablePush } from './push';
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFailed, setProfileFailed] = useState(false);
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
    },
    [switchUser],
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

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      profileFailed,
      refreshProfile: () => applySession(session),
      signOut: async () => {
        // Este aparelho para de receber push da conta que está saindo (precisa da sessão ainda).
        await disablePush().catch(() => undefined);
        await supabase.auth.signOut();
        switchUser(null);
        qc.clear();
      },
    }),
    [loading, session, profile, profileFailed, applySession, switchUser, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
