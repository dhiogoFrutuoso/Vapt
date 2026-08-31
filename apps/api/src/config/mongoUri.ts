/**
 * Monta a connection string final a partir das variaveis de ambiente.
 *
 * Aceita as tres formas que aparecem no dia a dia:
 *  1. MONGODB_URI completa, com usuario e senha embutidos;
 *  2. MONGODB_URI sem credenciais + MONGODB_USERNAME / MONGODB_PASSWORD;
 *  3. MONGODB_URI com os placeholders do Atlas (<db_username>:<db_password>).
 *
 * Tambem garante nome do banco e opcoes de escrita, que o Atlas nao entrega
 * ao copiar a string do painel — sem isso o Mongoose grava no banco "test".
 */

type BuildInput = {
  uri: string;
  username?: string;
  password?: string;
  dbName: string;
};

const DEFAULT_OPTIONS = 'retryWrites=true&w=majority';

export function buildMongoUri({ uri, username, password, dbName }: BuildInput): string {
  const raw = uri.trim().replace(/^["']|["']$/g, '');

  const schemeMatch = raw.match(/^(mongodb\+srv:\/\/|mongodb:\/\/)/);
  if (!schemeMatch) {
    throw new Error('[env] MONGODB_URI deve comecar com "mongodb://" ou "mongodb+srv://".');
  }

  const scheme = schemeMatch[1];
  let rest = raw.slice(scheme.length);

  /* ---------- 1. Credenciais ---------- */
  let credentials = '';
  const atIndex = rest.lastIndexOf('@');
  if (atIndex !== -1) {
    credentials = rest.slice(0, atIndex);
    rest = rest.slice(atIndex + 1);
  }

  const isPlaceholder = /[<>]/.test(credentials);
  const hasCredentials = credentials.length > 0 && !isPlaceholder;

  if (!hasCredentials && username && password) {
    // encodeURIComponent protege senhas com @ : / ? # e afins
    credentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  } else if (!hasCredentials && (username || password)) {
    throw new Error('[env] Informe MONGODB_USERNAME e MONGODB_PASSWORD juntos, ou credenciais dentro da MONGODB_URI.');
  } else if (isPlaceholder && !(username && password)) {
    throw new Error(
      '[env] A MONGODB_URI ainda tem os placeholders do Atlas. Preencha MONGODB_USERNAME e MONGODB_PASSWORD no .env.'
    );
  }

  /* ---------- 2. Host, banco e query ---------- */
  const [hostAndPath, existingQuery = ''] = rest.split('?');
  const slashIndex = hostAndPath.indexOf('/');
  const host = slashIndex === -1 ? hostAndPath : hostAndPath.slice(0, slashIndex);
  const pathDb = slashIndex === -1 ? '' : hostAndPath.slice(slashIndex + 1);

  if (!host) throw new Error('[env] MONGODB_URI sem host. Confira o valor copiado do Atlas.');

  const database = pathDb || dbName;

  /* ---------- 3. Opcoes ---------- */
  const params = new URLSearchParams(existingQuery);
  if (!params.has('retryWrites')) params.set('retryWrites', 'true');
  if (!params.has('w')) params.set('w', 'majority');

  const query = params.toString() || DEFAULT_OPTIONS;
  const auth = credentials ? `${credentials}@` : '';

  return `${scheme}${auth}${host}/${database}?${query}`;
}

/** Versao segura para log: esconde a senha. */
export function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@]+)@/, '//$1:****@');
}
