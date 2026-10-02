import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';
import { planAccess, effectivePermissions, legacyPermissions, roleAllowed, commandAllowed } from '../src/utils/planAccess.js';
import { AppProject } from '../src/models/AppProject.js';
import { Operation } from '../src/models/Operation.js';
import { getOperation, runOperationCommand, serializar } from '../src/controllers/operation.controller.js';
import { getPublicApp, createPublicOrder } from '../src/controllers/publicApp.controller.js';
import { requireAppPlan } from '../src/middlewares/requireAppPlan.js';

const query = (value: unknown): any => ({ select: () => query(value), lean: async () => value });
const invoke = (handler: any, req: any) => new Promise<any>((resolve, reject) =>
  handler(req, { setHeader() {}, json: resolve }, reject));
const appId = '111111111111111111111111';

for (const prefix of ['TESTE', 'OFICIAL']) {
  for (const suffix of ['DELIVERY', 'SALAO', 'COMPLETO']) {
    const plan = `${prefix}_${suffix}`;
    test(`${plan}: administrator cannot exceed plan, kitchen is included`, () => {
      const access = planAccess(plan);
      const expected = ['cliente', 'recepcao', 'salao', 'cozinha', 'caixa', 'entregador', 'administracao']
        .filter(tab => suffix === 'DELIVERY' ? !['salao', 'caixa'].includes(tab) : suffix === 'SALAO' ? !['cliente', 'entregador'].includes(tab) : true);
      assert.deepEqual(effectivePermissions(plan, ['administracao']), expected);
      assert.deepEqual(access.tabs, expected);
      assert.deepEqual(effectivePermissions(plan, ['cozinha']), ['cozinha']);
      assert.equal(roleAllowed(plan, ['cozinha']), true);
      assert.equal(commandAllowed(plan, { tipo: 'retirada.criar' }), true);
      assert.equal(commandAllowed(plan, { tipo: 'pedido.criar' }), suffix !== 'SALAO');
      assert.equal(commandAllowed(plan, { tipo: 'caixa.abrir' }), suffix !== 'DELIVERY');
      assert.equal(commandAllowed(plan, { tipo: 'comanda.pagar', alvo: 'mesa' }), suffix !== 'DELIVERY');
      assert.equal(commandAllowed(plan, { tipo: 'cozinha.status', comandaId: 'k-mesa-1' }), suffix !== 'DELIVERY');
      assert.equal(commandAllowed(plan, { tipo: 'cozinha.status', comandaId: 'k-delivery-1' }), suffix !== 'SALAO');
      const legacy = legacyPermissions(plan, ['administracao']);
      assert.equal(legacy.includes('administracao'), true, 'retain dispatch and editing for installed administrators');
      assert(legacy.includes('cozinha'));
      assert.equal(roleAllowed(plan, ['cozinha', 'entregador']), suffix !== 'SALAO');
    });
  }
}

test('unknown plans and unknown commands fail closed; employee permissions remain scoped', () => {
  assert.deepEqual(planAccess('unrecognized').tabs, []);
  assert.deepEqual(effectivePermissions('OFICIAL_SALAO', ['entregador']), []);
  assert.deepEqual(effectivePermissions('OFICIAL_DELIVERY', ['caixa', 'cozinha']), ['cozinha']);
  assert.equal(commandAllowed('OFICIAL_COMPLETO', { tipo: 'surprise' }), false);
});

test('API rejects restricted commands before loading or saving any operation, even for administrator', async () => {
  for (const [planType, body] of [
    ['OFICIAL_SALAO', { tipo: 'pedido.avancar', pedidoId: 'd1' }],
    ['OFICIAL_DELIVERY', { tipo: 'caixa.abrir', openingCash: 0 }],
    ['OFICIAL_DELIVERY', { tipo: 'mesa.abrir', mesaId: 'm1' }],
    ['OFICIAL_SALAO', { tipo: 'cozinha.status', comandaId: 'k-delivery-d1', saguoes: ['Cozinha'], status: 'pronto' }],
  ] as const) {
    await assert.rejects(invoke(runOperationCommand, { body, device: { app: appId, sub: 'e', planType, perms: ['administracao'] } }), (e: any) => e.status === 403);
  }
});

test('operation response removes excluded modules and their kitchen/audit data without deleting history', () => {
  const operation = new Operation({ app: new mongoose.Types.ObjectId(), cashOpen: false,
    tables: [{ id: 'm1', label: '01', status: 'livre', items: [] }],
    deliveries: [{ id: 'd1', code: '01', customerName: 'Ana', items: [], status: 'novo' }],
    kitchenStatus: { 'k-mesa-m1::Cozinha': 'recebido', 'k-delivery-d1::Cozinha': 'pronto' },
  });
  const delivery = serializar(operation, ['administracao'], 'e', 'OFICIAL_DELIVERY');
  const dining = serializar(operation, ['administracao'], 'e', 'OFICIAL_SALAO');
  assert.equal(delivery.tables.length, 0);
  assert.equal(delivery.deliveries.length, 1);
  assert.equal(dining.tables.length, 1);
  assert.equal(dining.deliveries.length, 0);
  assert.deepEqual(Object.keys(delivery.kitchenStatus), ['k-delivery-d1::Cozinha']);
  assert.deepEqual(Object.keys(dining.kitchenStatus), ['k-mesa-m1::Cozinha']);
  assert.equal(operation.tables.length, 1);
  assert.equal(operation.deliveries.length, 1);
});

test('Delivery serves orders without cash; Salao and Completo stay closed', async () => {
  for (const plan of ['OFICIAL_DELIVERY', 'OFICIAL_SALAO', 'OFICIAL_COMPLETO']) {
    const operation = new Operation({ app: appId, tables: [], cashOpen: false,
      scheduledDeliveries: [{ id: 'scheduled', code: '01', customerName: 'Ana', items: [], status: 'novo' }],
    });
    mock.method(AppProject, 'findById', () => query({ appPlanType: plan, tables: [], roles: [], employees: [] }));
    mock.method(Operation, 'findOne', async () => operation);
    mock.method(operation, 'save', async () => operation);
    try {
      const result = await invoke(getOperation, { device: { app: appId, sub: 'e', planType: plan, perms: ['administracao'] } });
      assert.equal(result.data.cashOpen, plan === 'OFICIAL_DELIVERY');
      assert.equal(operation.scheduledDeliveries.length, plan === 'OFICIAL_DELIVERY' ? 0 : 1);
      assert.equal(operation.deliveries.length, plan === 'OFICIAL_DELIVERY' ? 1 : 0);
    } finally { mock.restoreAll(); }
  }
});

test('public menu excludes Salao and trials, and Delivery ignores closed cash', async () => {
  for (const plan of ['OFICIAL_DELIVERY', 'OFICIAL_COMPLETO', 'OFICIAL_SALAO', 'TESTE_DELIVERY']) {
    mock.method(AppProject, 'findOne', () => query({ _id: appId, name: 'Test', appPlanType: plan, status: 'publicado' }));
    mock.method(Operation, 'findOne', () => query({ cashOpen: false }));
    try {
      const call = invoke(getPublicApp, { params: { id: appId } });
      if (plan === 'OFICIAL_SALAO' || plan === 'TESTE_DELIVERY') await assert.rejects(call);
      else assert.equal((await call).data.cashOpen, plan === 'OFICIAL_DELIVERY');
    } finally { mock.restoreAll(); }
  }
});

test('owner API enforces module boundary and forbids official trial checkout', async () => {
  for (const [plan, path, body, denied] of [
    ['OFICIAL_DELIVERY', `/apps/${appId}/tables`, {}, true],
    ['OFICIAL_DELIVERY', `/apps/${appId}/cash/close`, {}, true],
    ['OFICIAL_SALAO', `/apps/${appId}`, { delivery: { fee: 10 } }, true],
    ['OFICIAL_SALAO', `/apps/${appId}`, { delivery: { whatsapp: '123' } }, false],
    ['OFICIAL_COMPLETO', `/apps/${appId}/plan`, {}, true],
    ['TESTE_COMPLETO', `/apps/${appId}/plan`, {}, false],
  ] as const) {
    mock.method(AppProject, 'findOne', () => query({ appPlanType: plan }));
    try {
      const error = await new Promise<any>(resolve => requireAppPlan({ params: { id: appId }, user: { id: 'owner' }, path, method: 'PATCH', body } as any, {} as any, resolve));
      assert.equal(error?.status === 403, denied, path);
    } finally { mock.restoreAll(); }
  }
});

test('public Delivery orders enter immediately; closed Completo orders require explicit scheduling', async () => {
  for (const [plan, schedule, denied] of [
    ['OFICIAL_DELIVERY', false, false], ['OFICIAL_COMPLETO', false, true], ['OFICIAL_COMPLETO', true, false],
  ] as const) {
    const operation = new Operation({ app: appId, cashOpen: false });
    mock.method(AppProject, 'findOne', () => query({ _id: appId, appPlanType: plan, status: 'publicado',
      products: [{ _id: 'p1', name: 'Suco', price: 10, available: true }], delivery: { enabled: true },
    }));
    mock.method(Operation, 'findOne', async () => operation);
    mock.method(operation, 'save', async () => operation);
    try {
      const call = invoke(createPublicOrder, { params: { id: appId }, body: {
        customerName: 'Teste', phone: '11999999999', items: [{ productId: 'p1', quantity: 1 }],
        isDelivery: false, scheduleForOpening: schedule,
      } });
      if (denied) await assert.rejects(call, (e: any) => e.status === 409);
      else {
        const result = await call;
        assert.equal(result.data.scheduled, plan === 'OFICIAL_COMPLETO');
        assert.equal(operation.deliveries.length, plan === 'OFICIAL_DELIVERY' ? 1 : 0);
        assert.equal(operation.scheduledDeliveries.length, plan === 'OFICIAL_COMPLETO' ? 1 : 0);
      }
    } finally { mock.restoreAll(); }
  }
});
