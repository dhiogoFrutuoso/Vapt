import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const api = (process.env.VAPT_BUILD_API_URL || 'https://vapt-api-ashen.vercel.app/api').replace(/\/$/, '');
const credential = process.env.VAPT_BUILD_WORKER_KEY;
if (!credential) throw new Error('Missing worker capability');
async function request(path, body = {}) {
  const response = await fetch(`${api}/internal/native-build/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Build service: HTTP ${response.status}`);
  return (await response.json()).data;
}
const action = process.argv[2];
if (action === 'claim') {
  const job = await request('claim');
  if (job) writeFileSync('native-job.json', JSON.stringify(job));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pending=${Boolean(job)}\n`);
  console.log(job ? 'A build is queued.' : 'No builds pending.');
} else if (action === 'build') {
  const job = JSON.parse(readFileSync('native-job.json'));
  try {
    execFileSync(process.execPath, ['apps/web/scripts/build-apps.mjs', '--job', 'native-job.json'], { stdio: 'inherit' });
    const directory = resolve('.native-builds', job.id);
    const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json')));
    const tag = `personalized-${job.id}`;
    const repo = 'dhiogoFrutuoso/Vapt-Releases';
    // Never change the public generic "latest" release used by existing updaters.
    let alreadyPublished = false;
    try { execFileSync('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' }); alreadyPublished = true; } catch { /* first publication */ }
    if (!alreadyPublished) {
      execFileSync('gh', ['release', 'create', tag, resolve(directory, 'vapt.apk'), resolve(directory, 'vapt.exe'),
        '--repo', repo, '--title', `Aplicativo personalizado · ${job.version}`, '--notes', 'Instaladores personalizados do Vapt. Mesma identidade do aplicativo; somente nome e ícone personalizados.',
        '--prerelease', '--latest=false'], { stdio: 'inherit' });
    }
    const published = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/releases/tags/${tag}`], { encoding: 'utf8' }));
    const artifacts = {};
    for (const extension of ['apk', 'exe']) {
      const asset = published.assets.find(a => a.name === `vapt.${extension}`);
      if (!asset?.digest?.startsWith('sha256:')) throw new Error('GitHub did not confirm installer integrity');
      if (!alreadyPublished && asset.digest !== `sha256:${manifest.artifacts[extension].sha256}`) throw new Error('Published artifact hash mismatch');
      artifacts[extension] = { url: asset.browser_download_url, sha256: asset.digest.slice(7) };
    }
    await request('complete', { id: job.id, lease: job.lease, state: 'ready', artifacts });
  } catch (error) {
    await request('complete', { id: job.id, lease: job.lease, state: 'failed' }).catch(() => {});
    throw error;
  }
} else throw new Error('Expected claim or build');
