import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * MIGRAÇÃO — Categorias: string  ->  subdocumento { _id, name, image }
 *
 * Contexto do problema que esta migração resolve:
 * até certo ponto do projeto, `AppProject.categories` era um array de strings
 * (ex.: ["Hamburgueres"]). Quando o schema passou a exigir subdocumentos com
 * `name` obrigatório, os documentos antigos ficaram inconsistentes e o Mongoose
 * passou a convertê-los em um objeto indexado por caractere:
 *
 *   "Hamburgueres"  ->  { "0": "H", "1": "a", "2": "m", ..., name: undefined, _id: <novo a cada load> }
 *
 * Isso causava DOIS bugs de uma vez:
 *   1. `app.save()` falhava com ValidationError ("A categoria precisa de um nome"),
 *      derrubando com 500 QUALQUER escrita no aplicativo — inclusive remover um produto;
 *   2. o `_id` era gerado de novo a cada carregamento, então o id que o front
 *      conhecia nunca batia e o DELETE de categoria respondia 404.
 *
 * Esta migração é IDEMPOTENTE: pode rodar quantas vezes quiser. Ela usa o driver
 * nativo de propósito, para ler o valor cru sem passar pela conversão do Mongoose.
 *
 * Uso:  npm run migrate:categories -w apps/api
 */

type LegacyCategory = string | Record<string, unknown> | null;

/** Reconstrói o nome de uma categoria bagunçada, seja string ou objeto por caractere. */
function extractName(value: LegacyCategory): string | null {
  if (typeof value === 'string') {
    const name = value.trim();
    return name || null;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    // Já está no formato novo.
    if (typeof record.name === 'string' && record.name.trim()) return record.name.trim();

    // Objeto indexado por caractere: { "0": "H", "1": "a", ... }
    const chars = Object.keys(record)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => record[key]);

    if (chars.length > 0 && chars.every((c) => typeof c === 'string')) {
      const name = (chars as string[]).join('').trim();
      return name || null;
    }
  }

  return null;
}

/** Já é um subdocumento válido? Então não mexemos nele. */
function isValidCategory(value: LegacyCategory): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' && record.name.trim().length > 0 && record._id != null;
}

async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log('[migrate] conectado ao MongoDB');

  const collection = mongoose.connection.db!.collection('appprojects');
  const documents = await collection.find({}).toArray();

  let touchedApps = 0;
  let convertedCategories = 0;
  let droppedCategories = 0;

  for (const doc of documents) {
    const categories = (doc.categories ?? []) as LegacyCategory[];
    if (!Array.isArray(categories) || categories.length === 0) continue;

    // Nada a fazer se todas já estiverem no formato novo.
    if (categories.every(isValidCategory)) continue;

    const migrated: Array<{ _id: mongoose.Types.ObjectId; name: string; image: null; createdAt: Date; updatedAt: Date }> = [];
    const now = new Date();

    for (const category of categories) {
      if (isValidCategory(category)) {
        const record = category as Record<string, unknown>;
        migrated.push({
          _id: record._id as mongoose.Types.ObjectId,
          name: String(record.name).trim(),
          image: (record.image ?? null) as null,
          createdAt: (record.createdAt as Date) ?? now,
          updatedAt: (record.updatedAt as Date) ?? now,
        });
        continue;
      }

      const name = extractName(category);
      if (!name) {
        droppedCategories += 1;
        console.warn(`[migrate]   categoria ilegível descartada em "${doc.name}":`, JSON.stringify(category).slice(0, 80));
        continue;
      }

      migrated.push({
        _id: new mongoose.Types.ObjectId(),
        name,
        image: null,
        createdAt: now,
        updatedAt: now,
      });
      convertedCategories += 1;
    }

    await collection.updateOne({ _id: doc._id }, { $set: { categories: migrated } });
    touchedApps += 1;

    console.log(
      `[migrate] "${doc.name}" (${doc._id}) -> ${migrated.length} categoria(s): ${migrated
        .map((c) => c.name)
        .join(', ')}`
    );
  }

  console.log(
    `\n[migrate] concluído: ${touchedApps} aplicativo(s) atualizado(s), ` +
      `${convertedCategories} categoria(s) convertida(s), ${droppedCategories} descartada(s).`
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error('[migrate] falhou:', error);
  process.exit(1);
});
