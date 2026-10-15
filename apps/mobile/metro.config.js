// Configuração do Metro (empacotador do Expo).
// O pacote compartilhado @soundhora/core mora em packages/core e normalmente chega pelo atalho
// que o `npm install` cria em node_modules. Se o atalho faltar (install antigo, de quando o
// app se chamava Soundora), o Metro ainda acha o pacote direto na pasta.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@soundhora/core': path.resolve(__dirname, '../../packages/core'),
};

module.exports = config;
