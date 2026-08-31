import type { CookieOptions, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { Image } from '../models/Image.js';
import { User, hashPassword } from '../models/User.js';
import { toAvatarWebp } from '../services/imageProcessor.js';
import { HttpError } from '../utils/httpError.js';
import { signAccessToken } from '../utils/jwt.js';

/* ------------------------------------------------------------------ */
/* Validacao                                                           */
/* ------------------------------------------------------------------ */

const addressSchema = z.object({
  zip: z.string().trim().max(12).optional().default(''),
  street: z.string().trim().min(3, 'Informe a rua.').max(140),
  number: z.string().trim().min(1, 'Informe o numero.').max(20),
  complement: z.string().trim().max(80).optional().default(''),
  district: z.string().trim().min(2, 'Informe o bairro.').max(80),
  city: z.string().trim().min(2, 'Informe a cidade.').max(80),
  state: z.string().trim().length(2, 'Use a sigla do estado, com 2 letras.'),
  reference: z.string().trim().max(200).optional().default(''),
});

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail invalido.').max(160),
  password: z
    .string()
    .min(8, 'A senha precisa de ao menos 8 caracteres.')
    .max(72, 'A senha pode ter no maximo 72 caracteres.'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .max(40, 'O nome de usuario pode ter no maximo 40 caracteres.')
    .regex(/^[a-z0-9._-]*$/, 'Use apenas letras, numeros, ponto, hifen e underline.')
    .optional()
    .transform(val => val === '' ? undefined : val),
  displayName: z.string().trim().max(80).optional().default(''),
  phone: z.string().trim().max(30).optional().default(''),
  address: z.string().transform((val) => {
    try {
      return addressSchema.parse(JSON.parse(val));
    } catch {
      throw new Error('Endereço inválido');
    }
  }),
});

const loginSchema = z.object({
  /** Aceita e-mail ou nome de usuario no mesmo campo. */
  identifier: z.string().trim().min(3, 'Informe seu e-mail ou nome de usuario.').max(160),
  password: z.string().min(1, 'Informe a senha.').max(72),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.isProd ? 'none' : 'lax',
    secure: env.isProd,
    maxAge: env.auth.cookieMaxAgeMs,
    path: '/',
  };
}

/** Formato unico do usuario devolvido ao front. Nunca inclui hash de senha. */
function publicUser(user: {
  _id: unknown;
  email: string;
  username?: string | null;
  displayName?: string;
  phone?: string;
  role: string;
  status: string;
  photo?: unknown;
  address?: unknown;
  createdAt?: Date;
  lastLoginAt?: Date | null;
}) {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username ?? null,
    displayName: user.displayName ?? '',
    phone: user.phone ?? '',
    role: user.role,
    status: user.status,
    photoUrl: user.photo ? `/api/images/${String(user.photo)}` : null,
    address: user.address ?? null,
    createdAt: user.createdAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* POST /api/auth/register                                             */
/* ------------------------------------------------------------------ */

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);
  if (!req.file) throw HttpError.badRequest('Envie uma foto de perfil.');

  // Checagem amigavel antes de gravar: erro por campo, nao um 11000 cru.
  const [emailTaken, usernameTaken] = await Promise.all([
    User.exists({ email: body.email }),
    body.username ? User.exists({ username: body.username }) : Promise.resolve(false),
  ]);

  if (emailTaken) {
    throw HttpError.conflict('Ja existe uma conta com esse e-mail. Tente entrar.');
  }
  if (usernameTaken) {
    throw HttpError.conflict('Esse nome de usuario ja esta em uso. Escolha outro.');
  }

  // Converte a foto para WEBP ANTES de qualquer escrita no banco:
  // se a imagem for invalida, nada e criado pela metade.
  const base64Input = req.file.buffer.toString('base64');
  const processed = await toAvatarWebp(base64Input);
  const passwordHash = await hashPassword(body.password);

  const userId = new mongoose.Types.ObjectId();

  const image = await Image.create({
    owner: userId,
    kind: 'avatar',
    mimeType: processed.mimeType,
    data: processed.base64,
    width: processed.width,
    height: processed.height,
    bytes: processed.bytes,
  });

  let user;
  try {
    user = await User.create({
      _id: userId,
      email: body.email,
      username: body.username,
      displayName: body.displayName || body.username || body.email.split('@')[0],
      phone: body.phone,
      passwordHash,
      address: body.address,
      photo: image._id,
    });
  } catch (error) {
    // Nao deixa imagem orfa se a criacao do usuario falhar.
    await Image.deleteOne({ _id: image._id });
    throw error;
  }

  const token = signAccessToken({ sub: String(user._id), role: 'owner' });
  res.cookie(env.auth.cookieName, token, cookieOptions());

  res.status(201).json({
    ok: true,
    data: { user: publicUser(user.toObject()) },
    message: `Conta criada. Bem-vindo ao VaptApp, ${user.displayName || user.username}!`,
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/auth/login                                                */
/* ------------------------------------------------------------------ */

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const identifier = body.identifier.toLowerCase();

  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  }).select('+passwordHash');

  // Mesma mensagem para usuario inexistente e senha errada:
  // nao entregamos de graca quais e-mails existem na base.
  const genericError = new HttpError(401, 'E-mail, usuario ou senha incorretos.');
  if (!user) throw genericError;

  const matches = await user.comparePassword(body.password);
  if (!matches) throw genericError;

  if (user.status !== 'ativo') {
    throw new HttpError(403, 'Sua conta esta suspensa. Fale com o suporte.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAccessToken({ sub: String(user._id), role: user.role as 'owner' | 'admin' });
  res.cookie(env.auth.cookieName, token, cookieOptions());

  res.json({
    ok: true,
    data: { user: publicUser(user.toObject()) },
    message: `Bem-vindo de volta, ${user.displayName || user.username}!`,
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/auth/logout                                               */
/* ------------------------------------------------------------------ */

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(env.auth.cookieName, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true, data: null, message: 'Sessao encerrada.' });
});

/* ------------------------------------------------------------------ */
/* GET /api/auth/me                                                    */
/* ------------------------------------------------------------------ */

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user?.id).lean();
  if (!user) throw new HttpError(401, 'Sessao invalida.');

  res.json({ ok: true, data: { user: publicUser(user) } });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/auth/me                                                  */
/* ------------------------------------------------------------------ */

const updateSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  address: addressSchema.optional(),
  photo: z.string().trim().min(1).optional(),
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);

  const user = await User.findById(req.user?.id);
  if (!user) throw new HttpError(401, 'Sessao invalida.');

  if (body.displayName !== undefined) user.displayName = body.displayName;
  if (body.phone !== undefined) user.phone = body.phone;
  if (body.address) user.set('address', body.address);

  if (body.photo) {
    const processed = await toAvatarWebp(body.photo);
    const image = await Image.create({
      owner: user._id,
      kind: 'avatar',
      mimeType: processed.mimeType,
      data: processed.base64,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
    });

    const previousPhoto = user.photo;
    user.photo = image._id;
    if (previousPhoto) await Image.deleteOne({ _id: previousPhoto });
  }

  await user.save();

  res.json({ ok: true, data: { user: publicUser(user.toObject()) }, message: 'Perfil atualizado.' });
});

/* ------------------------------------------------------------------ */
/* GET /api/auth/check-username?value=...                              */
/* ------------------------------------------------------------------ */

export const checkUsername = asyncHandler(async (req: Request, res: Response) => {
  const value = String(req.query.value ?? '')
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9._-]{1,40}$/.test(value)) {
    return res.json({
      ok: true,
      data: { available: false, reason: 'Use até 40 caracteres: letras, números, ponto, hífen ou underline.' },
    });
  }

  const taken = await User.exists({ username: value });
  return res.json({ ok: true, data: { available: !taken, reason: taken ? 'Ja esta em uso.' : null } });
});
