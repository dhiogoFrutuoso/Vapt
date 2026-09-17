import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const profile = mkdtempSync(join(tmpdir(), 'vapt-desktop-smoke-'));
env.VAPT_DESKTOP_TEST_PROFILE = profile;
try {
  const result = spawnSync(require('electron'), [resolve(root, 'scripts/smoke-desktop.cjs'), ...process.argv.slice(2)], {
    cwd: root, env, stdio: 'inherit', windowsHide: true, timeout: 40_000,
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  const checked = realpathSync(profile);
  if (!checked.startsWith(realpathSync(tmpdir()) + sep)) throw new Error('Perfil de teste fora da pasta temporária.');
  rmSync(checked, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
