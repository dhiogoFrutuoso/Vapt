import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppVersion } from '../models/AppVersion.js';
import { emitForceUpdatePublished } from '../realtime/io.js';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

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
  latestVersion: '1.0.0',
  minVersion: '1.0.0',
  buildId: '1.0.0',
  tenantBuilds: {},
  reason: '',
  forceUpdate: true,
  downloadUrls: { apk: '/downloads/vapt.apk', exe: '/downloads/vapt.exe' },
  changelog: ['Versão inicial do aplicativo Vapt.'],
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
  return {
    latestVersion: saved.latestVersion,
    minVersion: saved.minVersion,
    buildId: saved.buildId ?? saved.latestVersion,
    tenantBuilds: normalizeTenantBuilds(saved.tenantBuilds),
    reason: saved.reason,
    forceUpdate: saved.forceUpdate,
    downloadUrls: saved.downloadUrls,
    changelog: saved.changelog,
  };
}

/** GET /api/public/app/version */
export const getPublicAppVersion = asyncHandler(async (_req: Request, res: Response) => {
  return res.json({ ok: true, data: await currentVersion() });
});

/** PUT /api/admin/app/version — persiste e publica o hard gate. */
export const publishAppVersion = asyncHandler(async (req: Request, res: Response) => {
  const body = publicationSchema.parse(req.body);
  const payload = {
    ...body,
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
