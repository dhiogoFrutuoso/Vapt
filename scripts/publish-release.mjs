import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Publica apenas instaladores no repositório aberto; nunca envia o código. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'dhiogoFrutuoso/Vapt-Releases';
const version = JSON.parse(readFileSync(join(root, 'apps', 'web', 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const apk = join(root, 'builds', 'vapt.apk');
const exe = join(root, 'builds', 'vapt-setup.exe');

function capture(program, args, options = {}) {
  return execFileSync(program, args, { encoding: 'utf8', windowsHide: true, ...options }).trim();
}

function run(program, args) {
  const result = spawnSync(program, args, { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`${program} ${args[0]} falhou.`);
}

for (const file of [apk, exe]) {
  if (!existsSync(file) || statSync(file).size < 1_000_000) {
    throw new Error(`Instalador não preparado ou incompleto: ${file}. Execute deploy:apps antes.`);
  }
}

const details = JSON.parse(capture('gh', ['repo', 'view', repo, '--json', 'visibility,defaultBranchRef']));
if (details.visibility !== 'PUBLIC' || details.defaultBranchRef?.name !== 'main') {
  throw new Error('Vapt-Releases precisa ser público e usar a branch main.');
}

let existingRelease = null;
try {
  existingRelease = JSON.parse(capture('gh', ['release', 'view', tag, '-R', repo, '--json', 'assets']));
} catch (error) {
  if (!String(error?.stderr ?? error?.message ?? '').includes('release not found')) throw error;
  // Uma release ainda não publicada é o caminho normal para uma versão nova.
}
if (existingRelease) {
  throw new Error(`A release ${tag} já existe. Não sobrescreva instaladores publicados.`);
}

const temp = mkdtempSync(join(tmpdir(), 'vapt-release-'));
try {
  run('gh', ['repo', 'clone', repo, temp, '--', '--depth', '1']);
  copyFileSync(apk, join(temp, 'vapt.apk'));
  copyFileSync(exe, join(temp, 'vapt-setup.exe'));
  writeFileSync(join(temp, 'VERSION'), `${version}\n`, 'utf8');
  run('git', ['-C', temp, 'add', 'vapt.apk', 'vapt-setup.exe', 'VERSION']);
  // Uma tentativa anterior pode ter enviado os arquivos, mas falhado antes
  // de criar a release. Nesse caso, permita repetir sem um commit vazio.
  if (capture('git', ['-C', temp, 'diff', '--cached', '--name-only'])) {
    run('git', ['-C', temp, 'commit', '-m', `Publish Vapt ${version} installers`]);
    run('git', ['-C', temp, 'push', 'origin', 'main']);
  }

  run('gh', [
    'release', 'create', tag, apk, exe, '-R', repo, '--target', 'main',
    '--title', `Vapt ${version}`,
    '--notes', `Instaladores oficiais do Vapt Equipe ${version} para Android e Windows. Instale por cima da versão anterior.`,
    '--latest',
  ]);
  console.log(`Release publicada: https://github.com/${repo}/releases/tag/${tag}`);
  console.log('Confirme os dois links latest/download antes de publicar a nova versão da API.');
} finally {
  const checked = realpathSync(temp);
  const allowed = realpathSync(tmpdir()) + sep;
  if (!checked.startsWith(allowed)) throw new Error('Pasta temporária fora do diretório permitido; limpeza cancelada.');
  rmSync(checked, { recursive: true, force: true });
}
