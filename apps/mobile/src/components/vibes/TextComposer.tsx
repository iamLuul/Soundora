import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
  VIBE_FONTS,
  VIBE_TEXT_ALIGNS,
  VIBE_TEXT_BGS,
  VIBE_TEXT_COLORS,
  VIBE_TEXT_MAX,
  VIBE_TEXT_SCALE,
  type VibeKind,
  type VibeTextAlign,
  type VibeTextItem,
} from '../../lib/api';
import { colors, fonts, space } from '../../theme';
import { keyboardBehavior } from '../ui';
import { FONT_STYLE, fontSizeFor, itemStyle, TEXT_COLOR } from './textStyle';

type Look = Pick<VibeTextItem, 'f' | 'c' | 'b' | 's' | 'a'>;

const ALIGN_ICON: Record<VibeTextAlign, 'reorder-three-outline' | 'menu-outline'> = {
  center: 'reorder-three-outline',
  left: 'menu-outline',
  right: 'menu-outline',
};

/**
 * Escrever um texto da vibe, como no Story: a tela escurece, o texto fica no meio com o teclado
 * aberto, "Pronto" em cima à direita, o tamanho numa barra à esquerda e, em cima do teclado, as
 * fontes (ou as cores) e a barra com Aa, cor, fundo do texto e alinhamento.
 */
export function TextComposer({
  initial,
  kind,
  onDone,
}: {
  /** O texto que está sendo editado (ou um novo, vazio, já com o último jeito usado). */
  initial: VibeTextItem;
  kind: VibeKind;
  /** Terminou: o texto como ficou (vazio = a tela apaga). */
  onDone: (item: VibeTextItem) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initial.t);
  const [look, setLook] = useState<Look>({ f: initial.f, c: initial.c, b: initial.b, s: initial.s ?? 1, a: initial.a ?? 'center' });
  const [panel, setPanel] = useState<'font' | 'color'>('font');
  const change = (patch: Partial<Look>) => setLook((l) => ({ ...l, ...patch }));
  const done = () => onDone({ ...initial, ...look, t: text });

  const s = itemStyle(look, kind);
  const size = fontSizeFor(kind) * (look.s ?? 1);
  const nextBg = VIBE_TEXT_BGS[(VIBE_TEXT_BGS.indexOf(look.b) + 1) % VIBE_TEXT_BGS.length]!;
  const nextAlign = VIBE_TEXT_ALIGNS[(VIBE_TEXT_ALIGNS.indexOf(look.a ?? 'center') + 1) % VIBE_TEXT_ALIGNS.length]!;

  return (
    <View style={styles.overlay} testID="vibe-text-composer">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior}>
        <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <Pressable testID="vibe-text-done" accessibilityRole="button" onPress={done} hitSlop={12} style={styles.doneButton}>
            <Text style={styles.done}>{t('vibes.done')}</Text>
          </Pressable>
        </View>

        <View style={styles.middle}>
          <SizeSlider value={look.s ?? 1} onChange={(v) => change({ s: v })} label={t('vibes.size')} />
          <View style={[styles.inputBox, s.box, look.a === 'left' ? styles.alignLeft : look.a === 'right' ? styles.alignRight : null]}>
            <TextInput
              testID="vibe-text"
              accessibilityLabel={t('a11y.vibeText')}
              value={text}
              onChangeText={setText}
              autoFocus
              multiline
              maxLength={VIBE_TEXT_MAX}
              placeholder={t('vibes.textPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={[s.text, styles.input, { fontSize: size, lineHeight: Math.round(size * 1.3) }]}
            />
          </View>
        </View>

        {panel === 'font' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.chips}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('vibes.font')}
          >
            {VIBE_FONTS.map((f) => (
              <Pressable
                key={f}
                testID={`vibe-font-${f}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: look.f === f }}
                accessibilityLabel={t(`vibes.fonts.${f}`)}
                onPress={() => change({ f })}
                style={[styles.chip, look.f === f && styles.chipOn]}
              >
                <Text style={[styles.chipText, FONT_STYLE[f], { textTransform: 'none', letterSpacing: 0 }, look.f === f && { color: '#000' }]}>{t(`vibes.fonts.${f}`)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.chips}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('vibes.textColor')}
          >
            {VIBE_TEXT_COLORS.map((c) => (
              <Pressable
                key={c}
                testID={`vibe-color-${c}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: look.c === c }}
                accessibilityLabel={t(`vibes.colors.${c}`)}
                onPress={() => change({ c })}
                style={[styles.swatch, { backgroundColor: TEXT_COLOR[c] }, look.c === c && styles.swatchOn]}
              />
            ))}
          </ScrollView>
        )}

        <View style={[styles.toolbar, { marginBottom: space.sm }]}>
          <ToolButton testID="vibe-tool-font" label={t('vibes.font')} active={panel === 'font'} onPress={() => setPanel('font')}>
            <Text style={styles.aa}>Aa</Text>
          </ToolButton>
          <ToolButton testID="vibe-tool-color" label={t('vibes.textColor')} active={panel === 'color'} onPress={() => setPanel('color')}>
            <ColorWheel />
          </ToolButton>
          <ToolButton testID="vibe-text-bg" label={t('vibes.textBg')} value={t(`vibes.bg.${look.b}`)} onPress={() => change({ b: nextBg })}>
            <View style={[styles.bgGlyph, look.b === 'solid' && styles.bgSolid, look.b === 'soft' && styles.bgSoft]}>
              <Text style={[styles.bgGlyphText, look.b === 'solid' && { color: '#000' }]}>A</Text>
            </View>
          </ToolButton>
          <ToolButton testID="vibe-text-align" label={t('vibes.align')} value={t(`vibes.aligns.${look.a ?? 'center'}`)} onPress={() => change({ a: nextAlign })}>
            <Ionicons
              name={ALIGN_ICON[look.a ?? 'center']}
              size={26}
              color={colors.text}
              style={look.a === 'right' ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </ToolButton>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function ToolButton({
  testID,
  label,
  value,
  active,
  onPress,
  children,
}: {
  testID: string;
  label: string;
  value?: string;
  active?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value ? { text: value } : undefined}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      onPress={onPress}
      hitSlop={6}
      style={[styles.tool, active && styles.toolOn]}
    >
      {children}
    </Pressable>
  );
}

/** Bolinha com as cores (o botão de cor do Story). */
function ColorWheel() {
  return (
    <Svg width={26} height={26}>
      <Defs>
        <LinearGradient id="wheel" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF5FA2" />
          <Stop offset="0.35" stopColor="#FFD60A" />
          <Stop offset="0.65" stopColor="#3DD68C" />
          <Stop offset="1" stopColor="#4D8BFF" />
        </LinearGradient>
      </Defs>
      <Circle cx={13} cy={13} r={11} fill="url(#wheel)" stroke="#FFFFFF" strokeWidth={2} />
    </Svg>
  );
}

const TRACK = 200;

/** Barra do tamanho do texto, em pé à esquerda (em cima = maior). */
function SizeSlider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const { min, max } = VIBE_TEXT_SCALE;
  const toY = (v: number) => TRACK - ((v - min) / (max - min)) * TRACK;
  const fromY = (y: number) => Math.round((min + ((TRACK - Math.min(TRACK, Math.max(0, y))) / TRACK) * (max - min)) * 100) / 100;
  const [start, setStart] = useState(0);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      setStart(e.y);
      onChange(fromY(e.y));
    })
    .onUpdate((e) => onChange(fromY(start + e.translationY)));
  const step = (max - min) / 10;
  return (
    <GestureDetector gesture={pan}>
      <View
        testID="vibe-text-size"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: Math.round(min * 100), max: Math.round(max * 100), now: Math.round(value * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}
        style={styles.slider}
        hitSlop={{ left: 12, right: 24 }}
      >
        {/* Trilho em cunha: fino embaixo (menor), largo em cima (maior). */}
        <View style={styles.wedge} />
        <View style={[styles.thumb, { top: toY(value) - 10 }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg },
  doneButton: { paddingVertical: space.sm, paddingHorizontal: space.xs },
  done: { fontFamily: fonts.bold, fontSize: 17, color: '#FFFFFF' },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: 48 },
  inputBox: { alignSelf: 'center', maxWidth: '100%' },
  alignLeft: { alignSelf: 'flex-start' },
  alignRight: { alignSelf: 'flex-end' },
  input: { minWidth: 40, maxWidth: '100%', padding: 0, outlineWidth: 0 },
  chips: { paddingHorizontal: space.md, gap: space.sm, alignItems: 'center', paddingVertical: space.sm },
  chip: {
    height: 36,
    borderRadius: 10,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  chipOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  chipText: { fontSize: 15, color: '#FFFFFF' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  swatchOn: { borderColor: '#FFFFFF', borderWidth: 4 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tool: { width: 48, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  aa: { fontFamily: fonts.semibold, fontSize: 22, color: '#FFFFFF' },
  bgGlyph: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  bgSolid: { backgroundColor: '#FFFFFF' },
  bgSoft: { backgroundColor: 'rgba(255,255,255,0.35)' },
  bgGlyphText: { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
  slider: { position: 'absolute', left: 14, top: '50%', marginTop: -TRACK / 2, width: 16, height: TRACK, alignItems: 'center' },
  wedge: {
    width: 0,
    height: TRACK,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomWidth: TRACK,
    borderBottomColor: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '180deg' }],
    position: 'absolute',
    top: 0,
  },
  thumb: { position: 'absolute', left: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
});
