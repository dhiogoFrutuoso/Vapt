import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { Operation } from '../src/models/Operation.js';
import { aplicar } from '../src/controllers/operation.controller.js';

test('closed register schedules orders and opening publishes them; closing archives and clears all queues', () => {
  const operation = new Operation({
    app: new mongoose.Types.ObjectId(), cashOpen: false,
    tables: [{ id: 'm1', label: '01', status: 'livre', items: [] }],
  });
  const apply = (command: Parameters<typeof aplicar>[1]) =>
    aplicar(operation, command, 'employee', 0, new Map([['employee', 'Funcionário']]), new Set(), ['administracao']);

  assert.throws(() => apply({ tipo: 'mesa.abrir', mesaId: 'm1' }), /Caixa fechado/);
  assert.throws(() => apply({ tipo: 'retirada.criar', customerName: 'Ana' }), /Caixa fechado/);
  assert.throws(() => apply({ tipo: 'pedido.criar', customerName: 'Ana', items: [{ name: 'Suco', price: 12, station: '' }], payments: [], address: { mode: 'manual' } }), /Caixa fechado/);

  apply({ tipo: 'mesa.agendar', mesaId: 'm1' });
  apply({ tipo: 'retirada.agendar', customerName: 'Ana', phone: '' });
  apply({ tipo: 'pedido.agendar', customerName: 'Ana', items: [{ name: 'Suco', price: 12, station: '' }], payments: [], address: { mode: 'manual' } });
  assert.equal(operation.deliveries.length, 0);
  assert.equal(operation.scheduledDeliveries.length, 1);

  apply({ tipo: 'caixa.abrir', openingCash: 50 });
  assert.equal(operation.cashOpen, true);
  assert.equal(operation.scheduledDeliveries.length, 0);
  assert.equal(operation.deliveries.length, 1);
  assert.equal(operation.tables[0].status, 'ocupada');
  assert.equal(operation.takeouts.length, 1);
  assert.throws(() => apply({ tipo: 'caixa.abrir', openingCash: 0 }), /caixa aberto/);

  apply({ tipo: 'caixa.fechar', counted: { dinheiro: 50, cartao: 0, pix: 0 } });
  assert.equal(operation.cashOpen, false);
  assert.equal(operation.cashClosures.length, 1);
  assert.equal(operation.cashClosures[0].expected.dinheiro, 50);
  assert.equal(operation.cashArchive.length, 1);
  assert.equal(operation.cashArchive[0].orderStatus, 'cancelado');
  assert.equal(operation.cashEntries.length, 0);
  assert.equal(operation.deliveries.length, 0);
  assert.equal(operation.takeouts.length, 0);
  assert.equal(operation.tables[0].status, 'livre');
  assert.throws(() => apply({ tipo: 'caixa.fechar', counted: { dinheiro: 0, cartao: 0, pix: 0 } }), /Caixa fechado/);
  assert.throws(() => apply({ tipo: 'fiado.abater', lancamentoId: 'qualquer', amount: 1 }), /Caixa fechado/);

  const closureId = operation.cashClosures[0].id;
  apply({ tipo: 'caixa.turno.reabrir', closureId });
  assert.equal(operation.cashOpen, true);
  assert.equal(operation.cashEntries.length, 1);
  assert.equal(operation.cashArchive.length, 0);
  assert.throws(() => apply({ tipo: 'caixa.turno.reabrir', closureId }), /Feche o caixa atual/);
});
