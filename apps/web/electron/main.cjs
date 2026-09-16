'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} = require('electron');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');
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

/** Origem unica da interface. Tudo fora disto e considerado externo. */
const ORIGEM = 'vapt://localhost';

/*
 * Dimensoes de software de desktop.
 *
 * A interface e responsiva: em tela larga a barra de abas vira uma coluna
 * lateral e o conteudo ocupa o espaco. O caixa e a cozinha usam monitor, e
 * obrigar um monitor a se comportar como celular desperdica a tela inteira.
 */
const LARGURA = 1280;
const ALTURA = 720;
const LARGURA_MIN = 380;
const ALTURA_MIN = 600;

/* ------------------------------------------------------------------ */
/* Esquema proprio                                                     */
/* ------------------------------------------------------------------ */

/**
 * `vapt://` em vez de `file://`.
 *
 * Tres razoes, e nenhuma delas e estetica:
 *
 *   1. CORS. Em `file://` o navegador manda `Origin: null`, e liberar `null`
 *      na API abriria a porta para qualquer iframe com sandbox na internet.
 *      Um esquema proprio produz uma origem que so este aplicativo emite.
 *
 *   2. Armazenamento. `file://` nao tem origem estavel, entao localStorage e
 *      IndexedDB ficam sem lugar fixo: o funcionario seria deslogado a cada
 *      atualizacao do aplicativo.
 *
 *   3. Navegacao. Com uma origem nomeada da para dizer "nunca saia daqui"
 *      numa comparacao de string, sem depender de heuristica de caminho.
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
    const destino = path.join(RAIZ, relativo || 'index.app.html');

    if (!destino.startsWith(RAIZ)) {
      return new Response('Nao encontrado', { status: 404 });
    }

    return net.fetch(pathToFileURL(destino).toString());
  });
}

/* ------------------------------------------------------------------ */
/* Cofre de segredos                                                   */
/* ------------------------------------------------------------------ */

/**
 * Armazenamento cifrado dos tokens do funcionario.
 *
 * O `safeStorage` cifra com a chave do usuario do sistema — DPAPI no Windows,
 * Keychain no macOS, libsecret no Linux. O arquivo resultante so abre na
 * conta de quem gravou: copiar para outra maquina nao serve de nada.
 *
 * Fica no processo PRINCIPAL, nao na interface. Se a interface pudesse cifrar
 * e decifrar sozinha, um XSS na tela teria a mesma capacidade que o
 * aplicativo — e o cofre viraria enfeite.
 */
const CHAVES_PERMITIDAS = new Set([
  'vapt.device.access',
  'vapt.device.refresh',
  'vapt.device.id',
]);

function arquivoDoCofre() {
  return path.join(app.getPath('userData'), 'cofre.json');
}

function lerCofre() {
  try {
    return JSON.parse(fs.readFileSync(arquivoDoCofre(), 'utf8'));
  } catch {
    /* Primeira execucao, arquivo apagado ou corrompido: comeca vazio. */
    return {};
  }
}

function gravarCofre(dados) {
  try {
    fs.writeFileSync(arquivoDoCofre(), JSON.stringify(dados), { mode: 0o600 });
  } catch (erro) {
    console.error('[cofre] Nao foi possivel gravar.', erro.message);
  }
}

function limparCredenciaisDoCofre() {
  const cofre = lerCofre();
  delete cofre['vapt.device.access'];
  delete cofre['vapt.device.refresh'];
  gravarCofre(cofre);
}

function validarUrlDoInstalador(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' || !url.pathname.toLowerCase().endsWith('.exe')) {
    throw new Error('URL de instalador inválida.');
  }
  return url;
}

function baixarInstalador(url, destino, webContents, redirecionamentos = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 30_000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirecionamentos >= 5) return reject(new Error('Redirecionamentos demais no download.'));
        try {
          return resolve(
            baixarInstalador(
              validarUrlDoInstalador(new URL(response.headers.location, url).toString()),
              destino,
              webContents,
              redirecionamentos + 1
            )
          );
        } catch (error) {
          return reject(error);
        }
      }

      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Download recusado (${response.statusCode}).`));
      }

      const total = Number(response.headers['content-length'] ?? 0);
      let transferred = 0;
      const file = fs.createWriteStream(destino, { flags: 'w', mode: 0o600 });

      response.on('data', (chunk) => {
        transferred += chunk.length;
        const percent = total > 0 ? Math.min(99, Math.round((transferred / total) * 100)) : 0;
        if (!webContents.isDestroyed()) {
          webContents.send('vapt:update:progress', { percent, transferred, total });
        }
      });
      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          if (!webContents.isDestroyed()) {
            webContents.send('vapt:update:progress', { percent: 100, transferred, total });
          }
          resolve(destino);
        });
      });
      file.on('error', reject);
      response.on('error', reject);
    });

    request.on('timeout', () => request.destroy(new Error('Tempo limite do download excedido.')));
    request.on('error', reject);
  });
}

async function instalarAtualizacao(evento, value) {
  const url = validarUrlDoInstalador(value);
  const destino = path.join(app.getPath('temp'), 'Vapt-Setup-update.exe');
  try {
    fs.rmSync(destino, { force: true });
    await baixarInstalador(url, destino, evento.sender);
    const cabecalho = Buffer.alloc(2);
    const arquivo = fs.openSync(destino, 'r');
    fs.readSync(arquivo, cabecalho, 0, 2, 0);
    fs.closeSync(arquivo);
    if (cabecalho.toString('ascii') !== 'MZ') throw new Error('O arquivo recebido não é um executável válido.');

    /* Se o usuário cancelar o NSIS, não pode reabrir a versão antiga ainda
       autenticada. A atualização bem-sucedida pede novo login uma vez. */
    limparCredenciaisDoCofre();
    const instalador = spawn(destino, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true });
    instalador.unref();
    setTimeout(() => app.quit(), 120);
    return true;
  } catch (error) {
    try { fs.rmSync(destino, { force: true }); } catch { /* arquivo já removido */ }
    console.error('[update] Falha ao instalar atualização:', error.message);
    throw error;
  }
}

function registrarCofre() {
  const gatesAtivos = new Set();
  ipcMain.handle('vapt:secure:get', (_evento, chave) => {
    /*
     * A lista de chaves e conferida AQUI, no lado privilegiado. Confiar na
     * interface para nao pedir chaves alheias seria confiar justamente no
     * lado que um XSS controla.
     */
    if (!CHAVES_PERMITIDAS.has(chave)) return null;

    const cofre = lerCofre();
    const guardado = cofre[chave];
    if (typeof guardado !== 'string') return null;

    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(guardado, 'base64'));
    } catch {
      /* Cifrado por outro usuario ou outra maquina: trata como ausente, e o
         funcionario faz login de novo. Melhor que estourar na tela. */
      return null;
    }
  });

  ipcMain.handle('vapt:secure:set', (_evento, chave, valor) => {
    if (!CHAVES_PERMITIDAS.has(chave)) return false;
    if (!safeStorage.isEncryptionAvailable()) return false;

    const cofre = lerCofre();
    cofre[chave] = safeStorage.encryptString(valor).toString('base64');
    gravarCofre(cofre);
    return true;
  });

  ipcMain.handle('vapt:secure:remove', (_evento, chave) => {
    if (!CHAVES_PERMITIDAS.has(chave)) return false;
    const cofre = lerCofre();
    delete cofre[chave];
    gravarCofre(cofre);
    return true;
  });

  ipcMain.handle('vapt:update:install', instalarAtualizacao);
  ipcMain.handle('vapt:update:exit', () => {
    limparCredenciaisDoCofre();
    setTimeout(() => app.quit(), 50);
    return true;
  });
  ipcMain.handle('vapt:update:gate-active', (evento, ativo) => {
    if (ativo) gatesAtivos.add(evento.sender.id);
    else gatesAtivos.delete(evento.sender.id);
    return true;
  });

  app.on('browser-window-created', (_event, janela) => {
    janela.on('close', () => {
      if (gatesAtivos.has(janela.webContents.id)) limparCredenciaisDoCofre();
      gatesAtivos.delete(janela.webContents.id);
    });
  });

  const arquivoImpressora = () => path.join(app.getPath('userData'), 'printer.json');
  const lerImpressora = () => {
    try {
      const data = JSON.parse(fs.readFileSync(arquivoImpressora(), 'utf8'));
      return typeof data.deviceName === 'string' ? data.deviceName.slice(0, 240) : '';
    } catch {
      return '';
    }
  };

  ipcMain.handle('vapt:printer:list', async (evento) => {
    const printers = await evento.sender.getPrintersAsync();
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      isDefault: printer.isDefault === true,
      status: Number(printer.status ?? 0),
    }));
  });

  ipcMain.handle('vapt:printer:get', () => ({ deviceName: lerImpressora() }));

  ipcMain.handle('vapt:printer:save', async (evento, rawDeviceName) => {
    const deviceName = String(rawDeviceName ?? '').trim().slice(0, 240);
    if (deviceName) {
      const printers = await evento.sender.getPrintersAsync();
      if (!printers.some((printer) => printer.name === deviceName)) {
        return { success: false, error: 'A impressora selecionada não está mais disponível.' };
      }
    }
    fs.writeFileSync(arquivoImpressora(), JSON.stringify({ deviceName }), { encoding: 'utf8', mode: 0o600 });
    return { success: true, deviceName };
  });

  ipcMain.handle('vapt:print:receipt', (evento) =>
    new Promise((resolve) => {
      const deviceName = lerImpressora();
      evento.sender.print(
        {
          silent: Boolean(deviceName),
          deviceName: deviceName || undefined,
          printBackground: false,
          margins: { marginType: 'none' },
        },
        (success, failureReason) => resolve({ success, error: success ? null : failureReason })
      );
    })
  );
}

/* ------------------------------------------------------------------ */
/* Janela                                                              */
/* ------------------------------------------------------------------ */

/**
 * Enderecos externos que o aplicativo pode ENCAMINHAR ao navegador do
 * sistema — nunca abrir dentro de si.
 *
 * A lista existe porque duas telas dependem dela: o entregador abre o mapa do
 * endereco e a recepcao chama o cliente no WhatsApp. Bloquear tudo deixaria o
 * entregador sem rota, que e uma falha de operacao, nao um ganho de
 * seguranca — ele abriria o mapa no celular do bolso e o pedido atrasaria.
 *
 * O que a lista NAO faz e permitir navegacao interna: mesmo estes enderecos
 * saem para o navegador do sistema. A janela do aplicativo nunca deixa
 * `vapt://`.
 */
const HOSTS_EXTERNOS = new Set([
  'wa.me',
  'api.whatsapp.com',
  'www.google.com',
  'maps.google.com',
]);

function podeEncaminhar(url) {
  try {
    const alvo = new URL(url);
    if (alvo.protocol !== 'https:') return false;
    return HOSTS_EXTERNOS.has(alvo.hostname);
  } catch {
    return false;
  }
}

function configurarGeolocalizacao() {
  const origemConfiavel = (conteudo, origem) =>
    String(origem ?? '').startsWith(ORIGEM) &&
    String(conteudo?.getURL?.() ?? '').startsWith(ORIGEM);

  session.defaultSession.setPermissionCheckHandler((conteudo, permissao, origem) =>
    permissao === 'geolocation' && origemConfiavel(conteudo, origem)
  );

  session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder, detalhes) => {
    const origem = detalhes?.requestingUrl ?? conteudo?.getURL?.() ?? '';
    responder(permissao === 'geolocation' && origemConfiavel(conteudo, origem));
  });
}

function criarJanela() {
  const janela = new BrowserWindow({
    width: LARGURA,
    height: ALTURA,
    minWidth: LARGURA_MIN,
    minHeight: ALTURA_MIN,
    /*
     * `useContentSize` mede a AREA UTIL, nao a janela inteira. Sem ele, a
     * barra de titulo do Windows comeria uns 30px do desenho.
     */
    useContentSize: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: '#FAF8F5',
    autoHideMenuBar: true,
    title: 'Vapt — App da equipe',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),

      /*
       * A interface nao precisa de Node e nao deve ter. Ela renderiza nome,
       * observacao e endereco digitados por CLIENTES; com `nodeIntegration`,
       * uma falha de escape na tela viraria acesso ao sistema de arquivos do
       * computador do restaurante.
       */
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,

      /*
       * `enableRemoteModule` foi REMOVIDO do Electron na versao 14 (usamos a
       * 33), entao esta linha nao tem efeito nenhum hoje. Fica explicita
       * mesmo assim: quem auditar o arquivo procura por ela, e a ausencia
       * levantaria a duvida de se o modulo remoto esta ligado.
       */
      enableRemoteModule: false,

      /* Sem integracao de Node tambem nos web workers. */
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,

      /* Nao afrouxa a politica de mesma origem por conveniencia de debug. */
      webSecurity: true,
      allowRunningInsecureContent: false,

      /* Nada de janela abrindo sozinha por `window.open` sem gesto do usuario. */
      spellcheck: false,
    },
  });

  /*
   * DevTools fechado em producao.
   *
   * O console aberto no computador do caixa e um caminho direto para ler a
   * sessao do funcionario e disparar chamadas autenticadas a mao. Em
   * desenvolvimento continua liberado, senao depurar vira adivinhacao.
   */
  if (app.isPackaged) {
    janela.webContents.on('before-input-event', (evento, entrada) => {
      const tecla = String(entrada.key ?? '').toLowerCase();
      const abreDevtools =
        tecla === 'f12' ||
        ((entrada.control || entrada.meta) && entrada.shift && ['i', 'j', 'c'].includes(tecla)) ||
        ((entrada.control || entrada.meta) && tecla === 'u'); // ver codigo-fonte

      if (abreDevtools) evento.preventDefault();
    });

    /* Cinto e suspensorio: se algo abrir o DevTools por outro caminho
       (menu, extensao, chamada programatica), ele fecha na hora. */
    janela.webContents.on('devtools-opened', () => janela.webContents.closeDevTools());
  }

  /*
   * Trava de navegacao.
   *
   * O painel de edicao ja nao esta dentro do bundle, entao isto e a segunda
   * camada: nenhum link, redirecionamento ou `location.href` tira a janela de
   * `vapt://`. Endereco da lista curta sai para o navegador do sistema; o
   * resto e simplesmente descartado.
   */
  janela.webContents.on('will-navigate', (evento, url) => {
    if (url.startsWith(ORIGEM)) return;

    evento.preventDefault();
    if (podeEncaminhar(url)) void shell.openExternal(url);
    else console.warn('[nav] Navegacao bloqueada:', url);
  });

  /* Nenhuma janela nova, nunca. Popup e o vetor classico de phishing dentro
     de aplicativo: a janela sem barra de endereco imita a tela de login. */
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (podeEncaminhar(url)) void shell.openExternal(url);
    else console.warn('[nav] Popup bloqueado:', url);
    return { action: 'deny' };
  });

  /* Anexar webview e outra forma de embutir conteudo de terceiros. */
  janela.webContents.on('will-attach-webview', (evento) => evento.preventDefault());

  void janela.loadURL(`${ORIGEM}/index.app.html`);
  return janela;
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

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
    registrarCofre();
    configurarGeolocalizacao();
    criarJanela();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  /*
   * Ultima linha de defesa do processo principal: mesmo que algum codigo
   * futuro esqueca as travas da janela, nenhuma WebContents deste
   * aplicativo pode ganhar Node nem abrir janela para fora.
   */
  app.on('web-contents-created', (_evento, conteudo) => {
    conteudo.setWindowOpenHandler(({ url }) => {
      if (podeEncaminhar(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    conteudo.on('will-attach-webview', (evento) => evento.preventDefault());
  });
}
