import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { genreLabel, prettyGenre, useGenres, useGenreSearch, type GenreRow } from '../lib/queries';
import { colors, fonts, space } from '../theme';

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Gêneros que batem com o texto digitado (nome em português ou inglês, sem acento). */
export function searchGenres(all: GenreRow[], query: string, exclude: string[]): GenreRow[] {
  const q = normalize(query.trim());
  return all.filter((g) => !exclude.includes(g.slug) && (!q || normalize(g.name_pt).includes(q) || normalize(g.name_en).includes(q) || g.slug.includes(q)));
}

/**
 * Escolher até `max` gêneros do catálogo inteiro (milhares), digitando para pesquisar no
 * servidor. Sem digitar, aparecem as sugestões (ex.: os gêneros em destaque). Os gêneros
 * detectados na música chegam já marcados (com o selo "detectado") e podem ser desmarcados.
 */
export function GenrePicker({
  value,
  onChange,
  detected = [],
  suggestions = [],
  max = 3,
  title,
  quickLimit = 10,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Detectados pelos metadados da música. */
  detected?: string[];
  /** Mostrados sem digitar (ex.: os gêneros do perfil). */
  suggestions?: string[];
  max?: number;
  /** Título no lugar de "Gêneros" (ex.: no editar perfil); null esconde. */
  title?: string | null;
  /** Quantas sugestões mostrar sem digitar. */
  quickLimit?: number;
}) {
  const { t, i18n } = useTranslation();
  const genres = useGenres();
  const [query, setQuery] = useState('');
  const all = useMemo(() => genres.data ?? [], [genres.data]);
  const full = value.length >= max;

  const remote = useGenreSearch(query);
  // Nomes dos gêneros escolhidos que vieram da pesquisa (fora dos destaques).
  const [known, setKnown] = useState<Record<string, GenreRow>>({});

  const results = useMemo(() => {
    if (query.trim()) {
      // Destaques que batem na hora; o catálogo do servidor completa assim que responde.
      const found = [...searchGenres(all, query, value), ...(remote.data ?? []).filter((g) => !value.includes(g.slug))];
      return found.filter((g, i) => found.findIndex((x) => x.slug === g.slug) === i).slice(0, 12);
    }
    const quick = [...detected, ...suggestions].filter((s, i, arr) => arr.indexOf(s) === i && !value.includes(s));
    return quick.map((slug) => all.find((g) => g.slug === slug) ?? known[slug] ?? { slug, name_pt: prettyGenre(slug), name_en: prettyGenre(slug) }).slice(0, quickLimit);
  }, [all, query, value, detected, suggestions, remote.data, known, quickLimit]);

  const add = (g: GenreRow) => {
    if (full || value.includes(g.slug)) return;
    setKnown((k) => ({ ...k, [g.slug]: g }));
    onChange([...value, g.slug]);
    setQuery('');
  };
  const remove = (slug: string) => onChange(value.filter((s) => s !== slug));
  const label = (slug: string) => {
    const k = known[slug];
    return k ? (i18n.language === 'pt-BR' ? k.name_pt : k.name_en) : (genreLabel(all, slug, i18n.language) ?? slug);
  };

  return (
    <View style={styles.wrap}>
      {title !== null ? (
        <Text style={styles.title}>
          {title ?? t('compose.genres')} <Text style={styles.counter}>{t('compose.genresCount', { count: value.length, max })}</Text>
        </Text>
      ) : null}

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
                <Pressable key={g.slug} testID={`genre-option-${g.slug}`} accessibilityRole="button" onPress={() => add(g)} style={styles.option}>
                  <Ionicons name="add" size={13} color={colors.textMuted} />
                  <Text style={styles.optionText}>{label(g.slug)}</Text>
                </Pressable>
              ))}
            </View>
          ) : query.trim() && !remote.isFetching ? (
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
