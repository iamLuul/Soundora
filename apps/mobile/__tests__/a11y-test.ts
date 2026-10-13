/// <reference types="node" />
// Acessibilidade: todo campo de texto tem nome para o leitor de tela (o placeholder some ao
// digitar e não é um nome confiável) e todo Pressable diz o que é (botão, link…).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

/** As tags de abertura `<Nome …>` de um arquivo, com a linha (ignora `useRef<Nome>`). */
function openingTags(source: string, name: string) {
  const tags: { line: number; tag: string }[] = [];
  const re = new RegExp(`(?<![\\w.])<${name}\\b`, 'g');
  for (let m = re.exec(source); m; m = re.exec(source)) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    tags.push({ line: source.slice(0, m.index).split('\n').length, tag: source.slice(m.index, i) });
  }
  return tags;
}

const sources = files(root).map((f) => ({
  file: relative(root, f),
  // Comentários de linha inteira podem ter `<` e `>`: vazios, mantendo a contagem de linhas.
  source: readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, ''),
}));

test('todo TextInput tem accessibilityLabel', () => {
  // A busca acha os campos (se o padrão quebrar, o teste não passa vazio).
  expect(sources.reduce((n, { source }) => n + openingTags(source, 'TextInput').length, 0)).toBeGreaterThan(5);
  const missing = sources.flatMap(({ file, source }) =>
    openingTags(source, 'TextInput')
      .filter(({ tag }) => !/accessibilityLabel|aria-label|\{\.\.\.\w+\}/.test(tag))
      .map(({ line }) => `${file}:${line}`),
  );
  expect(missing).toEqual([]);
});

test('todo Pressable diz o papel (ou fica fora da árvore de acessibilidade)', () => {
  const missing = sources.flatMap(({ file, source }) =>
    openingTags(source, 'Pressable')
      .filter(({ tag }) => !/accessibilityRole|role=|accessible=\{false\}|\{\.\.\.\w+\}/.test(tag))
      .map(({ line }) => `${file}:${line}`),
  );
  expect(missing).toEqual([]);
});
