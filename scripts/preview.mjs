/**
 * Page d'essai locale : le vrai bundle de la vue, sur un CSV du dépôt, sans
 * VS Code. Lancée par le bouton « play » (.claude/launch.json) ou `npm run preview`.
 *
 *   http://localhost:4173/                       → samples/wines.csv
 *   http://localhost:4173/?csv=samples/xxx.csv   → un autre fichier du dépôt
 *
 * La page est reconstruite à chaque chargement : après `npm run build`, un
 * simple rechargement montre le nouveau code.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const port = Number(process.env.PORT ?? 4173);
const { decode, parse } = await import(resolve(root, 'out/core/csv.js'));
const { computeAll } = await import(resolve(root, 'out/core/stats.js'));

function page(csv) {
  const script = readFileSync(resolve(root, 'dist/webview.js'), 'utf8');
  const css = readFileSync(resolve(root, 'media/main.css'), 'utf8');
  const source = readFileSync(resolve(root, 'src/extension.ts'), 'utf8');
  const body = source.slice(source.indexOf('<body>') + 6, source.indexOf('<script nonce='));
  const table = parse(decode(readFileSync(csv)));
  const head = {
    type: 'head',
    headers: table.headers,
    delimiter: table.delimiter,
    truncated: table.truncated,
    rowCount: table.rows.length,
    stats: computeAll(table),
    theme: 'syntax',
  };
  const rows = { type: 'rows', start: 0, rows: table.rows, lines: table.lines, done: true };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CSV Stats — ${relative(root, csv)}</title>
<style>${css}</style>
<style>:root{--vscode-font-family:system-ui,sans-serif;--vscode-font-size:13px;--vscode-foreground:#cccccc;--vscode-editor-background:#1f1f1f;
--vscode-descriptionForeground:#9d9d9d;--vscode-panel-border:#3c3c3c;--vscode-dropdown-background:#313131;--vscode-dropdown-foreground:#cccccc;
--vscode-dropdown-border:#3c3c3c;--vscode-editorGroupHeader-tabsBackground:#181818;--vscode-list-hoverBackground:#2a2d2e;
--vscode-list-activeSelectionBackground:#04395e;--vscode-list-activeSelectionForeground:#ffffff;--vscode-editorWidget-background:#202020;
--vscode-editorHoverWidget-background:#202020;--vscode-editorHoverWidget-border:#454545;--vscode-editorHoverWidget-foreground:#cccccc;}
body{background:var(--vscode-editor-background)}</style></head>
<body class="vscode-dark">
${body}
<script>window.acquireVsCodeApi = () => ({ postMessage: () => {} });</script>
<script>${script}</script>
<script>window.postMessage(${JSON.stringify(head)}, '*');window.postMessage(${JSON.stringify(rows)}, '*');</script>
</body></html>`;
}

createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://localhost:${port}`);
    if (url.pathname !== '/') {
      response.writeHead(404).end();
      return;
    }
    const csv = resolve(root, url.searchParams.get('csv') ?? 'samples/wines.csv');
    const inside = relative(root, csv);
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('CSV must be inside the repository');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(csv));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error));
  }
}).listen(port, () => console.log(`CSV Stats preview: http://localhost:${port}/`));
