import { QueryClientContext, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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

/**
 * Selo de verificado (desenho do Raul): escudo roxo de topo reto e base arredondada, com o
 * check branco de pontas retas. Coordenadas medidas no desenho original (218 × 224).
 * Tamanho: a altura das maiúsculas do nome ao lado (~75% da fonte): 10 para nomes em 13–14 px.
 */
export function VerifiedBadge({ size = 10, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  return (
    <View testID="verified-badge" accessible accessibilityRole="image" accessibilityLabel={t('profile.verified')} style={style}>
      <Svg width={(size * 218) / 224} height={size} viewBox="6 7 218 224">
        <Path d="M6 7H224V122A109 109 0 0 1 6 122Z" fill={colors.primary} />
        <Path d="M66 117L92.8 143.8L161.5 85" fill="none" stroke="#FFFFFF" strokeWidth={17} strokeLinecap="butt" strokeLinejoin="miter" />
      </Svg>
    </View>
  );
}

type VerifiedProps = { username: string | null | undefined; size?: number; style?: StyleProp<ViewStyle> };

/** A insígnia, só se o perfil for verificado (fora de um QueryClientProvider, nada). */
export function Verified(props: VerifiedProps) {
  return useContext(QueryClientContext) ? <VerifiedIfListed {...props} /> : null;
}

function VerifiedIfListed({ username, size = 10, style }: VerifiedProps) {
  const verified = useVerifiedUsernames();
  if (!username || !verified.data?.has(username)) return null;
  return <VerifiedBadge size={size} style={style} />;
}
