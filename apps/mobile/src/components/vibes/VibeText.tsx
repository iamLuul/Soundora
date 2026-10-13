import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import type { VibeKind } from '../../lib/api';
import { colors, fonts, space } from '../../theme';

/** Centro do texto em fração da tela da vibe (0 = esquerda/topo, 1 = direita/base). */
export interface TextPos {
  x: number;
  y: number;
}

/** Onde o texto fica se a pessoa não escolheu: embaixo na foto/vídeo/música/post, no meio no texto. */
export function defaultTextPos(kind: VibeKind): TextPos {
  if (kind === 'text') return { x: 0.5, y: 0.5 };
  return { x: 0.5, y: 0.84 };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Converte o centro (fração) em left/top, sem deixar o texto sair da tela. */
function place(pos: TextPos, box: { w: number; h: number }, size: { w: number; h: number }) {
  const m = 8;
  const left = Math.min(Math.max(pos.x * box.w - size.w / 2, m), Math.max(m, box.w - size.w - m));
  const top = Math.min(Math.max(pos.y * box.h - size.h / 2, m), Math.max(m, box.h - size.h - m));
  return { left, top };
}

function textStyle(kind: VibeKind) {
  return kind === 'text' ? styles.big : styles.caption;
}

/** Texto da vibe no lugar escolhido (só leitura, para quem vê). */
export function VibeTextOverlay({ text, kind, pos }: { text: string; kind: VibeKind; pos: TextPos | null }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const p = place(pos ?? defaultTextPos(kind), box, size);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) =>
        setBox({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
    >
      <View
        style={[styles.holder, { left: p.left, top: p.top, maxWidth: box.w ? box.w * 0.86 : undefined, opacity: size.w ? 1 : 0 }]}
        onLayout={(e: LayoutChangeEvent) =>
          setSize({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
      >
        <Text style={[textStyle(kind), styles.wrap]}>{text}</Text>
      </View>
    </View>
  );
}

/**
 * Texto editável na tela de criar: tocar na tela escreve ali, arrastar o texto muda o lugar,
 * tocar no texto edita de novo.
 */
export function EditableVibeText({
  kind,
  text,
  pos,
  editing,
  placeholder,
  onChangeText,
  onChangePos,
  onStartEdit,
  onEndEdit,
}: {
  kind: VibeKind;
  text: string;
  pos: TextPos;
  editing: boolean;
  placeholder: string;
  onChangeText: (t: string) => void;
  onChangePos: (p: TextPos) => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
}) {
  const { t } = useTranslation();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragStart, setDragStart] = useState<TextPos | null>(null);
  // Arrastar o texto muda o lugar (desligado enquanto digita).
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(!editing)
    .minDistance(4)
    .onStart(() => setDragStart(pos))
    .onFinalize(() => setDragStart(null))
    .onUpdate((g) => {
      if (!box.w || !box.h) return;
      onChangePos({
        x: clamp01((dragStart ?? pos).x + g.translationX / box.w),
        y: clamp01((dragStart ?? pos).y + g.translationY / box.h),
      });
    });
  // Tocar no texto edita de novo. Pan e toque disputam: arrastou, é pan; só tocou, é toque.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .enabled(!editing && !!text)
    .onEnd((_e, ok) => {
      if (ok) onStartEdit();
    });
  const drag = Gesture.Exclusive(pan, tap);

  const p = place(pos, box, size);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) =>
        setBox({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
    >
      {editing ? <View style={styles.dim} pointerEvents="none" /> : null}
      <GestureDetector gesture={drag}>
        <View
          style={[
            styles.holder,
            // Digitando: largura fixa, centralizado na horizontal (dá para escrever confortável).
            editing
              ? { left: 16, width: box.w ? box.w - 32 : undefined, top: Math.max(8, Math.min(pos.y * box.h - size.h / 2, box.h - size.h - 8)) }
              : { left: p.left, top: p.top, maxWidth: box.w ? box.w * 0.86 : undefined },
          ]}
          onLayout={(e: LayoutChangeEvent) =>
            setSize({
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            })
          }
        >
          {editing ? (
            <TextInput
              testID="vibe-text"
              accessibilityLabel={t('a11y.vibeText')}
              value={text}
              onChangeText={onChangeText}
              onBlur={onEndEdit}
              autoFocus
              multiline
              maxLength={300}
              placeholder={placeholder}
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={[textStyle(kind), styles.input, { width: '100%' }]}
            />
          ) : text ? (
            <Text testID="vibe-text-display" accessibilityRole="button" accessibilityHint={placeholder} style={[textStyle(kind), styles.wrap]}>
              {text}
            </Text>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  holder: { position: 'absolute', alignItems: 'center' },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  // O texto quebra a linha dentro da largura máxima, em vez de vazar para os lados.
  wrap: { flexShrink: 1, maxWidth: '100%' },
  big: {
    fontFamily: fonts.bold,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 6,
  },
  caption: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 10,
    overflow: 'hidden',
  },
  input: { outlineWidth: 0, padding: 0 },
});
