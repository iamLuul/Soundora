import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CommunityCard } from '../../lib/api';
import { colors, fonts, space } from '../../theme';
import { CommunityAvatar } from './CommunityAvatar';

/** Uma comunidade numa lista (busca, suas comunidades, recomendadas). */
export function CommunityRow({ item, right }: { item: CommunityCard; right?: React.ReactNode }) {
  const { t } = useTranslation();
  const closed = item.visibility === 'closed';
  const meta = [t('communities.members', { count: item.member_count }), closed ? t('communities.closed') : t('communities.open')].join(' · ');
  return (
    <Pressable
      testID={`community-${item.slug}`}
      accessibilityRole="link"
      accessibilityLabel={`${item.name}, ${meta}`}
      onPress={() => router.push(`/c/${item.slug}`)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
    >
      <CommunityAvatar name={item.name} color={item.color} size={48} closed={closed} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {item.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  description: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
});
