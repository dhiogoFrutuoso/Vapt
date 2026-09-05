'use strict';

const { app, BrowserWindow, shell, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Processo principal do aplicativo de desktop (.exe).
 *
 * O arquivo e `.cjs` e nao `.js` porque o package.json declara
 * `"type": "module"`: um `main.js` ali seria tratado como ESM e os `require`
 * abaixo quebrariam antes da janela abrir.
 *
 * Carrega a MESMA interface do aplicativo do celular — a pasta `dist-app`,
 * que nao contem o painel de edicao. O dono edita o aplicativo pelo site, na
 * conta dele; o .exe instalado no caixa do restaurante e do funcionario.
 */

const RAIZ = path.join(__dirname, '..', 'dist-app');

/*
 * Proporcao de celular. A interface do app foi desenhada para uma coluna
 * unica com barra de abas no rodape; esticada em tela cheia de monitor, os
 * cards de pedido virariam faixas de um metro de largura com tres palavras
 * dentro. Travar a janela e mais honesto do que criar um segundo layout que
 * ninguem mantem.
 */
const LARGURA = 450;
const ALTURA = 850;

/**
 * `vapt://` em vez de `file://`.
 *
 * Duas razoes, e nenhuma delas e estetica:
 *
 *   1. CORS. Em `file://` o navegador manda `Origin: null`, e liberar `null`
 *      na API abriria a porta para qualquer iframe com sandbox na internet.
 *      Um esquema proprio produz uma origem que so este aplicativo emite.
 *
 *   2. Armazenamento. `file://` nao tem origem estavel, entao localStorage e
 *      IndexedDB ficam sem lugar fixo: o funcionario seria deslogado a cada
 *      atualizacao do aplicativo.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vapt',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function servirArquivos() {
  protocol.handle('vapt', (request) => {
    const url = new URL(request.url);

    /*
     * `decodeURIComponent` + `normalize` antes de qualquer coisa: sem isso um
     * pedido com `..%2f..%2f` sairia da pasta do aplicativo e leria arquivos
     * do disco do usuario. O aplicativo so serve o que esta em `dist-app`.
     */
    const bruto = path.normalize(decodeURIComponent(url.pathname));

    /*
     * Sem regex de proposito: uma classe de caracteres com contrabarra e um
     * convite a erro de escape, e aqui um escape errado vira travessia de
     * diretorio. Separar pelo separador da plataforma e descartar os vazios
     * remove a barra inicial sem ambiguidade.
     */
    const relativo = bruto.split(path.sep).filter(Boolean).join(path.sep);
    const destino = path.join(RAIZ, relativo || 'index.html');

    if (!destino.startsWith(RAIZ)) {
      return new Response('Nao encontrado', { status: 404 });
    }

    return net.fetch(pathToFileURL(destino).toString());
  });
}

function criarJanela() {
  const janela = new BrowserWindow({
    width: LARGURA,
    height: ALTURA,
    /*
     * `useContentSize` mede a AREA UTIL, nao a janela inteira. Sem ele, a
     * barra de titulo do Windows comeria uns 30px do desenho e a barra de
     * abas do rodape ficaria cortada.
     */
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#FAF8F5',
    autoHideMenuBar: true,
    title: 'Vapt — App da equipe',
    webPreferences: {
      /*
       * A interface nao precisa de Node e nao deve ter. Ela renderiza nome,
       * observacao e endereco digitados por clientes; com `nodeIntegration`,
       * uma falha de escape na tela viraria acesso ao sistema de arquivos do
       * computador do restaurante.
       */
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  });

  /*
   * Trava de navegacao.
   *
   * O painel de edicao ja nao esta dentro do bundle, entao isto e a segunda
   * camada: mesmo que um link ou um redirecionamento tente levar a janela
   * para o site, ela nao sai de `vapt://`. Link externo abre no navegador do
   * sistema, que e onde ele deve abrir.
   */
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith('vapt://')) {
      evento.preventDefault();
      void shell.openExternal(url);
    }
  });

  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void janela.loadURL('vapt://localhost/index.html');
  return janela;
}

/*
 * Instancia unica. Dois aplicativos abertos disputariam o mesmo
 * armazenamento de sessao, e o efeito para o funcionario seria ser
 * desconectado sem motivo aparente.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [janela] = BrowserWindow.getAllWindows();
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  void app.whenReady().then(() => {
    servirArquivos();
    criarJanela();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
