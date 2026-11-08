/**
 * Les étapes de nettoyage, côté vue : les ajouter, les retirer, les rejouer.
 *
 * Rejouer, c'est repartir de `state.original` — le fichier tel qu'il a été lu,
 * jamais modifié — et lui appliquer toute la liste (voir core/steps.ts). Les
 * types et les statistiques se recalculent alors sur le résultat : un Trim peut
 * faire d'une colonne de texte une colonne de nombres.
 */
import { count } from '../core/format';
import { compute } from '../core/stats';
import { applySteps, columnOf, compileRegex, toCsv, type Step } from '../core/steps';
import { type ColumnType } from '../core/types';
import { refilter } from './actions';
import { elements } from './dom';
import { ask, askFields } from './prompt';
import { state } from './state';
import { vscode } from './vscode-api';

export function reapplySteps(): void {
  const result = applySteps(state.original, state.headers, state.steps, state.delimiter === ';');
  state.rows = result.rows;
  state.source = result.source;
  state.lines = result.source.map((index) => state.originalLines[index] ?? index + 2);
  state.effects = result.effects;
  state.forcedTypes = result.types;
  state.order = state.headers.map((_, index) => index).filter((index) => !result.removed.has(index));
  if (state.selectedColumn !== null && result.removed.has(state.selectedColumn)) {
    state.selectedColumn = null;
    elements.selection.textContent = '';
  }
  // Les lignes ont pu changer d'index : ce qui les désignait par leur index
  // (sélection, filtre des doublons) ne vaut plus.
  state.selected.clear();
  state.active = null;
  state.filters = state.filters.filter((filter) => filter.kind !== 'duplicates' && !result.removed.has(filter.column));
  if (state.sort && result.removed.has(state.sort.index)) state.sort = null;
  // La forme annoncée est celle du tableau nettoyé, comme ce que la copie contiendra.
  elements.shape.textContent = `${count(state.rows.length)} rows × ${count(state.order.length)} columns`;

  // Les types se redécident sur les données nettoyées, sauf ceux qu'une étape impose.
  const table = { headers: state.headers, rows: state.rows, delimiter: state.delimiter, truncated: false };
  state.stats = state.headers.map((_, index) => {
    const stats = compute(table, index, state.forcedTypes.get(index));
    stats.name = result.names[index];
    return stats;
  });
  refilter();
}

export function addStep(step: Step): void {
  state.steps = [...state.steps, step];
  reapplySteps();
}

export function removeStep(position: number): void {
  state.steps = state.steps.filter((_, index) => index !== position);
  reapplySteps();
}

/** Les étapes qui portent sur une colonne, pour allumer son balai. */
export function stepsOn(column: number): number {
  return state.steps.filter((step) => columnOf(step) === column).length;
}

export async function renameColumn(column: number): Promise<void> {
  const current = state.stats[column]?.name ?? '';
  const entered = await ask('Rename column', 'New name for this column', current);
  if (entered === null || entered.trim() === '' || entered.trim() === current) return;
  addStep({ kind: 'rename', column, name: entered.trim() });
}

/** Un changement de type remplace le précédent s'il vient juste avant : on corrige, on n'empile pas. */
export function changeType(column: number, type: ColumnType): void {
  const last = state.steps[state.steps.length - 1];
  if (last?.kind === 'type' && last.column === column) state.steps = state.steps.slice(0, -1);
  addStep({ kind: 'type', column, type });
}

export async function replaceValue(column: number): Promise<void> {
  const values = await askFields('Replace values', [
    { label: 'Value to replace (the whole cell)', value: state.stats[column]?.top[0]?.value ?? '' },
    { label: 'Replace with (empty to clear it)' },
  ]);
  if (values === null) return;
  addStep({ kind: 'replace', column, from: values[0], to: values[1] });
}

/**
 * Chercher dans la cellule, pas la cellule entière : « € » dans « 12 € ». Entre deux barres
 * obliques, `/\\d+ ?kg/`, le motif est une expression régulière.
 */
export async function replaceText(column: number): Promise<void> {
  const values = await askFields(
    'Replace text',
    [{ label: 'Text to find in each cell, or /pattern/' }, { label: 'Replace with (empty to remove it)' }],
    {
      validate: ([found]) => {
        if (found === '') return 'Write the text to find.';
        const pattern = regexIn(found);
        return pattern !== null && compileRegex(pattern) === null ? `« ${pattern} » is not a valid regular expression.` : null;
      },
    },
  );
  if (values === null) return;
  const [found, to] = values;
  const pattern = regexIn(found);
  addStep(pattern !== null ? { kind: 'replace', column, from: pattern, to, mode: 'regex' } : { kind: 'replace', column, from: found, to, mode: 'contains' });
}

/** Le motif d'un texte écrit /entre barres/, ou `null` : c'est alors du texte simple. */
function regexIn(text: string): string | null {
  return text.length > 2 && text.startsWith('/') && text.endsWith('/') ? text.slice(1, -1) : null;
}

/** Les cellules vides d'une colonne reçoivent une valeur fixe : 0, « unknown »… */
export async function fillEmpty(column: number): Promise<void> {
  const value = await ask('Fill empty cells', 'Value to put in every empty cell', '');
  if (value === null || value.trim() === '') return;
  addStep({ kind: 'fillValue', column, value });
}

/**
 * Retire les lignes que la vue montre en ce moment (un filtre est actif) : outliers,
 * lignes d'une valeur, doublons. Le filtre n'a plus d'objet une fois les lignes parties.
 * Les lignes sont désignées par leur place dans le fichier d'origine, pour que l'étape
 * se rejoue à l'identique.
 */
export function removeShownRows(): void {
  if (state.filters.length === 0 || state.view.length === 0 || state.view.length === state.rows.length) return;
  const label = state.filters.map((filter) => filter.label).join(' + ');
  const rows = state.view.map((index) => state.source[index]);
  state.filters = [];
  addStep({ kind: 'dropRows', rows, label });
}

export async function roundColumn(column: number): Promise<void> {
  const entered = await ask('Round', 'Number of decimals to keep', '2', {
    validate: ([digits]) => (/^\d{1,2}$/.test(digits.trim()) && Number(digits) <= 15 ? null : 'A whole number from 0 to 15.'),
  });
  if (entered === null) return;
  addStep({ kind: 'round', column, digits: Number(entered.trim()) });
}

/** `suggested` : les jetons d'absence déjà repérés dans la colonne, proposés d'office. */
export async function treatAsEmpty(column: number, suggested: string[] = []): Promise<void> {
  const proposal = suggested.length > 0 ? suggested.join(', ') : 'NULL, -, n/a';
  const entered = await ask('Treat as empty', 'Values that mean "missing", separated by commas', proposal);
  if (entered === null) return;
  const tokens = entered
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '');
  if (tokens.length > 0) addStep({ kind: 'empty', column, tokens });
}

/**
 * Envoie le tableau nettoyé à l'hôte, qui l'écrit dans un nouveau fichier à
 * côté de l'original : `nom.clean.csv`, puis `nom.clean-2.csv`… Jamais
 * l'original, et jamais par-dessus une copie existante. Toutes les lignes, pas
 * seulement celles qu'un filtre laisse voir : un filtre sert à regarder.
 */
export function saveCleanCopy(): void {
  const names = state.stats.map((column) => column.name);
  const text = toCsv(names, state.rows, state.order, state.delimiter);
  vscode.postMessage({ type: 'saveCopy', text });
}
