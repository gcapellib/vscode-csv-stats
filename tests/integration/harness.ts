import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { decode, parse } from '../../src/core/csv';
import { computeAll } from '../../src/core/stats';

const ROOT = resolve(__dirname, '../..');

/**
 * Page autonome exécutant le vrai bundle produit par `npm run build`, pas une
 * réimplémentation — c'est précisément le point : un test unitaire ne peut
 * pas voir l'ordre réel des événements du navigateur (mousedown avant click),
 * ni une mesure prise pendant qu'un élément est `hidden`. Tout est intégré
 * dans la page (bundle, styles) : aucun serveur à démarrer, aucun port à
 * réserver, un test isolé des autres.
 */
export function harnessHtml(csvPath: string, theme = 'syntax'): string {
  const script = readFileSync(resolve(ROOT, 'dist/webview.js'), 'utf8');
  const css = readFileSync(resolve(ROOT, 'media/main.css'), 'utf8');
  const source = readFileSync(resolve(ROOT, 'src/extension.ts'), 'utf8');
  const body = source.slice(source.indexOf('<body>') + 6, source.indexOf('<script nonce='));

  const table = parse(decode(readFileSync(resolve(ROOT, csvPath))));
  const stats = computeAll(table);
  const head = {
    type: 'head',
    headers: table.headers,
    delimiter: table.delimiter,
    truncated: table.truncated,
    rowCount: table.rows.length,
    stats,
    theme,
  };
  const rows = { type: 'rows', start: 0, rows: table.rows, done: true };

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${css}</style>
<style>:root{
 --vscode-font-family:system-ui,sans-serif; --vscode-font-size:13px;
 --vscode-foreground:#cccccc; --vscode-editor-background:#1f1f1f;
 --vscode-descriptionForeground:#9d9d9d; --vscode-panel-border:#3c3c3c;
 --vscode-dropdown-background:#313131; --vscode-dropdown-foreground:#cccccc; --vscode-dropdown-border:#3c3c3c;
 --vscode-editorGroupHeader-tabsBackground:#181818; --vscode-list-hoverBackground:#2a2d2e;
 --vscode-list-activeSelectionBackground:#04395e; --vscode-list-activeSelectionForeground:#ffffff;
 --vscode-editorHoverWidget-background:#202020; --vscode-editorHoverWidget-border:#454545; --vscode-editorHoverWidget-foreground:#cccccc;
 --vscode-editorWidget-background:#202020;}</style></head>
<body class="vscode-dark">
${body}
<script>window.acquireVsCodeApi = () => ({ postMessage: (m) => { window.__sent = (window.__sent||[]).concat(m); } });</script>
<script>${script}</script>
<script>
window.postMessage(${JSON.stringify(head)}, '*');
window.postMessage(${JSON.stringify(rows)}, '*');
</script>
</body></html>`;
}

/** Charge le harness et attend que la première ligne soit peinte. */
export async function openHarness(page: Page, csvPath = 'samples/wines.csv', theme = 'syntax'): Promise<void> {
  await page.setContent(harnessHtml(csvPath, theme));
  await page.waitForSelector('.row');
}
