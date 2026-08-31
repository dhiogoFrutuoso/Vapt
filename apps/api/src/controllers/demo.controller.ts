import type { Request, Response } from 'express';
import { z } from 'zod';
import { DemoStore } from '../models/DemoStore.js';
import { Lead } from '../models/Lead.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { HttpError } from '../utils/httpError.js';
import { generateRestaurantCode, uniqueSlug } from '../utils/codes.js';
import { destroyImage, storeImage } from '../services/imageStorage.js';

const MAX_IMAGE_CHARS = 3_000_000; // ~2MB em base64; o front ja reduz antes de enviar

const imageField = z
  .string()
  .trim()
  .max(MAX_IMAGE_CHARS, 'Imagem muito pesada. Envie uma foto menor.')
  .refine((v) => v.startsWith('data:image/') || v.startsWith('http'), 'Formato de imagem invalido')
  .nullable()
  .optional();

const productSchema = z.object({
  name: z.string().trim().min(2, 'Nome do produto muito curto').max(80),
  description: z.string().trim().max(240).optional().default(''),
  price: z.coerce.number().min(0, 'Preco invalido').max(99_999),
  imageUrl: imageField,
  category: z.string().trim().max(40).optional().default('Destaques'),
});

const tableSchema = z.object({
  label: z.string().trim().min(1).max(10),
  seats: z.coerce.number().min(1).max(40),
  area: z.string().trim().max(40).optional().default('Salao'),
});

const storeSchema = z.object({
  restaurantName: z.string().trim().min(2, 'Informe o nome do restaurante').max(80),
  businessType: z
    .enum(['restaurante', 'bar', 'lanchonete', 'pizzaria', 'cafeteria', 'mercado'])
    .optional()
    .default('restaurante'),
  tagline: z.string().trim().max(120).optional().default(''),
  logoUrl: imageField,
  brandColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor invalida')
    .optional()
    .default('#FF6B2C'),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor invalida')
    .optional()
    .default('#111827'),
  theme: z.enum(['claro', 'escuro']).optional().default('claro'),
  whatsapp: z.string().trim().max(30).optional(),
  deliveryFee: z.coerce.number().min(0).max(999).optional().default(0),
  minOrder: z.coerce.number().min(0).max(9999).optional().default(0),
  ownerEmail: z.string().trim().email('E-mail invalido').optional(),
  products: z.array(productSchema).max(20).optional().default([]),
  tables: z.array(tableSchema).max(40).optional().default([]),
});

type ProductInput = z.infer<typeof productSchema>;

/**
 * Sobe a imagem do produto para o storage e devolve o produto pronto para o banco.
 * O data:URL morre aqui — no MongoDB entra so a URL publica.
 */
async function persistProduct(product: ProductInput, storeHint: string) {
  const image = await storeImage(product.imageUrl, 'produtos', `${storeHint}-${product.name}`);

  return {
    name: product.name,
    description: product.description,
    price: product.price,
    category: product.category,
    imageUrl: image?.url ?? null,
    imagePublicId: image?.publicId ?? null,
  };
}

/** POST /api/demo/stores - cria a loja de demonstracao e devolve o codigo do restaurante. */
export const createDemoStore = asyncHandler(async (req: Request, res: Response) => {
  const body = storeSchema.parse(req.body);

  const slug = await uniqueSlug(body.restaurantName, async (candidate) => {
    const found = await DemoStore.exists({ slug: candidate });
    return Boolean(found);
  });

  let code = generateRestaurantCode();
  for (let attempt = 0; attempt < 5 && (await DemoStore.exists({ code })); attempt += 1) {
    code = generateRestaurantCode();
  }

  // Imagens viram arquivo ANTES de tocar no banco.
  const logo = await storeImage(body.logoUrl, 'logos', body.restaurantName);
  const products = await Promise.all(body.products.map((product) => persistProduct(product, slug)));

  const store = await DemoStore.create({
    ...body,
    slug,
    code,
    logoUrl: logo?.url ?? null,
    logoPublicId: logo?.publicId ?? null,
    products,
  });

  // Se o visitante deixou e-mail, ja vira lead ligado a demo.
  if (body.ownerEmail) {
    const lead = await Lead.create({
      email: body.ownerEmail,
      restaurantName: body.restaurantName,
      source: 'demo-interativa',
      demoStoreCode: code,
      status: 'testando',
    });
    store.leadId = lead._id;
    await store.save();
  }

  res.status(201).json({
    ok: true,
    data: {
      code: store.code,
      slug: store.slug,
      previewUrl: `/loja/${store.slug}`,
      expiresAt: store.expiresAt,
      store,
    },
    message: `Pronto! O codigo do seu restaurante e ${store.code}. Sua equipe usa ele para entrar no app.`,
  });
});

/** GET /api/demo/stores/:code - o app parceiro busca a loja pelo codigo digitado. */
export const getDemoStore = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').toUpperCase().trim();
  const store = await DemoStore.findOne({ code }).lean();
  if (!store) throw HttpError.notFound('Nao encontramos nenhum restaurante com esse codigo.');
  res.json({ ok: true, data: store });
});

/** POST /api/demo/stores/:code/products - adiciona item ao cardapio da demo. */
export const addDemoProduct = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').toUpperCase().trim();
  const product = productSchema.parse(req.body);

  const store = await DemoStore.findOne({ code });
  if (!store) throw HttpError.notFound('Loja de demonstracao nao encontrada.');
  if (store.products.length >= 20) {
    throw HttpError.badRequest('A demonstracao aceita ate 20 itens. Crie sua conta para liberar o cardapio completo.');
  }

  store.products.push(await persistProduct(product, store.slug));
  await store.save();

  res.status(201).json({ ok: true, data: store.products.at(-1) });
});

/** DELETE /api/demo/stores/:code/products/:productId */
export const removeDemoProduct = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').toUpperCase().trim();
  const store = await DemoStore.findOne({ code });
  if (!store) throw HttpError.notFound('Loja de demonstracao nao encontrada.');

  // Tira o arquivo do storage junto com o registro, para nao deixar lixo pago para tras.
  const product = store.products.id(req.params.productId);
  if (product?.imagePublicId) await destroyImage(product.imagePublicId);

  store.products.pull({ _id: req.params.productId });
  await store.save();

  res.json({ ok: true, data: { removed: req.params.productId } });
});
