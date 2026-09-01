const fs = require('fs');

let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// 1. Add state and refs inside EditorPage component
// Find `const [viewMode, setViewMode] = useState<'mobile' | 'default' | 'fullscreen'>('default');`
const stateCode = `const [viewMode, setViewMode] = useState<'mobile' | 'default' | 'fullscreen'>('default');
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);

  const handleMouseDown = (e) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e) => {
    if (!isResizing.current) return;
    let newWidth = e.clientX;
    if (newWidth < 250) newWidth = 250;
    if (newWidth > 600) newWidth = 600;
    setSidebarWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = '';
  };`;

d = d.replace(/const \[viewMode, setViewMode\] = useState<'mobile' \| 'default' \| 'fullscreen'>\('default'\);/, stateCode);

// 2. Update sidebar width
d = d.replace(/width: '320px'/, 'width: `${sidebarWidth}px`');

// 3. Inject resizer
const resizerCode = `</aside>
        <div 
          onMouseDown={handleMouseDown}
          className="editor-resizer"
          style={{ width: '4px', cursor: 'col-resize', backgroundColor: 'var(--ep-border)', zIndex: 10, flexShrink: 0, transition: 'background-color 0.2s' }}
        />
        {/* PREVIEW CONTAINER */}`;
d = d.replace(/<\/aside>\s*\{\/\* PREVIEW CONTAINER \*\/\}/, resizerCode);

// 4. Add hover effect to CSS
const css = `
.editor-resizer:hover, .editor-resizer:active {
  background-color: var(--ep-primary) !important;
}
`;
d = d.replace('<style>{`', '<style>{`' + css);

fs.writeFileSync('src/pages/EditorPage.tsx', d);
