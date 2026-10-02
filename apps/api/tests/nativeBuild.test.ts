import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createHash } from 'node:crypto';
import { NATIVE_RELEASE_VERSION } from '../src/config/nativeRelease.js';
import { AppProject } from '../src/models/AppProject.js';
import { NativeBuild } from '../src/models/NativeBuild.js';
import { requireBuildWorker, nativeBuildWorkerKey, getNativeBuild, requestNativeBuild, completeNativeBuild } from '../src/controllers/nativeBuild.controller.js';

const appId = '111111111111111111111111';
const logoId = '222222222222222222222222';
const query = (value: unknown) => ({ select: () => query(value), lean: async () => value });
const invoke = (handler: any, req: any = {}) => new Promise<any>((resolve, reject) => {
  handler({ device: { app: appId }, ...req }, { setHeader() {}, json: resolve }, reject);
});

test('build worker rejects device tokens, missing capabilities and wrong-length keys', () => {
  for (const token of ['', 'Bearer employee-jwt', 'Bearer ' + 'a'.repeat(64)]) {
    let error: any;
    requireBuildWorker({ get: () => token } as any, {} as any, e => { error = e; });
    assert.equal(error.status, 401);
  }
  let error: any;
  requireBuildWorker({ get: () => 'Bearer ' + nativeBuildWorkerKey() } as any, {} as any, e => { error = e; });
  assert.equal(error, undefined);
});

test('status is tenant-derived, content-addressed, and hides lease/signing data', async () => {
  let requestedApp: unknown;
  mock.method(AppProject, 'findById', (id: unknown) => {
    requestedApp = id; return query({ name: 'Restaurante A', brand: { logo: logoId } });
  });
  mock.method(NativeBuild, 'updateOne', async () => ({}));
  mock.method(NativeBuild, 'findById', () => query({ state: 'building', lease: 'secret', appId: 'other' }));
  try {
    const first = await invoke(getNativeBuild, { query: { appId: 'other' } });
    const second = await invoke(getNativeBuild);
    assert.equal(requestedApp, appId);
    assert.match(first.data.revision, /^[a-f0-9]{64}$/);
    assert.equal(first.data.revision, second.data.revision);
    const oldPaddedRevision = createHash('sha256').update(JSON.stringify({ appId, name: 'Restaurante A', logoId, version: NATIVE_RELEASE_VERSION })).digest('hex');
    assert.notEqual(first.data.revision, oldPaddedRevision, 'old padded installers must not be reused');
    assert.equal(first.data.lease, undefined);
    assert.equal(first.data.artifacts, undefined);
  } finally { mock.restoreAll(); }
});

test('missing logo is an actionable error, never a falsely personalized generic icon', async () => {
  mock.method(AppProject, 'findById', () => query({ name: 'A', brand: {} }));
  try { await assert.rejects(invoke(getNativeBuild), /logo/); } finally { mock.restoreAll(); }
});

test('multiple employees requesting the same brand share an existing build', async () => {
  mock.method(AppProject, 'findById', () => query({ name: 'A', brand: { logo: logoId } }));
  mock.method(NativeBuild, 'findById', () => query({ _id: 'existing', state: 'building' }));
  const writes: any[] = [];
  mock.method(NativeBuild, 'updateOne', async (...args: any[]) => { writes.push(args); return {}; });
  try {
    const result = await invoke(requestNativeBuild, { body: { name: 'attacker', appId: 'other' } });
    assert.equal(result.data.state, 'building');
    assert.equal(writes[0][1].$setOnInsert.name, 'A');
    assert.equal(writes[0][1].$setOnInsert.appId, appId);
    assert.equal(writes[1][0].state, 'failed');
  } finally { mock.restoreAll(); }
});

test('exhausted personalization attempts return an actionable failure, not a no-op success', async () => {
  mock.method(AppProject, 'findById', () => query({ name: 'A', brand: { logo: logoId } }));
  mock.method(NativeBuild, 'findById', () => query({ state: 'failed', attempts: 3 }));
  try { await assert.rejects(invoke(requestNativeBuild), (e: any) => e.status === 409 && /suporte/.test(e.message)); }
  finally { mock.restoreAll(); }
});

test('completion rejects foreign download hosts and mismatched artifact revisions', async () => {
  const id = 'a'.repeat(64), hash = 'b'.repeat(64);
  const base = { id, lease: '11111111-1111-4111-8111-111111111111', state: 'ready' };
  await assert.rejects(invoke(completeNativeBuild, { body: { ...base, artifacts: {
    apk: { url: 'https://evil.example/vapt.apk', sha256: hash },
    exe: { url: 'https://evil.example/vapt.exe', sha256: hash },
  } } }));
  const url = 'https://github.com/dhiogoFrutuoso/Vapt-Releases/releases/download/personalized-' + hash;
  await assert.rejects(invoke(completeNativeBuild, { body: { ...base, artifacts: {
    apk: { url: url + '/vapt.apk', sha256: hash }, exe: { url: url + '/vapt.exe', sha256: hash },
  } } }), /incompatíveis/);
});

test('completion cannot overwrite a job claimed by a different worker', async () => {
  mock.method(NativeBuild, 'updateOne', async (filter: any) => {
    assert.equal(filter.state, 'building'); assert.equal(filter.lease, '11111111-1111-4111-8111-111111111111');
    return { modifiedCount: 0 };
  });
  try { await assert.rejects(invoke(completeNativeBuild, { body: {
    id: 'a'.repeat(64), lease: '11111111-1111-4111-8111-111111111111', state: 'failed',
  } }), /executor/); } finally { mock.restoreAll(); }
});
