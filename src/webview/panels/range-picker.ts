import { type Filter } from '../../core/filters';
import { num } from '../../core/format';
import { closePicker, setOpenPanel } from '../actions';
import { elements, textSpan } from '../dom';
import { floating, positionFloating } from '../floating-setup';
import { state } from '../state';
import { setColumnFilter } from '../table';

/**
 * Pendant numérique du sélecteur : deux bornes saisies à la main.
 *
 * Une liste de valeurs n'a pas de sens sur une mesure continue, et les tranches
 * de l'histogramme ne permettent pas de demander « entre 0 et 10 ».
 */
export function openRangePicker(columnIndex: number, anchor: HTMLElement): void {
  const column = state.stats[columnIndex];
  const current = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'range' }> =>
      filter.kind === 'range' && filter.column === columnIndex,
  );

  elements.picker.textContent = '';
  const title = document.createElement('div');
  title.className = 'picker-title';
  title.textContent = column?.name ?? '';
  elements.picker.appendChild(title);

  const make = (label: string, value: number) => {
    const row = document.createElement('label');
    row.className = 'picker-row';
    row.append(textSpan(label));
    const input = document.createElement('input');
    input.className = 'picker-number';
    input.type = 'number';
    input.step = 'any';
    input.value = String(value);
    row.appendChild(input);
    elements.picker.appendChild(row);
    return input;
  };
  const low = make('From', current?.low ?? column?.min ?? 0);
  const high = make('To', current?.high ?? column?.max ?? 0);

  const footer = document.createElement('div');
  footer.className = 'picker-footer';
  const clear = document.createElement('button');
  clear.className = 'picker-button';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => {
    closePicker();
    setColumnFilter(columnIndex, null);
  });
  const apply = document.createElement('button');
  apply.className = 'picker-button primary';
  apply.textContent = 'Apply';
  apply.addEventListener('click', () => {
    const from = Number(low.value);
    const to = Number(high.value);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    closePicker();
    setColumnFilter(columnIndex, {
      kind: 'range',
      column: columnIndex,
      low: Math.min(from, to),
      high: Math.max(from, to),
      // Bornes saisies à la main : les deux sont incluses, comme on les lit.
      last: true,
      label: `${column?.name} ${num(Math.min(from, to))} – ${num(Math.max(from, to))}`,
    });
  });
  footer.append(clear, apply);
  elements.picker.appendChild(footer);

  floating.open('picker', anchor);
  positionFloating(elements.picker, anchor);
  setOpenPanel(`filter:${columnIndex}`);
  low.focus();
}
