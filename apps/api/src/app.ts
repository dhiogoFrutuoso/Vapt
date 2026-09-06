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
import { ensureDatabase } from './config/db.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  /*
   * Helmet com CSP explícita.
   *
   * ONDE ISTO PROTEGE, E ONDE NÃO
   * -----------------------------
   * Esta API devolve JSON e imagens; o HTML do site vem da Vercel, não daqui.
   * Uma CSP mandada em resposta JSON não protege a página do painel — quem
   * protege aquilo é o cabeçalho servido junto do HTML, configurado no
   * `vercel.json`.
   *
   * O que a CSP daqui cobre de verdade:
   *
   *   - a rota de imagens (`/api/images/:id`), que devolve conteúdo enviado
   *     por usuários. Um SVG com `<script>` dentro executaria na origem da
   *     API se aberto direto no navegador; `script-src 'none'` impede;
   *   - qualquer página de erro que um middleware venha a renderizar;
   *   - o enquadramento em iframe, barrado por `frame-ancestors` e pelo
   *     `X-Frame-Options: DENY` — sem isso um site hostil embutiria uma rota
   *     nossa e faria clickjacking.
   *
   * `crossOriginResourcePolicy: cross-origin` continua necessário: as
   * imagens das lojas são carregadas pelo domínio do site, que é outra
   * origem, e o padrão `same-origin` do Helmet as bloquearia.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          /* A API não serve script nenhum. Nem o próprio. */
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          /* `data:` cobre as imagens processadas que voltam embutidas. */
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
          fontSrc: ["'none'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      /* DENY, não SAMEORIGIN: nada nesta API precisa ser embutido. */
      frameguard: { action: 'deny' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      /* Sem `Referer` para fora: as URLs carregam ids de aplicativo. */
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  /*
   * O navegador não deve adivinhar o tipo de um upload.
   *
   * `nosniff` já vem do Helmet, mas a rota de imagens merece a menção: sem
   * ele, um arquivo enviado como imagem e servido com o tipo errado poderia
   * ser interpretado como HTML e executar script na origem da API.
   */
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

  /*
   * Conexao com o banco garantida ANTES de qualquer rota.
   *
   * Em serverless a funcao acorda fria e a conexao pode nao estar pronta
   * quando a primeira requisicao chega. Sem este await, a consulta bufferizava
   * e morria com "buffering timed out after 10000ms" — um 500 que apontava
   * para a colecao consultada em vez de para a conexao.
   *
   * Fica DEPOIS do rate limit: requisicao bloqueada por limite nao deve
   * acordar o banco.
   */
  app.use('/api', apiLimiter, async (_req, res, next) => {
    try {
      await ensureDatabase();
      next();
    } catch (erro) {
      console.error('[db] Falha ao conectar antes da rota.', erro);
      res.status(503).json({
        ok: false,
        error: 'Servico indisponivel no momento. Tente novamente em instantes.',
      });
    }
  }, router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
