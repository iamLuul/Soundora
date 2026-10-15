import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * HTML de cada página na web (só no build estático). Idioma e título para leitores de tela e
 * para a aba do navegador; o idioma acompanha o do app depois que ele abre (lib/i18n).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
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
        {/* overscroll-behavior: puxar a lista para baixo não recarrega a página (o app atualiza os dados). */}
        <style dangerouslySetInnerHTML={{ __html: 'html,body{overscroll-behavior-y:none;}body{background-color:#3A374C;}' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
