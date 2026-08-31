import fs from 'fs';
import path from 'path';

// Fix DashboardPage
let dashFile = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'DashboardPage.tsx');
let dashContent = fs.readFileSync(dashFile, 'utf8');

dashContent = dashContent.replace('type AppProjectFull, type Role, type Employee', 'type AppProjectFull');
dashContent = dashContent.replace('Shield, Copy, KeySquare', 'Shield, KeySquare, Save');
dashContent = dashContent.replace(/const inputClass = ".*?";\n\s*const labelClass = ".*?";\n/, '');

fs.writeFileSync(dashFile, dashContent, 'utf8');

// Fix EditorPage
let edFile = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let edContent = fs.readFileSync(edFile, 'utf8');

edContent = edContent.replace(/const logoInputRef = useRef<HTMLInputElement>\(null\);\n/g, '');
edContent = edContent.replace(/const \[isSavingApp, setIsSavingApp\] = useState\(false\);\n/g, '');

// Also remove handleLogoSelect and handleSaveApp functions
edContent = edContent.replace(/async function handleLogoSelect.*?\}\n\n/s, '');
edContent = edContent.replace(/async function handleSaveApp.*?\}\n\n/s, '');

fs.writeFileSync(edFile, edContent, 'utf8');
console.log('Fixed build errors');
