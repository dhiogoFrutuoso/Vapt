const fs = require('fs');
const path = require('path');

const cwd = 'c:/Users/seuma/Desktop/PROJETOS/Vapt';

// 1. Update User.ts
const userModelPath = path.join(cwd, 'apps/api/src/models/User.ts');
let userTs = fs.readFileSync(userModelPath, 'utf8');

userTs = userTs.replace(
/username: \{\s*type: String,\s*unique: true,\s*sparse: true,\s*lowercase: true,\s*trim: true,\s*maxlength: \[40, 'O nome de usuario pode ter no maximo 40 caracteres\.'\],\s*match: \[\/\^\[a-z0-9\._-\]\*\$\/, 'Use apenas letras, numeros, ponto, hifen e underline\.'\],\s*\}/,
`username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      minlength: [4, 'O nome de usuario deve ter no minimo 4 caracteres.'],
      maxlength: [24, 'O nome de usuario pode ter no maximo 24 caracteres.'],
      match: [/^[a-zA-Z0-9._]+$/, 'Use apenas letras, numeros, ponto e underline.'],
    }`);

fs.writeFileSync(userModelPath, userTs);


// 2. Update RegisterPage.tsx
const registerPagePath = path.join(cwd, 'apps/web/src/pages/RegisterPage.tsx');
let regTs = fs.readFileSync(registerPagePath, 'utf8');

regTs = regTs.replace(
/if \(!\/\^\[a-z0-9\._-\]\{3,24\}\$\/\.test\(form\.username\.trim\(\)\.toLowerCase\(\)\)\) \{[\s\n]*errors\.username = 'De 3 a 24 caracteres: letras minúsculas, números, ponto, hífen ou underline\.';[\s\n]*\}/,
`if (!/^[a-zA-Z0-9._]{4,24}$/.test(form.username.trim())) {
      errors.username = 'Entre 4 e 24 caracteres. Apenas letras, números, ponto e underline.';
    }`);

regTs = regTs.replace(
/formData\.append\('username', form\.username\.trim\(\)\.toLowerCase\(\)\);/,
`formData.append('username', form.username.trim());`);

regTs = regTs.replace(
/onChange=\{\(event\) => update\('username', event\.target\.value\.toLowerCase\(\)\)\}/,
`onChange={(event) => update('username', event.target.value)}`);

fs.writeFileSync(registerPagePath, regTs);


// 3. Update content.tsx
const contentPath = path.join(cwd, 'apps/web/src/data/content.tsx');
let contentTs = fs.readFileSync(contentPath, 'utf8');

contentTs = contentTs.replace(
/usernameHint: 'Letras minúsculas, números, ponto, hífen e underline\.',/,
`usernameHint: 'Entre 4 e 24 caracteres. Apenas letras, números, ponto e underline.',`);

fs.writeFileSync(contentPath, contentTs);

console.log("Validation rules updated successfully");
