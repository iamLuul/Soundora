import { AppError } from './errors';

/** Web: o arquivo escolhido vem como blob: (ou data:), que o fetch do navegador lê direto. */
export async function readLocalFile(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  if (!res.ok) throw new AppError('invalid_media', `HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new AppError('invalid_media', 'arquivo vazio');
  return bytes;
}
