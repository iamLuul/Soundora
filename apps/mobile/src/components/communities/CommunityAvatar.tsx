import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../../theme';

/** As 6 cores que a dona pode escolher (fundo da "foto" da comunidade). */
export const COMMUNITY_PALETTE = ['#685EFF', '#D9488F', '#1F9E6E', '#C77A12', '#2F6FD6', '#8E44C9'] as const;

export const communityColor = (color: number) => COMMUNITY_PALETTE[color] ?? COMMUNITY_PALETTE[0];

/** "Foto" da comunidade: a inicial do nome sobre a cor escolhida (cadeado pequeno se fechada). */
export function CommunityAvatar({ name, color, size = 44, closed = false }: { name: string; color: number; size?: number; closed?: boolean }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      style={[styles.box, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: communityColor(color) }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.initial, { fontSize: size * 0.46 }]}>{initial}</Text>
      {closed ? (
        <View style={[styles.lock, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21 }]}>
          <Ionicons name="lock-closed" size={size * 0.24} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.bold, color: '#FFFFFF' },
  lock: { position: 'absolute', right: -4, bottom: -4, backgroundColor: '#3A374C', alignItems: 'center', justifyContent: 'center' },
});
