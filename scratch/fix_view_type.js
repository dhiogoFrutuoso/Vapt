import fs from 'fs';
import path from 'path';

// Fix EditorPreview.tsx
const epFile = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'EditorPreview.tsx');
let epContent = fs.readFileSync(epFile, 'utf8');

epContent = epContent.replace(
  "type View = 'menu' | 'salao' | 'entrega';",
  "type View = 'menu' | 'salao' | 'entrega' | 'recepcao';"
);

fs.writeFileSync(epFile, epContent, 'utf8');

// Fix ReceptionView.tsx
const rvFile = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'phone', 'ReceptionView.tsx');
let rvContent = fs.readFileSync(rvFile, 'utf8');

rvContent = rvContent.replace("import React, { useState } from 'react';", "import { useState } from 'react';");

fs.writeFileSync(rvFile, rvContent, 'utf8');
