import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { renameSync } from 'node:fs';

/**
 * Build do APLICATIVO NATIVO (APK e .exe), separado do build do site.
 *
 * Sao dois artefatos com publicos diferentes: `dist/` vai para a Vercel e tem
 * o painel do dono; `dist-app/` vai para dentro do binario e nao tem. Manter
 * um `outDir` proprio e o que impede um `vite build` distraido de sobrescrever
 * um com o outro.
 *
 * Roda em modo `app`, entao le `.env.app`. Copie `.env.app.example` e
 * preencha antes de empacotar.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  const api = (env.VITE_API_URL ?? '').trim();

  /*
   * O site pode usar `/api` porque a Vercel reescreve o caminho. O binario
   * nao: a pagina abre por `file://`, e ali `/api` aponta para a raiz do
   * sistema de arquivos do aparelho.
   *
   * A falha precisa acontecer AQUI, no build. Se passasse, o APK seria
   * gerado, assinado, instalado e so entao mostraria "sem conexao" na tela de
   * login — sem nada indicando que o problema nasceu em uma variavel.
   */
  if (!/^https?:\/\//.test(api)) {
    throw new Error(
      [
        '',
        'VITE_API_URL precisa ser uma URL absoluta para empacotar o aplicativo.',
        `  valor lido: ${api === '' ? '(vazio)' : api}`,
        '',
        'O aplicativo abre em file:// e nao tem como resolver um caminho',
        'relativo. Crie apps/web/.env.app a partir de .env.app.example:',
        '',
        '  VITE_API_URL=https://sua-api.vercel.app/api',
        '',
      ].join('\n')
    );
  }

  /**
   * Renomeia `index.app.html` para `index.html` na saida.
   *
   * O nome precisa ser diferente na ENTRADA (senao colide com o index.html do
   * site) e precisa ser `index.html` na SAIDA: tanto o Capacitor quanto o
   * empacotador do Electron procuram esse nome exato dentro da pasta, e o
   * Capacitor recusa a pasta inteira sem ele.
   */
  const renomearEntrada = {
    name: 'vapt-renomear-html-do-app',
    closeBundle() {
      const saida = resolve(__dirname, 'dist-app');
      renameSync(resolve(saida, 'index.app.html'), resolve(saida, 'index.html'));
    },
  };

  return {
    plugins: [react(), renomearEntrada],

    /*
     * `./` em vez de `/`. Dentro do APK e do .exe a pagina abre por `file://`,
     * e um caminho absoluto viraria a raiz do sistema de arquivos: a tela
     * subia em branco, sem erro visivel, so um 404 de asset no console da
     * WebView.
     */
    base: './',

    build: {
      outDir: 'dist-app',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: resolve(__dirname, 'index.app.html'),
      },
    },
  };
});
