import type { Request, Response } from 'express';
import { Plan } from '../models/Plan.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { fallbackPlans } from '../seed/plans.data.js';

export const listPlans = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await Plan.find({ active: true }).sort({ order: 1 }).lean();
  // Se o banco ainda nao foi populado, a landing nunca fica sem preco.
  const data = plans.length > 0 ? plans : fallbackPlans;
  res.json({ ok: true, data });
});
