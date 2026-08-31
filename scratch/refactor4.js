import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/import \{ ArrowLeft.*?\} from 'lucide-react';/, "import { ArrowLeft, Sun, Moon, Trash2, Pencil, Star, Camera, Utensils, Lightbulb } from 'lucide-react';");

content = content.replace(/<span style=\{\{ fontSize: '1\.2rem' \}\}>📷<\/span>/g, '<Camera size={20} color="#94a3b8" />');
content = content.replace(/<span style=\{\{ fontSize: '2rem' \}\}>📷<\/span>/g, '<Camera size={32} color="#94a3b8" />');
content = content.replace(/<span style=\{\{ width: '22px', height: '22px', borderRadius: '5px', display: 'grid', placeItems: 'center', backgroundColor: panelBg \}\}>🍽️<\/span>/g, '<span style={{ width: "22px", height: "22px", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: panelBg, color: "#94a3b8" }}><Utensils size={14} /></span>');
content = content.replace(/💡 /g, '<Lightbulb size={18} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px", color: "#f59e0b" }} />');

// Clean up line 380 if there is any stray emoji '🍽️'
content = content.replace(/emoji: '🍽️'/g, "emoji: ''");

fs.writeFileSync(file, content, 'utf8');
