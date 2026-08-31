import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { Image } from '../models/Image.js';
import { HttpError } from '../utils/httpError.js';
import { env } from '../config/env.js';

/**
 * GET /api/images/:id
 *
 * A imagem mora no MongoDB em base64, mas e servida como BINARIO. Assim o
 * navegador guarda em cache, o <img src="/api/images/:id"> funciona igual a
 * qualquer arquivo, e os JSONs do painel continuam leves.
 *
 * Sao imagens publicas por natureza (foto de perfil, logo, foto de produto):
 * quem tem o id ve. Nao guarde nada sensivel aqui.
 */
export const serveImage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw HttpError.badRequest('Identificador de imagem invalido.');
  }

  const image = await Image.findById(id).lean();
  if (!image) throw HttpError.notFound('Imagem nao encontrada.');

  const buffer = Buffer.from(image.data, 'base64');
  const etag = `"${String(image._id)}-${buffer.byteLength}"`;

  // O conteudo de um id nunca muda (troca de foto cria outro documento),
  // entao pode ser cacheado agressivamente.
  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Length', String(buffer.byteLength));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.send(buffer);
});

/**
 * GET /api/images/:id/meta
 * Metadados sem o binario — util para depurar e para telas de gerenciamento.
 */
export const imageMeta = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw HttpError.badRequest('Identificador de imagem invalido.');
  }

  const image = await Image.findById(id).select('-data').lean();
  if (!image) throw HttpError.notFound('Imagem nao encontrada.');

  res.json({
    ok: true,
    data: {
      id: String(image._id),
      kind: image.kind,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      url: `${env.publicUrl}/api/images/${String(image._id)}`,
      createdAt: image.createdAt,
    },
  });
});
