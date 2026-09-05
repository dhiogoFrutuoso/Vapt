import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { verifyDeviceAccessToken } from '../utils/deviceToken.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppProject } from '../models/AppProject.js';

/**
 * Motor de tempo real.
 *
 * O painel e o app da equipe ficam abertos o turno inteiro. Sem push, a
 * Recepção só descobre um pedido novo quando alguém troca de aba — e um
 * pedido que ninguém vê é um cliente esperando.
 *
 * SALAS POR RESTAURANTE
 * ---------------------
 * Cada conexão entra na sala do próprio `appId`. Sem isso, um `io.emit()`
 * mandaria o pedido do restaurante A para a cozinha do restaurante B — o pior
 * vazamento possível num SaaS multi-inquilino, e silencioso: as telas
 * simplesmente mostrariam pedidos que não são delas.
 *
 * A sala NÃO vem do cliente. Ele manda um token; o servidor extrai o `appId`
 * de dentro dele e confere. Aceitar "me coloque na sala X" pelo socket seria
 * o mesmo vazamento, só que pedido educadamente.
 */

export type EventoPedido = {
  orderId: string;
  code?: string;
  customerName?: string;
  status?: string;
  source?: string;
};

let io: SocketServer | null = null;

/** Nome da sala. Uma função para não haver duas convenções no código. */
function sala(appId: string): string {
  return `app:${appId}`;
}

/**
 * Autentica a conexão.
 *
 * Dois tipos de cliente com credenciais diferentes:
 *   painel → cookie de sessão do dono (JWT do painel), e o appId vem no handshake
 *            mas é CONFERIDO contra a posse do aplicativo;
 *   app    → Bearer token do funcionário, que já carrega o appId assinado.
 */
async function autenticar(socket: Socket): Promise<{ appId: string } | null> {
  const { token, appId } = socket.handshake.auth as { token?: string; appId?: string };
  if (!token) return null;

  /* 1) Token do app da equipe: o appId vem assinado dentro dele. */
  const doApp = verifyDeviceAccessToken(token);
  if (doApp) return { appId: doApp.app };

  /* 2) Token do painel: precisa provar que o dono é dono DESTE aplicativo. */
  const doPainel = verifyAccessToken(token);
  if (doPainel && appId) {
    const existe = await AppProject.exists({ _id: appId, owner: doPainel.sub });
    if (existe) return { appId };
    console.warn('[socket] Dono tentou entrar em sala de aplicativo que nao e dele.', {
      userId: doPainel.sub,
      appId,
    });
  }

  return null;
}

export function initRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    /*
     * As mesmas origens do CORS HTTP, incluindo as da WebView do Capacitor.
     * O Socket.io tem configuração de CORS própria: liberar no Express não
     * libera aqui, e o sintoma é um handshake que falha sem mensagem clara.
     */
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
    /*
     * Polling primeiro, upgrade para WebSocket depois. Rede de restaurante
     * costuma ter proxy que bloqueia WebSocket; sem o fallback, o app fica
     * mudo em vez de degradar.
     */
    transports: ['polling', 'websocket'],
  });

  io.on('connection', (socket) => {
    void (async () => {
      const auth = await autenticar(socket);

      if (!auth) {
        socket.emit('unauthorized', { message: 'Sessao invalida para tempo real.' });
        socket.disconnect(true);
        return;
      }

      await socket.join(sala(auth.appId));
      socket.data.appId = auth.appId;
      socket.emit('ready', { appId: auth.appId });
    })();
  });

  console.info('[socket] Tempo real ativo.');
  return io;
}

/**
 * Emite para a sala do restaurante.
 *
 * Silencioso quando o socket não está ativo — em serverless ele não existe, e
 * um pedido não pode falhar porque o push não subiu. O evento é uma melhoria
 * de experiência, não parte da transação.
 */
function emitir(appId: string, evento: string, dados: EventoPedido): void {
  if (!io) return;
  io.to(sala(appId)).emit(evento, dados);
}

/** Pedido novo: entra na Recepção e na Cozinha na hora. */
export function emitNewOrder(appId: string, dados: EventoPedido): void {
  emitir(appId, 'new_order', dados);
}

/** Mudança de status: o card troca de coluna sem refresh. */
export function emitOrderUpdated(appId: string, dados: EventoPedido): void {
  emitir(appId, 'order_updated', dados);
}

export function getIO(): SocketServer | null {
  return io;
}
