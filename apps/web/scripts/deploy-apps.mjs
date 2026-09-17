import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build signed installers, validate Android in-place compatibility, then stage
 * both binaries at the private repository root. Release publication is separate. */
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(web, '..', '..');
const pkg = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'));
const output = join(root, 'releases');
const apk = join(web, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const builds = join(root, 'builds');
const stagedApk = join(builds, 'vapt.apk');
const stagedExe = join(builds, 'vapt-setup.exe');
const legacyApk = join(web, 'public', 'downloads', 'vapt.apk');
const oldApk = existsSync(stagedApk) ? stagedApk : legacyApk;
const exe = join(output, 'Vapt-Setup.exe');

const sdkLine = readFileSync(join(web, 'android', 'local.properties'), 'utf8')
  .split(/\r?\n/).find((line) => line.startsWith('sdk.dir='));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  sdkLine?.slice('sdk.dir='.length).replace(/\\\\/g, '\\');
if (!sdk) throw new Error('Android SDK não encontrado. Defina ANDROID_HOME.');
const versions = ['37.0.0', '36.1.0', '36.0.0', '35.0.0', '34.0.0'];
const tool = (name) => versions.map((v) => join(sdk, 'build-tools', v, `${name}.exe`))
  .find(existsSync);
const signer = versions.map((v) => join(sdk, 'build-tools', v, 'apksigner.bat'))
  .find(existsSync);
const aapt = tool('aapt');
if (!signer || !aapt) throw new Error('apksigner/aapt não encontrados no Android SDK.');

function command(commandName, args) {
  const result = spawnSync(commandName, args, { cwd: web, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${commandName} falhou; downloads públicos não foram alterados.`);
}

function signerDigest(file) {
  const value = execFileSync(signer, ['verify', '--print-certs', file], {
    encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true,
  });
  const digest = value.match(/certificate SHA-256 digest:\s*([0-9a-f]+)/i)?.[1];
  if (!digest) throw new Error(`APK sem assinatura verificável: ${file}`);
  return digest.toLowerCase();
}

if (!existsSync(oldApk)) throw new Error('APK anterior não encontrado; não é possível confirmar a sobrescrita.');
const originalSigner = signerDigest(oldApk);
const oldInfo = execFileSync(aapt, ['dump', 'badging', oldApk], { encoding: 'utf8', windowsHide: true });
const oldCode = Number(oldInfo.match(/versionCode='(\d+)'/)?.[1]);
if (!Number.isFinite(oldCode)) throw new Error('Não foi possível ler a versão instalada anterior.');

command('npm', ['run', 'build:win']);
const desktopTest = spawnSync(process.execPath, [join(root, 'scripts', 'test-desktop.mjs')], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (desktopTest.status !== 0) throw new Error('O pacote Windows não abriu a tela de login; publicação interrompida.');
command('npm', ['run', 'build:android:release']);
if (!existsSync(exe) || statSync(exe).size < 1_000_000 || !existsSync(apk)) {
  throw new Error('Instaladores ausentes ou incompletos; nenhum download foi substituído.');
}
const nextSigner = signerDigest(apk);
const info = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8', windowsHide: true });
const packageId = info.match(/package: name='([^']+)'/)?.[1];
const code = Number(info.match(/versionCode='(\d+)'/)?.[1]);
const version = info.match(/versionName='([^']+)'/)?.[1];
if (packageId !== 'com.vapt.equipe' || version !== pkg.version || code <= oldCode || nextSigner !== originalSigner) {
  throw new Error(`Atualização incompatível: package=${packageId}, version=${version}, code=${code} (anterior ${oldCode}), mesma assinatura=${nextSigner === originalSigner}. Downloads preservados.`);
}

mkdirSync(builds, { recursive: true });
copyFileSync(apk, join(output, 'vapt.apk'));
copyFileSync(apk, stagedApk);
copyFileSync(exe, stagedExe);
// A API consulta esta versão. Ela só entra em produção depois que os dois
// instaladores forem publicados na release pública e o commit for enviado.
writeFileSync(
  join(root, 'apps', 'api', 'src', 'config', 'nativeRelease.ts'),
  `/** Atualizado pelo deploy:apps somente depois de validar e copiar APK e EXE. */\nexport const NATIVE_RELEASE_VERSION = '${pkg.version}';\n`,
  'utf8'
);
console.log(`Instaladores ${pkg.version} prontos em builds/ (APK ${code}; assinatura preservada).`);
console.log('Publique a release pública antes do commit que anuncia a nova versão na API.');
