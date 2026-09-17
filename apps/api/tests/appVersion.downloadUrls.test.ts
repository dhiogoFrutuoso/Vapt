import assert from 'node:assert/strict';
import test from 'node:test';
import { absoluteDownloadUrls, resolvePublicAppVersion } from '../src/controllers/appVersion.controller.js';

test('native update URLs use public HTTPS instead of the Capacitor localhost origin', () => {
  assert.deepEqual(
    absoluteDownloadUrls(
      { apk: '/downloads/vapt.apk', exe: '/downloads/vapt.exe' },
      'https://vapt-web.vercel.app'
    ),
    {
      apk: 'https://vapt-web.vercel.app/downloads/vapt.apk',
      exe: 'https://vapt-web.vercel.app/downloads/vapt.exe',
    }
  );
});

test('already-absolute published URLs stay unchanged', () => {
  assert.deepEqual(
    absoluteDownloadUrls(
      { apk: 'https://cdn.example.test/app.apk', exe: 'https://cdn.example.test/app.exe' },
      'https://vapt-web.vercel.app'
    ),
    { apk: 'https://cdn.example.test/app.apk', exe: 'https://cdn.example.test/app.exe' }
  );
});

test('public version points native updaters at direct public builds, including old database records', () => {
  const direct = {
    apk: 'https://raw.githubusercontent.com/dhiogoFrutuoso/Vapt-Releases/main/vapt.apk',
    exe: 'https://raw.githubusercontent.com/dhiogoFrutuoso/Vapt-Releases/main/vapt-setup.exe',
  };
  assert.deepEqual(resolvePublicAppVersion(null).downloadUrls, direct);
  assert.deepEqual(resolvePublicAppVersion({
    latestVersion: '1.0.2',
    minVersion: '1.0.2',
    downloadUrls: { apk: '/downloads/vapt.apk', exe: '/downloads/vapt.exe' },
  }).downloadUrls, direct);
});
