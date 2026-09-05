import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/httpError.js';
import { verifyDeviceAccessToken, type DevicePayload } from '../utils/deviceToken.js';

/**
 * Autentica requisicoes vindas do app da equipe.
 *
 * Le o Bearer token, NAO o cookie: a WebView do Capacitor roda em
 * `capacitor://localhost` e nao compartilha cookie com o dominio da API.
 *
 * Nao consulta o banco. O access token e curto (10 min por padrao) e essa
 * brevidade e o que substitui a checagem por requisicao: revogar a sessao
 * derruba o refresh imediatamente, e o access morre sozinho logo depois.
 * Trocar isso por um SELECT a cada chamada custaria uma ida ao banco em todo
 * request do app, o dia inteiro, para ganhar alguns minutos de reacao.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: DevicePayload;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function requireDevice(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next(new HttpError(401, 'Faca login no aplicativo para continuar.'));

  const payload = verifyDeviceAccessToken(token);
  if (!payload) return next(new HttpError(401, 'Sessao do aplicativo expirada. Entre novamente.'));

  /*
   * Device binding tambem no acesso, e o cabecalho e OBRIGATORIO.
   *
   * Aceitar a ausencia do cabecalho anularia o controle: bastaria omiti-lo
   * para usar um access token roubado em qualquer aparelho pelos 10 minutos
   * de vida dele. Como o cliente e o nosso proprio app, exigir e barato.
   */
  const deviceHeader = String(req.headers['x-device-id'] ?? '').trim();
  if (!deviceHeader) {
    return next(new HttpError(401, 'Identificacao do aparelho ausente.'));
  }
  if (deviceHeader !== payload.did) {
    return next(new HttpError(401, 'Este acesso pertence a outro aparelho.'));
  }

  req.device = payload;
  return next();
}

/**
 * RBAC por aba. `requirePermission('cozinha')` recusa quem nao tem a funcao.
 *
 * As permissoes vem do token, gravadas na emissao e reescritas a cada
 * rotacao — mudanca de funcao passa a valer na renovacao seguinte.
 */
export function requirePermission(...permissoes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const atuais = req.device?.perms ?? [];
    const autorizado = permissoes.some((p) => atuais.includes(p));

    if (!autorizado) {
      return next(new HttpError(403, 'Sua funcao nao tem acesso a esta area.'));
    }
    return next();
  };
}
