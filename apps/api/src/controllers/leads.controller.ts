import type { Request, Response } from 'express';
import { z } from 'zod';
import { Lead } from '../models/Lead.js';
import { asyncHandler } from '../middlewares/errorHandler.js';

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(120).optional(),
  email: z.string().trim().email('E-mail invalido').optional(),
  whatsapp: z
    .string()
    .trim()
    .min(10, 'WhatsApp precisa ter DDD + numero')
    .max(30)
    .optional(),
  restaurantName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  segment: z.enum(['restaurante', 'lanchonete', 'pizzaria', 'cafeteria', 'mercado', 'outro']).optional(),
  interestedPlan: z.string().trim().max(60).optional(),
  source: z.string().trim().max(60).optional(),
  demoStoreCode: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  utmSource: z.string().trim().max(120).optional(),
  utmMedium: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
});

export const createLead = asyncHandler(async (req: Request, res: Response) => {
  const body = leadSchema.parse(req.body);

  if (!body.email && !body.whatsapp) {
    return res.status(400).json({ ok: false, error: 'Informe ao menos um e-mail ou WhatsApp para contato.' });
  }

  const lead = await Lead.create({
    name: body.name,
    email: body.email,
    whatsapp: body.whatsapp,
    restaurantName: body.restaurantName,
    city: body.city,
    segment: body.segment ?? 'restaurante',
    interestedPlan: body.interestedPlan ?? null,
    source: body.source ?? 'landing',
    demoStoreCode: body.demoStoreCode ?? null,
    notes: body.notes,
    meta: {
      utmSource: body.utmSource ?? null,
      utmMedium: body.utmMedium ?? null,
      utmCampaign: body.utmCampaign ?? null,
      userAgent: req.get('user-agent') ?? null,
    },
  });

  return res.status(201).json({
    ok: true,
    data: { id: lead.id, createdAt: lead.createdAt },
    message: 'Recebemos seus dados. Um consultor de verdade vai te chamar no WhatsApp.',
  });
});
