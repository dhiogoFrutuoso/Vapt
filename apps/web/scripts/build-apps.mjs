/** Build a branding snapshot in a disposable, isolated checkout. Never edit the source tree. */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const jobFile = process.argv[process.argv.indexOf('--job') + 1];
if (!process.argv.includes('--job') || !jobFile) throw new Error('Use --job <manifest.json>. O manifesto deve vir da fila autenticada.');
const job = JSON.parse(readFileSync(resolve(jobFile), 'utf8'));
for (const field of ['id', 'appId', 'logoId', 'version', 'name']) if (typeof job[field] !== 'string') throw new Error(`Missing ${field}`);
if (!/^[a-f0-9]{64}$/.test(job.id) || !/^[a-f0-9]{24}$/.test(job.appId) || !/^[a-f0-9]{24}$/.test(job.logoId) ||
    !/^\d+\.\d+\.\d+$/.test(job.version) || !job.name.trim() || job.name.length > 100 || /[\x00-\x1f]/.test(job.name)) throw new Error('Invalid build snapshot');
const version = JSON.parse(readFileSync(join(root, 'apps/web/package.json'))).version;
if (version !== job.version) throw new Error('Source version does not match requested build. Refusing to mislabel a binary.');
const workspace = join(root, '.native-builds', randomUUID());
mkdirSync(workspace, { recursive: true });
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
for (const file of files) {
  if (!file || /^(builds|releases|\.native-builds|\.git)\//.test(file) || !existsSync(join(root, file))) continue;
  const target = join(workspace, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, file), target);
}
// Reuse the pinned dependency installation; no downloaded build tools or scripts from restaurant input.
symlinkSync(join(root, 'node_modules'), join(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const web = join(workspace, 'apps/web');
const runNode = (relative, args, cwd = web) => execFileSync(process.execPath, [join(root, 'node_modules', relative), ...args], { cwd, stdio: 'inherit', env: {
  ...process.env, VITE_API_URL: process.env.VAPT_BUILD_API_URL || 'https://vapt-api-ashen.vercel.app/api',
} });
const api = process.env.VAPT_BUILD_API_URL || 'https://vapt-api-ashen.vercel.app/api';
const image = await fetch(`${api}/images/${job.logoId}`, { signal: AbortSignal.timeout(30000), redirect: 'error' });
if (!image.ok) throw new Error('Restaurant logo could not be downloaded. No generic-icon fallback is allowed.');
const bytes = Buffer.from(await image.arrayBuffer());
if (bytes.length > 3_000_000) throw new Error('Logo exceeds build input limit');
const icon = await sharp(bytes, { limitInputPixels: 16_000_000 }).resize(512, 512, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
const metadata = JSON.stringify({ appId: job.appId, revision: job.id, name: job.name });
writeFileSync(join(web, 'electron/native-branding.json'), metadata);
writeFileSync(join(web, 'electron/branding-icon.png'), icon);
mkdirSync(join(web, 'build'), { recursive: true });
// ICO supports PNG payloads; generate the container ourselves, with no unpinned CLI dependency.
const png = await sharp(icon).resize(256, 256).png().toBuffer();
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(join(web, 'build/icon.ico'), Buffer.concat([ico, png]));
const pkgPath = join(web, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath));
pkg.build.productName = job.name;
pkg.build.appId = 'com.vapt.equipe';
pkg.build.win.executableName = 'Vapt Equipe';
pkg.build.nsis.shortcutName = job.name;
pkg.build.win.icon = 'build/icon.ico';
pkg.build.artifactName = 'vapt.exe';
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
runNode('vite/bin/vite.js', ['build', '--config', 'vite.app.config.ts', '--mode', 'app']);

// Generate Capacitor scaffolding from the installed, lockfile-pinned version, then restore our native extensions.
const nativeSource = join(web, 'android');
const backup = join(workspace, 'native-source');
cpSync(nativeSource, backup, { recursive: true });
// cap add needs an absent directory. Move only this explicitly created workspace directory.
const { renameSync } = await import('node:fs');
renameSync(nativeSource, join(workspace, 'native-original'));
runNode('@capacitor/cli/bin/capacitor', ['add', 'android']);
cpSync(backup, nativeSource, { recursive: true });
runNode('@capacitor/cli/bin/capacitor', ['sync', 'android']);
const res = join(nativeSource, 'app/src/main/res');
const xml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, "\\'");
writeFileSync(join(res, 'values/strings.xml'), `<?xml version="1.0" encoding="utf-8"?><resources><string name="app_name">${xml(job.name)}</string><string name="title_activity_main">${xml(job.name)}</string><string name="package_name">com.vapt.equipe</string><string name="custom_url_scheme">com.vapt.equipe</string></resources>`);
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  mkdirSync(join(res, `mipmap-${density}`), { recursive: true });
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    writeFileSync(join(res, `mipmap-${density}/${name}.png`), await sharp(icon).resize(size, size).png().toBuffer());
  }
}
mkdirSync(join(res, 'drawable'), { recursive: true });
writeFileSync(join(res, 'drawable/restaurant_icon.png'), icon);
for (const name of ['ic_launcher', 'ic_launcher_round']) {
  mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true });
  writeFileSync(join(res, `mipmap-anydpi-v26/${name}.xml`), '<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@android:color/white"/><foreground><inset android:drawable="@drawable/restaurant_icon" android:inset="18%"/></foreground></adaptive-icon>');
}
mkdirSync(join(nativeSource, 'app/src/main/assets'), { recursive: true });
writeFileSync(join(nativeSource, 'app/src/main/assets/native-branding.json'), metadata);
execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32'
  ? ['/d', '/c', 'gradlew.bat assembleRelease --no-daemon'] : ['gradlew', 'assembleRelease', '--no-daemon'],
  { cwd: nativeSource, stdio: 'inherit', env: process.env });
runNode('electron-builder/cli.js', ['--win', '--publish', 'never']);
const output = join(root, '.native-builds', job.id);
mkdirSync(output, { recursive: true });
const artifacts = {};
for (const [extension, source] of Object.entries({ apk: join(nativeSource, 'app/build/outputs/apk/release/app-release.apk'), exe: join(workspace, 'releases/vapt.exe') })) {
  const data = readFileSync(source);
  artifacts[extension] = { sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length };
  writeFileSync(join(output, `vapt.${extension}`), data);
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify({ ...job, lease: undefined, artifacts }, null, 2));
console.log(`Personalized build ready: ${output}`);
