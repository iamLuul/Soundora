import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MAX_POST_GENRES,
  POST_TEXT_MAX,
  extractFirstUrl,
  parseStreamingUrl,
} from "@soundhora/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTranslation } from "react-i18next";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GenrePicker } from "../../components/GenrePicker";
import { MusicCard } from "../../components/MusicCard";
import { ReviewComposer } from "../../components/ReviewComposer";
import { TopTabs } from "../../components/figma";
import { Button, ErrorText, KeyboardView } from "../../components/ui";
import {
  createPost,
  getMyGenres,
  POST_LIMITS,
  previewLink,
  uploadMedia,
  VIBE_VIDEO_MAX,
  type NewPostMedia,
} from "../../lib/api";
import { AppError, formatError } from "../../lib/errors";
import { convertPostPhoto } from "../../lib/image-convert";
import { readLocalFile } from "../../lib/local-file";
import { keys, useMyCommunities } from "../../lib/queries";
import { CommunityAvatar } from "../../components/communities/CommunityAvatar";
import type { LinkPreviewRow } from "../../lib/types";
import { colors, fonts, space } from "../../theme";
import { webTouch } from "../../lib/touch";
import { showToast } from "../../components/Toast";

interface Picked {
  type: "photo" | "video";
  uri: string;
  width: number;
  height: number;
  durationMs: number | null;
  fileSize: number | null;
}

/**
 * Novo post: texto (até 500 caracteres), até 4 fotos ou 1 vídeo (30 s / 30 MB), card de
 * música e até 3 gêneros de toda a lista — os da música vêm detectados e já marcados.
 * Precisa de pelo menos um: texto, mídia ou música.
 */
export default function ComposeScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { height } = useWindowDimensions();
  const [body, setBody] = useState("");
  // Duas subtelas: Post (texto, mídia, música) e Review (álbum, nota e análise).
  const [mode, setMode] = useState<"post" | "review">("post");

  // A tela sobe ao abrir; o X (o "+" girado na barra) faz ela descer e volta para a aba anterior.
  const slide = useSharedValue(height);
  useFocusEffect(
    useCallback(() => {
      slide.set(height);
      slide.set(
        withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }),
      );
    }, [slide, height]),
  );
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.navigate("/");
  }, [navigation]);
  useEffect(() => {
    const unsubscribe = navigation.addListener(
      "tabPress" as never,
      (e: { preventDefault: () => void }) => {
        if (!navigation.isFocused()) return;
        e.preventDefault();
        slide.set(
          withTiming(
            height,
            { duration: 240, easing: Easing.in(Easing.cubic) },
            (done) => {
              if (done) scheduleOnRN(goBack);
            },
          ),
        );
      },
    );
    return unsubscribe;
  }, [navigation, slide, height, goBack]);
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slide.value }],
  }));
  const [media, setMedia] = useState<Picked[]>([]);
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [preview, setPreview] = useState<LinkPreviewRow | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [detected, setDetected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [publishing, setPublishing] = useState<null | string>(null);
  // Onde o post vai: geral (perfil e timeline) ou uma comunidade de que faço parte.
  const params = useLocalSearchParams<{ community?: string }>();
  const communities = useMyCommunities();
  const [destination, setDestination] = useState<string | null>(null);
  const [fromParam, setFromParam] = useState<string | undefined>(undefined);
  if (params.community !== fromParam) {
    setFromParam(params.community);
    if (params.community) setDestination(params.community);
  }
  const target = communities.data?.find((c) => c.id === destination) ?? null;
  const myGenres = useQuery({ queryKey: ["my-genres"], queryFn: getMyGenres });

  const hasVideo = media.some((m) => m.type === "video");
  const canAddMedia = !hasVideo && media.length < POST_LIMITS.photos;
  const canPublish =
    (!!body.trim() || media.length > 0 || !!preview) &&
    body.length <= POST_TEXT_MAX;

  /** Gera o card da música. Devolve true se deu certo. */
  const loadPreview = async (value = link): Promise<boolean> => {
    setError(null);
    const url = extractFirstUrl(value);
    // Confere no app antes de chamar o servidor: resposta instantânea para links errados.
    if (!url || !parseStreamingUrl(url)) {
      setError(t("errors.unsupported"));
      return false;
    }
    setLoadingPreview(true);
    try {
      const p = await previewLink(url);
      setPreview(p);
      // Gêneros da música (detectados nas lojas): entram marcados; a pessoa pode tirar.
      const found = (p.genres ?? []).slice(0, MAX_POST_GENRES);
      setDetected(found);
      setGenres((current) =>
        [...found, ...current.filter((g) => !found.includes(g))].slice(
          0,
          MAX_POST_GENRES,
        ),
      );
      setShowLink(false);
      return true;
    } catch (err) {
      setError(formatError(t, err));
      return false;
    } finally {
      setLoadingPreview(false);
    }
  };

  const paste = async () => {
    const value = await Clipboard.getStringAsync();
    setLink(value);
    if (value) await loadPreview(value);
  };

  const removeMusic = () => {
    setPreview(null);
    setLink("");
    // Sem música, sem gênero: o gênero descreve a música.
    setGenres([]);
    setDetected([]);
  };

  // Link de música colado/digitado no texto: vira o card sozinho, e o link sai do texto.
  const autoTried = useRef<string | null>(null);
  useEffect(() => {
    if (preview || loadingPreview) return;
    const url = extractFirstUrl(body);
    if (!url || url === autoTried.current || !parseStreamingUrl(url)) return;
    const timer = setTimeout(async () => {
      autoTried.current = url;
      const ok = await loadPreview(url);
      if (ok)
        setBody((b) =>
          b
            .replace(url, "")
            .replace(/[ \t]{2,}/g, " ")
            .trim(),
        );
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPreview muda a cada render; o que importa é o texto
  }, [body, preview, loadingPreview]);

  const pick = async (source: "library" | "camera") => {
    setError(null);
    try {
      const options: ImagePicker.ImagePickerOptions = {
        // Já tem foto: só mais fotos. Sem nada: foto ou vídeo.
        mediaTypes: media.length ? ["images"] : ["images", "videos"],
        allowsMultipleSelection: source === "library",
        selectionLimit: POST_LIMITS.photos - media.length,
        videoMaxDuration: VIBE_VIDEO_MAX.seconds,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
        quality: 1,
      };
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setError(t("vibes.cameraDenied"));
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.length) return;
      const picked: Picked[] = result.assets.map((a) => ({
        type: a.type === "video" ? "video" : "photo",
        uri: a.uri,
        width: a.width ?? 0,
        height: a.height ?? 0,
        durationMs: a.duration ?? null,
        fileSize: a.fileSize ?? null,
      }));
      const video = picked.find((p) => p.type === "video");
      // Um vídeo sozinho, ou até 4 fotos.
      setMedia(
        video ? [video] : [...media, ...picked].slice(0, POST_LIMITS.photos),
      );
    } catch (err) {
      setError(formatError(t, err));
    }
  };

  const publish = async () => {
    setError(null);
    try {
      const uploaded: NewPostMedia[] = [];
      for (const [i, m] of media.entries()) {
        setPublishing(
          media.length > 1
            ? t("compose.uploading", { current: i + 1, total: media.length })
            : t("compose.uploadingOne"),
        );
        let bytes: Uint8Array;
        if (m.type === "photo") {
          bytes = await convertPostPhoto(m.uri, m.width, m.height);
        } else {
          // O servidor confere de novo; aqui só evita enviar arquivo grande à toa.
          if (
            m.durationMs &&
            m.durationMs > VIBE_VIDEO_MAX.seconds * 1000 + 500
          )
            throw new AppError("video_too_long");
          if (m.fileSize && m.fileSize > VIBE_VIDEO_MAX.bytes)
            throw new AppError("video_too_large");
          bytes = await readLocalFile(m.uri);
          if (bytes.byteLength > VIBE_VIDEO_MAX.bytes)
            throw new AppError("video_too_large");
        }
        const up = await uploadMedia("post", m.type, bytes);
        uploaded.push({
          path: up.path,
          kind: m.type,
          width: up.width,
          height: up.height,
          duration_ms: up.durationMs ?? null,
        });
      }
      setPublishing(t("compose.publishing"));
      const id = await createPost({
        body,
        previewId: preview?.id ?? null,
        genres: preview ? genres : [],
        media: uploaded,
        communityId: target?.id ?? null,
      });
      setBody("");
      setMedia([]);
      removeMusic();
      setGenres([]);
      setShowLink(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.feed }),
        qc.invalidateQueries({ queryKey: ["profile-posts"] }),
        qc.invalidateQueries({ queryKey: ["communities", "posts"] }),
      ]);
      setDestination(null);
      // Sai da aba de postar antes de abrir o post: ao fechar o post, volta para onde a pessoa estava.
      goBack();
      router.push(`/post/${id}`);
      showToast(t("toast.postPublished"));
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setPublishing(null);
    }
  };

  return (
    <Animated.View
      style={[styles.screen, { paddingTop: insets.top }, slideStyle]}
    >
      <TopTabs<"post" | "review">
        value={mode}
        onChange={setMode}
        style={{ marginHorizontal: space.lg }}
        tabs={[
          { value: "post", label: t("reviews.postTab") },
          { value: "review", label: t("reviews.composeTab") },
        ]}
      />
      {mode === "review" ? (
        <ReviewComposer
          onPublished={() => {
            setMode("post");
            goBack();
            router.navigate("/music");
          }}
        />
      ) : (
        <>
          <View style={styles.top}>
            <Text style={styles.title}>{t("compose.title")}</Text>
            <Button
              testID="publish"
              title={publishing ?? t("compose.publish")}
              size="sm"
              onPress={publish}
              loading={!!publishing}
              disabled={!canPublish || !!publishing}
              style={{ alignSelf: "center" }}
            />
          </View>

          <KeyboardView>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              {communities.data?.length ? (
                <View style={{ gap: space.xs }}>
                  <Text style={styles.limits}>
                    {target
                      ? t("communities.postingTo", { name: target.name })
                      : t("communities.postingGeneral")}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.destinations}
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t("communities.postWhere")}
                  >
                    <Pressable
                      testID="destination-general"
                      accessibilityRole="radio"
                      accessibilityState={{ selected: !target }}
                      onPress={() => setDestination(null)}
                      style={[styles.destination, !target && styles.destinationOn]}
                    >
                      <Ionicons name="globe-outline" size={16} color={colors.text} />
                      <Text style={styles.destinationText}>
                        {t("communities.general")}
                      </Text>
                    </Pressable>
                    {communities.data.map((c) => (
                      <Pressable
                        key={c.id}
                        testID={`destination-${c.slug}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: target?.id === c.id }}
                        onPress={() => setDestination(c.id)}
                        style={[
                          styles.destination,
                          target?.id === c.id && styles.destinationOn,
                        ]}
                      >
                        <CommunityAvatar name={c.name} color={c.color} size={18} />
                        <Text style={styles.destinationText} numberOfLines={1}>
                          {c.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <View>
                <TextInput
                  testID="post-body"
                  value={body}
                  onChangeText={setBody}
                  placeholder={t("compose.textPlaceholder")}
                  placeholderTextColor={colors.placeholder}
                  multiline
                  maxLength={POST_TEXT_MAX}
                  style={styles.body}
                  accessibilityLabel={t("compose.textLabel")}
                />
                <Text
                  style={[
                    styles.counter,
                    body.length > POST_TEXT_MAX - 50 && {
                      color: colors.warning,
                    },
                  ]}
                >
                  {body.length}/{POST_TEXT_MAX}
                </Text>
              </View>

              {media.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbs}
                >
                  {media.map((m, i) => (
                    <View key={m.uri} style={styles.thumb}>
                      {m.type === "photo" ? (
                        <Image
                          source={{ uri: m.uri }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.videoThumb}>
                          <Ionicons
                            name="videocam"
                            size={28}
                            color={colors.text}
                          />
                          {m.durationMs ? (
                            <Text style={styles.duration}>
                              {Math.round(m.durationMs / 1000)}s
                            </Text>
                          ) : null}
                        </View>
                      )}
                      <Pressable
                        testID={`remove-media-${i}`}
                        accessibilityRole="button"
                        accessibilityLabel={t("compose.removeMedia")}
                        onPress={() =>
                          setMedia(media.filter((_, j) => j !== i))
                        }
                        style={[styles.remove, webTouch(8)]}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={14} color={colors.text} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              {loadingPreview && !showLink ? (
                <Text style={styles.limits}>{t("compose.loadingMusic")}</Text>
              ) : null}
              {preview ? (
                <View>
                  <MusicCard
                    data={{
                      url: preview.url,
                      platform: preview.platform,
                      title: preview.title,
                      artist: preview.artist,
                      imageUrl: preview.image_url,
                    }}
                  />
                  <Pressable
                    testID="remove-music"
                    accessibilityRole="button"
                    accessibilityLabel={t("compose.removeMusic")}
                    onPress={removeMusic}
                    style={[styles.removeMusic, webTouch(8)]}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={14} color={colors.text} />
                  </Pressable>
                </View>
              ) : showLink ? (
                <View style={styles.linkBox}>
                  <TextInput
                    testID="link-input"
                    accessibilityLabel={t("a11y.musicLink")}
                    value={link}
                    onChangeText={setLink}
                    placeholder={t("compose.linkPlaceholder")}
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    inputMode="url"
                    onSubmitEditing={() => loadPreview()}
                    style={styles.linkInput}
                  />
                  <View style={styles.linkButtons}>
                    <Button
                      title={t("compose.paste")}
                      variant="ghost"
                      size="sm"
                      onPress={paste}
                      style={{ alignSelf: "auto" }}
                    />
                    <Button
                      testID="load-preview"
                      title={t("compose.preview")}
                      size="sm"
                      onPress={() => loadPreview()}
                      loading={loadingPreview}
                      disabled={!link.trim()}
                      style={{ alignSelf: "auto" }}
                    />
                  </View>
                </View>
              ) : null}

              <View style={styles.tools}>
                <Tool
                  testID="add-media"
                  icon="images-outline"
                  label={t("compose.addMedia")}
                  onPress={() => pick("library")}
                  disabled={!canAddMedia}
                />
                {Platform.OS !== "web" ? (
                  <Tool
                    testID="add-camera"
                    icon="camera-outline"
                    label={t("vibes.camera")}
                    onPress={() => pick("camera")}
                    disabled={!canAddMedia}
                  />
                ) : null}
                <Tool
                  testID="add-music"
                  icon="musical-notes-outline"
                  label={t("compose.addMusic")}
                  onPress={() => setShowLink(true)}
                  disabled={!!preview || showLink}
                />
              </View>
              <Text style={styles.limits}>{t("compose.limits")}</Text>

              {/* Gênero só com música: ele descreve a música do post. */}
              {preview ? (
                <GenrePicker
                  value={genres}
                  onChange={setGenres}
                  detected={detected}
                  suggestions={myGenres.data ?? []}
                  max={MAX_POST_GENRES}
                />
              ) : null}

              <ErrorText>{error}</ErrorText>
            </ScrollView>
          </KeyboardView>
        </>
      )}
    </Animated.View>
  );
}

function Tool({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.tool, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  destinations: { gap: space.sm },
  destination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    maxWidth: 200,
    paddingHorizontal: space.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  destinationOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  destinationText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text, flexShrink: 1 },
  screen: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.tabBar,
  },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  content: {
    padding: space.lg,
    gap: space.lg,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 120,
  },
  body: {
    minHeight: 110,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
    outlineWidth: 0,
  },
  counter: {
    alignSelf: "flex-end",
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  thumbs: { gap: space.sm },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  videoThumb: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  duration: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeMusic: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  linkBox: {
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.handle,
    borderRadius: 10,
    padding: space.md,
  },
  linkInput: {
    minHeight: 40,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    outlineWidth: 0,
  },
  linkButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.sm,
  },
  tools: {
    flexDirection: "row",
    gap: space.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.tabBar,
    paddingVertical: space.md,
  },
  tool: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
  limits: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -space.sm,
  },
});
