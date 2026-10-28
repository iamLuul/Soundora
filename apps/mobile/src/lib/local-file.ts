import { File } from 'expo-file-system';
import { AppError } from './errors';

/**
 * Lê um arquivo do aparelho (foto convertida, vídeo escolhido) inteiro.
 *
 * Não usa fetch(file://...): no Android o fetch do Expo procura o caminho com os "%" ainda
 * codificados, e no Expo Go a pasta do app tem "%40anonymous%2F..." no nome. O arquivo "não
 * existia", o fetch devolvia o texto "File not found" (status 404, sem erro) e esse texto ia
 * para o servidor no lugar da foto, que recusava como "formato não aceito".
 */
export async function readLocalFile(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  if (!file.exists) throw new AppError('invalid_media', `arquivo local não encontrado`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new AppError('invalid_media', 'arquivo local vazio');
  return bytes;
}
