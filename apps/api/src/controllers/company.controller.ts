import type { Request, Response } from 'express';
import { env } from '../config/env.js';

/** Dados publicos usados no rodape, botao flutuante do WhatsApp e secao de suporte. */
export function getCompanyInfo(_req: Request, res: Response) {
  res.json({
    ok: true,
    data: {
      name: env.company.name,
      cnpj: env.company.cnpj,
      city: env.company.city,
      email: env.company.email,
      whatsapp: env.company.whatsapp,
      whatsappUrl: `https://wa.me/${env.company.whatsapp}`,
      hours: env.company.hours,
    },
  });
}
