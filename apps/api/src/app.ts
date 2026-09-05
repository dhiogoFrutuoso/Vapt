import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { apiLimiter } from './middlewares/rateLimiter.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(mongoSanitize());

  /*
   * CORS estrito, com lista fixa.
   *
   * `env.corsOrigins` ja inclui as origens da WebView do Capacitor
   * (capacitor://localhost, ionic://localhost, http://localhost) alem dos
   * dominios web configurados no .env. Nao ha regex nem curinga: origem que
   * nao esta na lista e recusada.
   *
   * Duas decisoes que nao sao obvias:
   *
   * 1. Requisicao SEM Origin passa. Nao e brecha: navegador sempre envia o
   *    cabecalho em chamada cross-origin. Sem Origin significa mesma origem,
   *    curl, health check da Vercel ou app nativo — e nesses casos o CORS nao
   *    e a defesa, o token e.
   *
   * 2. A recusa vira 403, nao excecao. Antes, `callback(new Error(...))`
   *    subia para o tratador de erro e virava 500 "Erro interno no servidor" —
   *    o operador via falha do servidor onde havia configuracao errada de
   *    origem, que e um diagnostico completamente diferente.
   */
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        console.warn(`[cors] Origem recusada: ${origin}`);
        return callback(null, false);
      },
      // O cookie de sessao do painel precisa disto. O app usa Bearer token.
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
      exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    })
  );

  /*
   * O `cors` acima apenas omite os cabecalhos quando recusa, e o navegador
   * bloqueia do lado dele — mas a requisicao AINDA executa no servidor. Para
   * origem desconhecida cortamos antes de chegar na rota.
   */
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || env.corsOrigins.includes(origin)) return next();
    return res.status(403).json({ ok: false, error: 'Origem nao autorizada.' });
  });

  /**
   * Limite estrito de 15kb para o corpo JSON para prevenir DoS.
   * Uploads de arquivos maiores agora passam pelo Multer (multipart/form-data).
   */
  app.use(express.json({ limit: '15kb' }));
  app.use(express.urlencoded({ extended: true, limit: '15kb' }));
  app.use(cookieParser());
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Driver local de imagens das lojas de demonstracao da landing.
  // Com Cloudinary configurado esta rota simplesmente fica vazia.
  app.use(
    env.storage.local.route,
    express.static(path.resolve(process.cwd(), env.storage.local.dir), {
      maxAge: env.isProd ? '30d' : 0,
      fallthrough: true,
      index: false,
    })
  );

  app.use('/api', apiLimiter, router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
