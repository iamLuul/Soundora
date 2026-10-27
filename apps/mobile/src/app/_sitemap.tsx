import NotFoundScreen from './+not-found';

/**
 * O expo-router cria sozinho a página /_sitemap com a lista de todas as rotas do app. Ela
 * mostraria o mapa do app para qualquer um, então aqui ela vira a tela 404 (o servidor da web
 * também responde 404 para esse endereço: scripts/serve-web.mjs).
 */
export default NotFoundScreen;
