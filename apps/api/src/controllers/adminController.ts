import type { Request, Response } from 'express';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/jwt.js';
import { env } from '../config/env.js';
import type { CookieOptions } from 'express';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.isProd ? 'none' : 'lax',
    secure: env.isProd,
    maxAge: env.auth.cookieMaxAgeMs,
    path: '/',
  };
}


export async function listUsers(req: Request, res: Response) {

      try {
        const page = parseInt(req.query.page as string) || 1;
          const limit = parseInt(req.query.limit as string) || 1000;
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

          const skip = (page - 1) * limit;
          
          const [users, totalUsers] = await Promise.all([
            User.find(query).select('-passwordHash').skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
            User.countDocuments(query)
          ]);

          const mappedUsers = users.map(user => ({
            ...user,
            id: String(user._id),
            photoUrl: user.photo ? `${env.publicUrl}/api/images/${String(user.photo)}` : null,
          }));

          res.json({
            ok: true,
            data: {
              users: mappedUsers,
              totalPages: Math.ceil(totalUsers / limit),
              currentPage: page,
              totalUsers
            }
          });

      } catch (error: any) {
        console.error('[API Error - listUsers]:', error);
        
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
}

export async function updateUserPlan(req: Request, res: Response) {

      try {
        const { id } = req.params;
          const { plan, planStartDate, planEndDate } = req.body;

          const user = await User.findById(id);
          if (!user) {
            return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
          }

          user.set('plan', plan || null);
          user.set('planStartDate', planStartDate ? new Date(planStartDate) : null);
          user.set('planEndDate', planEndDate ? new Date(planEndDate) : null);

          await user.save();

          const userObject = user.toObject();
          const mappedUser = {
            ...userObject,
            id: String(userObject._id),
            photoUrl: userObject.photo ? `${env.publicUrl}/api/images/${String(userObject.photo)}` : null,
          };

          res.json({
            ok: true,
            data: { user: mappedUser },
            message: 'Plano atualizado com sucesso.'
          });

      } catch (error: any) {
        console.error('[API Error - updateUserPlan]:', error);
        
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
}

export async function impersonateUser(req: Request, res: Response) {

      try {
        try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
          return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        }

        // Gera o token para o usuário alvo
        const token = signAccessToken({ sub: String(user._id), role: user.role as 'owner' | 'admin' });
        const adminToken = req.cookies[env.auth.cookieName] || req.cookies.token;

        // Substitui o cookie de sessão com o do novo usuário
        res.cookie(env.auth.cookieName, token, cookieOptions());

        const userObject = user.toObject();
        const mappedUser = {
          ...userObject,
          id: String(userObject._id),
          photoUrl: userObject.photo ? `${env.publicUrl}/api/images/${String(userObject.photo)}` : null,
        };

        // Retorna o token para o frontend trocar e redirecionar
        res.json({
          ok: true,
          data: { token, adminToken, user: mappedUser },
          message: 'Impersonation gerado com sucesso.'
        });
      } catch (error) {
        console.error('Erro no impersonateUser:', error);
        res.status(500).json({ ok: false, message: 'Erro interno ao gerar token' });
      }

      } catch (error: any) {
        console.error('[API Error - impersonateUser]:', error);
        
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
}
