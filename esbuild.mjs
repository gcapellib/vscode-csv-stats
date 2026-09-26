// Deux cibles : l'extension tourne dans Node, la vue tourne dans le navigateur
// du webview. Elles partagent le même cœur métier (src/core), qui n'est donc
// écrit qu'une fois.
import { build } from 'esbuild';

const common = { bundle: true, minify: true, sourcemap: false, logLevel: 'info' };

await build({
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
});

await build({
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
});
