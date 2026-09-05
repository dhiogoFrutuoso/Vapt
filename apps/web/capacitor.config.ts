import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Casca nativa do APLICATIVO DA EQUIPE (APK).
 *
 * ATUALIZACAO OTA
 * ---------------
 * `server.url` faz a WebView carregar a rota isolada `/mobile-view` direto do
 * servidor. Todo deploy na Vercel troca a interface do aplicativo na proxima
 * abertura — sem loja, sem reinstalacao, sem plugin de live update.
 *
 * SOBRE O PAINEL DE EDICAO
 * ------------------------
 * Com `server.url`, o APK deixa de conter qualquer HTML ou JavaScript: nao ha
 * painel dentro do arquivo instalado, o que atende a regra pela raiz.
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
 * A trava que falta — impedir a digitacao de `/painel` na propria WebView —
 * exige servir o bundle isolado (`dist-app`) num caminho proprio do dominio.
 * Enquanto isso nao existe, `webDir` continua apontando para `dist-app` para
 * que uma build sem `server.url` ja caia no bundle certo, e nunca no do site.
 */
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

    /*
     * Endereco da rota isolada. Trocavel por variavel de ambiente para que
     * uma build de homologacao aponte para outro dominio sem editar o
     * arquivo — e para que uma build offline seja possivel deixando a
     * variavel como string vazia.
     */
    url: process.env.VAPT_APP_URL ?? 'https://vapt-web.vercel.app/mobile-view',

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
