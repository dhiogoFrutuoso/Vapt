import sharp, { type Metadata } from 'sharp';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Conversao e validacao de imagens do sistema.
 *
 * REGRA DO PRODUTO: toda imagem salva (foto de perfil, logo, capa, produto) e
 * convertida para WEBP e guardada no MongoDB como string base64 — sem bucket externo.
 *
 * O caminho e sempre o mesmo:
 *   data:URL / base64 cru  ->  Buffer  ->  sharp (resize + webp)  ->  valida  ->  base64
 *
 * A validacao acontece DEPOIS da conversao: lemos os metadados do resultado e
 * exigimos `format === 'webp'`. Assim nao existe caminho no codigo que grave
 * outro formato, nem mesmo se alguem trocar a lib de conversao amanha.
 */

export type ProcessedImage = {
  /** Conteudo em base64 puro, SEM o prefixo "data:image/webp;base64,". */
  base64: string;
  mimeType: 'image/webp';
  width: number;
  height: number;
  /** Tamanho do binario ja convertido (nao do base64). */
  bytes: number;
};

export type ProcessOptions = {
  /** Lado maior maximo, em pixels. */
  maxSize?: number;
  quality?: number;
  /** Recorta em quadrado, centralizado. Usado na foto de perfil. */
  square?: boolean;
};

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s;

/** Formatos de ENTRADA aceitos. A saida e sempre webp. */
const ACCEPTED_INPUT = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'tiff']);

/** Extrai o binario de um data:URL ou de uma string base64 crua. */
function toBuffer(input: string): Buffer {
  const trimmed = input.trim();
  if (!trimmed) throw HttpError.badRequest('Nenhuma imagem enviada.');

  const match = DATA_URL_PATTERN.exec(trimmed);
  const base64 = match ? match[2] : trimmed;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw HttpError.badRequest('Imagem invalida: nao foi possivel ler o conteudo.');
  }

  if (buffer.byteLength === 0) throw HttpError.badRequest('Imagem vazia ou corrompida.');

  // Limite de ENTRADA generoso: o arquivo original pode ser pesado; o que
  // importa e o tamanho depois de convertido, checado mais abaixo.
  const inputLimit = env.images.maxBytes * 4;
  if (buffer.byteLength > inputLimit) {
    const limitMb = (inputLimit / (1024 * 1024)).toFixed(1);
    throw HttpError.badRequest(`Imagem muito pesada. Envie um arquivo de ate ${limitMb}MB.`);
  }

  return buffer;
}

/**
 * Converte qualquer imagem suportada em WEBP base64, pronta para ir ao MongoDB.
 * Lanca HttpError 400 com mensagem legivel quando o arquivo nao serve.
 */
export async function toWebpBase64(input: string, options: ProcessOptions = {}): Promise<ProcessedImage> {
  const maxSize = options.maxSize ?? env.images.defaultMaxSize;
  const quality = options.quality ?? env.images.quality;

  const buffer = toBuffer(input);

  // 1. O arquivo e mesmo uma imagem de formato conhecido?
  let inputMeta: Metadata;
  try {
    inputMeta = await sharp(buffer).metadata();
  } catch {
    throw HttpError.badRequest('Arquivo invalido: nao parece ser uma imagem.');
  }

  if (!inputMeta.format || !ACCEPTED_INPUT.has(inputMeta.format)) {
    throw HttpError.badRequest(
      `Formato nao suportado${inputMeta.format ? `: ${inputMeta.format}` : ''}. Envie PNG, JPG ou WEBP.`
    );
  }

  // 2. Converte para WEBP, redimensionando sem esticar imagem pequena.
  let pipeline = sharp(buffer, { animated: inputMeta.format === 'gif' }).rotate();

  pipeline = options.square
    ? pipeline.resize(maxSize, maxSize, { fit: 'cover', position: 'attention', withoutEnlargement: true })
    : pipeline.resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true });

  let output: Buffer;
  try {
    output = await pipeline.webp({ quality, effort: 4 }).toBuffer();
  } catch {
    throw HttpError.badRequest('Nao conseguimos processar essa imagem. Tente outro arquivo.');
  }

  // 3. Validacao pos-conversao: o resultado E webp?
  const outputMeta = await sharp(output).metadata();
  if (outputMeta.format !== 'webp') {
    throw new HttpError(500, 'Falha ao converter a imagem para WEBP.');
  }

  if (output.byteLength > env.images.maxBytes) {
    const limitMb = (env.images.maxBytes / (1024 * 1024)).toFixed(1);
    throw HttpError.badRequest(`A imagem ficou maior que ${limitMb}MB mesmo apos a compressao. Envie uma menor.`);
  }

  return {
    base64: output.toString('base64'),
    mimeType: env.images.mimeType,
    width: outputMeta.width ?? 0,
    height: outputMeta.height ?? 0,
    bytes: output.byteLength,
  };
}

/** Atalho para foto de perfil: quadrada e pequena. */
export function toAvatarWebp(input: string): Promise<ProcessedImage> {
  return toWebpBase64(input, { maxSize: env.images.avatarMaxSize, square: true });
}

/** Monta o data:URL completo a partir do base64 guardado no banco. */
export function toDataUrl(base64: string): string {
  return `data:${env.images.mimeType};base64,${base64}`;
}
