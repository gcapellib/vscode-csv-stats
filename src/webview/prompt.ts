import { vscode } from './vscode-api';

/** Boîte de saisie côté hôte (renommer une colonne) — l'hôte ne rend aucune UI lui-même. */

const pending = new Map<string, (value: string | null) => void>();

export function ask(title: string, prompt: string, value: string): Promise<string | null> {
  const token = `${Date.now()}-${Math.random()}`;
  return new Promise((resolve) => {
    pending.set(token, resolve);
    vscode.postMessage({ type: 'prompt', token, title, prompt, value });
  });
}

export function resolvePrompt(token: string, value: string | null): void {
  const resolve = pending.get(token);
  if (!resolve) return;
  pending.delete(token);
  resolve(value);
}
