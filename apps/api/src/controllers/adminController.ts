import type { Request, Response } from 'express';
import { User } from '../models/User.js';

export async function listUsers(req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 30;
  const search = (req.query.search as string) || '';
  const isSubscribed = req.query.isSubscribed as string;
  const plan = req.query.plan as string;

  const query: any = {};
  
  if (search) {
    query.$or = [
      { displayName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  if (isSubscribed === 'true') {
     query.status = 'ativo';
  } else if (isSubscribed === 'false') {
     query.status = { $ne: 'ativo' };
  }

  // Filtragem de plano exata (Delivery, Salão-Caixa, Completo).
  // Se futuramente a app injetar isso no User (ex: user.plan), já estará suportado.
  // if (plan === 'Delivery' || plan === 'Salão-Caixa' || plan === 'Completo') {
  //    query.plan = plan; 
  // }

  const skip = (page - 1) * limit;
  
  const [users, totalUsers] = await Promise.all([
    User.find(query).select('-passwordHash').skip(skip).limit(limit).sort({ createdAt: -1 }).lean({ virtuals: true }),
    User.countDocuments(query)
  ]);

  res.json({
    ok: true,
    data: {
      users,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
      totalUsers
    }
  });
}
