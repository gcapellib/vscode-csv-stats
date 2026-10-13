import { type BlankMode } from '../../core/filters';
import { count } from '../../core/format';
import { textSpan } from '../dom';

/** Un menu déroulant natif : `options` associe la valeur à son libellé. */
export function select(className: string, options: Array<[string, string]>, value: string): HTMLSelectElement {
  const element = document.createElement('select');
  element.className = `picker-select ${className}`;
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    element.appendChild(option);
  }
  element.value = value;
  return element;
}

/** Une étiquette suivie de son champ, sur la grille commune des panneaux. */
export function fieldRow(label: string, ...fields: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'picker-bound';
  row.append(textSpan(label), ...fields);
  return row;
}

export function numberInput(placeholder: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'picker-number';
  input.type = 'number';
  input.step = 'any';
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

/**
 * Ce que deviennent les cellules vides, en un seul choix plutôt qu'une case et
 * un bouton : `only` ne garde qu'elles (la condition est alors sans objet),
 * `add` les ajoute au résultat, `exclude` les écarte, et le choix par défaut
 * laisse la condition décider.
 */
export type EmptyChoice = '' | BlankMode | 'only';

export function emptyChoiceRow(missing: number, initial: EmptyChoice): { row: HTMLElement; read: () => EmptyChoice } {
  const choice = select(
    'picker-empties',
    [
      ['', 'Follow the condition'],
      ['exclude', 'Hide them'],
      ['add', 'Keep them too'],
      ['only', `Only empty cells (${count(missing)})`],
    ],
    initial,
  );
  if (missing === 0) choice.disabled = true;
  const row = fieldRow('Empty', choice);
  return { row, read: () => (choice.disabled ? '' : (choice.value as EmptyChoice)) };
}

export function footerButtons(buttons: Array<[string, () => void, boolean]>): HTMLElement {
  const element = document.createElement('div');
  element.className = 'picker-footer';
  for (const [label, action, primary] of buttons) {
    const button = document.createElement('button');
    button.className = primary ? 'picker-button primary' : 'picker-button';
    button.textContent = label;
    button.addEventListener('click', action);
    element.appendChild(button);
  }
  return element;
}
