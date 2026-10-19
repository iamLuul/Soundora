import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../../theme';

/**
 * Selo "Patrocinado" dos anúncios. Política do AdMob: o selo do anúncio tem pelo menos 15 px de
 * altura e largura e fica bem visível (aqui, 18 px, branco sobre o roxo do app).
 */
export function SponsoredBadge({ testID = 'ad-sponsored' }: { testID?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.badge} testID={testID}>
      <Text style={styles.text}>{t('ads.sponsored')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minHeight: 18, minWidth: 18, borderRadius: 4, paddingHorizontal: 6, justifyContent: 'center', backgroundColor: '#6C62FF' },
  text: { fontFamily: fonts.bold, fontSize: 10, color: '#FFFFFF' },
});
