const fs = require('fs');
const path = require('path');

const cwd = 'c:/Users/seuma/Desktop/PROJETOS/Vapt';

// 1. Update User schema
const userModelPath = path.join(cwd, 'apps/api/src/models/User.ts');
if (fs.existsSync(userModelPath)) {
  let userTs = fs.readFileSync(userModelPath, 'utf8');
  if (!userTs.includes('isAdmin: { type: Boolean')) {
    userTs = userTs.replace(/status: \{ type: String, enum: \['ativo', 'suspenso'\], default: 'ativo' \},/, 
      "status: { type: String, enum: ['ativo', 'suspenso'], default: 'ativo' },\n    isAdmin: { type: Boolean, default: false },");
    fs.writeFileSync(userModelPath, userTs);
  }
}

// 2. Create adminGuard.ts
const adminGuardCode = `import type { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { env } from '../config/env.js';

function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.auth.cookieName];
  if (cookieToken) return cookieToken;
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

export async function adminGuard(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw new HttpError(401, 'Faça login para continuar.');
    const payload = verifyAccessToken(token);
    if (!payload) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    
    const user = await User.findById(payload.sub).select('isAdmin status').lean();
    if (!user) throw new HttpError(401, 'Conta não encontrada.');
    if (user.status !== 'ativo') throw new HttpError(403, 'Conta suspensa.');
    if (user.isAdmin !== true) throw new HttpError(403, 'Acesso negado. Privilégios de administrador necessários.');
    
    next();
  } catch (error) {
    next(error);
  }
}
`;
fs.writeFileSync(path.join(cwd, 'apps/api/src/middlewares/adminGuard.ts'), adminGuardCode);

// 3. Create adminController.ts
const adminControllerCode = `import type { Request, Response } from 'express';
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
`;
fs.writeFileSync(path.join(cwd, 'apps/api/src/controllers/adminController.ts'), adminControllerCode);

// 4. Create adminRoutes.ts
const adminRoutesCode = `import { Router } from 'express';
import { adminGuard } from '../middlewares/adminGuard.js';
import { listUsers } from '../controllers/adminController.js';

export const adminRoutes = Router();

adminRoutes.use(adminGuard);
adminRoutes.get('/users', listUsers);
`;
fs.writeFileSync(path.join(cwd, 'apps/api/src/routes/adminRoutes.ts'), adminRoutesCode);

// 5. Update app.ts
const appTsPath = path.join(cwd, 'apps/api/src/app.ts');
if (fs.existsSync(appTsPath)) {
  let appTs = fs.readFileSync(appTsPath, 'utf8');
  if (!appTs.includes('/api/admin')) {
    appTs = appTs.replace(/import \{ appRoutes \} from '\.\/routes\/appRoutes\.js';/, "import { appRoutes } from './routes/appRoutes.js';\nimport { adminRoutes } from './routes/adminRoutes.js';");
    appTs = appTs.replace(/app\.use\('\/api\/apps', appRoutes\);/, "app.use('/api/apps', appRoutes);\napp.use('/api/admin', adminRoutes);");
    fs.writeFileSync(appTsPath, appTs);
  }
}
