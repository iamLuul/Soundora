import { Platform } from 'react-native';

/**
 * Criar vibes só no app (celular). Na web dá para ver as vibes, não postar: a tela de criar, o "+"
 * da fila e "Compartilhar nas Vibes" não aparecem. É uma regra do app; o servidor não sabe de
 * onde o pedido veio, então ela não é uma barreira de segurança.
 */
export const canCreateVibes = Platform.OS !== 'web';
