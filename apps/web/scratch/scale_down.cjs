const fs = require('fs');
const glob = require('fs').readdirSync;
const path = require('path');

function scaleDownCSS(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Regex to match properties that should be scaled
  const regex = /(font-size|padding|padding-top|padding-bottom|padding-left|padding-right|margin|margin-top|margin-bottom|margin-left|margin-right|gap|row-gap|column-gap|height|min-height|width|min-width):\s*([^;]+);/g;
  
  content = content.replace(regex, (match, prop, valStr) => {
    // Skip relative units like %, vh, vw, or var/calc functions which are risky to multiply blindly
    if (valStr.includes('%') || valStr.includes('vh') || valStr.includes('vw') || valStr.includes('var') || valStr.includes('calc') || valStr.includes('auto') || valStr.includes('max-content') || valStr.includes('fit-content')) {
      return match;
    }
    
    // Scale down numbers
    let newValStr = valStr.replace(/([0-9.]+)(px|rem|em)/g, (m, numStr, unit) => {
      let num = parseFloat(numStr);
      if (num === 0) return '0';
      
      let reduced = num * 0.82; // Reduce by ~18%
      
      if (unit === 'px') {
        reduced = Math.round(reduced);
        if (reduced < 4 && num >= 4) reduced = 4; // Keep a minimum so things don't disappear
      } else {
        reduced = parseFloat(reduced.toFixed(3));
      }
      return reduced + unit;
    });
    
    return prop + ': ' + newValStr + ';';
  });

  // Explicit hardcoded overrides for drastic reductions on filters, buttons and selects
  if (filePath.includes('cash.css')) {
    content = content.replace(/\.cash__filter-group\s+select\s*{[^}]*}/, match => match.replace(/height: [^;]+;/, 'height: 28px;').replace(/padding: [^;]+;/, 'padding: 4px 8px;').replace(/font-size: [^;]+;/, 'font-size: 11px;'));
    content = content.replace(/\.cash__tabs\s+button\s*{[^}]*}/, match => match.replace(/height: [^;]+;/, 'height: 28px;').replace(/padding: [^;]+;/, 'padding: 4px 10px;').replace(/font-size: [^;]+;/, 'font-size: 11px;'));
    content = content.replace(/\.cash__filters\s*{[^}]*}/, match => match.replace(/gap: [^;]+;/, 'gap: 6px;').replace(/margin-bottom: [^;]+;/, 'margin-bottom: 8px;'));
    content = content.replace(/\.cash__footer\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 8px 12px;'));
    content = content.replace(/\.cash__empty\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 16px;'));
  }

  if (filePath.includes('base.css')) {
    content = content.replace(/\.dash__card\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 12px;'));
    content = content.replace(/\.dash__grid\s*{[^}]*}/, match => match.replace(/gap: [^;]+;/, 'gap: 12px;'));
    content = content.replace(/\.dash__input,\s*\.dash__select\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 4px 8px;').replace(/font-size: [^;]+;/, 'font-size: 12px;').replace(/height: [^;]+;/, 'height: 30px;'));
    content = content.replace(/\.dash__btn\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 6px 10px;').replace(/font-size: [^;]+;/, 'font-size: 12px;'));
    content = content.replace(/\.dash__table th,\s*\.dash__table td\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 6px 8px;').replace(/font-size: [^;]+;/, 'font-size: 11px;'));
  }

  if (filePath.includes('phone-app.css')) {
    content = content.replace(/\.phone\s*{[^}]*}/, match => match.replace(/font-size: [^;]+;/, 'font-size: 11px;'));
    content = content.replace(/\.phone__chip\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 4px 6px;').replace(/font-size: [^;]+;/, 'font-size: 10px;'));
    content = content.replace(/\.phone__item\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 6px;').replace(/gap: [^;]+;/, 'gap: 6px;'));
    content = content.replace(/\.cat-header\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 6px;').replace(/gap: [^;]+;/, 'gap: 8px;'));
  }
  
  if (filePath.includes('app-preview.css')) {
    content = content.replace(/\.ep-btn\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 4px 10px;').replace(/font-size: [^;]+;/, 'font-size: 11px;'));
    content = content.replace(/\.ep-input,\s*\.ep-select,\s*\.ep-textarea\s*{[^}]*}/, match => match.replace(/padding: [^;]+;/, 'padding: 4px 8px;').replace(/font-size: [^;]+;/, 'font-size: 11px;'));
    content = content.replace(/\.ep-field\s*{[^}]*}/, match => match.replace(/margin-bottom: [^;]+;/, 'margin-bottom: 8px;'));
  }

  fs.writeFileSync(filePath, content);
}

const filesToScale = [
  'src/styles/phone-app.css',
  'src/styles/cash.css',
  'src/styles/base.css',
  'src/styles/app-preview.css',
  'src/styles/categories.css',
  'src/styles/sections.css'
];

filesToScale.forEach(file => {
  if (fs.existsSync(file)) {
    scaleDownCSS(file);
    console.log('Scaled down ' + file);
  }
});
