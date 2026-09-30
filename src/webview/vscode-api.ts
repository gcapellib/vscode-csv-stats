/** Le pont vers l'extension host, acquis une seule fois. */

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

export const vscode = acquireVsCodeApi();
