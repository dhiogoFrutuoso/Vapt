'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Ponte entre a interface e o processo principal.
 *
 * O QUE ATRAVESSA, E O QUE NÃO
 * ----------------------------
 * Só três funções de armazenamento de segredo. Nada de `require`, nada de
 * `ipcRenderer` cru, nada de sistema de arquivos. Com `contextIsolation`
 * ligado, a interface enxerga exatamente o objeto abaixo e mais nada — um XSS
 * na tela não consegue alcançar o Node por baixo.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * No Android o Capacitor guarda o token no cofre do sistema. No Electron não
 * havia equivalente: o token caía em `sessionStorage`, que é lido por
 * qualquer script injetado na página.
 *
 * O `safeStorage` do Electron cifra com a chave do usuário do sistema
 * operacional — DPAPI no Windows, Keychain no macOS, libsecret no Linux. O
 * arquivo cifrado só abre na conta de quem o gravou; copiá-lo para outra
 * máquina não serve de nada.
 *
 * As chaves são restringidas do lado do processo principal, não aqui: quem
 * chama esta ponte é a nossa própria interface, mas quem GARANTE o limite
 * precisa ser o lado privilegiado.
 */
contextBridge.exposeInMainWorld('vaptSecure', {
  /** Marca de presença: o `deviceStorage` decide o backend por ela. */
  disponivel: true,

  get: (chave) => ipcRenderer.invoke('vapt:secure:get', String(chave)),
  set: (chave, valor) => ipcRenderer.invoke('vapt:secure:set', String(chave), String(valor)),
  remove: (chave) => ipcRenderer.invoke('vapt:secure:remove', String(chave)),
  installUpdate: (url) => ipcRenderer.invoke('vapt:update:install', String(url)),
  brandingStatus: () => ipcRenderer.invoke('vapt:branding:status'),
  installBranding: (url, hash) => ipcRenderer.invoke('vapt:branding:install', String(url), String(hash)),
  exitApp: () => ipcRenderer.invoke('vapt:update:exit'),
  setUpdateGateActive: (active) => ipcRenderer.invoke('vapt:update:gate-active', Boolean(active)),
  onUpdateProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('vapt:update:progress', handler);
    return () => ipcRenderer.removeListener('vapt:update:progress', handler);
  },
  printReceipt: () => ipcRenderer.invoke('vapt:print:receipt'),
  listPrinters: () => ipcRenderer.invoke('vapt:printer:list'),
  getPrinter: () => ipcRenderer.invoke('vapt:printer:get'),
  savePrinter: (deviceName) => ipcRenderer.invoke('vapt:printer:save', String(deviceName ?? '')),
});
