import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppVersion } from '../models/AppVersion.js';
import { emitForceUpdatePublished } from '../realtime/io.js';
import { env } from '../config/env.js';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
// The minimum binary now distributed at the stable public download URLs.
// A stale database record must never turn off this security/compatibility floor.
const RELEASE_FLOOR = '1.0.1';

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
      apk: z.string().trim().min(1).default('/downloads/vapt.apk'),
      exe: z.string().trim().min(1).default('/downloads/vapt.exe'),
    })
    .default({ apk: '/downloads/vapt.apk', exe: '/downloads/vapt.exe' }),
  changelog: z.union([z.string().trim().max(4000), z.array(z.string().trim().min(1).max(500)).max(30)]).default([]),
});

const FALLBACK = {
  latestVersion: RELEASE_FLOOR,
  minVersion: RELEASE_FLOOR,
  buildId: RELEASE_FLOOR,
  tenantBuilds: {},
  reason: 'Atualize o Vapt para usar o novo ciclo de caixa, pedidos agendados e correções do aplicativo.',
  forceUpdate: true,
  downloadUrls: { apk: '/downloads/vapt.apk', exe: '/downloads/vapt.exe' },
  changelog: ['Abertura e fechamento de caixa com pedidos agendados.', 'Correções da sessão do Android e da instalação por cima do app anterior.'],
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

async function currentVersion() {
  const saved = await AppVersion.findOne({ key: 'native-app' }).lean();
  if (!saved) return FALLBACK;
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
    downloadUrls: stale ? FALLBACK.downloadUrls : saved.downloadUrls,
    changelog: stale ? FALLBACK.changelog : saved.changelog,
  };
}

/** GET /api/public/app/version */
export const getPublicAppVersion = asyncHandler(async (_req: Request, res: Response) => {
  return res.json({ ok: true, data: await currentVersion() });
});

/** APKs antigos não têm o instalador nativo. Outro host faz o Capacitor abrir o navegador do aparelho. */
export const redirectLegacyAndroidDownload = (_req: Request, res: Response) => {
  const webOrigin = env.webUrl.startsWith('https://') ? env.webUrl : 'https://vapt-web.vercel.app';
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, new URL('/downloads/vapt.apk', webOrigin).toString());
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
