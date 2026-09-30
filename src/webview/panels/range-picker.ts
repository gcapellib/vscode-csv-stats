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

  const make = (label: string, value: string) => {
    const row = document.createElement('label');
    // Classe propre aux bornes : « picker-row » sert aussi aux cases à cocher
    // du sélecteur de valeurs, dont la disposition n'a rien à voir.
    row.className = 'picker-bound';
    row.append(textSpan(label));
    const input = document.createElement('input');
    input.className = 'picker-number';
    input.type = 'number';
    input.step = 'any';
    input.value = value;
    row.appendChild(input);
    elements.picker.appendChild(row);
    return input;
  };

  // Un filtre sur une seule valeur se lit « = 7 », pas « de 7 à 7 » : il est
  // rouvert dans son propre champ plutôt qu'étalé sur les deux bornes.
  const point = current !== undefined && current.low === current.high;
  const low = make('From', point ? '' : String(current?.low ?? column?.min ?? 0));
  const high = make('To', point ? '' : String(current?.high ?? column?.max ?? 0));

  const separator = document.createElement('div');
  separator.className = 'picker-or';
  separator.textContent = 'or';
  elements.picker.appendChild(separator);

  const exact = make('Exactly', point ? String(current.low) : '');

  // Les deux modes s'excluent : remplir l'un vide l'autre, plutôt que de
  // laisser deviner lequel l'emporte au moment d'appliquer.
  for (const bound of [low, high]) {
    bound.addEventListener('input', () => {
      if (bound.value !== '') exact.value = '';
    });
  }
  exact.addEventListener('input', () => {
    if (exact.value === '') return;
    low.value = '';
    high.value = '';
  });

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
    const single = Number(exact.value);
    if (exact.value.trim() !== '' && Number.isFinite(single)) {
      closePicker();
      // Une borne unique reste un intervalle, fermé des deux côtés : la
      // comparaison demeure numérique, donc « 7 » retient aussi « 7.0 », ce
      // qu'une égalité de texte manquerait.
      setColumnFilter(columnIndex, {
        kind: 'range',
        column: columnIndex,
        low: single,
        high: single,
        last: true,
        label: `${column?.name} = ${num(single)}`,
      });
      return;
    }

    const from = Number(low.value);
    const to = Number(high.value);
    if (low.value.trim() === '' || high.value.trim() === '') return;
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
