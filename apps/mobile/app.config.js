// Configuração dinâmica: tudo do app.json mais a versão (version.json) e o AdMob.
// Os IDs do app no AdMob não são segredo (vão dentro do app instalado), mas mudam entre teste e
// produção. Sem as variáveis ADMOB_ANDROID_APP_ID e ADMOB_IOS_APP_ID (no EAS: Environment
// variables), ficam os IDs de exemplo do Google, que só mostram anúncios de teste.
const SAMPLE_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const SAMPLE_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const { displayVersion, storeVersion, buildNumber } = require('./version');

module.exports = ({ config }) => ({
  ...config,
  // Versão: ver version.js (5 números no app; 3 nas lojas, que não aceitam mais).
  version: storeVersion,
  ios: { ...config.ios, buildNumber: String(buildNumber) },
  android: { ...config.android, versionCode: buildNumber },
  extra: { ...config.extra, displayVersion },
  plugins: [
    ...(config.plugins ?? []),
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: process.env.ADMOB_ANDROID_APP_ID || SAMPLE_ANDROID_APP_ID,
        iosAppId: process.env.ADMOB_IOS_APP_ID || SAMPLE_IOS_APP_ID,
        // Nada do SDK de anúncios roda antes de o app decidir mostrar anúncios (initialize).
        delayAppMeasurementInit: true,
      },
    ],
  ],
});
