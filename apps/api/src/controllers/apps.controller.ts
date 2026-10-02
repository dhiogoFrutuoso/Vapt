import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppProject } from '../models/AppProject.js';
import { generateUniqueEmployeeCode } from '../services/employeeLookup.js';
import { revokeAllForEmployee } from '../services/deviceSession.js';
import { emitSessionRevoked } from '../realtime/io.js';
import { User } from '../models/User.js';
import { Image } from '../models/Image.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { uniqueSlug } from '../utils/codes.js';
import { toWebpBase64 } from '../services/imageProcessor.js';
import { env } from '../config/env.js';
import { planAccess, roleAllowed, rolePermissions } from '../utils/planAccess.js';

const createAppSchema = z.object({
  name: z.string().min(1, 'Informe o nome do aplicativo.').max(80),
  businessType: z.enum(['restaurante', 'bar', 'lanchonete', 'pizzaria', 'cafeteria', 'mercado']).default('restaurante'),
  appPlanType: z.enum(['TESTE_DELIVERY', 'TESTE_SALAO', 'TESTE_COMPLETO', 'OFICIAL_DELIVERY', 'OFICIAL_SALAO', 'OFICIAL_COMPLETO']),
  targetUserId: z.string().optional(),
});

export const createApp = async (req: Request, res: Response) => {
          try {
            const { name, businessType, appPlanType, targetUserId } = createAppSchema.parse(req.body);
                  let ownerId = req.user!.id;
                  
                  if (req.user!.isAdmin && targetUserId) {
                    ownerId = targetUserId;
                  }

                  if (planAccess(appPlanType).official && !req.user!.isAdmin) {
                    const owner = await User.findById(ownerId).select('plan planEndDate status').lean();
                    const subscription = String(owner?.plan ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    const complete = subscription.includes('completo') || subscription.includes('master');
                    const entitled = complete || (appPlanType.endsWith('_DELIVERY') && subscription.includes('delivery')) || (appPlanType.endsWith('_SALAO') && subscription.includes('salao'));
                    if (!entitled || owner?.status !== 'ativo' || (owner.planEndDate && owner.planEndDate.getTime() <= Date.now())) {
                      throw new HttpError(403, 'Sua assinatura não permite criar este aplicativo oficial.');
                    }
                  }
                  const slug = await uniqueSlug(name, async (s) => {
                    const exists = await AppProject.exists({ slug: s });
                    return exists !== null;
                  });

                  const app = new AppProject({
                    owner: ownerId,
                    name,
                    slug,
                    businessType,
                    appPlanType,
                    roles: [
                      {
                        name: 'Administrador',
                        permissions: ['administracao'],
                      },
                      { name: 'Recepcionista', permissions: ['cliente', 'recepcao'] },
                      { name: 'Garçom', permissions: ['salao'] },
                      { name: 'Cozinheiro', permissions: ['cozinha'] },
                      { name: 'Caixeiro', permissions: ['caixa'] },
                      { name: 'Entregador', permissions: ['entregador'] },
                    ].map(role => ({ ...role, permissions: rolePermissions(appPlanType, role.permissions) })).filter(role => role.permissions.length),
                  });

                  await app.save();

                  res.status(201).json({ ok: true, data: (app as any).toSummary() });

          } catch (error: any) {
            console.error('[API Error - createApp]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const listApps = async (req: Request, res: Response) => {
          try {
            const targetUserId = req.query.targetUserId as string | undefined;
                  const ownerId = (req.user!.isAdmin && targetUserId) ? targetUserId : req.user!.id;
                  
                  const apps = await AppProject.find({ owner: ownerId }).sort({ updatedAt: -1 });
                  res.json({ ok: true, data: apps.map((a) => (a as any).toSummary()) });

          } catch (error: any) {
            console.error('[API Error - listApps]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const deleteApp = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOneAndDelete({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');
                  res.json({ ok: true, data: { deleted: true } });

          } catch (error: any) {
            console.error('[API Error - deleteApp]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const getApp = async (req: Request, res: Response) => {
          try {
            const app = (await AppProject.findOne({ _id: req.params.id, owner: req.user!.id }).lean()) as any;
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  // Filtra promoções vencidas para não enviar promoções expiradas no passado
                  app.roles = (app.roles ?? []).map((role: any) => ({ ...role, permissions: rolePermissions(app.appPlanType, role.permissions) })).filter((role: any) => role.permissions.length);
                  if (!planAccess(app.appPlanType).dining) app.tables = [];
                  const now = new Date();
                  app.promotions = (app.promotions || []).filter((p: any) => {
                    if (p.validUntil && new Date(p.validUntil) < now) return false;
                    return true;
                  });

                  res.json({ ok: true, data: app });

          } catch (error: any) {
            console.error('[API Error - getApp]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

const updateAppSchema = z.object({
  name: z.string().max(80).optional(),
  businessType: z.enum(['restaurante', 'bar', 'lanchonete', 'pizzaria', 'cafeteria', 'mercado']).optional(),
  brand: z
    .object({
      primaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor inválida.').optional(),
      secondaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor inválida.').optional(),
      theme: z.enum(['claro', 'escuro']).optional(),
      tagline: z.string().max(120).optional(),
      logoBase64: z.string().optional(),
    })
    .optional(),
  delivery: z
    .object({
      enabled: z.boolean().optional(),
      fee: z.number().min(0).max(999).optional(),
      minOrder: z.number().min(0).max(9999).optional(),
      estimatedMinutes: z.number().min(5).max(240).optional(),
      channel: z.enum(['whatsapp', 'painel', 'ambos']).optional(),
      whatsapp: z.string().max(30).optional(),
      courierPaidPerDelivery: z.boolean().optional(),
    })
    .optional(),
  dining: z
    .object({
      isWaiterCommissionEnabled: z.boolean().optional(),
      waiterCommissionPercentage: z.number().min(0).max(100).optional(),
    })
    .optional(),
  categories: z.array(z.string().max(40)).optional(),
});

export const updateApp = async (req: Request, res: Response) => {
          try {
            const updates = updateAppSchema.parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  if (updates.name) app.name = updates.name;
                  if (updates.businessType) app.businessType = updates.businessType;
                  
                  if (updates.brand) {
                    const brandData = { ...updates.brand } as any;
                    if (brandData.logoBase64) {
                      const processed = await toWebpBase64(brandData.logoBase64);
                      const imageDoc = await Image.create({
                        owner: req.user!.id,
                        kind: 'logo',
                        mimeType: processed.mimeType,
                        data: processed.base64,
                        width: processed.width,
                        height: processed.height,
                        bytes: processed.bytes,
                      });
                      brandData.logo = imageDoc._id;
                      delete brandData.logoBase64;
                    }
                    app.brand = { ...app.brand, ...brandData } as any;
                  }
                  
                  if (updates.delivery) {
                    app.delivery = { ...app.delivery, ...updates.delivery } as any;
                  }
                  
                  if (updates.dining) {
                    app.dining = { ...app.dining, ...updates.dining } as any;
                  }
                  
                  

                  await app.save();
                  res.json({ ok: true, data: app });

          } catch (error: any) {
            console.error('[API Error - updateApp]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

const addProductSchema = z.object({
  name: z.string().min(1, 'O produto precisa de um nome.').max(80),
  description: z.string().max(240).optional().default(''),
  price: z.number().min(0).max(99999),
  category: z.string().max(40).optional().default('Destaques'),
  pricingType: z.enum(['unit', 'weight']).optional().default('unit'),
  /** Saguão que prepara o item. Vazio = nao entra no roteamento da Cozinha. */
  station: z.string().max(40).optional().default(''),
  isFeatured: z.boolean().optional().default(false),
  available: z.boolean().optional().default(true),
  order: z.number().optional().default(0),
  imageBase64: z.string().optional(),
});

export const addProduct = async (req: Request, res: Response) => {
          try {
            const data = addProductSchema.parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  let imageId = null;
                  if (data.imageBase64) {
                    const processed = await toWebpBase64(data.imageBase64);
                    const imageDoc = await Image.create({
                      owner: req.user!.id,
                      kind: 'produto',
                      mimeType: processed.mimeType,
                      data: processed.base64,
                      width: processed.width,
                      height: processed.height,
                      bytes: processed.bytes,
                    });
                    imageId = imageDoc._id;
                  }

                  const newProduct = {
                    name: data.name,
                    description: data.description,
                    price: data.price,
                    category: data.category,
                    pricingType: data.pricingType,
                    station: data.station,
                    isFeatured: data.isFeatured,
                    available: data.available,
                    order: data.order,
                    image: imageId,
                  };

                  app.products.push(newProduct as any);
                  await app.save();

                  res.status(201).json({ ok: true, data: app.products[app.products.length - 1] });

          } catch (error: any) {
            console.error('[API Error - addProduct]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const updateProduct = async (req: Request, res: Response) => {
          try {
            const data = addProductSchema.partial().parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const productIndex = app.products.findIndex((p: any) => String(p._id) === req.params.productId);
                  if (productIndex === -1) throw HttpError.notFound('Produto não encontrado.');

                  const product = app.products[productIndex];

                  if (data.imageBase64 !== undefined) {
                    if (data.imageBase64 === null || data.imageBase64 === '') {
                      if (product.image) {
                        await Image.deleteOne({ _id: product.image, owner: req.user!.id }).catch(() => {});
                        product.image = undefined;
                      }
                    } else {
                      const processed = await toWebpBase64(data.imageBase64);
                      const imageDoc = await Image.create({
                        owner: req.user!.id,
                        kind: 'produto',
                        mimeType: processed.mimeType,
                        data: processed.base64,
                        width: processed.width,
                        height: processed.height,
                        bytes: processed.bytes,
                      });
                      if (product.image) {
                        await Image.deleteOne({ _id: product.image, owner: req.user!.id }).catch(() => {});
                      }
                      product.image = imageDoc._id;
                    }
                  }

                  if (data.name !== undefined) product.name = data.name;
                  if (data.description !== undefined) product.description = data.description;
                  if (data.price !== undefined) product.price = data.price;
                  if (data.category !== undefined) product.category = data.category;
                  if (data.pricingType !== undefined) product.pricingType = data.pricingType;
                  if (data.station !== undefined) product.station = data.station;
                  if (data.isFeatured !== undefined) product.isFeatured = data.isFeatured;
                  if (data.available !== undefined) product.available = data.available;
                  if (data.order !== undefined) product.order = data.order;

                  await app.save();
                  res.json({ ok: true, data: product });

          } catch (error: any) {
            console.error('[API Error - updateProduct]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const removeProduct = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const productIndex = app.products.findIndex((p: any) => String(p._id) === req.params.productId);
                  if (productIndex === -1) throw HttpError.notFound('Produto não encontrado.');

                  const product = app.products[productIndex];
                  if (product.image) {
                    await Image.deleteOne({ _id: product.image, owner: req.user!.id }).catch(() => {});
                  }

                  app.products.splice(productIndex, 1);
                  await app.save();

                  res.json({ ok: true, data: { removed: req.params.categoryId } });

          } catch (error: any) {
            console.error('[API Error - removeProduct]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

const addTableSchema = z.object({
  label: z.string().min(1).max(10),
  seats: z.number().min(1).max(40),
  area: z.string().max(40).optional().default('Salão'),
});

const categorySchemaApi = z.object({
  name: z.string().min(1, 'A categoria precisa de um nome.').max(40),
  imageBase64: z.string().optional(),
});

export const addCategory = async (req: Request, res: Response) => {
          try {
            const data = categorySchemaApi.parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  let imageId = null;
                  if (data.imageBase64) {
                    const processed = await toWebpBase64(data.imageBase64, { maxSize: 400 });
                    const imageDoc = await Image.create({
                      owner: req.user!.id,
                      kind: 'categoria',
                      mimeType: processed.mimeType,
                      data: processed.base64,
                      width: processed.width,
                      height: processed.height,
                      bytes: processed.bytes,
                    });
                    imageId = imageDoc._id;
                  }

                  app.categories.push({ name: data.name, image: imageId } as any);
                  await app.save();

                  res.status(201).json({ ok: true, data: app.categories[app.categories.length - 1] });

          } catch (error: any) {
            console.error('[API Error - addCategory]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const updateCategory = async (req: Request, res: Response) => {
          try {
            const parsedData = categorySchemaApi.partial().parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const category = app.categories.id(req.params.categoryId);
                  if (!category) throw HttpError.notFound('Categoria não encontrada.');

                  if (parsedData.name !== undefined) category.name = parsedData.name;
                  
                  if (parsedData.imageBase64 !== undefined) {
                    if (parsedData.imageBase64 === null) {
                      category.image = null;
                    } else {
                      const processed = await toWebpBase64(parsedData.imageBase64, { maxSize: 400 });
                      const imageDoc = await Image.create({
                        owner: req.user!.id,
                        kind: 'categoria',
                        mimeType: processed.mimeType,
                        data: processed.base64,
                        width: processed.width,
                        height: processed.height,
                        bytes: processed.bytes,
                      });
                      category.image = imageDoc._id;
                    }
                  }

                  await app.save();
                  res.json({ ok: true, data: category });

          } catch (error: any) {
            console.error('[API Error - updateCategory]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const removeCategory = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const catIndex = app.categories.findIndex((c: any) => String(c._id) === req.params.categoryId);
                  if (catIndex === -1) throw HttpError.notFound('Categoria não encontrada.');

                  app.categories.splice(catIndex, 1);
                  await app.save();

                  res.json({ ok: true, data: { removed: req.params.productId } });

          } catch (error: any) {
            console.error('[API Error - removeCategory]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const addTable = async (req: Request, res: Response) => {
          try {
            const data = addTableSchema.parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  app.tables.push(data as any);
                  await app.save();

                  res.status(201).json({ ok: true, data: app.tables[app.tables.length - 1] });

          } catch (error: any) {
            console.error('[API Error - addTable]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const updateTable = async (req: Request, res: Response) => {
          try {
            const data = addTableSchema.partial().parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const table = app.tables.id(req.params.tableId);
                  if (!table) throw HttpError.notFound('Mesa não encontrada.');

                  if (data.label !== undefined) table.label = data.label;
                  if (data.seats !== undefined) table.seats = data.seats;
                  if (data.area !== undefined) table.area = data.area;

                  await app.save();
                  res.json({ ok: true, data: table });

          } catch (error: any) {
            console.error('[API Error - updateTable]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const removeTable = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const tableIndex = app.tables.findIndex((t: any) => String(t._id) === req.params.tableId);
                  if (tableIndex === -1) throw HttpError.notFound('Mesa não encontrada.');

                  app.tables.splice(tableIndex, 1);
                  await app.save();

                  res.json({ ok: true, data: { removed: req.params.tableId } });

          } catch (error: any) {
            console.error('[API Error - removeTable]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

const planSchema = z.object({
  planName: z.string().min(1, 'Plano não informado.'),
});

export const requestPlan = async (req: Request, res: Response) => {
          try {
            const { planName } = planSchema.parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const user = await User.findById(req.user!.id);
                  if (!user) throw HttpError.notFound('Usuário não encontrado.');

                  app.selectedPlan = planName;
                  app.status = 'aguardando_contato';
                  app.planRequestedAt = new Date();
                  
                  await app.save();

                  /*
                   * Conta criada pelo Google so ganha endereco no onboarding.
                   * Ate la o campo pode estar vazio, e a mensagem do WhatsApp
                   * precisa sair mesmo assim — sem endereco, nao quebrada.
                   */
                  const address = user.address;
                  const addressString = address
                    ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''}, ${address.district}, ${address.city} - ${address.state}`
                    : 'Não informado';

                  const message = `Olá, quero ativar o VaptApp!
  
Meu nome: ${user.displayName || user.username}
E-mail: ${user.email}
Telefone: ${user.phone || 'Não informado'}
Endereço: ${addressString}
Aplicativo: ${app.name}
Plano escolhido: ${planName}`;

                  const whatsappUrl = `https://wa.me/${env.adminWhatsapp}?text=${encodeURIComponent(message)}`;

                  res.json({ ok: true, data: { whatsappUrl } });

          } catch (error: any) {
            console.error('[API Error - requestPlan]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };


/* ------------------------- Roles ------------------------- */

const permissionSchema = z.enum([
  'cliente',
  'recepcao',
  'salao',
  'caixa',
  'entregador',
  'cozinha',
  'administracao',
]);

const roleBodySchema = z.object({
  name: z.string().trim().min(2).max(40),
  permissions: z.array(permissionSchema).min(1).max(7),
});

const employeeBodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  roleId: z.string().min(1),
});

export const addRole = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('App nao encontrado');

                  const body = roleBodySchema.parse(req.body);
                  if (!roleAllowed(app.appPlanType, body.permissions)) throw new HttpError(403, 'A tag contém áreas não incluídas neste plano.');
                  const newRole = body;
                  app.roles.push(newRole as any);
                  await app.save();
                  
                  const created = app.roles[app.roles.length - 1];
                  res.json({ ok: true, data: created });

          } catch (error: any) {
            console.error('[API Error - addRole]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const updateRole = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('App nao encontrado');

                  const role = app.roles.id(req.params.roleId);
                  if (!role) throw HttpError.notFound('Funcao nao encontrada');

                  const body = roleBodySchema.partial().parse(req.body);
                  if (body.permissions && !roleAllowed(app.appPlanType, body.permissions)) throw new HttpError(403, 'A tag contém áreas não incluídas neste plano.');
                  if (body.name !== undefined) role.name = body.name;
                  if (body.permissions !== undefined) {
                    role.permissions = body.permissions;
                    const entregador = body.permissions.includes('entregador');
                    for (const employee of app.employees) {
                      if (String(employee.roleId) === String(role._id)) employee.isDeliveryman = entregador;
                    }
                  }
                  
                  await app.save();
                  const affected = app.employees.filter((employee) => String(employee.roleId) === String(role._id));
                  await Promise.all(
                    affected.map((employee) => revokeAllForEmployee(String(employee._id), 'admin'))
                  );
                  for (const employee of affected) {
                    emitSessionRevoked(String(app._id), String(employee._id), 'permissoes_alteradas');
                  }
                  res.json({ ok: true, data: role });

          } catch (error: any) {
            console.error('[API Error - updateRole]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const removeRole = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('App nao encontrado');

                  const role = app.roles.id(req.params.roleId);
                  if (role) {
                    if (app.employees.some((employee) => String(employee.roleId) === String(role._id))) {
                      throw HttpError.badRequest('Reatribua os funcionários antes de excluir esta tag.');
                    }
                    role.deleteOne();
                    await app.save();
                  }
                  res.json({ ok: true, data: { deleted: true } });

          } catch (error: any) {
            console.error('[API Error - removeRole]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

/* ----------------------- Employees ----------------------- */

/*
 * O gerador antigo vivia aqui: Math.random(), alfabeto com 0/O/1/I e sem
 * checagem de colisao. Foi substituido por `generateUniqueEmployeeCode`, que
 * usa crypto.randomInt e confirma que o codigo esta livre em TODA a base —
 * necessario porque o login do app busca o funcionario so pelo codigo,
 * atravessando todos os restaurantes.
 */

export const addEmployee = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('App nao encontrado');

                  const body = employeeBodySchema.parse(req.body);
                  const roleExists = app.roles.id(body.roleId);
                  if (!roleExists) throw HttpError.badRequest('Funcao invalida');
                  if (!rolePermissions(app.appPlanType, roleExists.permissions).length) throw new HttpError(403, 'Esta função não está incluída neste plano.');

                  const accessCode = await generateUniqueEmployeeCode();
                  const newEmployee = {
                    name: body.name,
                    roleId: body.roleId,
                    accessCode,
                    isDeliveryman: roleExists.permissions.includes('entregador'),
                  };
                  app.employees.push(newEmployee as any);
                  await app.save();
                  
                  const created = app.employees[app.employees.length - 1];
                  res.json({ ok: true, data: created });

          } catch (error: any) {
            console.error('[API Error - addEmployee]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const updateEmployee = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('App nao encontrado');

                  const emp = app.employees.id(req.params.empId);
                  if (!emp) throw HttpError.notFound('Funcionario nao encontrado');

                  const body = employeeBodySchema.partial().parse(req.body);
                  let roleChanged = false;
                  if (body.name !== undefined) emp.name = body.name;
                  if (body.roleId !== undefined) {
                    const role = app.roles.id(body.roleId);
                    if (!role) throw HttpError.badRequest('Funcao invalida');
                    if (!rolePermissions(app.appPlanType, role.permissions).length) throw new HttpError(403, 'Esta função não está incluída no plano.');
                    emp.roleId = role._id;
                    emp.isDeliveryman = planAccess(app.appPlanType).delivery && role.permissions.includes('entregador');
                    roleChanged = true;
                  }
                  
                  await app.save();
                  if (roleChanged) {
                    await revokeAllForEmployee(String(emp._id), 'admin');
                    emitSessionRevoked(String(app._id), String(emp._id), 'funcao_alterada');
                  }
                  res.json({ ok: true, data: emp });

          } catch (error: any) {
            console.error('[API Error - updateEmployee]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

/* ------------------------ Promoções e Combos ------------------------ */

const addPromotionSchema = z.object({
  type: z.enum(['combo', 'discount']),
  name: z.string().min(1, 'O nome é obrigatório.').max(80),
  description: z.string().max(240).optional().default(''),
  promotionalPrice: z.number().min(0).max(99999),
  targetProductId: z.string().optional(),
  comboItems: z.array(z.string()).optional().default([]),
  validUntil: z.string().datetime().nullable().optional(),
  expiresOnRegisterClose: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const addPromotion = async (req: Request, res: Response) => {
          try {
            const data = addPromotionSchema.parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });

                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  if (!planAccess(app.appPlanType).cash && data.expiresOnRegisterClose) throw new HttpError(403, 'Este plano não possui fechamento de caixa. Escolha uma data para a promoção.');
                  const newPromo = {
                    type: data.type,
                    name: data.name,
                    description: data.description,
                    promotionalPrice: data.promotionalPrice,
                    targetProductId: data.targetProductId || null,
                    comboItems: data.comboItems,
                    validUntil: data.validUntil ? new Date(data.validUntil) : null,
                    expiresOnRegisterClose: data.expiresOnRegisterClose,
                    active: data.active,
                  };

                  app.promotions.push(newPromo as any);
                  await app.save();

                  res.status(201).json({ ok: true, data: app.promotions[app.promotions.length - 1] });

          } catch (error: any) {
            console.error('[API Error - addPromotion]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const updatePromotion = async (req: Request, res: Response) => {
          try {
            const data = addPromotionSchema.partial().parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });

                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const promoIndex = app.promotions.findIndex((p: any) => String(p._id) === req.params.promoId);
                  if (promoIndex === -1) throw HttpError.notFound('Promoção não encontrada.');

                  const promo = app.promotions[promoIndex] as any;
                  if (!planAccess(app.appPlanType).cash && data.expiresOnRegisterClose) throw new HttpError(403, 'Este plano não possui fechamento de caixa. Escolha uma data para a promoção.');

                  if (data.type !== undefined) promo.type = data.type;
                  if (data.name !== undefined) promo.name = data.name;
                  if (data.description !== undefined) promo.description = data.description;
                  if (data.promotionalPrice !== undefined) promo.promotionalPrice = data.promotionalPrice;
                  if (data.targetProductId !== undefined) promo.targetProductId = data.targetProductId || null;
                  if (data.comboItems !== undefined) promo.comboItems = data.comboItems;
                  if (data.validUntil !== undefined) promo.validUntil = data.validUntil ? new Date(data.validUntil) : null;
                  if (data.expiresOnRegisterClose !== undefined) promo.expiresOnRegisterClose = data.expiresOnRegisterClose;
                  if (data.active !== undefined) promo.active = data.active;

                  await app.save();
                  res.json({ ok: true, data: promo });

          } catch (error: any) {
            console.error('[API Error - updatePromotion]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const removePromotion = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });

                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const promoIndex = app.promotions.findIndex((p: any) => String(p._id) === req.params.promoId);
                  if (promoIndex === -1) throw HttpError.notFound('Promoção não encontrada.');

                  app.promotions.splice(promoIndex, 1);
                  await app.save();

                  res.json({ ok: true, deleted: true });

          } catch (error: any) {
            console.error('[API Error - removePromotion]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const removeEmployee = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('App nao encontrado');

                  const emp = app.employees.id(req.params.empId);
                  if (emp) {
                    emp.deleteOne();
                    await app.save();

                    /*
                     * Derruba as sessoes do aparelho ANTES de responder.
                     *
                     * Sem isto, excluir o funcionario removia o cadastro mas
                     * deixava o app dele funcionando ate o refresh expirar —
                     * ate 30 dias operando o restaurante como um usuario que
                     * ja nao existe. O acesso tem de morrer junto com a conta.
                     */
                    const derrubadas = await revokeAllForEmployee(req.params.empId, 'admin');

                    /* Fecha a tela na hora, em vez de esperar o token expirar. */
                    emitSessionRevoked(req.params.id, req.params.empId, 'exclusao');

                    if (derrubadas > 0) {
                      console.info(`[equipe] Funcionario removido. ${derrubadas} sessao(oes) encerrada(s).`);
                    }
                  }
                  res.json({ ok: true, data: { deleted: true } });

          } catch (error: any) {
            console.error('[API Error - removeEmployee]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const closeCashRegister = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('App nao encontrado');

                  let updatedCount = 0;
                  for (const promo of app.promotions) {
                    if (promo.expiresOnRegisterClose && promo.active) {
                      promo.active = false;
                      updatedCount++;
                    }
                  }

                  if (updatedCount > 0) {
                    await app.save();
                  }

                  res.json({ ok: true, data: { deactivatedPromotions: updatedCount } });

          } catch (error: any) {
            console.error('[API Error - closeCashRegister]:', error);
            
            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }
            
            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.code === 11000) {
              return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessão expirada ou inválida." });
            }
            
            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

/* ======================= Saguoes (pracas de preparo) ====================== */

const stationSchemaApi = z.object({
  name: z.string().min(1, 'O saguão precisa de um nome.').max(40),
  color: z.string().max(9).optional(),
  order: z.number().optional(),
});

export const addStation = async (req: Request, res: Response) => {
          try {
            const data = stationSchemaApi.parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const exists = app.stations.some(
                    (s: any) => String(s.name).toLowerCase() === data.name.toLowerCase()
                  );
                  if (exists) throw HttpError.conflict('Já existe um saguão com esse nome.');

                  app.stations.push(data as any);
                  await app.save();

                  res.status(201).json({ ok: true, data: app.stations[app.stations.length - 1] });

          } catch (error: any) {
            console.error('[API Error - addStation]:', error);

            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }

            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessao expirada ou invalida." });
            }

            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const updateStation = async (req: Request, res: Response) => {
          try {
            const data = stationSchemaApi.partial().parse(req.body);
                  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const station = app.stations.id(req.params.stationId);
                  if (!station) throw HttpError.notFound('Saguão não encontrado.');

                  const previousName = station.name;

                  if (data.name !== undefined) station.name = data.name;
                  if (data.color !== undefined) station.color = data.color;
                  if (data.order !== undefined) station.order = data.order;

                  // Produtos apontam para o saguão pelo nome: renomear tem de arrastar o vínculo.
                  if (data.name !== undefined && data.name !== previousName) {
                    for (const product of app.products) {
                      if (product.station === previousName) product.station = data.name;
                    }
                  }

                  await app.save();
                  res.json({ ok: true, data: station });

          } catch (error: any) {
            console.error('[API Error - updateStation]:', error);

            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }

            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessao expirada ou invalida." });
            }

            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };

export const removeStation = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
                  if (!app) throw HttpError.notFound('Aplicativo não encontrado.');

                  const index = app.stations.findIndex(
                    (s: any) => String(s._id) === req.params.stationId
                  );
                  if (index === -1) throw HttpError.notFound('Saguão não encontrado.');

                  const removedName = app.stations[index].name;
                  app.stations.splice(index, 1);

                  // Sem o saguão, os produtos dele ficam sem roteamento em vez de apontar para o vazio.
                  for (const product of app.products) {
                    if (product.station === removedName) product.station = '';
                  }

                  await app.save();
                  res.json({ ok: true, data: { removed: req.params.stationId } });

          } catch (error: any) {
            console.error('[API Error - removeStation]:', error);

            if (error.name === 'ZodError') {
              return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
            }

            if (error.status) {
              return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
            }

            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
              return res.status(401).json({ message: "Sessao expirada ou invalida." });
            }

            return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
          }
        };
