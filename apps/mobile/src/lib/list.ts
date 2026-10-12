import { Platform } from "react-native";

/**
 * Ajuste das listas longas (FlatList). O padrão do React Native deixa ~10 telas montadas para
 * cima e para baixo (windowSize 21); com posts de foto e música isso pesa na memória e na
 * rolagem. Aqui: ~3 telas de cada lado, começando com poucos itens e montando aos poucos.
 */
export const listPerf = {
  initialNumToRender: 6,
  maxToRenderPerBatch: 6,
  windowSize: 7,
  // Android: tira da árvore nativa o que saiu da tela (no iOS e na web pode piscar).
  removeClippedSubviews: Platform.OS === "android",
} as const;
