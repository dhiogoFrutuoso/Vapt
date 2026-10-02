import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { User } from '../src/models/User.js';
import { AppProject } from '../src/models/AppProject.js';
import { SubscriptionEntry } from '../src/models/SubscriptionEntry.js';
import { createWithinRestaurantQuota } from '../src/services/restaurantQuota.js';
import { billingDateOf, billingEndOfDay, billingToday, nextBillingDate, validDate } from '../src/utils/subscriptionDates.js';
import { prepareReceipt, recordSubscriptionInvoice, updateSubscriptionSettings, downloadSubscriptionReceipt } from '../src/controllers/subscription.controller.js';
import { adminGuard } from '../src/middlewares/adminGuard.js';
import { signAccessToken } from '../src/utils/jwt.js';

const uid = '111111111111111111111111';
const session = {} as mongoose.ClientSession;
const invoke = (handler: any, req: any) => new Promise<any>((resolve, reject) => handler(req, { json: resolve, set() {}, send: resolve }, reject));
const req = (body: any) => ({ params: { id: uid }, user: { id: uid }, body });
const invoice = (extra = {}) => ({ kind: 'payment', month: '2026-07', paymentDate: '2026-07-18', expectedEnd: '2026-07-15', requestId: '3b982c38-b82c-44f8-b791-f533af518e12', confirmed: 'true', ...extra });
function setupUser() {
  const user: any = { _id: uid, plan: 'Salão-Caixa', status: 'ativo', planEndDate: billingEndOfDay('2026-07-15'), planStartDate: new Date('2026-06-15'), planBillingDay: 15, save: async () => {}, toObject() { return { ...this }; } };
  mock.method(mongoose.connection, 'transaction', async (fn: any) => fn(session));
  mock.method(User, 'findOneAndUpdate', async (_filter: any, update: any, options: any) => {
    assert.equal(update.$inc.subscriptionRevision, 1); assert.equal(options.session, session); return user;
  });
  return user;
}
test.afterEach(() => mock.restoreAll());

test('calendar billing preserves an early due day and resets late payment to its actual date', () => {
  assert.equal(nextBillingDate('2026-07-10', '2026-07-15').endDate, '2026-08-15');
  assert.equal(nextBillingDate('2026-07-15', '2026-07-15').endDate, '2026-08-15');
  assert.equal(nextBillingDate('2026-07-18', '2026-07-15', 15).endDate, '2026-08-18');
  assert.equal(nextBillingDate('2026-07-18').endDate, '2026-08-18');
});
test('short months, leap years, year rollover and original day 31 are preserved', () => {
  const feb = nextBillingDate('2026-01-31');
  assert.equal(feb.endDate, '2026-02-28');
  assert.equal(nextBillingDate('2026-02-25', feb.endDate, feb.billingDay).endDate, '2026-03-31');
  assert.equal(nextBillingDate('2028-01-31').endDate, '2028-02-29');
  assert.equal(nextBillingDate('2026-12-31').endDate, '2027-01-31');
  assert.equal(validDate('2026-02-30'), false);
  assert.throws(() => nextBillingDate('bad-date'));
});
test('due date includes its whole São Paulo day and handles legacy midnight UTC', () => {
  assert.equal(billingEndOfDay('2026-07-15').toISOString(), '2026-07-16T02:59:59.999Z');
  assert.equal(billingDateOf(billingEndOfDay('2026-07-15')), '2026-07-15');
  assert.equal(billingDateOf('2026-07-15T00:00:00.000Z'), '2026-07-15');
  assert.equal(billingToday(new Date('2026-07-16T01:00:00Z')), '2026-07-15');
});
test('normal account cannot create another official variant; admin remains exempt', async () => {
  const user = setupUser(); user.plan = 'Completo'; user.planEndDate = new Date('2099-01-01');
  mock.method(AppProject, 'exists', (filter: any) => ({ session: async (s: any) => { assert.equal(s, session); assert.equal(filter.owner, uid); assert(filter.appPlanType.test('OFICIAL_SALAO')); return { _id: 'existing' }; } }) as any);
  let created = 0;
  await assert.rejects(createWithinRestaurantQuota(uid, 'OFICIAL_DELIVERY', false, async () => ++created), { status: 409 });
  assert.equal(created, 0);
  assert.equal(await createWithinRestaurantQuota(uid, 'OFICIAL_DELIVERY', true, async () => ++created), 1);
});
test('first restaurant is inserted in the same transaction; wrong plan or expiry is forbidden', async () => {
  const user = setupUser(); user.planEndDate = new Date('2099-01-01');
  mock.method(AppProject, 'exists', () => ({ session: async () => null }) as any);
  assert.equal(await createWithinRestaurantQuota(uid, 'OFICIAL_SALAO', false, async s => { assert.equal(s, session); return 'created'; }), 'created');
  await assert.rejects(createWithinRestaurantQuota(uid, 'OFICIAL_DELIVERY', false, async () => 'bad'), { status: 403 });
  user.planEndDate = new Date('2001-01-01');
  await assert.rejects(createWithinRestaurantQuota(uid, 'OFICIAL_SALAO', false, async () => 'bad'), { status: 403 });
});
test('trial quota is scoped to its plan and failed insert is propagated', async () => {
  setupUser();
  mock.method(AppProject, 'exists', (filter: any) => ({ session: async () => { assert.equal(filter.appPlanType, 'TESTE_SALAO'); return null; } }) as any);
  await assert.rejects(createWithinRestaurantQuota(uid, 'TESTE_SALAO', false, async () => { throw new Error('insert failed'); }), /insert failed/);
});
test('late payment renews once, saves private receipt and audit atomically; duplicate retry is idempotent', async () => {
  const user = setupUser();
  let saved: any = null;
  mock.method(SubscriptionEntry, 'findById', () => ({ session: async () => saved ? { ...saved, toObject: () => ({ ...saved, receipt: undefined }) } : null }) as any);
  mock.method(SubscriptionEntry, 'create', async (entries: any[], options: any) => { assert.equal(options.session, session); saved = entries[0]; return [{ toObject: () => ({ ...saved }) }]; });
  const request = { ...req(invoice()), file: { buffer: Buffer.from('%PDF-1.4\n'), size: 9, mimetype: 'application/pdf' } };
  const result = await invoke(recordSubscriptionInvoice, request);
  assert.equal(billingDateOf(user.planEndDate), '2026-08-18');
  assert.equal(saved._id, `${uid}:2026-07`); assert.equal(saved.recordedBy, uid);
  assert(Buffer.isBuffer(saved.receipt)); assert.equal(result.data.entry.receipt, undefined);
  await invoke(recordSubscriptionInvoice, request);
  assert.equal(billingDateOf(user.planEndDate), '2026-08-18');
  await assert.rejects(invoke(recordSubscriptionInvoice, req(invoice({ requestId: '4b982c38-b82c-44f8-b791-f533af518e12' }))), { status: 409 });
});
test('future dates, stale profiles and waivers without a reason cannot change subscription', async () => {
  const user = setupUser();
  mock.method(SubscriptionEntry, 'findById', () => ({ session: async () => null }) as any);
  await assert.rejects(invoke(recordSubscriptionInvoice, req(invoice({ paymentDate: '2099-01-01' }))), { status: 400 });
  await assert.rejects(invoke(recordSubscriptionInvoice, req(invoice({ kind: 'waiver' }))), { status: 400 });
  await assert.rejects(invoke(recordSubscriptionInvoice, req(invoice({ expectedEnd: '2026-06-15' }))), { status: 409 });
  assert.equal(billingDateOf(user.planEndDate), '2026-07-15');
});
test('waiver is distinguishable from payment and does not silently unsuspend the account', async () => {
  const user = setupUser(); user.status = 'suspenso';
  mock.method(SubscriptionEntry, 'findById', () => ({ session: async () => null }) as any);
  mock.method(SubscriptionEntry, 'create', async (entries: any[]) => [{ toObject: () => entries[0] }]);
  const result = await invoke(recordSubscriptionInvoice, req(invoice({ kind: 'waiver', note: 'Cortesia autorizada' })));
  assert.equal(result.data.entry.kind, 'waiver'); assert.equal(result.data.entry.note, 'Cortesia autorizada');
  assert.equal(user.status, 'suspenso'); assert.equal(billingDateOf(user.planEndDate), '2026-08-18');
});
test('manual grants are audited and invalid date ranges rejected', async () => {
  const user = setupUser(); let entry: any;
  mock.method(SubscriptionEntry, 'create', async (entries: any[]) => { entry = entries[0]; return []; });
  await invoke(updateSubscriptionSettings, req({ plan: 'Delivery', planStartDate: '2026-07-18', planEndDate: '2026-08-18' }));
  assert.equal(entry.kind, 'adjustment'); assert.equal(user.plan, 'Delivery'); assert.equal(user.planBillingDay, 18);
  await assert.rejects(invoke(updateSubscriptionSettings, req({ plan: 'Delivery', planStartDate: '2026-08-18', planEndDate: '2026-07-18' })), { status: 400 });
});
test('receipts reject corrupt images and oversize files; image contents are normalized', async () => {
  await assert.rejects(prepareReceipt({ size: 4 * 1024 * 1024 } as any), { status: 400 });
  await assert.rejects(prepareReceipt({ size: 3, buffer: Buffer.from('bad'), mimetype: 'image/png' } as any), { status: 400 });
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
  const result = await prepareReceipt({ size: png.length, buffer: png, mimetype: 'image/png' } as any);
  assert.equal(result.receiptMime, 'image/webp'); assert.equal(SubscriptionEntry.schema.path('receipt').options.select, false);
});
test('admin guard denies unauthenticated and normal users access to receipts and billing routes', async () => {
  const next = (r: any) => new Promise<any>(resolve => adminGuard(r, {} as any, resolve));
  assert.equal((await next({ get: () => undefined })).status, 401);
  mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: uid, status: 'ativo', isAdmin: false }) }) }) as any);
  const token = signAccessToken({ sub: uid, role: 'owner' });
  assert.equal((await next({ get: () => `Bearer ${token}` })).status, 403);
});
test('receipt download checks its owning user and uses private attachment headers', async () => {
  const bytes = Buffer.from('%PDF-1.4\n'); let headers: any;
  mock.method(SubscriptionEntry, 'findOne', (filter: any) => { assert.equal(filter.user, uid); return { select: async () => ({ receipt: bytes, receiptMime: 'application/pdf', receiptName: 'comprovante.pdf' }) } as any; });
  const result = await new Promise<any>((resolve, reject) => downloadSubscriptionReceipt({ params: { id: uid, entryId: `${uid}:2026-07` } } as any, { set: (h: any) => { headers = h; }, send: resolve } as any, reject));
  assert.deepEqual(result, bytes); assert.equal(headers['Cache-Control'], 'private, no-store'); assert.match(headers['Content-Disposition'], /^attachment/);
});
