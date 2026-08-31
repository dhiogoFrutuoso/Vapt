import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/import \{ ArrowLeft.*?\} from 'lucide-react';/, "import { ArrowLeft, Sun, Moon, Trash2, Pencil, Star, Image as ImageIcon } from 'lucide-react';");

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed imports');
