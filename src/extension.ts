import * as vscode from 'vscode';
import { decode, parse, type CsvTable } from './core/csv';
import { compute, computeAll, type ColumnStats, type ColumnType } from './core/stats';

const VIEW_TYPE = 'csvStats.editor';
const THEME_KEY = 'csvStats.theme';
const INSIGHTS_KEY = 'csvStats.insights';

/** Au-delà, on refuse de charger plutôt que de saturer la mémoire de l'hôte. */
const MAX_FILE_BYTES = 300 * 1024 * 1024;

/** Les lignes partent par paquets : la vue s'affiche sans attendre la dernière. */
const CHUNK_ROWS = 20_000;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new CsvStatsEditorProvider(context), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.commands.registerCommand('csvStats.open', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showWarningMessage('Open a .csv file first.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
    }),
  );
}

export function deactivate(): void {
  // Rien à libérer : tout est enregistré dans les souscriptions du contexte.
}

class CsvDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {
    // Aucun état hors de la vue elle-même.
  }
}

/**
 * Onglet « CSV Stats ».
 *
 * Le fichier est lu et analysé dans l'hôte d'extension, pas dans la vue : le
 * webview reste réactif pendant tout le chargement, et reçoit les statistiques
 * avant même la première ligne.
 */
class CsvStatsEditorProvider implements vscode.CustomReadonlyEditorProvider<CsvDocument> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): CsvDocument {
    return new CsvDocument(uri);
  }

  async resolveCustomEditor(document: CsvDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist'), vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    panel.webview.html = this.html(panel.webview);

    let table: CsvTable | null = null;
    const stats: ColumnStats[] = [];

    panel.webview.onDidReceiveMessage(async (message: { type: string; [key: string]: unknown }) => {
      switch (message.type) {
        case 'ready':
          await this.load(document, panel, (loaded, computed) => {
            table = loaded;
            stats.length = 0;
            stats.push(...computed);
          });
          break;
        case 'selectTheme':
          await this.context.globalState.update(THEME_KEY, message.id as string);
          break;
        case 'setInsights':
          await this.context.globalState.update(INSIGHTS_KEY, message.visible as boolean);
          break;
        case 'prompt': {
          const answer = await vscode.window.showInputBox({
            title: message.title as string,
            prompt: message.prompt as string,
            value: message.value as string,
          });
          void panel.webview.postMessage({ type: 'promptResult', token: message.token, value: answer ?? null });
          break;
        }
        case 'changeType': {
          if (!table) return;
          const index = message.index as number;
          const recomputed = compute(table, index, message.forced as ColumnType);
          recomputed.name = stats[index]?.name ?? recomputed.name;
          stats[index] = recomputed;
          void panel.webview.postMessage({ type: 'columnStats', index, stats: recomputed });
          break;
        }
      }
    });
  }

  private async load(
    document: CsvDocument,
    panel: vscode.WebviewPanel,
    keep: (table: CsvTable, stats: ColumnStats[]) => void,
  ): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(document.uri);
      if (raw.byteLength > MAX_FILE_BYTES) {
        void panel.webview.postMessage({
          type: 'failed',
          message: `File too large for CSV Stats (${Math.round(raw.byteLength / (1024 * 1024))} MB).`,
        });
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `Analysing ${basename(document.uri)}` },
        async () => {
          const text = decode(raw);
          const table = parse(text);
          if (table.headers.length === 0) {
            void panel.webview.postMessage({ type: 'failed', message: 'Empty file: no column detected.' });
            return;
          }
          const stats = computeAll(table);
          keep(table, stats);

          void panel.webview.postMessage({
            type: 'head',
            headers: table.headers,
            delimiter: table.delimiter,
            truncated: table.truncated,
            rowCount: table.rows.length,
            fileName: basename(document.uri),
            stats,
            theme: this.context.globalState.get<string>(THEME_KEY),
            insights: this.context.globalState.get<boolean>(INSIGHTS_KEY) ?? true,
          });

          for (let start = 0; start < table.rows.length; start += CHUNK_ROWS) {
            void panel.webview.postMessage({
              type: 'rows',
              start,
              rows: table.rows.slice(start, start + CHUNK_ROWS),
              done: start + CHUNK_ROWS >= table.rows.length,
            });
            // Laisse l'hôte respirer entre deux paquets.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        },
      );
    } catch (error) {
      void panel.webview.postMessage({
        type: 'failed',
        message: `Could not read the file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
    const nonce = randomNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${style}" rel="stylesheet">
<title>CSV Stats</title>
</head>
<body>
<div id="toolbar">
  <span id="shape"></span>
  <span class="toolbar-sep"></span>
  <button id="insights-toggle" type="button" aria-expanded="true" title="Show or hide the statistics bands">
    <span class="chevron">▾</span> Insights
  </button>
  <button id="dataset-button" type="button" title="Duplicates, findings and the matching pandas call">Dataset…</button>
  <span class="toolbar-sep"></span>
  <span class="toolbar-label">Theme</span>
  <button id="theme-button" type="button" aria-haspopup="listbox" aria-expanded="false">
    <span id="theme-swatch" class="swatch"></span>
    <span id="theme-label"></span>
    <span class="caret">⌄</span>
  </button>
  <div id="theme-popup" role="listbox" hidden></div>
  <span id="selection"></span>
  <span id="notice"></span>
</div>
<div id="filters" hidden></div>
<div id="scroller"><div id="sheet">
  <div id="frozen">
    <div id="band"></div>
    <div id="head"></div>
  </div>
  <div id="body"></div>
</div></div>
<div id="tooltip" hidden></div>
<div id="menu" hidden></div>
<div id="picker" hidden></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}

function basename(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || uri.path;
}

function randomNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  return nonce;
}
