import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Camada de armazenamento de imagens.
 *
 * Motivo de existir: o construtor de demonstracao envia logo e fotos como data:URL
 * (base64). Guardar isso no MongoDB incha o documento, estoura o limite de 16MB em
 * cardapios grandes e deixa a leitura lenta. Aqui a imagem vira ARQUIVO e o banco
 * guarda so a URL.
 *
 * Dois drivers, escolhidos automaticamente em config/env.ts:
 *   - cloudinary: quando as credenciais reais estao no .env;
 *   - local:      fallback que grava em disco e serve por /uploads.
 *
 * O resto da aplicacao nao sabe qual driver esta ativo — chama `storeImage` e recebe
 * `{ url, publicId }`. Trocar por S3 no futuro significa escrever um terceiro caso aqui,
 * sem tocar em controller nenhum.
 */

export type StoredImage = {
  /** URL publica que vai para o MongoDB e para o front. */
  url: string;
  /** Identificador para apagar depois. Null quando a imagem e externa. */
  publicId: string | null;
  provider: 'cloudinary' | 'local' | 'external';
};

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

let cloudinaryReady = false;

function ensureCloudinary() {
  if (cloudinaryReady) return;
  const { url, cloudName, apiKey, apiSecret } = env.storage.cloudinary;

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  } else if (url) {
    // O SDK le CLOUDINARY_URL do process.env sozinho; só forçamos HTTPS.
    cloudinary.config({ secure: true });
  }

  cloudinaryReady = true;
}

/** Um data:URL de imagem valido? */
function parseDataUrl(value: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(value);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  if (!MIME_EXTENSIONS[mime]) {
    throw HttpError.badRequest(`Formato de imagem nao suportado: ${mime}. Use PNG, JPG ou WEBP.`);
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength === 0) throw HttpError.badRequest('Imagem vazia ou corrompida.');
  if (buffer.byteLength > env.storage.maxImageBytes) {
    const limitMb = (env.storage.maxImageBytes / (1024 * 1024)).toFixed(1);
    throw HttpError.badRequest(`Imagem muito pesada. O limite e ${limitMb}MB.`);
  }

  return { mime, buffer };
}

async function uploadToCloudinary(dataUrl: string, folder: string, publicIdHint: string): Promise<StoredImage> {
  ensureCloudinary();

  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: `${env.storage.cloudinary.folder}/${folder}`,
    public_id: `${publicIdHint}-${randomUUID().slice(0, 8)}`,
    resource_type: 'image',
    overwrite: false,
    invalidate: true,
    // Corta o custo de banda: limita o lado maior e deixa o Cloudinary escolher formato/qualidade.
    transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
  });

  return { url: result.secure_url, publicId: result.public_id, provider: 'cloudinary' };
}

async function saveToDisk(dataUrl: string, folder: string, publicIdHint: string): Promise<StoredImage> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw HttpError.badRequest('Formato de imagem invalido.');

  const extension = MIME_EXTENSIONS[parsed.mime];
  const fileName = `${publicIdHint}-${randomUUID().slice(0, 8)}.${extension}`;
  const relativeDir = path.posix.join(folder);
  const absoluteDir = path.resolve(process.cwd(), env.storage.local.dir, relativeDir);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, fileName), parsed.buffer);

  const relativePath = path.posix.join(relativeDir, fileName);

  return {
    url: `${env.publicUrl}${env.storage.local.route}/${relativePath}`,
    publicId: `local:${relativePath}`,
    provider: 'local',
  };
}

/** Nome de arquivo previsivel e seguro a partir do nome do restaurante/produto. */
function slugifyHint(hint: string): string {
  return (
    hint
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'imagem'
  );
}

/**
 * Persiste uma imagem e devolve a URL publica.
 *
 * - `null` / vazio  -> null (nada para guardar);
 * - URL http(s)     -> passa direto, nada e reenviado;
 * - data:URL        -> vira arquivo no driver ativo.
 *
 * Se o Cloudinary falhar (credencial errada, cota, rede), caimos para o disco em vez de
 * derrubar a criacao da loja: o visitante nao pode perder o "momento uau" por causa disso.
 */
export async function storeImage(
  value: string | null | undefined,
  folder: string,
  hint: string
): Promise<StoredImage | null> {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed, publicId: null, provider: 'external' };
  }

  if (!trimmed.startsWith('data:image/')) {
    throw HttpError.badRequest('Formato de imagem invalido. Envie um arquivo de imagem.');
  }

  // Valida tamanho/mime antes de qualquer upload, nos dois drivers.
  parseDataUrl(trimmed);

  const publicIdHint = slugifyHint(hint);

  if (env.storage.driver === 'cloudinary') {
    try {
      return await uploadToCloudinary(trimmed, folder, publicIdHint);
    } catch (error) {
      console.error('[storage] Falha no upload para o Cloudinary, gravando em disco:', error);
    }
  }

  return saveToDisk(trimmed, folder, publicIdHint);
}

/** Remove uma imagem guardada. Erro aqui nunca derruba a requisicao. */
export async function destroyImage(publicId: string | null | undefined): Promise<void> {
  if (!publicId) return;

  try {
    if (publicId.startsWith('local:')) {
      const relativePath = publicId.slice('local:'.length);
      await unlink(path.resolve(process.cwd(), env.storage.local.dir, relativePath));
      return;
    }

    ensureCloudinary();
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (error) {
    console.warn('[storage] Nao foi possivel remover a imagem:', publicId, error);
  }
}

/** Usado no log de boot para deixar claro onde as imagens estao caindo. */
export function describeStorage(): string {
  return env.storage.driver === 'cloudinary'
    ? `Cloudinary (pasta "${env.storage.cloudinary.folder}")`
    : `disco local em "${env.storage.local.dir}" servido por ${env.publicUrl}${env.storage.local.route}`;
}
