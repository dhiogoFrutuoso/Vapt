const fs = require('fs');

let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// 1. Add className to view controls
d = d.replace(/<div style=\{\{\s*display: 'flex',\s*justifyContent: 'flex-end',\s*gap: '8px',\s*marginBottom: viewMode === 'fullscreen' \? '0' : '12px',\s*padding: viewMode === 'fullscreen' \? '12px 16px' : '0'\s*\}\}>/, '<div className="editor-view-controls" style={{ display: \'flex\', justifyContent: \'flex-end\', gap: \'8px\', marginBottom: viewMode === \'fullscreen\' ? \'0\' : \'12px\', padding: viewMode === \'fullscreen\' ? \'12px 16px\' : \'0\' }}>');

// 2. Add className to preview wrapper
d = d.replace(/<div style=\{\{\s*flex: 1,\s*minHeight: viewMode === 'fullscreen' \? 'calc\(100vh - 45px\)' : '600px',/, '<div className="editor-preview-wrapper" style={{ flex: 1, minHeight: viewMode === \'fullscreen\' ? \'calc(100vh - 45px)\' : \'600px\',');

// 3. Add styles to the <style> block
const stylesToAdd = `
@media (max-width: 768px) {
  .editor-view-controls { display: none !important; }
  .editor-main { padding: 0 !important; background-image: none !important; background-color: transparent !important; }
  .editor-preview-wrapper { 
    min-height: calc(100vh - 45px) !important; 
    border: none !important; 
    border-radius: 0 !important; 
    box-shadow: none !important; 
    width: 100% !important; 
    margin: 0 !important; 
    max-width: none !important; 
  }
}
`;
d = d.replace('<style>{`', '<style>{`' + stylesToAdd);

fs.writeFileSync('src/pages/EditorPage.tsx', d);
