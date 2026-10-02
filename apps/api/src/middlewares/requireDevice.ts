import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/httpError.js';
import { verifyDeviceAccessToken, type DevicePayload } from '../utils/deviceToken.js';
import { AppProject } from '../models/AppProject.js';
import { effectivePermissions } from '../utils/planAccess.js';

/**
 * Autentica requisicoes vindas do app da equipe.
 *
 * Le o Bearer token, NAO o cookie: a WebView do Capacitor roda em
 * `capacitor://localhost` e nao compartilha cookie com o dominio da API.
 *
 * Aplica Zero Trust por requisicao: o token prova a sessao e o banco fornece
 * o estado e as permissoes atuais. Bloqueios e trocas de tag passam a valer
 * imediatamente, sem esperar a expiracao do access token.
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

export async function requireDevice(req: Request, _res: Response, next: NextFunction) {
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

  try {
    /* A permissão efetiva vem do cadastro atual, não do snapshot do JWT.
       Assim uma tag removida fecha a rota na requisição seguinte. */
    const app = await AppProject.findOne({ _id: payload.app, 'employees._id': payload.sub })
      .select('employees roles status appPlanType')
      .lean();
    if (!app || app.status === 'pausado') {
      return next(new HttpError(401, 'Este acesso não está mais disponível.'));
    }
    const employee = (app.employees ?? []).find((item) => String(item._id) === payload.sub);
    if (!employee || employee.blocked) {
      return next(new HttpError(401, 'Seu acesso foi bloqueado.'));
    }
    const role = (app.roles ?? []).find((item) => String(item._id) === String(employee.roleId));
    req.device = { ...payload, planType: app.appPlanType, perms: effectivePermissions(app.appPlanType, (role?.permissions ?? []).map(String)) };
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * RBAC por aba. `requirePermission('cozinha')` recusa quem nao tem a funcao.
 *
 * As permissoes efetivas foram revalidadas no banco pela middleware acima.
 */
export function requirePermission(...permissoes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const atuais = req.device?.perms ?? [];
    const autorizado = atuais.includes('administracao') || permissoes.some((p) => atuais.includes(p));

    if (!autorizado) {
      return next(new HttpError(403, 'Sua funcao nao tem acesso a esta area.'));
    }
    return next();
  };
}
