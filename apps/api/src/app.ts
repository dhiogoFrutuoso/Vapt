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

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origem nao permitida pelo CORS: ${origin}`));
      },
      // Necessario para o cookie de sessao viajar entre o front (5173) e a API (4000).
      credentials: true,
    })
  );

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
