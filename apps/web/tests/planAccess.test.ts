import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleAppTabs } from '../src/lib/planAccess.js';

const all = ['cliente', 'recepcao', 'salao', 'cozinha', 'caixa', 'entregador', 'administracao'];
for (const prefix of ['TESTE', 'OFICIAL']) {
  for (const suffix of ['SALAO', 'DELIVERY', 'COMPLETO']) {
    test(`${prefix}_${suffix}: installed admin menu cannot exceed its plan, even with stale all-access data`, () => {
      const expected = all.filter(tab => suffix === 'SALAO' ? !['cliente', 'entregador'].includes(tab)
        : suffix === 'DELIVERY' ? !['salao', 'caixa'].includes(tab) : true);
      assert.deepEqual(visibleAppTabs(`${prefix}_${suffix}`, ['administracao'], all), expected);
      assert.deepEqual(visibleAppTabs(`${prefix}_${suffix}`, all), expected);
      assert(expected.includes('cozinha'));
    });
  }
}
test('no cached administrator tabs appear before loading a known restaurant plan', () => {
  assert.deepEqual(visibleAppTabs(undefined, ['administracao'], all), []);
  assert.deepEqual(visibleAppTabs('unrecognized', ['administracao'], all), []);
});
test('staff roles and server revocations further restrict the plan', () => {
  assert.deepEqual(visibleAppTabs('OFICIAL_SALAO', ['entregador', 'cozinha']), ['cozinha']);
  assert.deepEqual(visibleAppTabs('OFICIAL_DELIVERY', ['administracao'], ['recepcao', 'cozinha']), ['recepcao', 'cozinha']);
  assert.deepEqual(visibleAppTabs('OFICIAL_COMPLETO', ['administracao'], []), []);
});
