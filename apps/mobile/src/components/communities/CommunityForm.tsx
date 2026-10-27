import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COMMUNITY_MAX_ARTISTS, COMMUNITY_MAX_GENRES, COMMUNITY_SLUG, type CommunityInput, type CommunityVisibility } from '../../lib/api';
import { colors, fonts, radius, space, text } from '../../theme';
import { GenrePicker } from '../GenrePicker';
import { Button, TextField } from '../ui';
import { COMMUNITY_PALETTE, CommunityAvatar } from './CommunityAvatar';

/** "Fãs do Arctic Monkeys!" → "fas_do_arctic_monkeys" (sugestão de @). */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}

/**
 * Formulário de criar/editar comunidade: nome, @ (só ao criar), descrição, aberta ou fechada,
 * gêneros, artistas e cor. A validação de verdade é no banco; aqui só evita erro bobo.
 */
export function CommunityForm({
  initial,
  creating,
  busy,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: CommunityInput & { slug?: string };
  creating: boolean;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (value: CommunityInput & { slug: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(!!initial?.slug);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [visibility, setVisibility] = useState<CommunityVisibility>(initial?.visibility ?? 'open');
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? []);
  const [artists, setArtists] = useState<string[]>(initial?.artists ?? []);
  const [artist, setArtist] = useState('');
  const [color, setColor] = useState(initial?.color ?? 0);

  const finalSlug = (slugEdited ? slug : slugFromName(name)).toLowerCase();
  const nameOk = name.trim().length >= 3 && name.trim().length <= 60;
  const slugOk = !creating || COMMUNITY_SLUG.test(finalSlug);
  const canSubmit = nameOk && slugOk && description.length <= 500 && !busy;

  const addArtist = () => {
    const a = artist.trim();
    if (!a || artists.length >= COMMUNITY_MAX_ARTISTS || artists.some((x) => x.toLowerCase() === a.toLowerCase())) return setArtist('');
    setArtists([...artists, a.slice(0, 60)]);
    setArtist('');
  };

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.preview}>
        <CommunityAvatar name={name || '?'} color={color} size={64} closed={visibility === 'closed'} />
        <View style={{ flex: 1 }}>
          <Text style={styles.previewName} numberOfLines={1}>
            {name.trim() || t('communities.namePlaceholder')}
          </Text>
          {creating ? <Text style={styles.previewSlug}>@{finalSlug || '…'}</Text> : null}
        </View>
      </View>

      <TextField
        testID="community-name"
        label={t('communities.name')}
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder={t('communities.namePlaceholder')}
      />
      {creating ? (
        <TextField
          testID="community-slug"
          label={t('communities.slug')}
          value={finalSlug}
          onChangeText={(v) => {
            setSlugEdited(true);
            setSlug(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
          hint={t('communities.slugHint')}
          error={finalSlug && !slugOk ? t('communities.slugInvalid') : null}
        />
      ) : null}
      <TextField
        testID="community-description"
        label={t('communities.description')}
        value={description}
        onChangeText={setDescription}
        maxLength={500}
        multiline
        placeholder={t('communities.descriptionPlaceholder')}
        hint={`${description.length}/500`}
        style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: space.md }}
      />

      <View style={{ gap: space.sm }}>
        <Text style={text.label}>{t('communities.privacy')}</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {(['open', 'closed'] as const).map((v) => (
            <Pressable
              key={v}
              testID={`community-visibility-${v}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: visibility === v }}
              onPress={() => setVisibility(v)}
              style={[styles.segmentItem, visibility === v && styles.segmentOn]}
            >
              <Ionicons name={v === 'open' ? 'globe-outline' : 'lock-closed-outline'} size={18} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={styles.segmentTitle}>{t(v === 'open' ? 'communities.open' : 'communities.closed')}</Text>
                <Text style={styles.segmentHint}>{t(v === 'open' ? 'communities.openHint' : 'communities.closedHint')}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <GenrePicker value={genres} onChange={setGenres} max={COMMUNITY_MAX_GENRES} title={t('communities.genres')} />

      <View style={{ gap: space.sm }}>
        <Text style={text.label}>{t('communities.artists', { max: COMMUNITY_MAX_ARTISTS })}</Text>
        <View style={styles.artistRow}>
          <TextInput
            testID="community-artist"
            value={artist}
            onChangeText={setArtist}
            onSubmitEditing={addArtist}
            placeholder={t('communities.artistPlaceholder')}
            placeholderTextColor={colors.placeholder}
            accessibilityLabel={t('communities.artistPlaceholder')}
            maxLength={60}
            returnKeyType="done"
            editable={artists.length < COMMUNITY_MAX_ARTISTS}
            style={styles.artistInput}
          />
          <Pressable
            testID="community-artist-add"
            accessibilityRole="button"
            accessibilityLabel={t('communities.addArtist')}
            onPress={addArtist}
            style={styles.addButton}
          >
            <Ionicons name="add" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.chips}>
          {artists.map((a) => (
            <Pressable
              key={a}
              testID={`community-artist-${a}`}
              accessibilityRole="button"
              accessibilityLabel={t('communities.removeArtist', { artist: a })}
              onPress={() => setArtists(artists.filter((x) => x !== a))}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{a}</Text>
              <Ionicons name="close" size={14} color={colors.text} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={text.label}>{t('communities.color')}</Text>
        <View style={styles.colors} accessibilityRole="radiogroup">
          {COMMUNITY_PALETTE.map((c, i) => (
            <Pressable
              key={c}
              testID={`community-color-${i}`}
              accessibilityRole="radio"
              accessibilityLabel={t('communities.colorN', { n: i + 1 })}
              accessibilityState={{ selected: color === i }}
              onPress={() => setColor(i)}
              style={[styles.swatch, { backgroundColor: c }, color === i && styles.swatchOn]}
            />
          ))}
        </View>
      </View>

      {error ? <Text style={[text.small, { color: colors.danger }]}>{error}</Text> : null}
      <Button
        testID="community-submit"
        title={submitLabel}
        loading={busy}
        disabled={!canSubmit}
        onPress={() => onSubmit({ slug: finalSlug, name, description, visibility, genres, artists, color })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  previewName: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  previewSlug: { fontFamily: fonts.regular, fontSize: 13, color: colors.handle },
  segment: { gap: space.sm },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentOn: { borderColor: colors.primary, backgroundColor: 'rgba(104, 94, 255, 0.18)' },
  segmentTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  segmentHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  artistRow: { flexDirection: 'row', gap: space.sm },
  artistInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.field,
    paddingHorizontal: space.md,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  addButton: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, height: 30, borderRadius: 15, backgroundColor: colors.surface },
  chipText: { fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  colors: { flexDirection: 'row', gap: space.md },
  swatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: '#FFFFFF' },
});
