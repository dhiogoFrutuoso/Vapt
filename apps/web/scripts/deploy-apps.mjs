import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Esteira de publicação dos instaladores nativos.
 *
 * Compila .exe e .apk, cria a tag, sobe os dois como assets de um GitHub
 * Release e imprime as variáveis prontas para colar na Vercel.
 *
 * ORDEM DAS VERIFICAÇÕES
 * ----------------------
 * Tudo o que pode dar errado é conferido ANTES do primeiro build. Compilar o
 * .exe leva alguns minutos e o APK mais um tanto; descobrir só no final que
 * falta autenticação é jogar esse tempo fora. As checagens caras de rede vêm
 * depois das baratas, mas todas antes de qualquer compilação.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raizWeb = resolve(aqui, '..');
const raizProjeto = resolve(raizWeb, '..', '..');
const pastaReleases = join(raizProjeto, 'releases');

const EXE = join(pastaReleases, 'vapt-setup.exe');
const APK = join(pastaReleases, 'vapt.apk');

const seco = process.argv.includes('--dry-run');

/* -------------------------------------------------------------------- */
/* Utilidades                                                            */
/* -------------------------------------------------------------------- */

function titulo(texto) {
  console.log(`\n\x1b[1m${texto}\x1b[0m`);
}

function morrer(mensagem, dica) {
  console.error(`\n\x1b[31m  ${mensagem}\x1b[0m`);
  if (dica) console.error(`\n${dica}\n`);
  process.exit(1);
}

/** Roda um comando e devolve a saída. Lança se o comando falhar. */
function capturar(comando, args, opcoes = {}) {
  return execFileSync(comando, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...opcoes,
  }).trim();
}

/** Roda um comando mostrando a saída ao vivo. Devolve o código de saída. */
function rodar(comando, args, opcoes = {}) {
  const r = spawnSync(comando, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
    ...opcoes,
  });
  return r.status ?? 1;
}

function mb(caminho) {
  return (statSync(caminho).size / 1024 / 1024).toFixed(1);
}

/* -------------------------------------------------------------------- */
/* 1. Qual repositório recebe o release                                  */
/* -------------------------------------------------------------------- */

/**
 * Extrai `dono/repo` de uma URL de remote, em qualquer um dos formatos que o
 * git aceita: HTTPS com ou sem `.git`, SSH, e `ssh://`.
 */
function partirRemote(url) {
  const limpa = url.trim().replace(/\.git$/, '');
  const m = limpa.match(/github\.com[/:]([^/]+)\/(.+)$/);
  if (!m) return null;
  return { dono: m[1], repo: m[2] };
}

function descobrirRepositorio() {
  /*
   * A variável tem prioridade sobre o remote, e não é um detalhe: o
   * código-fonte costuma viver num repositório PRIVADO, e um release privado
   * gera URLs que exigem token. A página /download é pública e não tem token,
   * então o download falharia para todo mundo. Publicar num segundo
   * repositório, público, é o caminho normal — e é isso que a variável
   * permite sem mexer no remote do projeto.
   */
  const doAmbiente = (process.env.VAPT_RELEASE_REPO ?? '').trim();
  if (doAmbiente) {
    const [dono, repo] = doAmbiente.split('/');
    if (!dono || !repo) {
      morrer(
        `VAPT_RELEASE_REPO invalido: "${doAmbiente}"`,
        '  Use o formato dono/repositorio, por exemplo:\n' +
          '    VAPT_RELEASE_REPO=meu-usuario/vapt-downloads'
      );
    }
    return { dono, repo, origem: 'VAPT_RELEASE_REPO' };
  }

  let url;
  try {
    url = capturar('git', ['remote', 'get-url', 'origin'], { cwd: raizProjeto });
  } catch {
    morrer(
      'Nenhum remote "origin" configurado e VAPT_RELEASE_REPO nao definida.',
      '  Defina o repositorio de destino:\n    VAPT_RELEASE_REPO=usuario/vapt-downloads'
    );
  }

  const partes = partirRemote(url);
  if (!partes) morrer(`Nao reconheci o remote como um repositorio do GitHub: ${url}`);

  return { ...partes, origem: 'git remote origin' };
}

/* -------------------------------------------------------------------- */
/* 2. Pré-voo                                                            */
/* -------------------------------------------------------------------- */

function exigirGh() {
  try {
    capturar('gh', ['--version']);
  } catch {
    morrer(
      'GitHub CLI (gh) nao encontrado.',
      '  Instale com:\n' +
        '    winget install --id GitHub.cli      (Windows)\n' +
        '    brew install gh                     (macOS)'
    );
  }
}

function exigirAutenticacao() {
  const r = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', windowsHide: true });
  if (r.status === 0) return;

  morrer(
    'O gh nao esta autenticado.',
    '  Rode UMA vez, no seu terminal:\n\n' +
      '    gh auth login\n\n' +
      '  Escolha GitHub.com -> HTTPS -> autenticar pelo navegador.\n' +
      '  Esta etapa e sua de proposito: o token e uma credencial, e fica\n' +
      '  guardada na sua maquina. Depois dela, rode este script de novo.'
  );
}

/**
 * O repositório de destino precisa existir e ser público.
 *
 * Público não é preferência: a URL de um asset em repositório privado exige
 * cabeçalho de autenticação. A página /download é aberta e não tem token, de
 * modo que o botão levaria a um 404 para todos os lojistas. Melhor falhar
 * aqui, antes de publicar, do que descobrir pelo suporte.
 */
function exigirRepositorioPublico({ dono, repo }) {
  const alvo = `${dono}/${repo}`;
  const r = spawnSync('gh', ['repo', 'view', alvo, '--json', 'visibility'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (r.status !== 0) {
    morrer(
      `Repositorio ${alvo} nao encontrado (ou sem acesso).`,
      '  Crie o repositorio de downloads, publico:\n\n' +
        `    gh repo create ${repo} --public --description "Instaladores do Vapt"\n\n` +
        '  Ele guarda apenas os binarios; nenhuma linha de codigo vai para la.'
    );
  }

  let visibilidade = '';
  try {
    visibilidade = JSON.parse(r.stdout).visibility;
  } catch {
    visibilidade = 'DESCONHECIDA';
  }

  if (String(visibilidade).toUpperCase() !== 'PUBLIC') {
    morrer(
      `O repositorio ${alvo} e ${visibilidade}.`,
      '  Um asset de release em repositorio privado so baixa com token, e a\n' +
        '  pagina /download e publica: o botao daria 404 para os lojistas.\n\n' +
        '  Publique num repositorio publico separado:\n\n' +
        `    gh repo create vapt-downloads --public --description "Instaladores do Vapt"\n` +
        `    VAPT_RELEASE_REPO=${dono}/vapt-downloads npm run deploy:apps -w apps/web\n\n` +
        '  O codigo-fonte continua privado.'
    );
  }
}

/* -------------------------------------------------------------------- */
/* 3. Próxima versão                                                     */
/* -------------------------------------------------------------------- */

/**
 * Calcula a próxima tag olhando o que JÁ existe no repositório de destino.
 *
 * Não usa a versão do package.json: ela é a versão do pacote, não do release,
 * e nada garante que alguém a incremente. Perguntar ao GitHub qual foi a
 * última tag publicada evita colisão — `gh release create` recusa uma tag
 * repetida, e o script morreria depois de compilar tudo.
 */
function proximaTag({ dono, repo }) {
  const r = spawnSync(
    'gh',
    ['release', 'list', '--repo', `${dono}/${repo}`, '--limit', '100', '--json', 'tagName'],
    { encoding: 'utf8', windowsHide: true }
  );

  let maior = [1, 0, -1]; // sem release nenhum, a primeira tag vira v1.0.0

  if (r.status === 0) {
    try {
      for (const { tagName } of JSON.parse(r.stdout)) {
        const m = String(tagName).match(/^v?(\d+)\.(\d+)\.(\d+)$/);
        if (!m) continue;
        const atual = [Number(m[1]), Number(m[2]), Number(m[3])];
        for (let i = 0; i < 3; i += 1) {
          if (atual[i] > maior[i]) { maior = atual; break; }
          if (atual[i] < maior[i]) break;
        }
      }
    } catch {
      /* Lista ilegível: cai no padrão v1.0.0. */
    }
  }

  return `v${maior[0]}.${maior[1]}.${maior[2] + 1}`;
}

/* -------------------------------------------------------------------- */
/* 4. Fluxo                                                              */
/* -------------------------------------------------------------------- */

titulo('1/5  Verificando o ambiente');

exigirGh();
console.log('  gh instalado');

exigirAutenticacao();
console.log('  gh autenticado');

const repositorio = descobrirRepositorio();
console.log(`  destino: ${repositorio.dono}/${repositorio.repo}  (${repositorio.origem})`);

exigirRepositorioPublico(repositorio);
console.log('  repositorio publico');

const tag = proximaTag(repositorio);
console.log(`  proxima tag: ${tag}`);

titulo('2/5  Compilando o instalador do Windows');
if (rodar('npm', ['run', 'build:win'], { cwd: raizWeb }) !== 0) {
  morrer('build:win falhou. Nada foi publicado.');
}

titulo('3/5  Compilando o APK do Android');
if (rodar('npm', ['run', 'build:android'], { cwd: raizWeb }) !== 0) {
  morrer(
    'build:android falhou. Nada foi publicado.',
    '  Se o erro foi ao baixar o Gradle, a JVM pode estar sem acesso a\n' +
      '  services.gradle.org. Aponte o distributionUrl do wrapper para uma\n' +
      '  copia local em apps/web/android/gradle/wrapper/gradle-wrapper.properties.'
  );
}

titulo('4/5  Conferindo os arquivos');
for (const arquivo of [EXE, APK]) {
  if (!existsSync(arquivo)) morrer(`Arquivo esperado nao foi gerado: ${arquivo}`);
  console.log(`  ${arquivo}  (${mb(arquivo)} MB)`);
}

titulo('5/5  Publicando o release');

if (seco) {
  console.log('  --dry-run: nada foi enviado ao GitHub.');
} else {
  const codigo = rodar('gh', [
    'release',
    'create',
    tag,
    EXE,
    APK,
    '--repo',
    `${repositorio.dono}/${repositorio.repo}`,
    '--title',
    `Release ${tag}`,
    '--notes',
    'Instaladores do aplicativo da equipe: Windows (.exe) e Android (.apk).',
  ]);

  if (codigo !== 0) morrer('gh release create falhou. O release nao foi publicado.');
}

/* -------------------------------------------------------------------- */
/* 5. Saída                                                              */
/* -------------------------------------------------------------------- */

const base = `https://github.com/${repositorio.dono}/${repositorio.repo}/releases/download/${tag}`;

console.log('\n\x1b[1mVariaveis para a Vercel:\x1b[0m\n');
console.log(`VITE_EXE_URL=${base}/vapt-setup.exe`);
console.log(`VITE_APK_URL=${base}/vapt.apk`);
console.log(
  '\n  Lembrete: variavel VITE_ e lida na COMPILACAO. Depois de salvar na\n' +
    '  Vercel, e preciso um Redeploy — sem ele os botoes seguem em "Em breve".\n'
);
