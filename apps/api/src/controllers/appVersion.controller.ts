import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppVersion } from '../models/AppVersion.js';
import { emitForceUpdatePublished } from '../realtime/io.js';
import { env } from '../config/env.js';
import { NATIVE_RELEASE_VERSION } from '../config/nativeRelease.js';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
// O repositório público contém somente instaladores. O caminho raw termina
// em .exe/.apk e não redireciona para uma URL sem extensão; isso preserva a
// atualização automática de versões antigas do Windows.
const PUBLIC_BUILDS = 'https://raw.githubusercontent.com/dhiogoFrutuoso/Vapt-Releases/main';
const RELEASE_DOWNLOADS = {
  apk: `${PUBLIC_BUILDS}/vapt.apk`,
  exe: `${PUBLIC_BUILDS}/vapt-setup.exe`,
};
// O deploy dos instaladores atualiza esta versão somente após validar os dois
// binários. Um registro antigo no banco não pode ocultar uma nova publicação.
const RELEASE_FLOOR = NATIVE_RELEASE_VERSION;

function belowReleaseFloor(version: string): boolean {
  const actual = version.split(/[.+-]/).slice(0, 3).map(Number);
  const minimum = RELEASE_FLOOR.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] < minimum[index];
  }
  return false;
}

const publicationSchema = z.object({
  latestVersion: z.string().trim().regex(SEMVER, 'latestVersion deve usar SemVer.'),
  minVersion: z.string().trim().regex(SEMVER, 'minVersion deve usar SemVer.'),
  buildId: z.string().trim().min(1).max(120).optional(),
  tenantBuilds: z.record(z.string().trim().min(1).max(120)).default({}),
  reason: z.string().trim().max(1000).default(''),
  forceUpdate: z.boolean().default(true),
  downloadUrls: z
    .object({
      apk: z.string().trim().min(1).default(RELEASE_DOWNLOADS.apk),
      exe: z.string().trim().min(1).default(RELEASE_DOWNLOADS.exe),
    })
    .default(RELEASE_DOWNLOADS),
  changelog: z.union([z.string().trim().max(4000), z.array(z.string().trim().min(1).max(500)).max(30)]).default([]),
});

const FALLBACK = {
  latestVersion: RELEASE_FLOOR,
  minVersion: RELEASE_FLOOR,
  buildId: RELEASE_FLOOR,
  tenantBuilds: {},
  reason: 'Atualize o Vapt para instalar a versão personalizada do restaurante, com nome e ícone próprios no Android e no Windows.',
  forceUpdate: true,
  downloadUrls: RELEASE_DOWNLOADS,
  changelog: [
    'Localização atual com pino centralizado e botão Minha localização.',
    'Conversão de delivery para balcão com remoção da taxa e confirmação do pagamento.',
    'Disponibilidade do cardápio atualizada automaticamente.',
    'Aplicativo personalizado por atualização real: nome e logo do restaurante, sem atalhos extras.',
    'Personalização disponível no perfil e obrigatória ao trocar de restaurante numa instalação personalizada.',
  ],
};

function normalizeChangelog(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeTenantBuilds(value: unknown): Record<string, string> {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value ?? {});
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** Capacitor runs at https://localhost. Relative download paths would point at
 * the app's own WebView, so even already-installed clients need absolute URLs. */
export function absoluteDownloadUrls(
  urls: { apk: string; exe: string },
  webOrigin = env.webUrl.startsWith('https://') ? env.webUrl : 'https://vapt-web.vercel.app'
): { apk: string; exe: string } {
  return {
    apk: new URL(urls.apk, webOrigin).toString(),
    exe: new URL(urls.exe, webOrigin).toString(),
  };
}

function currentDownloadUrls(urls: { apk: string; exe: string }): { apk: string; exe: string } {
  const absolute = absoluteDownloadUrls(urls);
  return {
    apk: new URL(absolute.apk).pathname === '/downloads/vapt.apk' ? RELEASE_DOWNLOADS.apk : absolute.apk,
    exe: new URL(absolute.exe).pathname === '/downloads/vapt.exe' ? RELEASE_DOWNLOADS.exe : absolute.exe,
  };
}

type SavedVersion = {
  latestVersion: string;
  minVersion: string;
  buildId?: string | null;
  tenantBuilds?: unknown;
  reason?: string | null;
  downloadUrls?: { apk: string; exe: string } | null;
  changelog?: string[] | null;
};

/** Mantém a última versão distribuída mesmo se o banco guardar uma publicação antiga. */
export function resolvePublicAppVersion(saved: SavedVersion | null) {
  if (!saved) return { ...FALLBACK, downloadUrls: currentDownloadUrls(FALLBACK.downloadUrls) };
  const stale = belowReleaseFloor(saved.latestVersion) || belowReleaseFloor(saved.minVersion);
  return {
    latestVersion: belowReleaseFloor(saved.latestVersion) ? RELEASE_FLOOR : saved.latestVersion,
    minVersion: belowReleaseFloor(saved.minVersion) ? RELEASE_FLOOR : saved.minVersion,
    buildId: stale ? RELEASE_FLOOR : saved.buildId ?? saved.latestVersion,
    tenantBuilds: normalizeTenantBuilds(saved.tenantBuilds),
    reason: stale ? FALLBACK.reason : saved.reason,
    // The minimum binary is mandatory even if an older admin record disabled
    // an optional update; the client still compares its version against minVersion.
    forceUpdate: true,
    downloadUrls: currentDownloadUrls(stale ? FALLBACK.downloadUrls : saved.downloadUrls ?? FALLBACK.downloadUrls),
    changelog: stale ? FALLBACK.changelog : saved.changelog,
  };
}

async function currentVersion() {
  return resolvePublicAppVersion(await AppVersion.findOne({ key: 'native-app' }).lean());
}

/** GET /api/public/app/version */
export const getPublicAppVersion = asyncHandler(async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, data: await currentVersion() });
});

/** APKs antigos não têm o instalador nativo. Outro host faz o Capacitor abrir o navegador do aparelho. */
export const redirectLegacyAndroidDownload = (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, currentDownloadUrls(FALLBACK.downloadUrls).apk);
};

/** PUT /api/admin/app/version — persiste e publica o hard gate. */
export const publishAppVersion = asyncHandler(async (req: Request, res: Response) => {
  const body = publicationSchema.parse(req.body);
  if (belowReleaseFloor(body.latestVersion) || belowReleaseFloor(body.minVersion)) {
    res.status(400).json({ ok: false, message: `A versão mínima não pode ser inferior a ${RELEASE_FLOOR}.` });
    return;
  }
  const payload = {
    ...body,
    forceUpdate: true,
    buildId: body.buildId ?? body.latestVersion,
    downloadUrls: currentDownloadUrls(body.downloadUrls),
    changelog: normalizeChangelog(body.changelog),
  };

  await AppVersion.findOneAndUpdate(
    { key: 'native-app' },
    { $set: { ...payload, publishedAt: new Date() }, $setOnInsert: { key: 'native-app' } },
    { upsert: true, runValidators: true, new: true }
  );

  emitForceUpdatePublished(payload);
  return res.json({ ok: true, data: payload, message: 'Atualização publicada para os aplicativos conectados.' });
});
