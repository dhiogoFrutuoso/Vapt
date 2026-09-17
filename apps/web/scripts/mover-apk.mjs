import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Move o APK recém-compilado para `releases/` e para o download do site.
 *
 * O Gradle enterra o arquivo em `android/app/build/outputs/apk/debug/` com o
 * nome genérico `app-debug.apk`. Dois problemas nisso:
 *
 *   1. `app-debug.apk` não diz de qual aplicativo é — baixado pelo lojista,
 *      vira um arquivo anônimo na pasta de downloads;
 *   2. o caminho fica dentro de `android/`, que é gerado e descartável: um
 *      `cap add android` novo apagaria o binário junto.
 *
 * O site e a atualização obrigatória usam `/downloads/vapt.apk`. Atualizar
 * apenas `releases/` deixava esse endereço servindo um APK antigo com a
 * interface web nova, mas sem os plugins nativos correspondentes.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raizWeb = resolve(aqui, '..');
const raizProjeto = resolve(raizWeb, '..', '..');
const destino = join(raizProjeto, 'releases');

/*
 * Aceita release e debug, nesta ordem. Quem tiver keystore configurada gera o
 * release e é ele que deve ser publicado; sem keystore, o debug é o que
 * existe.
 */
const variante = process.argv[2] === 'release' ? 'release' : 'debug';
const CANDIDATOS = [
  join(raizWeb, 'android', 'app', 'build', 'outputs', 'apk', variante, `app-${variante}.apk`),
];

const origem = CANDIDATOS.find((c) => existsSync(c));

if (!origem) {
  console.error('  APK nao encontrado. Procurei em:');
  for (const c of CANDIDATOS) console.error(`    ${c}`);
  process.exit(1);
}

mkdirSync(destino, { recursive: true });

const alvo = join(destino, 'vapt.apk');
const downloadPublico = join(raizWeb, 'public', 'downloads', 'vapt.apk');
copyFileSync(origem, alvo);
mkdirSync(dirname(downloadPublico), { recursive: true });
copyFileSync(origem, downloadPublico);

const mb = (statSync(alvo).size / 1024 / 1024).toFixed(1);
console.log(`  APK -> ${alvo}  (${mb} MB)`);
console.log(`  Download do site -> ${downloadPublico}`);
