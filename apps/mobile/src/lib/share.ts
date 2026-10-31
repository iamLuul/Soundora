import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

/**
 * Compartilha um texto pelo menu do sistema. No computador sem esse menu (Chrome e Firefox no
 * Windows, por exemplo), copia o texto: devolve 'copied' para a tela avisar.
 */
export async function shareText(message: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const canNativeShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  if (canNativeShare) {
    try {
      await Share.share({ message });
      return 'shared';
    } catch {
      // Na web, fechar o menu também cai aqui.
      return 'cancelled';
    }
  }
  await Clipboard.setStringAsync(message);
  return 'copied';
}

/** Link do post (na web, o endereço do site; no celular, o que abre o app). */
export function postLink(postId: string): string {
  return Linking.createURL(`/post/${postId}`);
}

/** Link do perfil. */
export function profileLink(username: string): string {
  return Linking.createURL(`/u/${username}`);
}
