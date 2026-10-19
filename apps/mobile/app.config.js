// Configuração dinâmica: tudo do app.json mais o AdMob.
// Os IDs do app no AdMob não são segredo (vão dentro do app instalado), mas mudam entre teste e
// produção. Sem as variáveis ADMOB_ANDROID_APP_ID e ADMOB_IOS_APP_ID (no EAS: Environment
// variables), ficam os IDs de exemplo do Google, que só mostram anúncios de teste.
const SAMPLE_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const SAMPLE_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

module.exports = ({ config }) => ({
  ...config,
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
