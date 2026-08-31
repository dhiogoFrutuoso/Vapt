import mongoose from 'mongoose';
import { env } from './env.js';
import { maskUri } from './mongoUri.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('connected', () =>
    console.log(`[db] MongoDB conectado -> ${maskUri(env.mongoUri)}`)
  );
  mongoose.connection.on('error', (err) => console.error('[db] Erro:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB desconectado'));

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 8000,
    autoIndex: !env.isProd,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
}
