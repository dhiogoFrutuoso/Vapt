import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Junta os instaladores prontos numa pasta só, com nomes estáveis.
 *
 * POR QUE UMA PASTA SEPARADA
 * --------------------------
 * O Electron e o Capacitor cospem os binários em lugares distantes e cheios
 * de entulho: `release/` traz `win-unpacked/`, `.blockmap` e o desinstalador;
 * o Gradle enterra o APK em `android/app/build/outputs/apk/debug/`. Subir um
 * release passa a ser abrir uma pasta com exatamente dois arquivos, em vez de
 * caçar cada um deles.
 *
 * POR QUE OS NOMES SÃO FIXOS
 * --------------------------
 * `vapt-setup.exe` e `vapt.apk`, sem número de versão. A URL do GitHub
 * Releases usa `/releases/latest/download/<nome>`, que aponta sempre para o
 * release mais novo — mas só funciona se o NOME do arquivo não mudar. Com a
 * versão embutida no nome, cada publicação exigiria reconfigurar a variável
 * de ambiente e refazer o deploy do site.
 *
 * A versão continua existindo: ela vive na tag do release.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raizWeb = resolve(aqui, '..');
const raizProjeto = resolve(raizWeb, '..', '..');
const destino = join(raizProjeto, 'builds');

const ARTEFATOS = [
  {
    de: join(raizWeb, 'release', 'Vapt-Setup.exe'),
    para: 'vapt-setup.exe',
    comando: 'npm run build:win -w apps/web',
  },
  {
    de: join(raizWeb, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    para: 'vapt.apk',
    comando: 'npm run build:android -w apps/web',
  },
];

function mb(caminho) {
  return (statSync(caminho).size / 1024 / 1024).toFixed(1);
}

mkdirSync(destino, { recursive: true });

let faltando = 0;

for (const { de, para, comando } of ARTEFATOS) {
  if (!existsSync(de)) {
    /*
     * Avisa e segue, em vez de abortar. Quem acabou de gerar só o APK deve
     * conseguir coletá-lo sem ser obrigado a recompilar o .exe de 78 MB.
     */
    console.warn(`  ausente  ${para}  — gere com: ${comando}`);
    faltando += 1;
    continue;
  }

  copyFileSync(de, join(destino, para));
  console.log(`  ok       ${para}  (${mb(de)} MB)`);
}

console.log(`\n  pasta: ${destino}`);

if (faltando === ARTEFATOS.length) {
  console.error('\n  Nenhum instalador encontrado. Nada foi coletado.');
  process.exit(1);
}
