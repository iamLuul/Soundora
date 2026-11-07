import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  communitySlugAvailable,
  COMMUNITY_MAX_ARTISTS,
  COMMUNITY_MAX_GENRES,
  COMMUNITY_SLUG,
  type CommunityInput,
  type CommunityVisibility,
} from '../../lib/api';
import { formatError } from '../../lib/errors';
import { useDebouncedValue } from '../../lib/hooks';
import { pickSquareImage, type PickedImage } from '../../lib/pick-image';
import { colors, fonts, radius, space, text } from '../../theme';
import { GenrePicker } from '../GenrePicker';
import { Button, TextField } from '../ui';
import { colorForName, CommunityAvatar } from './CommunityAvatar';

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

export type CommunityFormValue = CommunityInput & {
  slug: string;
  /** Foto nova escolhida no aparelho; null = tirar a foto; undefined = não mexeu. */
  photo?: PickedImage | null;
};

/** As etapas da criação (na edição, as três ficam na mesma tela, uma seção cada). */
const STEPS = ['identity', 'about', 'music'] as const;
type Step = (typeof STEPS)[number];

/**
 * Formulário de criar/editar comunidade. Criar é em 3 etapas curtas (nome e foto; sobre e quem
 * entra; o som da comunidade); editar mostra tudo numa tela, separado por seção.
 * A validação de verdade é no banco; aqui só evita erro bobo.
 */
export function CommunityForm({
  initial,
  creating,
  busy,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: CommunityInput & { slug?: string; avatar_url?: string | null };
  creating: boolean;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (value: CommunityFormValue) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(!!initial?.slug);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [visibility, setVisibility] = useState<CommunityVisibility>(initial?.visibility ?? 'open');
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? []);
  const [artists, setArtists] = useState<string[]>(initial?.artists ?? []);
  const [artist, setArtist] = useState('');
  const [photo, setPhoto] = useState<PickedImage | null | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Sem foto, a inicial fica sobre uma cor: a da comunidade (editar) ou uma tirada do nome (criar).
  const color = initial?.color ?? colorForName(name);
  const hasPhoto = photo ? true : photo === null ? false : !!initial?.avatar_url;

  const finalSlug = (slugEdited ? slug : slugFromName(name)).toLowerCase();
  const nameOk = name.trim().length >= 3 && name.trim().length <= 60;
  const slugOk = !creating || COMMUNITY_SLUG.test(finalSlug);
  // O @ é único entre pessoas e comunidades: confere enquanto a pessoa digita.
  const slugToCheck = useDebouncedValue(creating && slugOk ? finalSlug : '', 400);
  const available = useQuery({
    queryKey: ['community-slug', slugToCheck],
    queryFn: () => communitySlugAvailable(slugToCheck),
    enabled: !!slugToCheck,
    staleTime: 30_000,
  });
  const slugTaken = creating && slugToCheck === finalSlug && available.data === false;
  const identityOk = nameOk && slugOk && !slugTaken;
  const canSubmit = identityOk && description.length <= 500 && !busy;

  const addArtist = () => {
    const a = artist.trim();
    if (!a || artists.length >= COMMUNITY_MAX_ARTISTS || artists.some((x) => x.toLowerCase() === a.toLowerCase())) return setArtist('');
    setArtists([...artists, a.slice(0, 60)]);
    setArtist('');
  };

  const choosePhoto = async () => {
    setPhotoError(null);
    try {
      const picked = await pickSquareImage();
      if (picked) setPhoto(picked);
    } catch (err) {
      setPhotoError(formatError(t, err));
    }
  };

  const submit = () => onSubmit({ slug: finalSlug, name, description, visibility, genres, artists, color, photo });

  const section = (id: Step) => {
    if (id === 'identity')
      return (
        <View style={{ gap: space.lg }}>
          <View style={styles.photoRow}>
            <Pressable
              testID="community-photo"
              accessibilityRole="button"
              accessibilityLabel={t(hasPhoto ? 'communities.photoChange' : 'communities.photoAdd')}
              onPress={choosePhoto}
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <CommunityAvatar
                name={name || '?'}
                color={color}
                uri={photo?.uri}
                image={photo === null ? null : initial?.avatar_url}
                size={80}
                closed={visibility === 'closed'}
              />
              <View style={styles.photoBadge}>
                <Ionicons name="camera" size={14} color={colors.text} />
              </View>
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.previewName} numberOfLines={1}>
                {name.trim() || t('communities.namePlaceholder')}
              </Text>
              {creating ? <Text style={styles.previewSlug}>@{finalSlug || '…'}</Text> : null}
              <View style={styles.photoActions}>
                <Text testID="community-photo-pick" style={styles.link} accessibilityRole="button" onPress={choosePhoto}>
                  {t(hasPhoto ? 'communities.photoChange' : 'communities.photoAdd')}
                </Text>
                {hasPhoto ? (
                  <Text testID="community-photo-remove" style={styles.linkMuted} accessibilityRole="button" onPress={() => setPhoto(null)}>
                    {t('communities.photoRemove')}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
          <Text style={text.small}>{photoError ?? t('communities.photoHint')}</Text>

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
              error={finalSlug && !slugOk ? t('communities.slugInvalid') : slugTaken ? t('communities.slugTaken') : null}
              success={creating && slugOk && slugToCheck === finalSlug && available.data === true ? t('communities.slugFree') : null}
            />
          ) : null}
        </View>
      );
    if (id === 'about')
      return (
        <View style={{ gap: space.lg }}>
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
        </View>
      );
    return (
      <View style={{ gap: space.lg }}>
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
      </View>
    );
  };

  const errorText = error ? <Text style={[text.small, { color: colors.danger }]}>{error}</Text> : null;

  // Editar: as três partes numa tela só, cada uma com o seu título.
  if (!creating) {
    return (
      <View style={{ gap: space.xl }}>
        {STEPS.map((id) => (
          <View key={id} style={{ gap: space.md }}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t(`communities.section_${id}`)}
            </Text>
            {section(id)}
          </View>
        ))}
        {errorText}
        <Button testID="community-submit" title={submitLabel} loading={busy} disabled={!canSubmit} onPress={submit} />
      </View>
    );
  }

  // Criar: uma etapa por vez.
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const stepOk = current === 'identity' ? identityOk : current === 'about' ? description.length <= 500 : true;
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }} testID={`community-step-${current}`}>
        <View style={styles.progress} accessible accessibilityLabel={t('communities.stepOf', { n: step + 1, total: STEPS.length })}>
          {STEPS.map((id, i) => (
            <View key={id} style={[styles.progressBar, i <= step && styles.progressOn]} />
          ))}
        </View>
        <Text style={styles.stepCount}>{t('communities.stepOf', { n: step + 1, total: STEPS.length })}</Text>
        <Text style={styles.stepTitle} accessibilityRole="header">
          {t(`communities.step_${current}`)}
        </Text>
        <Text style={text.small}>{t(`communities.step_${current}_hint`)}</Text>
      </View>

      {section(current)}

      {last ? errorText : null}
      <View style={styles.footer}>
        {step > 0 ? (
          <Button testID="community-back" title={t('communities.stepBack')} variant="ghost" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />
        ) : null}
        {last ? (
          <Button testID="community-submit" title={submitLabel} loading={busy} disabled={!canSubmit} onPress={submit} style={{ flex: 2 }} />
        ) : (
          <Button testID="community-next" title={t('communities.stepNext')} disabled={!stepOk} onPress={() => setStep(step + 1)} style={{ flex: 2 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  photoBadge: {
    position: 'absolute',
    left: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  photoActions: { flexDirection: 'row', gap: space.lg, marginTop: space.xs },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, textDecorationLine: 'underline' },
  linkMuted: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
  previewName: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  previewSlug: { fontFamily: fonts.regular, fontSize: 13, color: colors.handle },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  progress: { flexDirection: 'row', gap: space.xs },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface },
  progressOn: { backgroundColor: colors.primary },
  stepCount: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, marginTop: space.xs },
  stepTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  footer: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
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
});
