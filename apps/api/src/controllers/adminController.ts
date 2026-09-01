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

  // Se tivéssemos um isSubscribed ou plan filters reais, aplicaríamos ao query aqui.
  // if (isSubscribed === 'true') { }

  const skip = (page - 1) * limit;
  
  const [users, totalUsers] = await Promise.all([
    User.find(query).select('-passwordHash').skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
    User.countDocuments(query)
  ]);

  res.json({
    users,
    totalPages: Math.ceil(totalUsers / limit),
    currentPage: page,
    totalUsers
  });
}
