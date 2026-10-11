import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { genreLabel, useGenres, type GenreRow } from '../lib/queries';
import { colors, fonts, space } from '../theme';

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Gêneros que batem com o texto digitado (nome em português ou inglês, sem acento). */
export function searchGenres(all: GenreRow[], query: string, exclude: string[]): GenreRow[] {
  const q = normalize(query.trim());
  return all.filter((g) => !exclude.includes(g.slug) && (!q || normalize(g.name_pt).includes(q) || normalize(g.name_en).includes(q) || g.slug.includes(q)));
}

/**
 * Escolher até `max` gêneros de toda a lista do app, digitando para filtrar. Os gêneros
 * detectados na música chegam já marcados (com o selo "detectado") e podem ser desmarcados.
 */
export function GenrePicker({
  value,
  onChange,
  detected = [],
  suggestions = [],
  max = 3,
  title,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Detectados pelos metadados da música. */
  detected?: string[];
  /** Mostrados sem digitar (ex.: os gêneros do perfil). */
  suggestions?: string[];
  max?: number;
  /** Título no lugar de "Gêneros" (ex.: no editar perfil). */
  title?: string;
}) {
  const { t, i18n } = useTranslation();
  const genres = useGenres();
  const [query, setQuery] = useState('');
  const all = useMemo(() => genres.data ?? [], [genres.data]);
  const full = value.length >= max;

  const results = useMemo(() => {
    if (query.trim()) return searchGenres(all, query, value).slice(0, 10);
    const quick = [...detected, ...suggestions].filter((s, i, arr) => arr.indexOf(s) === i && !value.includes(s));
    return quick.map((slug) => all.find((g) => g.slug === slug)).filter((g): g is GenreRow => !!g).slice(0, 10);
  }, [all, query, value, detected, suggestions]);

  const add = (slug: string) => {
    if (full || value.includes(slug)) return;
    onChange([...value, slug]);
    setQuery('');
  };
  const remove = (slug: string) => onChange(value.filter((s) => s !== slug));
  const label = (slug: string) => genreLabel(all, slug, i18n.language) ?? slug;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        {title ?? t('compose.genres')} <Text style={styles.counter}>{t('compose.genresCount', { count: value.length, max })}</Text>
      </Text>

      {value.length ? (
        <View style={styles.row}>
          {value.map((slug) => (
            <Pressable
              key={slug}
              testID={`genre-selected-${slug}`}
              accessibilityRole="button"
              accessibilityLabel={t('compose.removeGenre', { genre: label(slug) })}
              onPress={() => remove(slug)}
              style={styles.selected}
            >
              {detected.includes(slug) ? <Ionicons name="sparkles" size={11} color={colors.text} /> : null}
              <Text style={styles.selectedText}>{label(slug)}</Text>
              <Ionicons name="close" size={13} color={colors.text} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {value.some((s) => detected.includes(s)) ? <Text style={styles.hint}>{t('compose.detectedHint')}</Text> : null}

      {!full ? (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={15} color={colors.placeholder} />
            <TextInput
              testID="genre-search"
              value={query}
              onChangeText={setQuery}
              placeholder={t('compose.genreSearch')}
              placeholderTextColor={colors.placeholder}
              autoCorrect={false}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
          {results.length ? (
            <View style={styles.row}>
              {results.map((g) => (
                <Pressable key={g.slug} testID={`genre-option-${g.slug}`} accessibilityRole="button" onPress={() => add(g.slug)} style={styles.option}>
                  <Ionicons name="add" size={13} color={colors.textMuted} />
                  <Text style={styles.optionText}>{label(g.slug)}</Text>
                </Pressable>
              ))}
            </View>
          ) : query.trim() ? (
            <Text style={styles.hint}>{t('compose.genreNotFound')}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  title: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  counter: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: space.md, paddingVertical: 6 },
  selectedText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
  option: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: colors.handle, borderRadius: 14, paddingHorizontal: space.md, paddingVertical: 5 },
  optionText: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.handle, borderRadius: 10, paddingHorizontal: space.md },
  input: { flex: 1, minHeight: 38, color: colors.text, fontFamily: fonts.regular, fontSize: 13, outlineWidth: 0 },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
