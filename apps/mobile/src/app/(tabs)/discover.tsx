import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiscoverSection } from '../../components/DiscoverSection';
import { TopTabs } from '../../components/figma';
import { SearchPanel } from '../../components/SearchPanel';
import { TrendingSection } from '../../components/TrendingSection';
import { colors, space } from '../../theme';

type Section = 'discover' | 'trending' | 'search';

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>('discover');

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Figma: Search page — abas Discover | Trending | Search e o sino */}
      <TopTabs<Section>
        value={section}
        onChange={setSection}
        style={styles.header}
        tabs={[
          { value: 'discover', label: t('discover.segDiscover') },
          { value: 'trending', label: t('discover.segTrending') },
          { value: 'search', label: t('discover.segSearch') },
        ]}
      />
      <View style={styles.body}>
        {section === 'discover' ? <DiscoverSection /> : section === 'trending' ? <TrendingSection /> : <SearchPanel />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { marginHorizontal: space.lg },
  body: { flex: 1, paddingHorizontal: space.md, paddingTop: space.sm, maxWidth: 640, width: '100%', alignSelf: 'center' },
});
