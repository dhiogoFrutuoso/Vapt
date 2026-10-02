import type { RequestHandler } from 'express';
import { AppProject } from '../models/AppProject.js';
import { planAccess } from '../utils/planAccess.js';
import { HttpError } from '../utils/httpError.js';

/** Owner dashboard mutations must enforce the same boundary as device APIs. */
export const requireAppPlan: RequestHandler = async (req, _res, next) => {
  try {
    const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id }).select('appPlanType').lean();
    if (!app) throw HttpError.notFound('Aplicativo não encontrado.');
    const access = planAccess(app.appPlanType);
    if ((req.path.includes('/tables') && !access.dining) || (req.path.includes('/cash/') && !access.cash)
      || (req.path.endsWith('/plan') && access.official)) throw new HttpError(403, 'Esta ação não está disponível neste plano.');
    if (req.method === 'PATCH' && req.path === `/apps/${req.params.id}`) {
      if (!access.dining && req.body.dining) throw new HttpError(403, 'Configurações de salão não estão incluídas neste plano.');
      // WhatsApp is also the restaurant contact, not an entitlement to delivery.
      if (!access.delivery && req.body.delivery && Object.keys(req.body.delivery).some(key => key !== 'whatsapp')) throw new HttpError(403, 'Configurações de entrega não estão incluídas neste plano.');
    }
    next();
  } catch (error) { next(error); }
};
