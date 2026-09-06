import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Compila os aplicativos nativos JÁ COM A CARA DO RESTAURANTE.
 *
 * POR QUE ISTO PRECISA SER PRÉ-BUILD
 * ----------------------------------
 * Android, iOS e Windows NÃO deixam o aplicativo trocar o próprio nome ou
 * ícone depois de instalado. Isso não é limitação nossa: o ícone da tela
 * inicial é assinado dentro do pacote, e mudá-lo em tempo de execução seria
 * exatamente o que um aplicativo malicioso faria para se disfarçar de outro.
 *
 * A marca do restaurante, então, precisa entrar ANTES da compilação. Este
 * script lê o cadastro no banco, injeta nome e ícone nos arquivos de
 * configuração, compila, e devolve os arquivos originais ao lugar.
 *
 * O QUE ELE NÃO FAZ
 * -----------------
 * Não mexe no `dist-app`. A interface continua sendo a mesma para todos os
 * clientes e busca a marca da API em tempo de execução — o que é o certo,
 * porque logo e cor mudam quando o dono quiser, sem recompilar nada.
 *
 * O que é imutável no binário é só o que o sistema operacional trava: nome
 * do app e ícone da tela inicial.
 *
 * USO
 * ---
 *   node scripts/build-apps.mjs --slug pitaya-4 --alvo ambos
 *   node scripts/build-apps.mjs --slug pitaya-4 --alvo apk
 *   node scripts/build-apps.mjs --slug pitaya-4 --alvo exe
 *
 * Sem `--slug`, compila com a marca genérica do Vapt.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raizWeb = resolve(aqui, '..');
const raizProjeto = resolve(raizWeb, '..', '..');

/* ------------------------------------------------------------------ */
/* Argumentos                                                          */
/* ------------------------------------------------------------------ */

function arg(nome, padrao = '') {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const slug = arg('slug');
const alvo = arg('alvo', 'ambos');

const PADRAO = { appName: 'Vapt Equipe', appId: 'com.vapt.equipe', logoUrl: null };

/* ------------------------------------------------------------------ */
/* Cadastro do restaurante                                             */
/* ------------------------------------------------------------------ */

/**
 * Lê nome e logo direto do MongoDB.
 *
 * Usa o driver da API, que já está instalado no monorepo, em vez de uma
 * chamada HTTP: o script roda na máquina de quem compila, e depender da API
 * no ar para gerar um binário adicionaria uma peça que pode estar fora do ar
 * justamente na hora da entrega.
 */
async function lerRestaurante() {
  if (!slug) {
    console.log('  sem --slug: compilando com a marca genérica do Vapt');
    return PADRAO;
  }

  const { default: mongoose } = await import('mongoose');
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('\n  MONGODB_URI não definida. Sem ela não dá para ler o cadastro.');
    console.error('  Rode a partir de apps/api, ou exporte a variável antes.\n');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || undefined,
    serverSelectionTimeoutMS: 8000,
  });

  const doc = await mongoose.connection
    .collection('appprojects')
    .findOne({ slug: slug.toLowerCase() }, { projection: { name: 1, brand: 1 } });

  await mongoose.connection.close();

  if (!doc) {
    console.error(`\n  Restaurante "${slug}" não encontrado.\n`);
    process.exit(1);
  }

  const nome = String(doc.name ?? 'Vapt').trim();

  return {
    appName: nome,
    /*
     * O appId vira `com.vapt.<slug>`. Precisa ser estável e único: mudá-lo
     * entre versões faz o Android tratar o app como OUTRO aplicativo, e o
     * funcionário acaba com dois ícones e uma sessão perdida.
     */
    appId: `com.vapt.${slug.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
    logoUrl: doc.brand?.logo ? String(doc.brand.logo) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Injeção                                                             */
/* ------------------------------------------------------------------ */

const CAPACITOR = join(raizWeb, 'capacitor.config.ts');
const PACKAGE = join(raizWeb, 'package.json');

/** Guarda o original para devolver depois — inclusive se o build falhar. */
const originais = new Map();

function guardar(caminho) {
  if (!originais.has(caminho)) originais.set(caminho, readFileSync(caminho, 'utf8'));
}

function restaurar() {
  for (const [caminho, conteudo] of originais) writeFileSync(caminho, conteudo);
  if (originais.size > 0) console.log('  configurações originais restauradas');
}

function injetar(marca) {
  guardar(CAPACITOR);
  guardar(PACKAGE);

  /* Capacitor: nome e id do pacote Android. */
  let cap = readFileSync(CAPACITOR, 'utf8');
  cap = cap.replace(/appId: '[^']*'/, `appId: '${marca.appId}'`);
  cap = cap.replace(/appName: '[^']*'/, `appName: '${marca.appName.replace(/'/g, "\\'")}'`);
  writeFileSync(CAPACITOR, cap);

  /* electron-builder: nome do produto e do instalador. */
  const pkg = JSON.parse(readFileSync(PACKAGE, 'utf8'));
  pkg.build.appId = marca.appId;
  pkg.build.productName = marca.appName;
  pkg.build.nsis = { ...pkg.build.nsis, shortcutName: marca.appName };
  writeFileSync(PACKAGE, JSON.stringify(pkg, null, 2) + '\n');

  console.log(`  marca injetada: "${marca.appName}" (${marca.appId})`);
}

/**
 * Baixa o logo e o coloca onde cada empacotador procura o ícone.
 *
 * O Electron aceita PNG direto. O Android precisa dos mipmaps em vários
 * tamanhos, gerados pelo `@capacitor/assets` — e é por isso que o ícone só
 * entra no APK se essa ferramenta estiver instalada. Sem ela, avisamos e
 * seguimos com o ícone padrão em vez de abortar: um binário com o ícone
 * genérico ainda é entregável; nenhum binário não é.
 */
async function prepararIcone(marca) {
  if (!marca.logoUrl) return;

  const base = process.env.PUBLIC_BASE_URL || 'https://vapt-api-ashen.vercel.app';
  const url = `${base}/api/images/${marca.logoUrl}`;
  const destino = join(raizWeb, 'resources');

  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    mkdirSync(destino, { recursive: true });
    const bytes = Buffer.from(await resposta.arrayBuffer());
    writeFileSync(join(destino, 'icon.png'), bytes);

    /* O electron-builder procura em build/icon.png por convenção. */
    mkdirSync(join(raizWeb, 'build'), { recursive: true });
    copyFileSync(join(destino, 'icon.png'), join(raizWeb, 'build', 'icon.png'));

    console.log('  logo baixado para resources/icon.png');

    const assets = spawnSync('npx', ['@capacitor/assets', 'generate', '--android'], {
      cwd: raizWeb,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    if (assets.status !== 0) {
      console.warn('  @capacitor/assets indisponível: o APK sai com o ícone padrão.');
      console.warn('  Para o ícone do restaurante: npm i -D @capacitor/assets');
    }
  } catch (erro) {
    console.warn(`  não consegui baixar o logo (${erro.message}); usando o ícone padrão.`);
  }
}

/* ------------------------------------------------------------------ */
/* Compilação                                                          */
/* ------------------------------------------------------------------ */

function rodar(script) {
  console.log(`\n> npm run ${script}`);
  const r = spawnSync('npm', ['run', script], {
    cwd: raizWeb,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

async function main() {
  const marca = await lerRestaurante();

  injetar(marca);
  await prepararIcone(marca);

  let ok = true;

  if (alvo === 'exe' || alvo === 'ambos') ok = rodar('build:win') && ok;
  if (alvo === 'apk' || alvo === 'ambos') ok = rodar('build:android') && ok;

  restaurar();

  if (!ok) {
    console.error('\n  Compilação falhou. Veja o log acima.\n');
    process.exit(1);
  }

  console.log(`\n  pronto. Binários em ${join(raizProjeto, 'releases')}\n`);
}

/* Restaura mesmo se algo estourar no meio: deixar o capacitor.config.ts com
   o nome de um cliente dentro do repositório seria pior que o erro em si. */
process.on('exit', restaurar);
process.on('SIGINT', () => {
  restaurar();
  process.exit(130);
});

main().catch((erro) => {
  console.error(erro);
  restaurar();
  process.exit(1);
});
