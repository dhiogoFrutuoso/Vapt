import type { Request, Response } from 'express';
import { Plan } from '../models/Plan.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { fallbackPlans } from '../seed/plans.data.js';

export const listPlans = async (req: Request, res: Response) => {
          try {
            const plans = await Plan.find({ active: true }).sort({ order: 1 }).lean();
                  // Se o banco ainda nao foi populado, a landing nunca fica sem preco.
                  const data = plans.length > 0 ? plans : fallbackPlans;
                  res.json({ ok: true, data });

          } catch (error: any) {
            console.error('[API Error - listPlans]:', error);
            
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
