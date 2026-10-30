import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import { BOOT_SKELETON_CSS } from '../lib/layout';

/**
 * HTML de cada página na web (só no build estático). Idioma e título para leitores de tela e
 * para a aba do navegador; o idioma acompanha o do app depois que ele abre (lib/i18n).
 *
 * SDK 58: o expo-router entrega pelo useServerDocumentContext os atributos e as tags que ele
 * precisa no <html>, <head> e <body> (scripts do app incluídos). Sem os bodyNodes o app não abre.
 */
export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="pt-BR" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Soundhora</title>
        <meta name="description" content="Soundhora: a rede social da música." />
        {/* Defesa extra na web: sem plugins (<object>/<embed>), sem trocar a base dos links e sem
            formulários enviados para outro site; o endereço da página não vaza para outros sites.
            O resto da política (frame-ancestors, connect-src) vai nos cabeçalhos da hospedagem:
            veja docs/SEGURANCA.md. */}
        <meta httpEquiv="Content-Security-Policy" content="object-src 'none'; base-uri 'self'; form-action 'self'" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <ScrollViewStyleReset />
        {/* overscroll-behavior: puxar a lista para baixo não recarrega a página (o app atualiza os dados).
            Campos de texto sem o contorno azul do navegador ao clicar (o cursor piscando já mostra
            onde se escreve); botões e links continuam com o contorno ao navegar pelo teclado.
            Barras de rolagem: finas, no tom do app, e só aparecem com o mouse sobre a área que rola
            (a roda do mouse e o arrasto funcionam sempre). */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html,body{overscroll-behavior-y:none;}body{background-color:#3A374C;}input:focus,textarea:focus,[contenteditable]:focus{outline:none;}' +
              '*{scrollbar-width:thin;scrollbar-color:transparent transparent;}' +
              '*:hover{scrollbar-color:rgba(194,190,221,0.35) transparent;}',
          }}
        />
        {/* Esqueleto de abertura: o de celular ou o de desktop, pela largura (antes do JavaScript). */}
        <style dangerouslySetInnerHTML={{ __html: BOOT_SKELETON_CSS }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
