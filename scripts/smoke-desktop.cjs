'use strict';

// Executado pelo Electron: usa o processo principal e os assets reais do
// pacote, com perfil temporário para não tocar na sessão do funcionário.
const { app } = require('electron');
const path = require('node:path');
const target = path.resolve(process.argv[2] || 'releases/win-unpacked/resources/app.asar/electron/main.cjs');
const profile = process.env.VAPT_DESKTOP_TEST_PROFILE;
if (!profile) throw new Error('Execute o teste pelo script test-desktop.mjs.');
app.setPath('userData', profile);
let finished = false;
let timer;
function finish(code, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.log(message);
  app.exit(code);
}
timer = setTimeout(() => finish(1, 'FAIL: a tela de login não apareceu em 30 segundos.'), 30_000);
app.on('browser-window-created', (_event, window) => {
  window.hide();
  window.show = () => {};
  window.webContents.on('did-fail-load', (_event, code, description, url, mainFrame) => {
    if (mainFrame) finish(1, `FAIL: ${code} ${description} ${url}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => finish(1, `FAIL: renderer ${details.reason}`));
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`);
  });
  window.webContents.on('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(`new Promise(resolve => {
        const started = Date.now();
        const check = () => {
          const input = document.querySelector('input');
          const text = document.body.innerText;
          if (input && text.includes('Digite o código do funcionário') && window.vaptSecure?.disponivel) {
            resolve({ ready: true, url: location.href, title: document.title });
          } else if (Date.now() - started > 20000) {
            resolve({ ready: false, text: text.slice(0, 800), url: location.href });
          } else setTimeout(check, 200);
        };
        check();
      })`);
      finish(result.ready ? 0 : 1, `${result.ready ? 'PASS' : 'FAIL'}: ${JSON.stringify(result)}`);
    } catch (error) { finish(1, `FAIL: ${error.message}`); }
  });
});
require(target);
