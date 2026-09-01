const fs = require('fs');
let d = fs.readFileSync('apps/web/src/pages/AdminPage.tsx', 'utf8');
d = d.replace(/import \{ site \} from '\.\.\/data\/content';\n/, '');
d = d.replace(/type User/g, 'type AuthUser');
d = d.replace(/<User>/g, '<AuthUser>');
d = d.replace(/<User \| null>/g, '<AuthUser | null>');
fs.writeFileSync('apps/web/src/pages/AdminPage.tsx', d);
