import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { describeStorage } from './services/imageStorage.js';

const app = createApp();

async function bootstrap() {
  try {
    await connectDatabase();
  } catch (error) {
    console.error('[boot] Nao foi possivel conectar ao MongoDB.');
    console.error('       Confira MONGODB_URI no .env (veja .env.example).');
    console.error(error);
    process.exit(1);
  }

  console.log(`[storage] Imagens indo para: ${describeStorage()}`);
  if (env.storage.driver === 'local') {
    console.warn('[storage] Cloudinary nao configurado. Para producao, preencha CLOUDINARY_* no .env.');
  }

  /*
   * Servidor HTTP explicito, em vez de `app.listen`: o Socket.io precisa
   * anexar ao mesmo servidor para dividir a porta com o Express. Com
   * `app.listen` nao ha referencia ao servidor para passar ao socket.
   */
  const server = createServer(app);

  /*
   * Import dinamico: o socket.io so e carregado no processo persistente.
   *
   * No topo do arquivo, ele entrava no grafo de modulos tambem em serverless,
   * onde nunca sera usado — carregando socket.io, engine.io e ws a cada cold
   * start, atrasando o boot sem servir para nada.
   */
  const { initRealtime } = await import('./realtime/io.js');
  initRealtime(server);

  server.listen(env.port, () => {
    console.log(`[boot] VaptApp API rodando em http://localhost:${env.port}/api (${env.nodeEnv})`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n[boot] A porta ${env.port} ja esta em uso.`);
      console.error('       Provavelmente outra instancia da API esta rodando.');
      console.error('       Feche a outra janela, ou rode com outra porta:');
      console.error(`         PORT=4001 npm run dev -w apps/api\n`);
    } else {
      console.error('[boot] Erro ao subir o servidor:', error);
    }
    void disconnectDatabase().finally(() => process.exit(1));
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[boot] ${signal} recebido, encerrando...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.env.NODE_ENV !== 'production') {
  void bootstrap();
}
/*
 * Em producao (Vercel) NAO conectamos aqui.
 *
 * A versao anterior fazia `connectDatabase().catch(console.error)` no carregamento
 * do modulo, sem await — uma corrida: se a requisicao chegasse antes de a conexao
 * subir, a consulta bufferizava e estourava. Agora quem garante a conexao e o
 * middleware `ensureDatabase` em app.ts, que aguarda de verdade.
 */

export default app;
