// Páginas de erro do site (HTML puro, sem JavaScript nem nada de fora), no visual do app.
// O servidor da web (server.mjs) usa estas páginas; `node web-server/server.mjs --write-pages <pasta>`
// grava os arquivos para usar em outra hospedagem (nginx, Cloudflare...), por exemplo no 504,
// que quem gera é o proxy na frente do site.

export const ERROR_PAGES = {
  401: {
    title: 'Você precisa entrar',
    body: 'Sua sessão terminou ou você ainda não entrou na sua conta. Entre de novo para continuar.',
    action: 'signin',
  },
  403: { title: 'Acesso negado', body: 'Você não tem permissão para ver esta página.', action: 'home' },
  404: { title: 'Página não encontrada', body: 'Este endereço não existe ou o conteúdo foi apagado.', action: 'home' },
  405: { title: 'Ação não permitida', body: 'Este endereço não aceita esse tipo de pedido.', action: 'home' },
  429: { title: 'Muitas tentativas', body: 'Você fez muitos pedidos em pouco tempo. Espere um pouco e tente de novo.', action: 'retry' },
  500: { title: 'Algo deu errado', body: 'Tivemos um problema do nosso lado. Tente de novo em instantes.', action: 'retry' },
  503: {
    title: 'Em manutenção',
    body: 'O Soundhora está passando por uma manutenção rápida ou está fora do ar. Tente de novo daqui a pouco.',
    action: 'retry',
  },
  504: { title: 'O servidor demorou demais', body: 'A resposta não chegou a tempo. Tente de novo em instantes.', action: 'retry' },
};

const ICONS = {
  // Desenhos simples (traço branco), no lugar dos ícones do app.
  401: '<path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  403: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  404: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  405: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  429: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/>',
  500: '<path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  503: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  504: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
};

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** O HTML da página de erro do código (códigos fora da lista viram 500). */
export function errorPage(code) {
  const status = ERROR_PAGES[code] ? code : 500;
  const page = ERROR_PAGES[status];
  const primary =
    page.action === 'signin'
      ? '<a class="btn" href="/sign-in">Entrar de novo</a>'
      : page.action === 'retry'
        ? '<a class="btn" href="">Tentar de novo</a><a class="btn ghost" href="/">Voltar para o início</a>'
        : '<a class="btn" href="/">Voltar para o início</a>';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#3A374C">
<title>${status} · ${escape(page.title)} · Soundhora</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:#3A374C;color:#fff;font-family:Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:32px 24px;text-align:center}
main{max-width:380px;width:100%;display:flex;flex-direction:column;align-items:center;gap:8px}
.badge{width:72px;height:72px;border-radius:50%;background:#5A5577;display:flex;align-items:center;justify-content:center;margin-bottom:8px}
.code{font-size:64px;line-height:72px;font-weight:700;color:#B3A9EB;letter-spacing:2px;margin:0}
h1{font-size:20px;margin:0}
p{font-size:14px;line-height:20px;color:#B3A9EB;margin:0}
.actions{display:flex;flex-direction:column;gap:8px;width:100%;max-width:320px;margin-top:16px}
.btn{display:block;height:48px;line-height:48px;border-radius:10px;background:#685EFF;color:#fff;text-decoration:none;font-weight:600;font-size:15px}
.btn.ghost{background:transparent}
.btn:hover{filter:brightness(1.1)}
.btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.brand{margin-top:32px;font-size:12px;color:#B3A9EB;opacity:.8}
</style>
</head>
<body>
<main>
<div class="badge" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[status]}</svg></div>
<p class="code" aria-label="Erro ${status}">${status}</p>
<h1>${escape(page.title)}</h1>
<p>${escape(page.body)}</p>
<div class="actions">${primary}</div>
<div class="brand">Soundhora</div>
</main>
</body>
</html>
`;
}
