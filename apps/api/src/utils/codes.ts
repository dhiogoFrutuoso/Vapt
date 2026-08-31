/** Alfabeto sem 0/O/1/I para o dono ditar o codigo por telefone sem erro. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRestaurantCode(length = 5): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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
