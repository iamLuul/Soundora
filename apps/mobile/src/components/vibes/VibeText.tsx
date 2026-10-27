import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { VIBE_TEXT_SCALE, type VibeKind, type VibeTextItem } from '../../lib/api';
import { itemStyle, transformOf } from './textStyle';

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
      style={[
        styles.holder,
        { left: p.left, top: p.top, maxWidth: box.w ? box.w * 0.86 : undefined, opacity: size.w ? 1 : 0, transform: transformOf(item) },
      ]}
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View style={[styles.itemBox, s.box]}>
        <Text style={[s.text, styles.wrap]}>{item.t}</Text>
      </View>
    </View>
  );
}

/** Um texto na tela de criar, com o id para a tela saber qual é qual. */
export type EditorItem = VibeTextItem & { id: string };

/** Onde fica a lixeira na tela (centro e raio, em coordenadas da janela). */
export interface TrashZone {
  x: number;
  y: number;
  r: number;
}

/**
 * Um texto na tela de criar, como no Story: arrastar move; pinça aumenta/diminui; girar com
 * dois dedos gira; tocar edita; soltar em cima da lixeira apaga. O movimento roda na thread de
 * interface (liso) e só no fim avisa a tela (onChange / onDelete).
 */
export function DraggableText({
  item,
  kind,
  box,
  index,
  trash,
  onEdit,
  onChange,
  onDelete,
  onDragging,
  onOverTrash,
}: {
  item: EditorItem;
  kind: VibeKind;
  box: { w: number; h: number };
  index: number;
  trash: TrashZone;
  onEdit: () => void;
  onChange: (patch: Partial<VibeTextItem>) => void;
  onDelete: () => void;
  onDragging: (dragging: boolean) => void;
  onOverTrash: (over: boolean) => void;
}) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(item.s ?? 1);
  const rotation = useSharedValue(item.r ?? 0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  const over = useSharedValue(false);

  // A tela mudou o texto (ou terminou de mover): o deslocamento volta a zero no lugar novo.
  useEffect(() => {
    tx.set(0);
    ty.set(0);
  }, [item.x, item.y, tx, ty]);
  useEffect(() => {
    scale.set(item.s ?? 1);
    rotation.set(item.r ?? 0);
  }, [item.s, item.r, scale, rotation]);

  const p = place(item, box, size);
  const finishMove = (dx: number, dy: number, drop: boolean) => {
    onDragging(false);
    onOverTrash(false);
    if (drop) return onDelete();
    if (!box.w || !box.h) return;
    onChange({ x: clamp01((p.left + size.w / 2 + dx) / box.w), y: clamp01((p.top + size.h / 2 + dy) / box.h) });
  };
  const finishTransform = (s: number, r: number) => onChange({ s, r });

  const pan = Gesture.Pan()
    .withTestId(`vibe-text-pan-${index}`)
    .minDistance(3)
    .averageTouches(true)
    .hitSlop(16)
    .onStart(() => {
      'worklet';
      scheduleOnRN(onDragging, true);
    })
    .onUpdate((e) => {
      'worklet';
      tx.set(e.translationX);
      ty.set(e.translationY);
      const isOver = Math.hypot(e.absoluteX - trash.x, e.absoluteY - trash.y) < trash.r;
      if (isOver !== over.get()) {
        over.set(isOver);
        scheduleOnRN(onOverTrash, isOver);
      }
    })
    .onEnd(() => {
      'worklet';
      scheduleOnRN(finishMove, tx.get(), ty.get(), over.get());
      over.set(false);
    });
  const pinch = Gesture.Pinch()
    .withTestId(`vibe-text-pinch-${index}`)
    .hitSlop(24)
    .onStart(() => {
      'worklet';
      startScale.set(scale.get());
    })
    .onUpdate((e) => {
      'worklet';
      scale.set(Math.min(VIBE_TEXT_SCALE.max, Math.max(VIBE_TEXT_SCALE.min, startScale.get() * e.scale)));
    })
    .onEnd(() => {
      'worklet';
      scheduleOnRN(finishTransform, scale.get(), rotation.get());
    });
  const rotate = Gesture.Rotation()
    .withTestId(`vibe-text-rotate-${index}`)
    .hitSlop(24)
    .onStart(() => {
      'worklet';
      startRotation.set(rotation.get());
    })
    .onUpdate((e) => {
      'worklet';
      rotation.set(startRotation.get() + (e.rotation * 180) / Math.PI);
    })
    .onEnd(() => {
      'worklet';
      scheduleOnRN(finishTransform, scale.get(), rotation.get());
    });
  const tap = Gesture.Tap().onEnd((_e, ok) => {
    'worklet';
    if (ok) scheduleOnRN(onEdit);
  });
  const gesture = Gesture.Exclusive(Gesture.Simultaneous(pan, pinch, rotate), tap);

  const left = p.left;
  const top = p.top;
  const animated = useAnimatedStyle(() => ({
    left: left + tx.get(),
    top: top + ty.get(),
    transform: [{ rotate: `${rotation.get()}deg` }, { scale: scale.get() }],
  }));

  const s = itemStyle(item, kind);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        testID={`vibe-text-item-${index}`}
        accessible
        accessibilityRole="button"
        accessibilityLabel={item.t}
        accessibilityHint={t('vibes.textItemHint')}
        accessibilityActions={[{ name: 'activate' }, { name: 'delete', label: t('vibes.deleteText') }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'delete' ? onDelete() : onEdit())}
        style={[styles.holder, { maxWidth: box.w ? box.w * 0.86 : undefined, opacity: size.w ? 1 : 0 }, animated]}
        onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <View style={[styles.itemBox, s.box]}>
          <Text testID={`vibe-text-display-${index}`} style={[s.text, styles.wrap]}>
            {item.t}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  holder: { position: 'absolute', alignItems: 'center' },
  itemBox: { maxWidth: '100%' },
  // O texto quebra a linha dentro da largura máxima, em vez de vazar para os lados.
  wrap: { flexShrink: 1, maxWidth: '100%' },
});
