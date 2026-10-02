import mongoose, { type ClientSession } from 'mongoose';
import { User } from '../models/User.js';
import { AppProject } from '../models/AppProject.js';
import { HttpError } from '../utils/httpError.js';
import { planAccess } from '../utils/planAccess.js';

/** A write on the owner serializes competing creations, including across servers.
 * The count and insert share a transaction: failures never consume a slot. */
export async function createWithinRestaurantQuota<T>(ownerId: string, plan: string, platformAdmin: boolean,
  create: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (platformAdmin) return create();
  return mongoose.connection.transaction(async session => {
    const owner = await User.findOneAndUpdate({ _id: ownerId }, { $inc: { subscriptionRevision: 1 } }, { new: true, session });
    if (!owner) throw HttpError.notFound('Conta não encontrada.');
    const official = planAccess(plan).official;
    if (official) {
      const subscription = String(owner.plan ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const entitled = /completo|master/.test(subscription) || (plan.endsWith('_SALAO') && subscription.includes('salao')) || (plan.endsWith('_DELIVERY') && subscription.includes('delivery'));
      if (!entitled || owner.status !== 'ativo' || (owner.planEndDate && owner.planEndDate.getTime() <= Date.now()))
        throw new HttpError(403, 'Sua assinatura não permite criar este aplicativo oficial.');
    }
    // One subscription is stored per account, so all official variants share its slot.
    const existing = await AppProject.exists({ owner: ownerId, appPlanType: official ? /^OFICIAL_/ : plan }).session(session);
    if (existing) throw new HttpError(409, official
      ? 'Sua assinatura já possui um restaurante oficial. Acesse o aplicativo existente ou fale com o suporte.'
      : 'Você já possui um aplicativo de teste deste plano. Acesse o aplicativo existente.');
    return create(session);
  });
}
