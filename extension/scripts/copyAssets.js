const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@salesforce-ux', 'design-system-2', 'dist', 'css', 'bundled', 'slds2.cosmos.css');
const destDir = path.join(__dirname, '..', 'media', 'slds');
const dest = path.join(destDir, 'slds2.css');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied SLDS 2 CSS → ${path.relative(path.join(__dirname, '..'), dest)}`);
