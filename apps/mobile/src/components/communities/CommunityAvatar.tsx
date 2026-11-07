import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { communityImageUrl } from '../../lib/avatar';
import { fonts } from '../../theme';

/** As 6 cores que a dona pode escolher (fundo da "foto" da comunidade). */
export const COMMUNITY_PALETTE = ['#685EFF', '#D9488F', '#1F9E6E', '#C77A12', '#2F6FD6', '#8E44C9'] as const;

export const communityColor = (color: number) => COMMUNITY_PALETTE[color] ?? COMMUNITY_PALETTE[0];

/** Cor de fundo de uma comunidade nova sem foto: sai do nome (a mesma para o mesmo nome). */
export function colorForName(name: string): number {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h % COMMUNITY_PALETTE.length;
}

/**
 * Foto da comunidade: a imagem que a dona escolheu ou, sem foto, a inicial do nome sobre a cor
 * (cadeado pequeno se fechada). `image` é o caminho no Storage; `uri`, uma imagem do aparelho
 * ainda não enviada (prévia na criação).
 */
export function CommunityAvatar({
  name,
  color,
  image,
  uri,
  size = 44,
  closed = false,
}: {
  name: string;
  color: number;
  image?: string | null;
  uri?: string | null;
  size?: number;
  closed?: boolean;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const source = uri ?? communityImageUrl(image);
  return (
    <View
      style={[styles.box, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: communityColor(color) }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {source ? (
        <Image source={{ uri: source }} style={{ width: size, height: size, borderRadius: size * 0.28 }} contentFit="cover" transition={120} />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.46 }]}>{initial}</Text>
      )}
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
