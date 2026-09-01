import type { Request, Response } from 'express';
import { z } from 'zod';
import { SupportRequest } from '../models/SupportRequest.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { env } from '../config/env.js';

const schema = z.object({
  name: z.string().trim().min(2, 'Como podemos te chamar?').max(120),
  whatsapp: z.string().trim().min(10, 'Informe DDD + numero').max(30),
  restaurantName: z.string().trim().max(120).optional(),
  topic: z.enum(['montagem', 'cardapio', 'fotos', 'pagamentos', 'app_equipe', 'outro']).optional(),
  message: z.string().trim().max(1000).optional(),
  bestTime: z.enum(['manha', 'tarde', 'noite', 'qualquer']).optional(),
});

export const createSupportRequest = async (req: Request, res: Response) => {
          try {
            const body = schema.parse(req.body);
                  const request = await SupportRequest.create(body);

                  const text = encodeURIComponent(
                    `Ola! Sou ${body.name}${body.restaurantName ? ` do ${body.restaurantName}` : ''} e quero ajuda para montar meu VaptApp.`
                  );

                  res.status(201).json({
                    ok: true,
                    data: {
                      id: request.id,
                      whatsappUrl: `https://wa.me/${env.company.whatsapp}?text=${text}`,
                    },
                    message: 'Recebemos! Uma pessoa de verdade te chama no WhatsApp em ate 10 minutos no horario comercial.',
                  });

          } catch (error: any) {
            console.error('[API Error - createSupportRequest]:', error);
            
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
