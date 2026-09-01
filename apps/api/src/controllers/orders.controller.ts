import type { Request, Response } from 'express';
import { Order } from '../models/Order.js';
import { AppProject } from '../models/AppProject.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../middlewares/errorHandler.js';

export const createOrder = async (req: Request, res: Response) => {
          try {
            const app = await AppProject.findById(req.body.appId);
                  if (!app) throw HttpError.notFound('App não encontrado');

                  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
                  
                  const order = new Order({
                    ...req.body,
                    code,
                    status: 'novo',
                  });
                  
                  await order.save();
                  res.status(201).json({ ok: true, data: order });

          } catch (error: any) {
            console.error('[API Error - createOrder]:', error);
            
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

export const getOrders = async (req: Request, res: Response) => {
          try {
            const { appId, status } = req.query;
                  if (!appId) throw HttpError.badRequest('appId é obrigatório');
                  
                  const query: any = { appId };
                  if (status) query.status = status;

                  const orders = await Order.find(query).sort({ createdAt: -1 });
                  res.json({ ok: true, data: orders });

          } catch (error: any) {
            console.error('[API Error - getOrders]:', error);
            
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

export const updateOrderStatus = async (req: Request, res: Response) => {
          try {
            const order = await Order.findById(req.params.id);
                  if (!order) throw HttpError.notFound('Pedido não encontrado');

                  if (req.body.status) order.status = req.body.status;
                  if (req.body.deliveryFee !== undefined) {
                    order.deliveryFee = req.body.deliveryFee;
                    order.total = order.subtotal + order.serviceFee + order.deliveryFee;
                  }

                  await order.save();
                  res.json({ ok: true, data: order });

          } catch (error: any) {
            console.error('[API Error - updateOrderStatus]:', error);
            
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
