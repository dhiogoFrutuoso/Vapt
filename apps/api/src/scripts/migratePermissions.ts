import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * MIGRAÇÃO — Permissões de função: verbos antigos -> nomes das abas
 *
 * Contexto do problema que esta migração resolve:
 * `roleSchema.permissions` tinha o enum ['pedidos','entregas','mesas','cardapio'].
 * Com a criação da aba Cozinha, as permissões passaram a espelhar 1:1 as abas do
 * aplicativo: ['cliente','recepcao','salao','caixa','entregador','cozinha'].
 *
 * Sem esta migração, qualquer documento que ainda guarde um valor antigo passa a
 * FALHAR na validação do Mongoose no próximo `app.save()` — e não só ao mexer em
 * funções: salvar um produto, uma mesa ou uma categoria valida o documento
 * inteiro. Ou seja, uma função legada derrubaria com 500 qualquer escrita
 * naquele aplicativo, exatamente como aconteceu com as categorias.
 *
 * Mapeamento (o mais próximo do que cada verbo dava acesso):
 *   pedidos  -> caixa
 *   entregas -> entregador
 *   mesas    -> salao
 *   cardapio -> (removido: virou edição no painel do dono, não é aba do app)
 *
 * Uso:
 *   npx tsx src/scripts/migratePermissions.ts
 *   npx tsx src/scripts/migratePermissions.ts --dry
 */

const LEGACY_MAP: Record<string, string | null> = {
  pedidos: 'caixa',
  entregas: 'entregador',
  mesas: 'salao',
  cardapio: null,
};

const VALID = new Set(['cliente', 'recepcao', 'salao', 'caixa', 'entregador', 'cozinha']);

async function main() {
  const dryRun = process.argv.includes('--dry');

  await mongoose.connect(env.mongoUri);
  console.log(`[migracao] Conectado.${dryRun ? ' Modo simulacao (--dry).' : ''}`);

  // Coleção crua de propósito: o schema novo rejeitaria os documentos antigos.
  const collection = mongoose.connection.collection('appprojects');
  const cursor = collection.find({ 'roles.0': { $exists: true } });

  let scanned = 0;
  let changed = 0;

  for await (const doc of cursor) {
    scanned += 1;

    const roles = (doc.roles ?? []) as Array<{ permissions?: string[] }>;
    let touched = false;

    for (const role of roles) {
      const current = role.permissions ?? [];
      const next: string[] = [];

      for (const permission of current) {
        if (VALID.has(permission)) {
          if (!next.includes(permission)) next.push(permission);
          continue;
        }

        const mapped = LEGACY_MAP[permission];
        if (mapped && !next.includes(mapped)) next.push(mapped);
        // Valor desconhecido ou 'cardapio': cai fora em vez de quebrar a validacao.
        touched = true;
      }

      if (touched) role.permissions = next;
    }

    if (!touched) continue;

    changed += 1;
    console.log(`[migracao] ${doc.name ?? doc._id}: ${JSON.stringify(roles.map((r) => r.permissions))}`);

    if (!dryRun) {
      await collection.updateOne({ _id: doc._id }, { $set: { roles } });
    }
  }

  console.log(`[migracao] ${scanned} aplicativo(s) com funcoes; ${changed} ajustado(s).`);
  if (dryRun) console.log('[migracao] Nada foi gravado. Rode sem --dry para aplicar.');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[migracao] Falhou:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
