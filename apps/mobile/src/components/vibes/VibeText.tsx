import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { vibeIcons, type VibeIconName } from '../../assets/vibeIcons';
import { VIBE_FONTS, VIBE_STYLES, VIBE_TEXT_BGS, VIBE_TEXT_COLORS, VIBE_TEXT_MAX, type VibeKind, type VibeStyle, type VibeTextItem } from '../../lib/api';
import { colors, fonts, space } from '../../theme';
import { VIBE_BACKGROUND } from './colors';
import { FONT_STYLE, itemStyle, TEXT_COLOR } from './textStyle';

const SERIF_BOLD = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Converte o centro (fração) em left/top, sem deixar o texto sair da tela. */
function place(pos: { x: number; y: number }, box: { w: number; h: number }, size: { w: number; h: number }) {
  const m = 8;
  const left = Math.min(Math.max(pos.x * box.w - size.w / 2, m), Math.max(m, box.w - size.w - m));
  const top = Math.min(Math.max(pos.y * box.h - size.h / 2, m), Math.max(m, box.h - size.h - m));
  return { left, top };
}

/** Os textos da vibe nos lugares escolhidos (só leitura, para quem vê). */
export function VibeTextOverlay({ items, kind }: { items: VibeTextItem[]; kind: VibeKind }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {items.map((item, i) => (
        <ReadOnlyItem key={i} item={item} kind={kind} box={box} />
      ))}
    </View>
  );
}

function ReadOnlyItem({ item, kind, box }: { item: VibeTextItem; kind: VibeKind; box: { w: number; h: number } }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const p = place(item, box, size);
  const s = itemStyle(item, kind);
  return (
    <View
      style={[styles.holder, { left: p.left, top: p.top, maxWidth: box.w ? box.w * 0.86 : undefined, opacity: size.w ? 1 : 0 }]}
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View style={[styles.itemBox, s.box]}>
        <Text style={[s.text, styles.wrap]}>{item.t}</Text>
      </View>
    </View>
  );
}

/** Um texto na tela de criar, com o id para a tela saber qual está sendo editado. */
export type EditorItem = VibeTextItem & { id: string };

/**
 * Textos editáveis na tela de criar. Tocar em um lugar vazio da vibe cria outro texto ali (feito
 * na tela, que recebe o toque); aqui, tocar em um texto edita só ele e arrastar muda o lugar.
 */
export function VibeTextEditor({
  kind,
  items,
  editingId,
  placeholder,
  onChangeText,
  onChangePos,
  onStartEdit,
}: {
  kind: VibeKind;
  items: EditorItem[];
  editingId: string | null;
  placeholder: string;
  onChangeText: (id: string, text: string) => void;
  onChangePos: (id: string, pos: { x: number; y: number }) => void;
  onStartEdit: (id: string) => void;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {editingId ? <View style={styles.dim} pointerEvents="none" /> : null}
      {items.map((item, i) => (
        <EditorItemView
          key={item.id}
          index={i}
          item={item}
          kind={kind}
          box={box}
          editing={editingId === item.id}
          othersEditing={!!editingId && editingId !== item.id}
          placeholder={placeholder}
          onChangeText={(t) => onChangeText(item.id, t)}
          onChangePos={(p) => onChangePos(item.id, p)}
          onStartEdit={() => onStartEdit(item.id)}
        />
      ))}
    </View>
  );
}

function EditorItemView({
  index,
  item,
  kind,
  box,
  editing,
  othersEditing,
  placeholder,
  onChangeText,
  onChangePos,
  onStartEdit,
}: {
  index: number;
  item: EditorItem;
  kind: VibeKind;
  box: { w: number; h: number };
  editing: boolean;
  othersEditing: boolean;
  placeholder: string;
  onChangeText: (t: string) => void;
  onChangePos: (p: { x: number; y: number }) => void;
  onStartEdit: () => void;
}) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const idle = !editing && !othersEditing;
  const here = { x: item.x, y: item.y };
  // Arrastar o texto muda o lugar (desligado enquanto digita, em qualquer texto).
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(idle)
    .minDistance(4)
    .onStart(() => setDragStart(here))
    .onFinalize(() => setDragStart(null))
    .onUpdate((g) => {
      if (!box.w || !box.h) return;
      const from = dragStart ?? here;
      onChangePos({ x: clamp01(from.x + g.translationX / box.w), y: clamp01(from.y + g.translationY / box.h) });
    });
  // Tocar no texto edita ele. Pan e toque disputam: arrastou, é pan; só tocou, é toque.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .enabled(idle)
    .onEnd((_e, ok) => {
      if (ok) onStartEdit();
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const s = itemStyle(item, kind);
  const p = place(here, box, size);
  // Digitando: o texto sobe para a parte de cima (o teclado e as opções ficam embaixo) e ocupa a largura.
  const editTop = Math.max(8, box.h * 0.26 - size.h / 2);
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={`vibe-text-item-${index}`}
        accessible={idle}
        accessibilityRole="button"
        accessibilityLabel={item.t}
        accessibilityHint={placeholder}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onStartEdit}
        pointerEvents={idle ? 'auto' : editing ? 'auto' : 'none'}
        style={[
          styles.holder,
          editing
            ? { left: 16, width: box.w ? box.w - 32 : undefined, top: editTop }
            : { left: p.left, top: p.top, maxWidth: box.w ? box.w * 0.86 : undefined, opacity: othersEditing ? 0.35 : 1 },
        ]}
        onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {editing ? (
          <TextInput
            testID="vibe-text"
            accessibilityLabel={t('a11y.vibeText')}
            value={item.t}
            onChangeText={onChangeText}
            autoFocus
            multiline
            maxLength={VIBE_TEXT_MAX}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={[s.text, s.box, styles.input, { width: '100%' }]}
          />
        ) : (
          <View style={[styles.itemBox, s.box]}>
            <Text testID={`vibe-text-display-${index}`} style={[s.text, styles.wrap]}>
              {item.t}
            </Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

/** Qual painel de opções está aberto sobre a parte de baixo da vibe. */
export type ToolPanel = 'font' | 'color' | null;

/** Um botão redondo do Figma (círculo roxo com o desenho dentro). */
export function VibeIconButton({
  icon,
  children,
  testID,
  label,
  onPress,
  active,
  dim,
}: {
  icon: VibeIconName;
  children?: ReactNode;
  testID: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  dim?: boolean;
}) {
  const { size, xml } = vibeIcons[icon];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={6}
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.45 : 1 },
        active && styles.iconOn,
      ]}
    >
      <SvgXml xml={xml} width={size} height={size} style={StyleSheet.absoluteFill} />
      {children}
    </Pressable>
  );
}

/**
 * Ferramentas sobre a vibe (Figma: Vibes): lixeira no canto de cima à esquerda; fonte (Aa) e cor
 * (pincel) no canto de cima à direita. Fonte abre as fontes; pincel abre cor do texto, fundo do
 * texto e fundo da vibe. Com um texto sendo editado, mudam só ele; sem texto, mudam o jeito do
 * próximo (como no Instagram).
 */
export function VibeEditTools({
  look,
  editing,
  panel,
  onPanel,
  onChange,
  onDelete,
  onDone,
  background,
}: {
  look: Pick<VibeTextItem, 'f' | 'c' | 'b'>;
  editing: boolean;
  panel: ToolPanel;
  onPanel: (p: ToolPanel) => void;
  onChange: (patch: Partial<Pick<VibeTextItem, 'f' | 'c' | 'b'>>) => void;
  onDelete: () => void;
  onDone: () => void;
  /** Fundo da vibe (texto, música e post); some quando a vibe é foto ou vídeo. */
  background?: { value: VibeStyle; onChange: (s: VibeStyle) => void };
}) {
  const { t } = useTranslation();
  const nextBg = VIBE_TEXT_BGS[(VIBE_TEXT_BGS.indexOf(look.b) + 1) % VIBE_TEXT_BGS.length]!;
  return (
    <>
      <View style={styles.topBar} pointerEvents="box-none">
        <VibeIconButton icon="trash" testID="vibe-text-delete" label={t('vibes.deleteText')} onPress={onDelete} dim={!editing} />
        {editing ? (
          <Pressable testID="vibe-text-done" accessibilityRole="button" onPress={onDone} style={styles.done} hitSlop={8}>
            <Text style={styles.doneText}>{t('vibes.done')}</Text>
          </Pressable>
        ) : null}
        <View style={styles.rightTools}>
          <VibeIconButton
            icon="disc38"
            testID="vibe-tool-font"
            label={t('vibes.font')}
            active={panel === 'font'}
            onPress={() => onPanel(panel === 'font' ? null : 'font')}
          >
            <Text style={styles.aaTop}>Aa</Text>
          </VibeIconButton>
          <VibeIconButton
            icon="brush"
            testID="vibe-tool-color"
            label={t('vibes.colorTools')}
            active={panel === 'color'}
            onPress={() => onPanel(panel === 'color' ? null : 'color')}
          />
        </View>
      </View>
      {panel ? (
        <View style={styles.bottomBar} pointerEvents="box-none">
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
                  onPress={() => onChange({ f })}
                  style={[styles.chip, look.f === f && styles.chipOn]}
                >
                  <Text style={[styles.chipText, FONT_STYLE[f], { textTransform: 'none' }, look.f === f && { color: colors.background }]}>Aa</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.chips}
                accessibilityRole="radiogroup"
                accessibilityLabel={t('vibes.textColor')}
              >
                <Pressable
                  testID="vibe-text-bg"
                  accessibilityRole="button"
                  accessibilityLabel={t('vibes.textBg')}
                  accessibilityValue={{ text: t(`vibes.bg.${look.b}`) }}
                  onPress={() => onChange({ b: nextBg })}
                  style={[styles.chip, look.b !== 'none' && styles.chipOn]}
                >
                  <Text style={[styles.bgGlyph, look.b !== 'none' && { color: colors.background }]}>A</Text>
                </Pressable>
                {VIBE_TEXT_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    testID={`vibe-color-${c}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: look.c === c }}
                    accessibilityLabel={t(`vibes.colors.${c}`)}
                    onPress={() => onChange({ c })}
                    style={[styles.swatch, { backgroundColor: TEXT_COLOR[c] }, look.c === c && styles.swatchOn]}
                  />
                ))}
              </ScrollView>
              {background ? (
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('vibes.background')}>
                  {VIBE_STYLES.map((s) => (
                    <Pressable
                      key={s}
                      testID={`vibe-style-${s}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: background.value === s }}
                      accessibilityLabel={t(`vibes.style.${s}`)}
                      onPress={() => background.onChange(s)}
                      style={[styles.swatch, { backgroundColor: VIBE_BACKGROUND[s] }, background.value === s && styles.swatchOn]}
                    />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  holder: { position: 'absolute', alignItems: 'center' },
  itemBox: { maxWidth: '100%' },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  // O texto quebra a linha dentro da largura máxima, em vez de vazar para os lados.
  wrap: { flexShrink: 1, maxWidth: '100%' },
  input: { outlineWidth: 0 },
  // Figma: lixeira a 20 px do canto de cima à esquerda; Aa e pincel a 20 px do canto de cima à direita.
  topBar: { position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rightTools: { gap: 10 },
  aaTop: { fontFamily: SERIF_BOLD, fontWeight: 'bold', fontSize: 16, color: '#FFFFFF' },
  iconOn: { borderWidth: 2, borderColor: '#FFFFFF' },
  bgGlyph: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  done: { backgroundColor: colors.text, borderRadius: 16, paddingHorizontal: space.md, paddingVertical: 6 },
  doneText: { fontFamily: fonts.bold, fontSize: 13, color: colors.background },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: space.md, gap: space.sm },
  chips: { paddingHorizontal: space.md, gap: space.sm, alignItems: 'center' },
  chip: {
    minWidth: 44,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontSize: 15, color: colors.text },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  swatchOn: { borderColor: colors.text, borderWidth: 3 },
});
