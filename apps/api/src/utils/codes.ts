import { randomInt } from 'node:crypto';

/** Alfabeto sem 0/O/1/I para o dono ditar o codigo por telefone sem erro. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Codigo publico do restaurante (FW-XXXXX).
 *
 * Nao e credencial — quem autentica a equipe e o codigo de 6 caracteres do
 * funcionario. Ainda assim usa `randomInt`: o campo tem indice unico, e uma
 * colisao viraria um E11000 confuso na ativacao do aplicativo. Custa nada e
 * remove a duvida de "este aqui e sensivel ou nao?" na proxima leitura.
 */
export function generateRestaurantCode(length = 5): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `FW-${out}`;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  const root = slugify(base) || 'meu-restaurante';
  let candidate = root;
  let i = 1;
  while (await exists(candidate)) {
    i += 1;
    candidate = `${root}-${i}`;
  }
  return candidate;
}

/**
 * Codigo de acesso do funcionario (6 caracteres).
 *
 * Duas correcoes em relacao a versao anterior, e as duas importam:
 *
 * 1. `crypto.randomInt` no lugar de `Math.random()`. Este codigo e a UNICA
 *    barreira entre alguem e a conta de um funcionario — Math.random e
 *    previsivel a partir de saidas observadas, o que aqui significa adivinhar
 *    codigos validos.
 *
 * 2. Alfabeto sem 0/O/1/I, o mesmo de `generateRestaurantCode`. O dono dita o
 *    codigo em voz alta no balcao; "zero ou O?" vira chamado de suporte.
 */
export function generateEmployeeCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}
