import crypto from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { OAuth2Client, type TokenPayload as GoogleIdTokenPayload } from 'google-auth-library';
import { env } from '../config/env.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { signAccessToken } from '../utils/jwt.js';
import { authCookieOptions } from './auth.controller.js';

/**
 * Login/cadastro com Google (OAuth 2.0, Authorization Code).
 *
 * Por que google-auth-library e nao Passport: esta API e stateless — a sessao
 * e um JWT em cookie httpOnly, nao ha express-session. Passport traria uma
 * camada de sessao e serializacao que nao usariamos, e o unico ganho seria a
 * padronizacao de estrategias que aqui e uma so. A biblioteca oficial faz a
 * troca do code e a verificacao do id_token, que e tudo o que falta.
 *
 * Fluxo:
 *   1. GET /api/auth/google          -> gera `state`, guarda em cookie curto,
 *                                       redireciona para o consentimento;
 *   2. Google devolve em ?code=&state=;
 *   3. GET /api/auth/google/callback -> confere o `state`, troca o code,
 *                                       verifica o id_token, cria/vincula o
 *                                       usuario, emite o nosso JWT e manda o
 *                                       lojista para o painel ou o onboarding.
 */

/** Cookie de CSRF do OAuth: vida curta, so precisa sobreviver ao round-trip. */
const STATE_COOKIE = 'vapt_oauth_state';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function stateCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // O retorno do Google e uma navegacao top-level de outro site: com
    // sameSite 'strict' o cookie nao viajaria e todo login falharia.
    sameSite: env.isProd ? 'none' : 'lax',
    secure: env.isProd,
    maxAge: STATE_MAX_AGE_MS,
    path: '/',
  };
}

function client(): OAuth2Client {
  if (!env.google.enabled) {
    throw new HttpError(503, 'Login com Google nao esta configurado nesta instalacao.');
  }

  return new OAuth2Client({
    clientId: env.google.clientId,
    clientSecret: env.google.clientSecret,
    redirectUri: env.google.redirectUri,
  });
}

/** Manda o navegador de volta ao painel com uma mensagem legivel na querystring. */
function redirectToWeb(res: Response, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${env.webUrl}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return res.redirect(url.toString());
}

/**
 * Deriva um nome de usuario livre a partir do e-mail.
 * O username tem indice unico: sem esta busca, o segundo "joao" a entrar pelo
 * Google quebraria com E11000 no meio do callback.
 */
async function uniqueUsername(email: string): Promise<string | undefined> {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20);

  if (base.length < 4) return undefined;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}${attempt}`.slice(0, 24);
    const taken = await User.exists({ username: candidate });
    if (!taken) return candidate;
  }

  // Desistiu de adivinhar: deixa vazio (o indice e sparse) e o onboarding pede.
  return undefined;
}

/* ------------------------------------------------------------------ */
/* GET /api/auth/google                                                */
/* ------------------------------------------------------------------ */

export const googleStart = asyncHandler(async (req: Request, res: Response) => {
  const oauth = client();

  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, stateCookieOptions());

  /*
   * `prompt` so entra quando pedido de verdade: a chave presente com valor
   * vazio vira "prompt=" na URL e o Google trata como parametro invalido.
   */
  const prompt = typeof req.query.prompt === 'string' ? req.query.prompt.trim() : '';

  const url = oauth.generateAuthUrl({
    // Nao pedimos refresh_token: so precisamos da identidade uma vez, no login.
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    ...(prompt ? { prompt } : {}),
  });

  return res.redirect(url);
});

/* ------------------------------------------------------------------ */
/* GET /api/auth/google/callback                                       */
/* ------------------------------------------------------------------ */

export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const oauth = client();

  // O Google avisa aqui quando o usuario clica em "Cancelar".
  if (typeof req.query.error === 'string') {
    return redirectToWeb(res, '/login', { erro: 'google_cancelado' });
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const expectedState = (req.cookies?.[STATE_COOKIE] as string | undefined) ?? '';

  res.clearCookie(STATE_COOKIE, { path: '/' });

  if (!code) {
    return redirectToWeb(res, '/login', { erro: 'google_sem_codigo' });
  }

  // Comparacao em tempo constante: o state e um segredo de uso unico.
  const stateOk =
    state.length > 0 &&
    state.length === expectedState.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState));

  if (!stateOk) {
    return redirectToWeb(res, '/login', { erro: 'google_state_invalido' });
  }

  /*
   * Estas duas chamadas saem para a rede e sao as que mais falham em
   * producao — quase sempre por `redirect_uri` divergente do cadastrado no
   * Console, credencial trocada entre ambientes ou code ja usado. Sem o
   * try/catch elas subiam como excecao e viravam um 500 generico, sem pista
   * nenhuma para quem esta na tela nem para quem le o log.
   */
  let idToken: string;

  try {
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) {
      return redirectToWeb(res, '/login', { erro: 'google_sem_identidade' });
    }
    idToken = tokens.id_token;
  } catch (error) {
    console.error('[google] troca do code falhou.', {
      redirectUri: env.google.redirectUri,
      motivo: error instanceof Error ? error.message : String(error),
    });
    return redirectToWeb(res, '/login', { erro: 'google_token_falhou' });
  }

  let payload: GoogleIdTokenPayload | undefined;

  try {
    const ticket = await oauth.verifyIdToken({
      idToken,
      audience: env.google.clientId as string,
    });
    payload = ticket.getPayload();
  } catch (error) {
    console.error('[google] id_token invalido.', {
      motivo: error instanceof Error ? error.message : String(error),
    });
    return redirectToWeb(res, '/login', { erro: 'google_identidade_invalida' });
  }

  const googleId = payload?.sub;
  const email = payload?.email?.toLowerCase().trim();

  if (!googleId || !email) {
    return redirectToWeb(res, '/login', { erro: 'google_sem_email' });
  }

  /*
   * E-mail nao verificado nao serve para vincular conta: quem controla um
   * e-mail nao confirmado poderia sequestrar uma conta local existente com
   * o mesmo endereco.
   */
  if (payload?.email_verified === false) {
    return redirectToWeb(res, '/login', { erro: 'google_email_nao_verificado' });
  }

  const displayName = (payload?.name ?? '').trim().slice(0, 80);
  const avatarUrl = (payload?.picture ?? '').trim().slice(0, 400);

  /* --- 1) Ja entrou por aqui antes --------------------------------- */
  let user = await User.findOne({ googleId });

  /* --- 2) Conta local com o mesmo e-mail: vincula ------------------ */
  if (!user) {
    /*
     * `+passwordHash` e obrigatorio aqui. O campo tem `select: false`, entao
     * um findOne comum devolve o documento SEM ele — e a checagem abaixo
     * concluia "nao tem senha" para toda conta local, gravando
     * authProvider 'google' numa conta que na verdade tem os dois caminhos
     * de login. O registro passava a mentir sobre como o dono entra.
     */
    const byEmail = await User.findOne({ email }).select('+passwordHash');

    if (byEmail) {
      byEmail.set({
        googleId,
        authProvider: byEmail.passwordHash ? 'both' : 'google',
        // Nao sobrescreve o que o dono ja personalizou no painel.
        avatarUrl: byEmail.avatarUrl || avatarUrl,
        displayName: byEmail.displayName || displayName,
      });
      user = byEmail;
    }
  }

  /* --- 3) Primeiro acesso: cria em estado de onboarding ------------ */
  let isFirstAccess = false;

  if (!user) {
    isFirstAccess = true;
    user = new User({
      email,
      googleId,
      authProvider: 'google',
      displayName,
      avatarUrl,
      username: await uniqueUsername(email),
      // Sem senha e sem endereco: o schema so exige isso de conta local.
      onboardingCompleted: false,
    });
  }

  if (user.status === 'suspenso') {
    return redirectToWeb(res, '/login', { erro: 'conta_suspensa' });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAccessToken({
    sub: String(user._id),
    role: user.role === 'admin' ? 'admin' : 'owner',
  });

  res.cookie(env.auth.cookieName, token, authCookieOptions());

  /*
   * Onboarding: o lojista precisa completar loja/slug antes do painel.
   * Quem ja completou (ou veio de conta local vinculada) segue direto.
   */
  if (isFirstAccess || user.onboardingCompleted === false) {
    return redirectToWeb(res, '/onboarding', { origem: 'google' });
  }

  return redirectToWeb(res, '/painel', { bemvindo: '1' });
});

/* ------------------------------------------------------------------ */
/* GET /api/auth/google/status                                         */
/* ------------------------------------------------------------------ */

/** O front usa isto para so mostrar o botao "Entrar com Google" quando ha credencial. */
export const googleStatus = asyncHandler(async (_req: Request, res: Response) => {
  return res.json({ ok: true, data: { enabled: env.google.enabled } });
});
