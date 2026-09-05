import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Casca nativa do APLICATIVO DA EQUIPE (APK).
 *
 * `webDir` aponta para `dist-app`, nao para `dist`. Essa linha e a diferenca
 * entre um APK que contem so o aplicativo do funcionario e um que carrega o
 * painel de edicao do dono junto — o painel nao pode viajar dentro do
 * arquivo instalado, e `dist-app` e construido justamente sem ele.
 */
const config: CapacitorConfig = {
  appId: 'com.vapt.equipe',
  appName: 'Vapt Equipe',
  webDir: 'dist-app',

  android: {
    /*
     * `https` deixa a origem da WebView em `https://localhost`, que a API ja
     * aceita no CORS. Trocar para `http` quebraria as chamadas e ainda faria
     * o Android tratar a pagina como insegura, bloqueando armazenamento.
     */
    allowMixedContent: false,
  },

  server: {
    androidScheme: 'https',
  },
}

export default config;
