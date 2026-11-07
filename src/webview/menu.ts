import { computeDetails } from '../core/details';
import { count } from '../core/format';
import { applySteps, type Step } from '../core/steps';
import { isMeasurable, type ColumnType } from '../core/types';
import { addStep, changeType, renameColumn, replaceValue, roundColumn, treatAsEmpty } from './cleaning';
import { elements } from './dom';
import { floating, positionFloating } from './floating-setup';
import { icon } from './icons';
import { openDetails } from './panels/column-details';
import { palette, state } from './state';
import { vscode } from './vscode-api';

/**
 * Le menu du balai — ou du clic droit sur l'en-tête : du diagnostic à l'action.
 *
 * Chaque action dit ce qu'elle toucherait (« · 20 cells »), compté par un essai
 * à blanc de l'étape sur les données telles qu'elles sont : un menu qui
 * annonce « Trim spaces » sans dire s'il y a quoi que ce soit à rogner fait
 * cliquer pour rien. Une coche marque ce qui est déjà appliqué à la colonne.
 * Les variantes d'un même geste — la casse, le type — tiennent sur une ligne de
 * pastilles plutôt que sur cinq lignes de menu.
 *
 * Les entrées sans objet n'apparaissent pas : ni Trim ni casse sur des nombres.
 */
/** Colonne dont le menu est ouvert, pour que son bouton le referme. */
let menuColumn: number | null = null;

const TYPES: Array<[ColumnType, string]> = [
  ['numeric', 'Number'],
  ['date', 'Date'],
  ['time', 'Time'],
  ['text', 'Text'],
];

export function openMenu(modelIndex: number, anchor: HTMLElement): void {
  if (floating.isOpen('menu') && menuColumn === modelIndex) {
    floating.close();
    return;
  }
  menuColumn = modelIndex;
  const column = state.stats[modelIndex];
  const accent = palette(modelIndex).accent;
  const text = !isMeasurable(column.type);
  const menu = elements.menu;
  menu.textContent = '';
  menu.classList.add('clean-menu');
  menu.style.borderTopColor = accent;

  const applied = (kind: Step['kind']) => state.steps.some((step) => step.kind === kind && 'column' in step && step.column === modelIndex);
  const effect = (step: Step) => applySteps(state.rows, state.headers, [step], state.delimiter === ';').effects[0] ?? 0;
  const cells = (amount: number) => (amount === 0 ? 'none' : `${count(amount)} cell${amount === 1 ? '' : 's'}`);

  const run = (action: () => void) => () => {
    closeMenu();
    action();
  };
  const item = (label: string, action: () => void, options: { mark?: 'check' | SVGSVGElement; hint?: string; idle?: boolean } = {}) => {
    const button = document.createElement('button');
    button.className = 'menu-item';
    if (options.idle) button.classList.add('idle');
    const mark = document.createElement('span');
    mark.className = 'cmenu-mark';
    mark.style.color = accent;
    if (options.mark === 'check') mark.textContent = '✓';
    else if (options.mark) mark.appendChild(options.mark);
    const name = document.createElement('span');
    name.textContent = label;
    button.append(mark, name);
    if (options.hint) {
      const hint = document.createElement('span');
      hint.className = 'cmenu-hint';
      hint.textContent = `· ${options.hint}`;
      button.appendChild(hint);
    }
    button.addEventListener('click', run(action));
    menu.appendChild(button);
  };
  const heading = (label: string) => {
    const element = document.createElement('div');
    element.className = 'menu-heading';
    element.textContent = label;
    menu.appendChild(element);
  };
  const chips = (entries: Array<[string, () => void, boolean?]>) => {
    const row = document.createElement('div');
    row.className = 'cmenu-chips';
    for (const [label, action, on] of entries) {
      const chip = document.createElement('button');
      chip.className = on ? 'cmenu-chip on' : 'cmenu-chip';
      if (on) chip.style.background = accent;
      chip.textContent = label;
      chip.addEventListener('click', run(action));
      row.appendChild(chip);
    }
    menu.appendChild(row);
  };

  item('Column details…', () => openDetails(modelIndex, anchor), { mark: icon('chart') });
  item('Copy column name', () => vscode.postMessage({ type: 'copy', text: column.name }), { mark: icon('copy') });

  if (text) {
    heading('Text');
    const trim: Step = { kind: 'trim', column: modelIndex };
    const clean: Step = { kind: 'clean', column: modelIndex };
    const trimmed = effect(trim);
    const invisible = effect(clean);
    item('Trim spaces', () => addStep(trim), { mark: applied('trim') ? 'check' : undefined, hint: cells(trimmed), idle: trimmed === 0 && !applied('trim') });
    item('Clean invisible characters', () => addStep(clean), {
      mark: applied('clean') ? 'check' : undefined,
      hint: cells(invisible),
      idle: invisible === 0 && !applied('clean'),
    });
    chips([
      ['lowercase', () => addStep({ kind: 'case', column: modelIndex, mode: 'lower' })],
      ['UPPERCASE', () => addStep({ kind: 'case', column: modelIndex, mode: 'upper' })],
      ['Capitalize', () => addStep({ kind: 'case', column: modelIndex, mode: 'title' })],
    ]);
  }

  heading('Values');
  const table = { headers: state.headers, rows: state.rows, delimiter: state.delimiter, truncated: false };
  const tokens = computeDetails(table, modelIndex, column.type, column.temporal).nullTokens.map((token) => token.value);
  const fill: Step = { kind: 'fillDown', column: modelIndex };
  const filled = effect(fill);
  item('Replace values…', () => void replaceValue(modelIndex), { mark: applied('replace') ? 'check' : undefined });
  item('Treat as empty…', () => void treatAsEmpty(modelIndex, tokens), {
    mark: applied('empty') ? 'check' : undefined,
    hint: tokens.length > 0 ? tokens.join(', ') : undefined,
  });
  item('Fill down', () => addStep(fill), { mark: applied('fillDown') ? 'check' : undefined, hint: cells(filled), idle: filled === 0 && !applied('fillDown') });

  // Les lignes où cette colonne est vide : le nettoyage le plus courant, et le
  // seul qui retire des lignes au lieu de changer des cellules.
  const dropEmpty: Step = { kind: 'dropEmpty', column: modelIndex };
  const emptyRows = effect(dropEmpty);
  item('Remove rows where empty', () => addStep(dropEmpty), {
    mark: applied('dropEmpty') ? 'check' : undefined,
    hint: emptyRows === 0 ? 'none' : `${count(emptyRows)} row${emptyRows === 1 ? '' : 's'}`,
    idle: emptyRows === 0 && !applied('dropEmpty'),
  });

  if (column.type === 'numeric') {
    heading('Numbers');
    item('Round…', () => void roundColumn(modelIndex), { mark: applied('round') ? 'check' : undefined });
  }

  heading('Type');
  chips(
    TYPES.map(([type, label]) => [
      label,
      () => {
        if (type !== column.type) changeType(modelIndex, type);
      },
      type === column.type,
    ]),
  );

  heading('Column');
  chips([
    ['Rename…', () => void renameColumn(modelIndex)],
    ['Remove column', () => addStep({ kind: 'remove', column: modelIndex })],
  ]);

  floating.open('menu', anchor);
  positionFloating(menu, anchor);
}

export function closeMenu(): void {
  floating.close();
}

/** Appelé quand le menu se ferme, quel que soit le chemin (voir floating.ts). */
export function resetMenuColumn(): void {
  menuColumn = null;
  elements.menu.classList.remove('clean-menu');
  elements.menu.style.borderTopColor = '';
}
