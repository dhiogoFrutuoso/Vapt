import type { Request, Response } from 'express';
import { Order } from '../models/Order.js';
import { AppProject } from '../models/AppProject.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../middlewares/errorHandler.js';

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const { appId, status } = req.query;
  if (!appId) throw HttpError.badRequest('appId é obrigatório');
  
  const query: any = { appId };
  if (status) query.status = status;

  const orders = await Order.find(query).sort({ createdAt: -1 });
  res.json({ ok: true, data: orders });
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw HttpError.notFound('Pedido não encontrado');

  if (req.body.status) order.status = req.body.status;
  if (req.body.deliveryFee !== undefined) {
    order.deliveryFee = req.body.deliveryFee;
    order.total = order.subtotal + order.serviceFee + order.deliveryFee;
  }

  await order.save();
  res.json({ ok: true, data: order });
});
