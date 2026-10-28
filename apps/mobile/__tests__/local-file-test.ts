// Fotos e vídeos do Android: lidos do arquivo, nunca com fetch(file://) (ver lib/local-file.ts).
import { readLocalFile } from '../src/lib/local-file';

const mockFiles: Record<string, Uint8Array> = {};
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(private uri: string) {}
    get exists() {
      return this.uri in mockFiles;
    }
    async arrayBuffer() {
      return mockFiles[this.uri]!.slice().buffer;
    }
  },
}));

// Pasta do Expo Go no Android: o nome tem "%40anonymous%2F" de verdade.
const uri = 'file:///data/user/0/host.exp.exponent/cache/ExperienceData/%2540anonymous%252Fsoundhora/ImageManipulator/a.jpg';

test('lê os bytes da foto (o JPEG começa com FF D8 FF)', async () => {
  mockFiles[uri] = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const fetchSpy = jest.spyOn(global, 'fetch');
  const bytes = await readLocalFile(uri);
  expect(Array.from(bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('arquivo que não existe ou vazio: erro claro, nada vai para o servidor', async () => {
  await expect(readLocalFile('file:///nao/existe.jpg')).rejects.toThrow('invalid_media');
  mockFiles['file:///vazio.jpg'] = new Uint8Array();
  await expect(readLocalFile('file:///vazio.jpg')).rejects.toThrow('invalid_media');
});
