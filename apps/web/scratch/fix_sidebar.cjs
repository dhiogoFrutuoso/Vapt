const fs = require('fs');

let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// The sidebar currently has `flex: 1` because of my previous script, causing the 50% split issue.
// It also has `width: '420px'`. We should remove `flex: 1` and change the width to `350px` or `320px` to make it slimmer.
// Let's replace the flex properties of the sidebar.
d = d.replace(/width:\s*['"]420px['"]/, "width: '320px'"); // reduce width
d = d.replace(/flexDirection:\s*['"]column['"],\s*flex:\s*1,\s*minHeight:\s*0,\s*flexShrink:\s*0/, "flexDirection: 'column', flexShrink: 0, minHeight: 0");

fs.writeFileSync('src/pages/EditorPage.tsx', d);
