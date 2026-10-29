import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import type { ChartPeriod } from '../lib/api';
import { colors, fonts, glass, gradients, space } from '../theme';
import { Reactive } from './Reactive';

const PERIODS: ChartPeriod[] = ['week', 'month', 'year'];

/** "Semana | Mês | Ano" do ranking mundial (sempre os últimos 7, 30 ou 360 dias). */
export function ChartPeriodPicker({ value, onChange, testID = 'chart-period' }: { value: ChartPeriod; onChange: (p: ChartPeriod) => void; testID?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={t('trending.periodLabel')}>
      {PERIODS.map((p) => {
        const on = p === value;
        return (
          <Reactive
            key={p}
            testID={`${testID}-${p}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(p)}
            pressScale={0.94}
            style={[styles.item, on && styles.on]}
          >
            <Text style={[styles.text, on && styles.textOn]}>{t(`trending.${p}`)}</Text>
          </Reactive>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 999, ...glass.chip, padding: 2, gap: 2 },
  item: { paddingHorizontal: space.sm + 2, paddingVertical: 3, borderRadius: 999 },
  on: { backgroundColor: colors.primary, backgroundImage: gradients.primary },
  text: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMutedOnSurface },
  textOn: { color: colors.text },
});
