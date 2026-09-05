import 'dotenv/config';
import { buildMongoUri } from './mongoUri.js';

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`[env] Variavel obrigatoria ausente: ${key}. Veja o .env.example`);
  }
  return value;
}

/**
 * O .env.example vem cheio de valores de demonstracao ("chave_exemplo", "token_de_exemplo").
 * Se alguem copiar o arquivo e esquecer de trocar, precisamos tratar como NAO configurado —
 * senao o servidor tenta subir imagem para uma conta que nao existe e o demo quebra.
 */
const PLACEHOLDER_PATTERN = /(exemplo|example|trocar|changeme|your[_-]|seu[_-]|xxx+)/i;

function optional(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (!value) return undefined;
  if (PLACEHOLDER_PATTERN.test(value)) return undefined;
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

/**
 * Painel do lojista. Tem de ser resolvido antes do objeto `env` porque o
 * redirect do Google depende dele (ver comentario em `google.redirectUri`).
 */
const webUrl = (process.env.WEB_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

/**
 * O wa.me so aceita digitos. Numeros no .env costumam vir formatados
 * ("+55 88 99613-1836"): limpamos e garantimos o DDI 55.
 */
export function normalizeWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

const cloudName = optional('CLOUDINARY_CLOUD_NAME');
const apiKey = optional('CLOUDINARY_API_KEY');
const apiSecret = optional('CLOUDINARY_API_SECRET');
const cloudinaryUrl = optional('CLOUDINARY_URL');

/** Cloudinary so e considerado ativo com as credenciais completas (trio ou CLOUDINARY_URL). */
const cloudinaryEnabled = Boolean((cloudName && apiKey && apiSecret) || cloudinaryUrl);

/**
 * Segredo do JWT. Em producao e obrigatorio de verdade: sem ele, qualquer um assina
 * um token valido. Em desenvolvimento usamos um valor fixo conhecido, com aviso,
 * para o login nao quebrar a cada reinicio do servidor.
 */
function resolveJwtSecret(): string {
  const secret = optional('JWT_SECRET');
  if (secret && secret.length >= 24) return secret;

  if (isProd) {
    throw new Error(
      '[env] JWT_SECRET ausente ou muito curto. Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  console.warn('[env] JWT_SECRET nao definido: usando segredo de DESENVOLVIMENTO. Nao use isso em producao.');
  return 'vaptapp-dev-secret-nao-use-em-producao-000000';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: Number(process.env.PORT ?? 4000),

  /** URL publica desta API. Usada para montar o link das imagens no driver local. */
  publicUrl: (process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, ''),

  mongoUri: buildMongoUri({
    uri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/vaptapp'),
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD,
    dbName: process.env.MONGODB_DB ?? 'vaptapp',
  }),

  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Login com Google (OAuth 2.0).
   *
   * `optional()` derruba os valores de exemplo do .env.example, entao
   * `enabled` so fica true com credenciais de verdade. Com ele false a API
   * sobe normalmente e apenas o login por senha responde — nada quebra por
   * falta de configuracao.
   */
  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
    /*
     * O callback aponta para o dominio do FRONT, nao para o da API — e o
     * rewrite `/api/*` do front repassa a chamada. Isso nao e detalhe de
     * roteamento: o cookie de sessao e gravado no dominio que o navegador
     * chamou. Apontando para a API, o cookie nasceria em outro dominio e o
     * painel voltaria deslogado depois do consentimento.
     */
    redirectUri: optional('GOOGLE_REDIRECT_URI') ?? `${webUrl}/api/auth/google/callback`,
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  /** Painel do lojista: destino do redirect depois do consentimento do Google. */
  webUrl,

  /** Autenticacao por JWT em cookie httpOnly (o token tambem volta no corpo, para clientes de API). */
  auth: {
    jwtSecret: resolveJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    cookieName: process.env.AUTH_COOKIE_NAME ?? 'fw_token',
    cookieMaxAgeMs: Number(process.env.AUTH_COOKIE_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000),
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  },

  company: {
    name: process.env.COMPANY_NAME ?? 'VaptApp Tecnologia LTDA',
    cnpj: process.env.COMPANY_CNPJ ?? '12.345.678/0001-90',
    city: process.env.COMPANY_CITY ?? 'Sao Paulo - SP',
    whatsapp: normalizeWhatsapp(process.env.SUPPORT_WHATSAPP ?? '5511999999999'),
    email: process.env.SUPPORT_EMAIL ?? 'contato@vaptapp.com.br',
    hours: process.env.SUPPORT_HOURS ?? 'Seg a Sab, 8h as 22h',
  },

  /** WhatsApp que recebe o fechamento do plano (checkout manual, sem gateway). */
  adminWhatsapp: normalizeWhatsapp(
    process.env.ADMIN_WHATSAPP ?? process.env.SUPPORT_WHATSAPP ?? '5511999999999'
  ),

  /**
   * Imagens de PERFIL e dos APPS ficam no MongoDB em base64 (decisao do produto:
   * nada de bucket externo por enquanto), sempre convertidas para WEBP.
   */
  images: {
    format: 'webp' as const,
    mimeType: 'image/webp' as const,
    quality: Number(process.env.IMAGE_WEBP_QUALITY ?? 82),
    avatarMaxSize: Number(process.env.IMAGE_AVATAR_MAX_SIZE ?? 512),
    defaultMaxSize: Number(process.env.IMAGE_MAX_SIZE ?? 1280),
    /** Limite do arquivo ja convertido, antes de virar base64. */
    maxBytes: Number(process.env.MAX_IMAGE_BYTES ?? 2 * 1024 * 1024),
  },

  /** Storage das imagens das lojas de demonstracao da landing (Cloudinary ou disco). */
  storage: {
    driver: (cloudinaryEnabled ? 'cloudinary' : 'local') as 'cloudinary' | 'local',
    cloudinary: {
      url: cloudinaryUrl,
      cloudName,
      apiKey,
      apiSecret,
      folder: process.env.CLOUDINARY_FOLDER ?? 'vaptapp',
    },
    local: {
      dir: process.env.UPLOAD_DIR ?? 'uploads',
      route: '/uploads',
    },
    maxImageBytes: Number(process.env.MAX_IMAGE_BYTES ?? 2 * 1024 * 1024),
  },

  rateLimit: {
    // Padrao de producao: 100 requisicoes por 15 minutos por IP.
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60_000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  },

  /**
   * Resend (e-mail transacional). Sem chave, o envio e desligado e o codigo
   * de recuperacao aparece no log do servidor — assim o fluxo continua
   * testavel em desenvolvimento sem depender de servico externo.
   */
  mail: {
    resendApiKey: optional('RESEND_API_KEY'),
    from: process.env.MAIL_FROM ?? 'Vapt <onboarding@resend.dev>',
    get enabled() {
      return Boolean(this.resendApiKey);
    },
  },
};
