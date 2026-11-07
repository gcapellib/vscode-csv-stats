import { describeEffect, describeStep, type Step } from '../../core/steps';
import { isMeasurable } from '../../core/types';
import { closePicker, setOpenPanel } from '../actions';
import { addStep, changeType, removeStep, renameColumn, replaceValue, saveCleanCopy, treatAsEmpty } from '../cleaning';
import { COLUMN_TYPES, TYPE_LABELS } from '../constants';
import { elements, textSpan } from '../dom';
import { floating, positionFloating } from '../floating-setup';
import { palette, state } from '../state';
import { footer, panelTitle, sectionTitle, tintPanel } from './shared';

/**
 * Le panneau Clean : les étapes appliquées, le catalogue complet, la copie.
 *
 * Le balai d'une colonne donne les actions de cette colonne ; ce panneau-ci
 * donne tout, y compris ce qui ne regarde pas une seule colonne (doublons,
 * lignes vides). Les étapes se lisent dans l'ordre où elles se rejouent sur
 * l'original, chacune avec ce qu'elle a touché, et se retirent d'un clic.
 */
export function openClean(anchor: HTMLElement): void {
  const panel = elements.picker;
  panel.textContent = '';
  panel.classList.add('wide');
  tintPanel(null);
  panel.appendChild(panelTitle('Clean', `${state.fileName || 'The file'} stays untouched: the steps replay on the original`));

  panel.appendChild(sectionTitle('Applied steps'));
  const list = document.createElement('div');
  list.className = 'clean-steps';
  const nameAt = namesAlongTheRecipe();
  state.steps.forEach((step, position) => {
    const row = document.createElement('div');
    row.className = 'clean-step';
    const column = 'column' in step ? step.column : -1;
    if (column >= 0) row.style.borderLeftColor = palette(column).accent;
    row.append(
      textSpan(`${position + 1} · ${describeStep(step, nameAt[position])}`),
      Object.assign(textSpan(describeEffect(step, state.effects[position] ?? 0)), { className: 'clean-effect' }),
    );
    const remove = document.createElement('button');
    remove.className = 'clean-remove';
    remove.textContent = '✕';
    remove.title = 'Remove this step: the steps after it replay without it';
    remove.addEventListener('click', () => {
      removeStep(position);
      openClean(anchor);
    });
    row.appendChild(remove);
    list.appendChild(row);
  });
  if (state.steps.length === 0) {
    list.appendChild(
      Object.assign(textSpan('No steps yet. Use the broom on a column header, or the catalogue below.'), { className: 'picker-note' }),
    );
  }
  panel.appendChild(list);

  // Le catalogue. Chaque bouton ajoute une étape puis rouvre le panneau, pour
  // qu'on la voie arriver dans la liste avec ce qu'elle a touché.
  const then = (action: () => void | Promise<void>) => async () => {
    await action();
    openClean(anchor);
  };

  panel.appendChild(sectionTitle('Rows'));
  panel.appendChild(
    buttons([
      ['Remove duplicate rows', then(() => addStep({ kind: 'removeDuplicates' }))],
      ['Remove blank rows', then(() => addStep({ kind: 'removeBlankRows' }))],
    ]),
  );

  panel.appendChild(sectionTitle('Columns'));
  const picker = document.createElement('select');
  picker.className = 'picker-select clean-column';
  for (const index of state.order) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = state.stats[index]?.name ?? '';
    picker.appendChild(option);
  }
  if (state.selectedColumn !== null && state.order.includes(state.selectedColumn)) picker.value = String(state.selectedColumn);
  const chosen = () => Number(picker.value);
  const columnRow = document.createElement('div');
  columnRow.className = 'picker-bound';
  columnRow.append(textSpan('Column'), picker);
  panel.appendChild(columnRow);

  const onColumn = (make: (column: number) => Step) => then(() => addStep(make(chosen())));
  const textOnly = () => !isMeasurable(state.stats[chosen()]?.type ?? 'text');
  panel.appendChild(
    buttons([
      ['Trim spaces', onColumn((column) => ({ kind: 'trim', column })), textOnly],
      ['Clean invisible characters', onColumn((column) => ({ kind: 'clean', column })), textOnly],
      ['lowercase', onColumn((column) => ({ kind: 'case', column, mode: 'lower' })), textOnly],
      ['UPPERCASE', onColumn((column) => ({ kind: 'case', column, mode: 'upper' })), textOnly],
      ['Capitalize Each Word', onColumn((column) => ({ kind: 'case', column, mode: 'title' })), textOnly],
      ['Replace values…', then(() => replaceValue(chosen()))],
      ['Treat as empty…', then(() => treatAsEmpty(chosen()))],
      ['Fill down', onColumn((column) => ({ kind: 'fillDown', column }))],
      ['Rename…', then(() => renameColumn(chosen()))],
      ['Remove column', onColumn((column) => ({ kind: 'remove', column }))],
      ...COLUMN_TYPES.map((type): ButtonSpec => [`Type: ${TYPE_LABELS[type]}`, then(() => changeType(chosen(), type))]),
    ], picker),
  );

  panel.appendChild(
    footer([
      [
        'Save cleaned copy…',
        () => {
          saveCleanCopy();
          closePicker();
        },
        true,
      ],
      ['Close', closePicker, false],
    ]),
  );
  if (!floating.isOpen('picker')) floating.open('picker', anchor);
  positionFloating(panel, anchor);
  setOpenPanel('clean');
  elements.cleanButton.classList.add('active');
}

type ButtonSpec = [string, () => void, (() => boolean)?];

/**
 * Une grille de boutons. Ceux qui ne valent que pour une colonne de texte se
 * masquent quand la colonne choisie est un nombre ou une date.
 */
function buttons(specs: ButtonSpec[], picker?: HTMLSelectElement): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'clean-catalogue';
  const refresh: Array<() => void> = [];
  for (const [label, action, applies] of specs) {
    const button = document.createElement('button');
    button.className = 'picker-button';
    button.textContent = label;
    button.addEventListener('click', action);
    if (applies) refresh.push(() => (button.hidden = !applies()));
    grid.appendChild(button);
  }
  const update = () => refresh.forEach((apply) => apply());
  update();
  picker?.addEventListener('change', update);
  return grid;
}

/** Pour chaque étape, le nom de chaque colonne à ce point de la recette : « Trim spaces in city » après le renommage. */
function namesAlongTheRecipe(): Array<(column: number) => string> {
  const names = [...state.headers];
  return state.steps.map((step) => {
    const snapshot = [...names];
    if (step.kind === 'rename') names[step.column] = step.name;
    return (column: number) => snapshot[column] ?? `column ${column + 1}`;
  });
}
