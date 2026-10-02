import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { HttpError } from '../utils/httpError.js';
import { z } from 'zod';
import { emitMenuItemAvailabilityChanged } from '../realtime/io.js';
import { planAccess, effectivePermissions } from '../utils/planAccess.js';

/**
 * Cardápio e configuração de operação, para o app da equipe.
 *
 * POR QUE NÃO REUSAR `/public/apps/:id`
 * -------------------------------------
 * A rota pública é o que o CLIENTE vê: sem saguões, sem a comissão do
 * garçom e barrada em aplicativo de teste. Itens indisponíveis seguem
 * visíveis lá apenas como "esgotados", sem possibilidade de compra.
 * A equipe precisa exatamente do que falta ali — o saguão roteia o item para
 * a praça certa na cozinha, e o item esgotado ainda aparece para quem lança
 * uma comanda de mesa.
 *
 * Montagem por LISTA BRANCA, campo a campo. Com `.select('-employees')`,
 * bastaria alguém acrescentar um campo sensível ao schema para ele vazar em
 * silêncio no dia seguinte; escrevendo cada linha, o vazamento passa a exigir
 * uma ação e não um esquecimento.
 *
 * NÃO sai daqui: employees (com os códigos de acesso), roles, owner,
 * tracking, selectedPlan.
 */

const imageUrl = (id: unknown) => (id ? `${env.publicUrl}/api/images/${String(id)}` : null);

export const getDeviceMenu = asyncHandler(async (req: Request, res: Response) => {
  const appId = req.device!.app;

  const app = (await AppProject.findById(appId)
    .select('name brand delivery dining categories products promotions stations businessType employees roles appPlanType')
    .lean()) as Record<string, any> | null;

  if (!app) throw new HttpError(404, 'Aplicativo nao encontrado.');

  const brand = (app.brand ?? {}) as Record<string, unknown>;
  const delivery = (app.delivery ?? {}) as Record<string, unknown>;
  const dining = (app.dining ?? {}) as Record<string, unknown>;

  return res.json({
    ok: true,
    data: {
      storeName: app.name,
      appPlanType: app.appPlanType,
      allowedTabs: planAccess(app.appPlanType).tabs,
      permissions: req.device!.perms,
      businessType: app.businessType,

      branding: {
        logoUrl: imageUrl(brand.logo),
        primaryColor: (brand.primaryColor as string) ?? '#F95D2A',
        secondaryColor: (brand.secondaryColor as string) ?? '#111827',
        theme: (brand.theme as string) ?? 'claro',
        tagline: (brand.tagline as string) ?? '',
      },

      delivery: {
        enabled: planAccess(app.appPlanType).delivery && delivery.enabled !== false,
        fee: planAccess(app.appPlanType).delivery ? Number(delivery.fee ?? 0) : 0,
        minOrder: planAccess(app.appPlanType).delivery ? Number(delivery.minOrder ?? 0) : 0,
        estimatedMinutes: Number(delivery.estimatedMinutes ?? 35),
        courierPaidPerDelivery: planAccess(app.appPlanType).delivery && delivery.courierPaidPerDelivery === true,
        whatsapp: String(delivery.whatsapp ?? '').replace(/\D/g, ''),
      },

      dining: {
        /*
         * A fração já vem calculada. Mandar "10" e deixar a tela dividir por
         * cem convida a um erro de duas ordens de grandeza na conta da mesa.
         */
        waiterCommissionRate:
          planAccess(app.appPlanType).dining && dining.isWaiterCommissionEnabled === true
            ? Number(dining.waiterCommissionPercentage ?? 10) / 100
            : 0,
      },

      categories: (app.categories ?? []).map((c: Record<string, any>) => ({
        _id: String(c._id),
        name: c.name,
        image: imageUrl(c.image),
      })),

      /*
       * Produto indisponível NÃO é filtrado aqui, ao contrário da rota
       * pública. O garçom precisa vê-lo para saber que existe e acabou — o
       * cliente é que não deve pedir o que não tem.
       */
      products: (app.products ?? []).map((p: Record<string, any>) => ({
        id: String(p._id),
        name: p.name,
        description: p.description ?? '',
        price: Number(p.price ?? 0),
        pricingType: p.pricingType ?? 'unit',
        category: p.category ?? '',
        station: p.station ?? '',
        imageUrl: imageUrl(p.image),
        isFeatured: p.isFeatured === true,
        available: p.available !== false,
      })),

      promotions: (app.promotions ?? [])
        .filter((p: Record<string, any>) => p.active === true)
        .map((p: Record<string, any>) => ({
          _id: String(p._id),
          type: p.type,
          name: p.name,
          description: p.description ?? '',
          promotionalPrice: Number(p.promotionalPrice ?? 0),
          targetProductId: p.targetProductId ? String(p.targetProductId) : null,
          comboItems: (p.comboItems ?? []).map((x: unknown) => String(x)),
          validUntil: p.validUntil ?? null,
          expiresOnRegisterClose: p.expiresOnRegisterClose === true,
          active: true,
        })),

      /*
       * Equipe: SÓ id e nome.
       *
       * É o mínimo para o seletor de entregador funcionar. Devolver o
       * subdocumento inteiro traria `accessCode` junto — o código de login de
       * cada colega — para dentro de um aplicativo que qualquer funcionário
       * abre. Montar campo a campo aqui é o que impede esse vazamento de
       * acontecer por esquecimento no dia em que alguém trocar o `.select`.
       */
      equipe: (app.employees ?? [])
        .filter((e: Record<string, any>) => e.blocked !== true)
        .map((e: Record<string, any>) => {
          const role = (app.roles ?? []).find(
            (r: Record<string, any>) => String(r._id) === String(e.roleId)
          );
          const permissions = effectivePermissions(app.appPlanType, (role?.permissions ?? []).map(String));
          return {
            id: String(e._id),
            name: String(e.name ?? ''),
            roleName: String(role?.name ?? 'Sem tag'),
            permissions,
            isDeliveryman: planAccess(app.appPlanType).delivery && (e.isDeliveryman === true || role?.permissions?.includes('entregador')),
          };
        }),

      /* Só os nomes, na ordem do cadastro: é o que a Cozinha usa como filtro. */
      stations: (app.stations ?? [])
        .slice()
        .sort((a: Record<string, any>, b: Record<string, any>) => (a.order ?? 0) - (b.order ?? 0))
        .map((s: Record<string, any>) => String(s.name)),
    },
  });
});

export const setDeviceProductAvailability = asyncHandler(async (req: Request, res: Response) => {
  const productId = z.string().min(1).parse(req.params.productId);
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  const permissions = req.device!.perms ?? [];
  if (!permissions.includes('administracao') && !permissions.includes('recepcao')) {
    throw new HttpError(403, 'Sua função não permite alterar o cardápio.');
  }

  const result = await AppProject.updateOne(
    { _id: req.device!.app, 'products._id': productId },
    { $set: { 'products.$.available': available } }
  );
  if (!result.matchedCount) throw new HttpError(404, 'Produto não encontrado.');

  emitMenuItemAvailabilityChanged(req.device!.app, { productId, available });
  return res.json({ ok: true, data: { productId, available } });
});
