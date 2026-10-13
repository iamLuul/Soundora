// Aplica Configurações › Acessibilidade antes de qualquer tela carregar (importado primeiro
// em index.ts): os StyleSheet.create do app passam a ter a fonte na escala escolhida e os
// ícones crescem junto. Com tudo no padrão, nada é trocado.
import Ionicons from '@expo/vector-icons/Ionicons';
import { cloneElement, isValidElement, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { fontScale, iconScale, scaleStyles } from './display';
import { text } from '../theme';

if (fontScale !== 1) {
  type Create = (styles: Record<string, unknown>) => unknown;
  const sheet = StyleSheet as unknown as { create: Create };
  const create = sheet.create.bind(StyleSheet);
  sheet.create = (styles) => create(scaleStyles(styles, fontScale));
  // Estilos de texto do tema (objetos simples, usados direto).
  Object.assign(text, scaleStyles(text as unknown as Record<string, unknown>, fontScale));
}

if (iconScale !== 1) {
  type Render = () => ReactElement | null;
  const proto = (Ionicons as unknown as { prototype: { render: Render } }).prototype;
  const render = proto.render;
  proto.render = function (this: unknown) {
    const el = render.call(this);
    // Enquanto a fonte de ícones carrega, o componente devolve um <Text /> vazio.
    if (!isValidElement(el) || !(el.props as { name?: string }).name) return el;
    const size = (el.props as { size?: number }).size ?? 12;
    return cloneElement(el as ReactElement<{ size?: number }>, { size: Math.round(size * iconScale) });
  };
}
