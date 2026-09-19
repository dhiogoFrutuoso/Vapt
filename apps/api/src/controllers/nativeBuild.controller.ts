import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { NATIVE_RELEASE_VERSION } from '../config/nativeRelease.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { NativeBuild } from '../models/NativeBuild.js';
import { HttpError } from '../utils/httpError.js';
import type { RequestHandler } from 'express';

// Domain-separated capability: never send the application's JWT secret to CI.
export const nativeBuildWorkerKey = () => createHmac('sha256', env.auth.jwtSecret)
  .update('vapt:native-branding-worker:v1').digest('hex');
export const requireBuildWorker: RequestHandler = (req, _res, next) => {
  const received = Buffer.from(req.get('Authorization')?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(nativeBuildWorkerKey());
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    next(new HttpError(401, 'Credencial de compilação inválida.')); return;
  }
  next();
};

async function snapshot(appId: string) {
  const app = await AppProject.findById(appId).select('name brand.logo').lean();
  if (!app) throw new HttpError(404, 'Restaurante não encontrado.');
  if (!app.brand?.logo) throw new HttpError(409, 'Adicione a logo do restaurante antes de personalizar o aplicativo.');
  const data = { appId, name: app.name, logoId: String(app.brand.logo), version: NATIVE_RELEASE_VERSION };
  return { ...data, _id: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}
function publicJob(job: any, revision: string) {
  return { revision, state: job?.state ?? 'available', version: NATIVE_RELEASE_VERSION,
    artifacts: job?.state === 'ready' ? job.artifacts : undefined };
}
export const getNativeBuild = asyncHandler(async (req, res) => {
  const data = await snapshot(req.device!.app);
  await NativeBuild.updateOne({ _id: data._id, state: 'building', attempts: { $gte: 3 }, leaseUntil: { $lt: new Date() } },
    { $set: { state: 'failed' }, $unset: { lease: '', leaseUntil: '' } });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, data: publicJob(await NativeBuild.findById(data._id).lean(), data._id) });
});
export const requestNativeBuild = asyncHandler(async (req, res) => {
  const data = await snapshot(req.device!.app);
  // IDs are content-addressed; concurrent employees share the same build.
  const existing = await NativeBuild.findById(data._id).select('_id').lean();
  if (!existing && await NativeBuild.countDocuments({ appId: data.appId, createdAt: { $gt: new Date(Date.now() - 86400_000) } }) >= 5) {
    throw new HttpError(429, 'Limite de personalizações do restaurante atingido hoje. Tente amanhã.');
  }
  try { await NativeBuild.updateOne({ _id: data._id }, { $setOnInsert: data }, { upsert: true }); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  await NativeBuild.updateOne({ _id: data._id, state: 'failed', attempts: { $lt: 3 } }, { $set: { state: 'queued' } });
  res.json({ ok: true, data: publicJob(await NativeBuild.findById(data._id).lean(), data._id) });
});
export const claimNativeBuild = asyncHandler(async (_req, res) => {
  const now = new Date();
  const job = await NativeBuild.findOneAndUpdate({
    version: NATIVE_RELEASE_VERSION, attempts: { $lt: 3 },
    $or: [{ state: 'queued' }, { state: 'building', leaseUntil: { $lt: now } }],
  }, { $set: { state: 'building', lease: randomUUID(), leaseUntil: new Date(Date.now() + 60 * 60_000) },
    $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, new: true }).lean();
  res.json({ ok: true, data: job ? { id: job._id, appId: job.appId, name: job.name,
    logoId: job.logoId, version: job.version, lease: job.lease } : null });
});
const artifact = z.object({
  url: z.string().url().refine(value => /^https:\/\/github\.com\/dhiogoFrutuoso\/Vapt-Releases\/releases\/download\/personalized-[a-f0-9]{64}\/vapt\.(apk|exe)$/.test(value)),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const completeNativeBuild = asyncHandler(async (req, res) => {
  const data = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), lease: z.string().uuid(),
    state: z.enum(['ready', 'failed']), artifacts: z.object({ apk: artifact, exe: artifact }).optional() }).parse(req.body);
  if (data.state === 'ready' && (!data.artifacts ||
    !data.artifacts.apk.url.endsWith(`/personalized-${data.id}/vapt.apk`) ||
    !data.artifacts.exe.url.endsWith(`/personalized-${data.id}/vapt.exe`))) {
    throw new HttpError(400, 'Instaladores ausentes ou incompatíveis.');
  }
  const result = await NativeBuild.updateOne({ _id: data.id, lease: data.lease, state: 'building' }, {
    $set: { state: data.state, ...(data.artifacts ? { artifacts: data.artifacts } : {}) },
    $unset: { lease: '', leaseUntil: '' },
  });
  if (!result.modifiedCount) throw new HttpError(409, 'Compilação não pertence mais a este executor.');
  res.json({ ok: true, data: true });
});
