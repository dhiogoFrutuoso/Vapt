import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Casca nativa do APLICATIVO DA EQUIPE (APK).
 *
 * ATUALIZACAO OTA
 * ---------------
 * O bundle local e o padrao de producao. Assim o JavaScript instalado e os
 * plugins nativos sincronizados pertencem sempre a mesma versao do APK.
 * `VAPT_APP_URL` continua disponivel para homologacao/OTA intencional.
 *
 * SOBRE O PAINEL DE EDICAO
 * ------------------------
 * O `webDir` aponta somente para `dist-app`, que nao contem o painel.
 *
 * O que sobra e risco de NAVEGACAO — a WebView aponta para o dominio que
 * tambem hospeda `/painel`. Duas travas cuidam disso:
 *
 *   1. `allowNavigation` vazio. Nenhum outro host e navegavel dentro da
 *      WebView; link externo abre no navegador do sistema.
 *   2. `/mobile-view` nao renderiza `App.tsx` nem tem link para o painel, e o
 *      painel exige o cookie httpOnly do dono, que a sessao Bearer do
 *      funcionario nao possui.
 *
 * Quando a URL remota for ativada, ela deve apontar para o bundle isolado e
 * ser publicada junto com a mesma versao nativa dos plugins.
 */
const appUrl = process.env.VAPT_APP_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.vapt.equipe',
  appName: 'Vapt Equipe',

  /*
   * Usado quando `server.url` esta ausente (build offline). Aponta para o
   * bundle isolado, nunca para `dist`: e o que garante que uma build sem OTA
   * tambem saia sem o painel dentro.
   */
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
    ...(appUrl ? { url: appUrl } : {}),

    /*
     * `false`: nada de http puro. O token do funcionario viaja em toda
     * chamada, e rede de restaurante costuma ser wifi compartilhado.
     */
    cleartext: false,

    /*
     * Lista vazia, e nao ausente. Sem host adicional liberado, qualquer
     * navegacao para fora do endereco acima sai para o navegador do sistema
     * em vez de acontecer dentro do aplicativo.
     */
    allowNavigation: [],
  },
};

export default config;
