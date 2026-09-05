import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { CookieOptions, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { Image } from '../models/Image.js';
import { User, hashPassword } from '../models/User.js';
import { toAvatarWebp } from '../services/imageProcessor.js';
import { sendResetCodeEmail } from '../services/mailer.js';
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

/**
 * Aceite dos Termos.
 *
 * `z.literal(true)` em vez de `z.boolean()`: recusa `false`, `"true"` e a
 * ausencia do campo. O aceite tem valor juridico, entao a validacao precisa
 * exigir a afirmacao explicita, nao apenas um campo presente.
 *
 * Vem do corpo em multipart no registro (tudo chega como string), por isso o
 * preprocess normaliza antes de comparar.
 */
const termsAccepted = z.preprocess(
  (value) => (value === 'true' || value === true ? true : value),
  z.literal(true, {
    errorMap: () => ({ message: 'E preciso aceitar os Termos de Uso e a Politica de Privacidade.' }),
  })
);

const registerSchema = z.object({
  termsAccepted,
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

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.').max(72),
  newPassword: z
    .string()
    .min(8, 'A nova senha precisa de ao menos 8 caracteres.')
    .max(72, 'A senha pode ter no maximo 72 caracteres.'),
});

const loginSchema = z.object({
  /** Aceita e-mail ou nome de usuario no mesmo campo. */
  identifier: z.string().trim().min(3, 'Informe seu e-mail ou nome de usuario.').max(160),
  password: z.string().min(1, 'Informe a senha.').max(72),
  termsAccepted,
});

/* ------------------------------------------------------------------ */
/* Recuperacao de senha                                                */
/* ------------------------------------------------------------------ */

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido.').max(160),
});

const resetSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido.').max(160),
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'O codigo tem 6 digitos.'),
  newPassword: z
    .string()
    .min(8, 'A nova senha precisa de ao menos 8 caracteres.')
    .max(72, 'A senha pode ter no maximo 72 caracteres.'),
});

/** Validade do codigo e teto de tentativas erradas antes de invalida-lo. */
const RESET_CODE_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;

/**
 * Codigo de 6 digitos com `randomInt`, nao `Math.random()`.
 * Math.random e previsivel: quem observa saidas suficientes consegue prever as
 * proximas, e aqui o codigo e a unica barreira entre um e-mail e a conta.
 */
function generateResetCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Exportado para o fluxo do Google emitir a sessao exatamente igual a local. */
export function authCookieOptions(): CookieOptions {
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
  isAdmin?: boolean;
  status: string;
  photo?: unknown;
  address?: unknown;
  createdAt?: Date;
  lastLoginAt?: Date | null;
  plan?: string | null;
  authProvider?: string;
  avatarUrl?: string;
  onboardingCompleted?: boolean;
  /** So chega aqui quando a consulta pediu `+passwordHash`. Nunca e devolvido. */
  passwordHash?: string | null;
}) {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username ?? null,
    displayName: user.displayName ?? '',
    phone: user.phone ?? '',
    role: user.role,
    isAdmin: user.isAdmin === true,
    status: user.status,
    photoUrl: user.photo ? `${env.publicUrl}/api/images/${String(user.photo)}` : null,
    address: user.address ?? null,
    createdAt: user.createdAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    plan: user.plan ?? null,
    authProvider: user.authProvider ?? 'local',
    /**
     * Foto do Google como fallback: se o dono subiu avatar proprio, `photoUrl`
     * tem precedencia e este campo fica so como reserva.
     */
    avatarUrl: user.avatarUrl ?? null,
    onboardingCompleted: user.onboardingCompleted !== false,
    /**
     * Booleano derivado — o hash NUNCA sai daqui. E o que diz ao front se deve
     * mostrar o card de troca de senha. Quando a consulta nao trouxe o hash,
     * caimos no provedor; `authProvider` sozinho ja se provou pouco confiavel
     * (uma conta com senha chegou a ficar marcada como 'google').
     */
    hasPassword:
      user.passwordHash !== undefined && user.passwordHash !== null
        ? Boolean(user.passwordHash)
        : (user.authProvider ?? 'local') !== 'google',
  };
}

/* ------------------------------------------------------------------ */
/* POST /api/auth/register                                             */
/* ------------------------------------------------------------------ */

export const register = async (req: Request, res: Response) => {
          try {
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
                      // Registra QUANDO houve o aceite: e a data que se prova depois.
                      termsAcceptedAt: new Date(),
                    });
                  } catch (error) {
                    // Nao deixa imagem orfa se a criacao do usuario falhar.
                    await Image.deleteOne({ _id: image._id });
                    throw error;
                  }

                  const token = signAccessToken({ sub: String(user._id), role: 'owner' });
                  res.cookie(env.auth.cookieName, token, authCookieOptions());

                  res.status(201).json({
                    ok: true,
                    data: { user: publicUser(user.toObject()) },
                    message: `Conta criada. Bem-vindo ao VaptApp, ${user.displayName || user.username}!`,
                  });

          } catch (error: any) {
            console.error('[API Error - register]:', error);
            
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

/* ------------------------------------------------------------------ */
/* POST /api/auth/login                                                */
/* ------------------------------------------------------------------ */

export const login = async (req: Request, res: Response) => {
          try {
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
                  res.cookie(env.auth.cookieName, token, authCookieOptions());

                  res.json({
                    ok: true,
                    data: { user: publicUser(user.toObject()) },
                    message: `Bem-vindo de volta, ${user.displayName || user.username}!`,
                  });

          } catch (error: any) {
            console.error('[API Error - login]:', error);
            
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

/* ------------------------------------------------------------------ */
/* POST /api/auth/logout                                               */
/* ------------------------------------------------------------------ */

export const logout = async (req: Request, res: Response) => {
          try {
            res.clearCookie(env.auth.cookieName, { ...authCookieOptions(), maxAge: undefined });
                  res.json({ ok: true, data: null, message: 'Sessao encerrada.' });

          } catch (error: any) {
            console.error('[API Error - logout]:', error);
            
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

/* ------------------------------------------------------------------ */
/* GET /api/auth/me                                                    */
/* ------------------------------------------------------------------ */

export const me = async (req: Request, res: Response) => {
          try {
            // `+passwordHash` alimenta `hasPassword` no publicUser; o hash nao sai na resposta.
            const user = await User.findById(req.user?.id).select('+passwordHash').lean();
                  if (!user) throw new HttpError(401, 'Sessao invalida.');

                  res.json({ ok: true, data: { user: publicUser(user) } });

          } catch (error: any) {
            console.error('[API Error - me]:', error);
            
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

/* ------------------------------------------------------------------ */
/* PATCH /api/auth/me                                                  */
/* ------------------------------------------------------------------ */

const updateSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  address: addressSchema.optional(),
  photo: z.string().trim().min(1).optional(),
});

export const updateMe = async (req: Request, res: Response) => {
          try {
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

          } catch (error: any) {
            console.error('[API Error - updateMe]:', error);
            
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

/* ------------------------------------------------------------------ */
/* PATCH /api/auth/password                                            */
/* ------------------------------------------------------------------ */

/**
 * Troca de senha do proprio usuario logado.
 *
 * Exige a senha atual mesmo havendo sessao valida: cookie sequestrado ou
 * maquina destravada nao devem bastar para trocar a credencial permanente.
 *
 * Conta so-Google nao tem senha para conferir — nesse caso respondemos 400
 * explicando, em vez de deixar a comparacao falhar como "senha errada".
 */
export const updatePassword = asyncHandler(async (req: Request, res: Response) => {
  const body = passwordSchema.parse(req.body);

  const user = await User.findById(req.user?.id).select('+passwordHash');
  if (!user) throw new HttpError(401, 'Sessao invalida.');

  if (!user.passwordHash) {
    throw new HttpError(
      400,
      'Esta conta entra pelo Google e ainda nao tem senha. Use "Entrar com o Google".'
    );
  }

  const matches = await user.comparePassword(body.currentPassword);
  if (!matches) {
    throw new HttpError(400, 'A senha atual esta incorreta.', [
      { field: 'currentPassword', message: 'Senha atual incorreta.' },
    ]);
  }

  if (body.currentPassword === body.newPassword) {
    throw new HttpError(400, 'A nova senha precisa ser diferente da atual.', [
      { field: 'newPassword', message: 'Escolha uma senha diferente da atual.' },
    ]);
  }

  user.passwordHash = await hashPassword(body.newPassword);
  // Conta que entrou pelo Google e agora define senha passa a ter os dois caminhos.
  if (user.googleId) user.authProvider = 'both';
  await user.save();

  res.json({ ok: true, data: null, message: 'Senha atualizada.' });
});

/* ------------------------------------------------------------------ */
/* POST /api/auth/forgot-password                                      */
/* ------------------------------------------------------------------ */

/**
 * Gera o codigo de 6 digitos e envia por e-mail.
 *
 * Responde SEMPRE a mesma coisa, exista ou nao a conta. Diferenciar as
 * respostas transformaria a rota num oraculo: qualquer um descobriria quais
 * e-mails tem cadastro no Vapt. O custo e nulo para quem e dono do e-mail —
 * ele recebe a mensagem de qualquer jeito.
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = forgotSchema.parse(req.body);

  const resposta = {
    ok: true,
    data: { expiresInMinutes: RESET_CODE_MINUTES },
    message: 'Se houver uma conta com este e-mail, o codigo chega em instantes.',
  };

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) return res.json(resposta);

  /*
   * Conta que so entra pelo Google nao tem senha para recuperar. Tambem nao
   * contamos isso ao chamador — mesma resposta de sempre.
   */
  if (!user.passwordHash) {
    console.warn(`[reset] ${email} entra so pelo Google: nada a recuperar.`);
    return res.json(resposta);
  }

  const code = generateResetCode();

  // Guardamos o HASH do codigo. Vazamento do banco nao entrega contas.
  user.set({
    resetPasswordCode: await bcrypt.hash(code, env.auth.bcryptRounds),
    resetPasswordExpires: new Date(Date.now() + RESET_CODE_MINUTES * 60_000),
    resetPasswordAttempts: 0,
  });
  await user.save();

  await sendResetCodeEmail(user.email, code, RESET_CODE_MINUTES);

  return res.json(resposta);
});

/* ------------------------------------------------------------------ */
/* POST /api/auth/reset-password                                       */
/* ------------------------------------------------------------------ */

/**
 * Valida o codigo e troca a senha.
 *
 * Um codigo de 6 digitos tem so 10^6 combinacoes: sem limite de tentativas,
 * um script quebra em minutos. Alem do rate limit por IP na rota, contamos as
 * tentativas erradas no proprio documento e queimamos o codigo ao estourar —
 * isso trava o ataque mesmo distribuido entre varios IPs.
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = resetSchema.parse(req.body);

  const invalido = new HttpError(400, 'Codigo invalido ou expirado. Peca um novo.', [
    { field: 'code', message: 'Codigo invalido ou expirado.' },
  ]);

  const user = await User.findOne({ email: body.email }).select(
    '+resetPasswordCode +resetPasswordExpires +resetPasswordAttempts'
  );

  if (!user || !user.resetPasswordCode || !user.resetPasswordExpires) throw invalido;

  if (user.resetPasswordExpires.getTime() < Date.now()) {
    user.set({ resetPasswordCode: null, resetPasswordExpires: null, resetPasswordAttempts: 0 });
    await user.save();
    throw invalido;
  }

  if ((user.resetPasswordAttempts ?? 0) >= RESET_MAX_ATTEMPTS) {
    user.set({ resetPasswordCode: null, resetPasswordExpires: null, resetPasswordAttempts: 0 });
    await user.save();
    throw new HttpError(429, 'Codigo bloqueado por tentativas erradas. Peca um novo.');
  }

  const confere = await bcrypt.compare(body.code, user.resetPasswordCode);

  if (!confere) {
    user.resetPasswordAttempts = (user.resetPasswordAttempts ?? 0) + 1;
    await user.save();
    throw invalido;
  }

  user.passwordHash = await hashPassword(body.newPassword);
  // Codigo e de uso unico: some assim que cumpre a funcao.
  user.set({ resetPasswordCode: null, resetPasswordExpires: null, resetPasswordAttempts: 0 });
  // Quem entrou pelo Google e definiu senha agora tem os dois caminhos.
  if (user.googleId) user.authProvider = 'both';
  await user.save();

  return res.json({ ok: true, data: null, message: 'Senha alterada. Ja pode entrar.' });
});

/* ------------------------------------------------------------------ */
/* GET /api/auth/check-username?value=...                              */
/* ------------------------------------------------------------------ */

export const checkUsername = async (req: Request, res: Response) => {
          try {
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

          } catch (error: any) {
            console.error('[API Error - checkUsername]:', error);
            
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
