import mongoose from 'mongoose';
import { env } from './env.js';
import { maskUri } from './mongoUri.js';

mongoose.set('strictQuery', true);

/**
 * Conexao unica, reaproveitada.
 *
 * Em serverless a funcao e reiniciada a todo momento, mas o modulo pode
 * sobreviver entre invocacoes. Guardar a PROMESSA (nao um booleano) garante
 * que requisicoes concorrentes durante o cold start esperem a mesma conexao
 * em vez de abrirem uma cada — o que estoura o limite de conexoes do Atlas.
 */
let conexao: Promise<void> | null = null;

/** Registra os listeners uma unica vez: `on` acumula a cada chamada. */
let listenersRegistrados = false;

function registrarListeners(): void {
  if (listenersRegistrados) return;
  listenersRegistrados = true;

  mongoose.connection.on('connected', () =>
    console.log(`[db] MongoDB conectado -> ${maskUri(env.mongoUri)}`)
  );
  mongoose.connection.on('error', (err) => console.error('[db] Erro:', err.message));
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB desconectado');
    /*
     * Limpa o cache ao cair.
     *
     * Sem isto, a promessa resolvida continuava valendo e `connectDatabase()`
     * retornava na hora sem reconectar — a consulta seguinte morria com
     * "Client must be connected before running operations". Acontece em queda
     * de rede e no reciclar de container, que em serverless e rotina.
     */
    conexao = null;
  });
}

export async function connectDatabase(): Promise<void> {
  // 1 = connected. Ja esta pronto, nao ha o que esperar.
  if (mongoose.connection.readyState === 1) return;

  /*
   * Desconectado com promessa em cache: o cache esta velho. Pode acontecer
   * quando a queda ocorre antes de o listener rodar; descartamos para nao
   * devolver uma conexao que ja morreu.
   */
  if (mongoose.connection.readyState === 0 && conexao) {
    conexao = null;
  }

  if (!conexao) {
    registrarListeners();

    conexao = mongoose
      .connect(env.mongoUri, {
        serverSelectionTimeoutMS: 8000,
        autoIndex: !env.isProd,
        /*
         * `bufferCommands: false` e o ponto central desta correcao.
         *
         * Com o buffer ligado (padrao), uma consulta feita antes da conexao
         * fica na fila e estoura em 10s com "buffering timed out" — que foi
         * exatamente o 500 em producao. O erro aparece longe da causa: a
         * mensagem fala de `plans.find()` quando o problema e a conexao.
         *
         * Desligado, a consulta falha na hora e com o motivo certo. E como
         * `ensureDatabase` abaixo aguarda a conexao antes de qualquer rota,
         * na pratica nenhuma consulta chega a rodar desconectada.
         */
        bufferCommands: false,
      })
      .then(() => undefined)
      .catch((erro) => {
        // Limpa para a proxima requisicao tentar de novo, em vez de ficar
        // presa numa promessa rejeitada para sempre.
        conexao = null;
        throw erro;
      });
  }

  return conexao;
}

/**
 * Middleware: garante conexao antes de a rota rodar.
 *
 * A versao anterior chamava `connectDatabase()` sem `await` no carregamento do
 * modulo (fire-and-forget). Em serverless isso e uma corrida: se a requisicao
 * chega antes de a conexao subir, a consulta bufferiza e morre. O `await` aqui
 * custa alguns milissegundos no cold start e nada nas invocacoes seguintes,
 * porque a promessa ja esta resolvida.
 */
export async function ensureDatabase(): Promise<void> {
  await connectDatabase();
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
}
