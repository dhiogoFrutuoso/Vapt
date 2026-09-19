import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { Operation } from '../src/models/Operation.js';
import { aplicar } from '../src/controllers/operation.controller.js';

function fixture(status = 'novo', paid = false) {
  const operation = new Operation({ app: new mongoose.Types.ObjectId(), cashOpen: true, cashTurnId: 'test',
    deliveries: [{ id: 'd1', code: '1234', customerName: 'QA', items: [{ name: 'Item', price: 20 }], total: 25,
      deliveryFee: 5, payments: [{ method: 'pix', amount: 3 }, { method: 'dinheiro', amount: 22, changeFor: 50 }],
      status, assignedCourierId: 'courier', deliveredById: status === 'novo' ? '' : 'courier', createdAt: Date.now() }],
    cashEntries: status === 'novo' ? [] : [{ id: 'c-d1', source: 'delivery', label: 'Entrega #1234', customerName: 'QA',
      items: [{ name: 'Item', price: 20 }], total: 25, subtotal: 20, deliveryFee: 5, orderStatus: 'feito',
      paymentStatus: paid ? 'concluido' : 'pendente', payments: [{ method: 'pix', amount: 25 }], createdAt: Date.now() }],
    kitchenStatus: { 'k-delivery-d1::Hamburguer': 'confeccao' },
  });
  const apply = (c: Parameters<typeof aplicar>[1]) => aplicar(operation, c, 'reception', 0,
    new Map([['reception', 'Recepção']]), new Set(['courier']), ['administracao', 'recepcao']);
  return { operation, apply };
}
for (const status of ['novo', 'aceito', 'a_caminho', 'entregue']) {
  for (const paymentStatus of ['pendente', 'concluido'] as const) {
    test(`convert ${status} to pickup ${paymentStatus}, removing fee and migrating all queues atomically`, () => {
      const { operation: op, apply } = fixture(status, status === 'entregue');
      apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus, payments: paymentStatus === 'concluido' ? [{ method: 'pix', amount: 20 }] : [] });
      assert.equal(op.deliveries.length, 0);
      assert.equal(op.takeouts.length, 1);
      assert.equal(op.takeouts[0].cashEntryId, 'c-d1');
      assert.equal(op.cashEntries.length, 1);
      const entry = op.cashEntries[0];
      assert.equal(entry.source, 'retirada'); assert.equal(entry.deliveryFee, 0); assert.equal(entry.total, 20);
      assert.equal(entry.paymentStatus, paymentStatus); assert.equal(entry.deliveredById, '');
      assert.equal(entry.conversionPrevious.delivery.deliveryFee, 5);
      assert.equal(op.kitchenStatus.get('k-retirada-t-d1::Hamburguer'), 'confeccao');
      assert.equal(op.kitchenStatus.has('k-delivery-d1::Hamburguer'), false);
      apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus, payments: [] });
      assert.equal(op.cashEntries.length, 1, 'idempotent retry');
      if (paymentStatus === 'pendente') {
        assert.throws(() => apply({ tipo: 'retirada.entregar', retiradaId: 't-d1' }), /pagamento/);
        apply({ tipo: 'comanda.pagar', alvo: 'retirada', alvoId: 't-d1', payments: [{ method: 'dinheiro', amount: 20, changeFor: 50 }] });
      } else apply({ tipo: 'retirada.entregar', retiradaId: 't-d1' });
      assert.equal(op.takeouts.length, 0); assert.equal(op.cashEntries.length, 1);
      assert.equal(op.cashEntries[0].total, 20);
      assert.equal(op.validateSync(), undefined);
    });
  }
}
test('reject false paid, preserve previous credit receipts, no duplicate on register close', () => {
  const { operation: op, apply } = fixture('entregue', true);
  op.cashEntries[0].set({ creditPaid: 8, creditOriginalAmount: 25, creditStatus: 'partial', creditPayments: [{ amount: 8, operatorId: 'x', operatorName: 'X', createdAt: Date.now() }] });
  assert.throws(() => apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus: 'concluido', payments: [{ method: 'fiado', amount: 20 }] }), /sem fiado/);
  apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus: 'concluido', payments: [{ method: 'pix', amount: 20 }] });
  assert.equal(op.cashEntries[0].conversionPrevious.cashEntry.creditPaid, 8);
  assert.equal(op.cashEntries[0].creditPayments[0].amount, 8);
  apply({ tipo: 'caixa.fechar', counted: { dinheiro: 0, cartao: 0, pix: 20 } });
  assert.equal(op.cashArchive.length, 1);
  assert.equal(op.cashClosures[0].expected.pix, 20);
});
test('schedule conversion works while closed and never registers payment early', () => {
  const { operation: op, apply } = fixture();
  op.set('scheduledDeliveries', op.deliveries); op.set('deliveries', []); op.cashOpen = false;
  assert.throws(() => apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus: 'concluido', payments: [{ method: 'pix', amount: 20 }] }), /Agendamentos/);
  apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus: 'pendente', payments: [] });
  assert.equal(op.scheduledDeliveries.length, 0); assert.equal(op.scheduledTakeouts.length, 1); assert.equal(op.cashEntries.length, 0);
  apply({ tipo: 'caixa.abrir', openingCash: 0 });
  assert.equal(op.takeouts.length, 1); assert.equal(op.deliveries.length, 0);
});

test('closed historical deliveries must be reopened in the original shift before converting', () => {
  const { operation: op, apply } = fixture('entregue', true);
  apply({ tipo: 'caixa.fechar', counted: { dinheiro: 0, cartao: 0, pix: 25 } });
  assert.throws(() => apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus: 'pendente', payments: [] }));
  apply({ tipo: 'caixa.turno.reabrir', closureId: op.cashClosures[0].id });
  apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus: 'pendente', payments: [] });
  assert.equal(op.takeouts.length, 1);
  assert.equal(op.cashEntries.length, 1);
  assert.equal(op.cashEntries[0].total, 20);
  assert.equal(op.cashEntries[0].paymentStatus, 'pendente');
  assert.equal(op.validateSync(), undefined);
});

test('cash edits, settlement and cancellation synchronize the linked pickup', () => {
  const { operation: op, apply } = fixture('aceito');
  apply({ tipo: 'pedido.balcao', pedidoId: 'd1', paymentStatus: 'pendente', payments: [] });
  apply({ tipo: 'caixa.editar', lancamentoId: 'c-d1', items: [{ name: 'Novo item', price: 18 }], payments: [] });
  assert.equal(op.takeouts[0].items[0].price, 18);
  apply({ tipo: 'caixa.pagamento', lancamentoId: 'c-d1', payments: [{ method: 'pix', amount: 18 }] });
  assert.equal(op.takeouts[0].paymentStatus, 'concluido');
  apply({ tipo: 'caixa.cancelar', lancamentoId: 'c-d1', motivo: 'Teste cancelamento' });
  assert.equal(op.takeouts.length, 0);
  assert.equal(op.cashEntries[0].orderStatus, 'cancelado');
  assert.equal(op.cashEntries.length, 1);
});
