import * as ImagePicker from 'expo-image-picker';
import { uploadProfileImage, type ProfileImageKind } from './api';

/**
 * Abre a galeria e envia a imagem escolhida como foto ou banner do perfil.
 * Devolve o caminho gravado, ou null se a pessoa cancelou.
 */
export async function pickAndUploadProfileImage(kind: ProfileImageKind): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    // A foto já sai quadrada do editor. O banner é recortado em 3:1 no centro (no iOS o
    // editor do sistema só recorta quadrado).
    allowsEditing: kind === 'avatar',
    aspect: kind === 'avatar' ? [1, 1] : undefined,
    quality: 0.9,
  });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  return uploadProfileImage(kind, { uri: asset.uri, width: asset.width ?? 0, height: asset.height ?? 0 });
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Abre a galeria para uma foto quadrada (a da comunidade). Não envia: devolve null se cancelou. */
export async function pickSquareImage(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.9 });
  const asset = result.canceled ? null : result.assets?.[0];
  return asset ? { uri: asset.uri, width: asset.width ?? 0, height: asset.height ?? 0 } : null;
}
