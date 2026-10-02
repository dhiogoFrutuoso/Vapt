import mongoose from 'mongoose';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { User } from '../models/User.js';
import { SubscriptionEntry } from '../models/SubscriptionEntry.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { HttpError } from '../utils/httpError.js';
import { env } from '../config/env.js';
import { billingToday, billingDateOf, billingEndOfDay, nextBillingDate, validDate } from '../utils/subscriptionDates.js';

const plans = z.enum(['Delivery', 'Salão-Caixa', 'Completo']);
const date = z.string().refine(validDate, 'Informe uma data válida.');
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'Informe o mês da fatura.');
const id = z.string().regex(/^[a-f\d]{24}$/i);
const bodySchema = z.object({
  kind: z.enum(['payment', 'waiver']),
  month, paymentDate: date.optional(), requestId: z.string().uuid(),
  expectedEnd: z.union([date, z.literal('')]),
  note: z.string().trim().max(1000).default(''), confirmed: z.literal('true'),
});
const userJson = (user: any) => ({ ...user.toObject(), id: String(user._id),
  photoUrl: user.photo ? `${env.publicUrl}/api/images/${user.photo}` : null });
export const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 8 } }).single('receipt');

export async function prepareReceipt(file?: Express.Multer.File) {
  if (!file) return {};
  if (file.size > 3 * 1024 * 1024) throw HttpError.badRequest('O comprovante deve ter até 3 MB.');
  if (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-') {
    return { receipt: file.buffer, receiptMime: 'application/pdf', receiptName: 'comprovante.pdf' };
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw HttpError.badRequest('Envie um comprovante em PDF, JPG, PNG ou WEBP.');
  try {
    const receipt = await sharp(file.buffer, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    return { receipt, receiptMime: 'image/webp', receiptName: 'comprovante.webp' };
  } catch { throw HttpError.badRequest('O comprovante não é uma imagem válida.'); }
}

export const listSubscriptionHistory = asyncHandler(async (req, res) => {
  const user = id.parse(req.params.id);
  if (!await User.exists({ _id: user })) throw HttpError.notFound('Usuário não encontrado.');
  const filter = req.query.month ? { user, month: month.parse(req.query.month) } : { user };
  const entries = await SubscriptionEntry.find(filter).sort({ month: -1, createdAt: -1 }).limit(240).lean();
  res.json({ ok: true, data: { entries } });
});

export const recordSubscriptionInvoice = asyncHandler(async (req, res) => {
  const userId = id.parse(req.params.id);
  const body = bodySchema.parse(req.body);
  const paymentDate = body.paymentDate || billingToday();
  if (paymentDate > billingToday()) throw HttpError.badRequest('A data de pagamento não pode estar no futuro.');
  if (body.kind === 'waiver' && !body.note) throw HttpError.badRequest('Informe o motivo da liberação sem pagamento.');
  const receipt = await prepareReceipt(req.file);
  const entryId = `${userId}:${body.month}`;
  const result = await mongoose.connection.transaction(async session => {
    // Serializes invoices, manual changes and restaurant creation for this owner.
    const user = await User.findOneAndUpdate({ _id: userId }, { $inc: { subscriptionRevision: 1 } }, { new: true, session });
    if (!user) throw HttpError.notFound('Usuário não encontrado.');
    const existing = await SubscriptionEntry.findById(entryId).session(session);
    if (existing) {
      if (existing.requestId === body.requestId) return { user: userJson(user), entry: existing.toObject() };
      throw new HttpError(409, 'Este mês já possui pagamento ou liberação registrados. Consulte o histórico.');
    }
    const plan = plans.safeParse(user.plan);
    if (!plan.success) throw HttpError.badRequest('Defina um plano válido para o usuário antes de registrar a fatura.');
    const previousEnd = user.planEndDate ? billingDateOf(user.planEndDate) : '';
    if (previousEnd !== body.expectedEnd) throw new HttpError(409, 'A assinatura foi alterada. Atualize o perfil e confira o novo vencimento antes de confirmar.');
    const next = nextBillingDate(paymentDate, previousEnd || null, user.planBillingDay);
    user.planEndDate = billingEndOfDay(next.endDate);
    user.planBillingDay = next.billingDay;
    if (!user.planStartDate) user.planStartDate = new Date(`${paymentDate}T12:00:00-03:00`);
    // A suspended account is not silently reactivated by a financial entry.
    await user.save({ session });
    const [entry] = await SubscriptionEntry.create([{
      _id: entryId, user: userId, month: body.month, kind: body.kind,
      requestId: body.requestId, plan: plan.data, paymentDate, previousEnd: previousEnd || null,
      newEnd: next.endDate, note: body.note, recordedBy: req.user!.id, ...receipt,
    }], { session });
    const entryJson = entry.toObject();
    delete (entryJson as any).receipt;
    return { user: userJson(user), entry: entryJson };
  });
  res.json({ ok: true, data: result });
});

export const downloadSubscriptionReceipt = asyncHandler(async (req, res) => {
  const user = id.parse(req.params.id);
  const entry = await SubscriptionEntry.findOne({ _id: req.params.entryId, user }).select('+receipt');
  if (!entry?.receipt) throw HttpError.notFound('Comprovante não encontrado.');
  res.set({ 'Content-Type': entry.receiptMime || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${entry.receiptName}"`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(entry.receipt));
});

/** Keep the existing editor, but every manual grant/change now has an audit trail. */
export const updateSubscriptionSettings = asyncHandler(async (req, res) => {
  const userId = id.parse(req.params.id);
  const body = z.object({ plan: z.union([plans, z.literal('')]),
    planStartDate: z.union([date, z.literal('')]), planEndDate: z.union([date, z.literal('')]),
  }).parse(req.body);
  if (body.plan && (!body.planStartDate || !body.planEndDate || body.planStartDate > body.planEndDate))
    throw HttpError.badRequest('Informe início e vencimento válidos para a assinatura.');
  const result = await mongoose.connection.transaction(async session => {
    const user = await User.findOneAndUpdate({ _id: userId }, { $inc: { subscriptionRevision: 1 } }, { new: true, session });
    if (!user) throw HttpError.notFound('Usuário não encontrado.');
    const previousEnd = user.planEndDate ? billingDateOf(user.planEndDate) : null;
    user.plan = body.plan || null;
    user.planStartDate = body.plan && body.planStartDate ? new Date(`${body.planStartDate}T12:00:00-03:00`) : null;
    user.planEndDate = body.plan && body.planEndDate ? billingEndOfDay(body.planEndDate) : null;
    user.planBillingDay = body.plan && body.planEndDate ? Number(body.planEndDate.slice(8)) : null;
    await user.save({ session });
    const requestId = randomUUID();
    await SubscriptionEntry.create([{ _id: `${userId}:adjustment:${requestId}`, user: userId,
      month: billingToday().slice(0, 7), kind: 'adjustment', requestId, plan: body.plan || 'Sem plano',
      paymentDate: billingToday(), previousEnd, newEnd: body.plan ? body.planEndDate : null,
      recordedBy: req.user!.id, note: 'Ajuste manual de plano e validade, sem registro de pagamento.' }], { session });
    return userJson(user);
  });
  res.json({ ok: true, data: { user: result } });
});
