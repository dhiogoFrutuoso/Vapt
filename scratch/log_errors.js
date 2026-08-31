import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'api', 'src', 'middlewares', 'errorHandler.ts');
let content = fs.readFileSync(file, 'utf8');

const replacement = `  console.error('[error]', err);
  require('fs').appendFileSync('api_error.log', new Date().toISOString() + ' ' + (err instanceof Error ? err.stack : String(err)) + '\\n');
  return res.status(500).json({ ok: false, error: 'Erro interno do servidor' });`;

content = content.replace(/console\.error\('\[error\]', err\);\s*return res\.status\(500\).*;/g, replacement);

fs.writeFileSync(file, content, 'utf8');
