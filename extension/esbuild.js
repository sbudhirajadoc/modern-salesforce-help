const esbuild = require('esbuild');
require('./scripts/copyAssets');

// Extension host — Node.js, vscode is provided by VS Code runtime
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
}).catch(() => process.exit(1));

// Webview — browser context, React JSX, no Node APIs
esbuild.build({
  entryPoints: ['src/webview/webviewScript.tsx'],
  bundle: true,
  outfile: 'dist/webviewScript.js',
  platform: 'browser',
  jsx: 'automatic',
  sourcemap: true,
}).catch(() => process.exit(1));
