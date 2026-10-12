import { QueryClientContext, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

/**
 * Usernames dos perfis verificados. São poucos (a equipe verifica direto no banco), então o
 * app busca a lista inteira uma vez e guarda por 10 min, em vez de mudar todas as consultas.
 */
export function useVerifiedUsernames() {
  return useQuery({
    queryKey: ['verified-usernames'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('username').eq('verified', true).limit(2000);
      if (error) throw error;
      return new Set((data as { username: string }[]).map((r) => r.username));
    },
  });
}

/** Selo: um círculo recortado (roseta) roxo com o check branco. */
export function VerifiedBadge({ size = 14, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  return (
    <View testID="verified-badge" accessible accessibilityRole="image" accessibilityLabel={t('profile.verified')} style={style}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polygon points="12.00,1.00 14.41,3.02 17.50,2.47 18.58,5.42 21.53,6.50 20.98,9.59 23.00,12.00 20.98,14.41 21.53,17.50 18.58,18.58 17.50,21.53 14.41,20.98 12.00,23.00 9.59,20.98 6.50,21.53 5.42,18.58 2.47,17.50 3.02,14.41 1.00,12.00 3.02,9.59 2.47,6.50 5.42,5.42 6.50,2.47 9.59,3.02" fill={colors.primary} stroke={colors.primary} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M7.6 12.4l2.9 2.9 5.9-6.1" fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

type VerifiedProps = { username: string | null | undefined; size?: number; style?: StyleProp<ViewStyle> };

/** A insígnia, só se o perfil for verificado (fora de um QueryClientProvider, nada). */
export function Verified(props: VerifiedProps) {
  return useContext(QueryClientContext) ? <VerifiedIfListed {...props} /> : null;
}

function VerifiedIfListed({ username, size = 14, style }: VerifiedProps) {
  const verified = useVerifiedUsernames();
  if (!username || !verified.data?.has(username)) return null;
  return <VerifiedBadge size={size} style={style} />;
}
