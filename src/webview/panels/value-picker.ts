import { type Filter } from '../../core/filters';
import { count } from '../../core/format';
import { closePicker, setOpenPanel } from '../actions';
import { elements, textSpan } from '../dom';
import { floating, positionFloating } from '../floating-setup';
import { state } from '../state';
import { setColumnFilter, valueCounts, valuesFilter } from '../table';

/** Au-delà, la liste devient illisible : la recherche prend le relais. */
const PICKER_MAX_ROWS = 400;

/**
 * Sélecteur de valeurs, à la manière d'Excel.
 *
 * Le palmarès du bandeau ne montre que trois valeurs ; toutes les autres sont
 * noyées dans « Other » et resteraient hors d'atteinte. Ce panneau les rend
 * toutes sélectionnables, et la recherche lui permet de tenir même sur une
 * colonne à plusieurs milliers de valeurs distinctes.
 */
export function openValuePicker(columnIndex: number, anchor: HTMLElement): void {
  const column = state.stats[columnIndex];
  const counts = valueCounts(columnIndex);
  const current = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'values' }> =>
      filter.kind === 'values' && filter.column === columnIndex,
  );
  const chosen = new Set<string>(current?.values ?? []);

  elements.picker.textContent = '';
  const title = document.createElement('div');
  title.className = 'picker-title';
  title.textContent = column?.name ?? '';
  elements.picker.appendChild(title);

  const search = document.createElement('input');
  search.className = 'picker-search';
  search.type = 'search';
  search.placeholder = 'Search values…';
  elements.picker.appendChild(search);

  const selectAll = document.createElement('label');
  selectAll.className = 'picker-row picker-all';
  const allBox = document.createElement('input');
  allBox.type = 'checkbox';
  selectAll.append(allBox, textSpan('(Select all)'));
  elements.picker.appendChild(selectAll);

  const list = document.createElement('div');
  list.className = 'picker-list';
  elements.picker.appendChild(list);

  const note = document.createElement('div');
  note.className = 'picker-note';
  elements.picker.appendChild(note);

  let visible: string[] = [];

  const render = () => {
    const needle = search.value.trim().toLowerCase();
    const matching = needle === '' ? counts : counts.filter(([value]) => value.toLowerCase().includes(needle));
    visible = matching.slice(0, PICKER_MAX_ROWS).map(([value]) => value);
    list.textContent = '';
    for (const [value, occurrences] of matching.slice(0, PICKER_MAX_ROWS)) {
      const row = document.createElement('label');
      row.className = 'picker-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = chosen.has(value);
      box.addEventListener('change', () => {
        if (box.checked) chosen.add(value);
        else chosen.delete(value);
        syncAll();
      });
      const name = textSpan(value === '' ? '(blank)' : value);
      name.className = 'picker-value';
      const tally = textSpan(count(occurrences));
      tally.className = 'picker-count';
      row.append(box, name, tally);
      list.appendChild(row);
    }
    note.textContent =
      matching.length > PICKER_MAX_ROWS
        ? `Showing ${count(PICKER_MAX_ROWS)} of ${count(matching.length)} values — refine your search`
        : `${count(matching.length)} values`;
    syncAll();
  };

  const syncAll = () => {
    const picked = visible.filter((value) => chosen.has(value)).length;
    allBox.checked = picked > 0 && picked === visible.length;
    allBox.indeterminate = picked > 0 && picked < visible.length;
  };

  allBox.addEventListener('change', () => {
    // « Tout sélectionner » porte sur ce que la recherche laisse voir, comme
    // dans Excel : sur une liste filtrée, il serait trompeur de tout cocher.
    for (const value of visible) {
      if (allBox.checked) chosen.add(value);
      else chosen.delete(value);
    }
    render();
  });

  search.addEventListener('input', render);
  render();

  const footer = document.createElement('div');
  footer.className = 'picker-footer';
  const cancel = document.createElement('button');
  cancel.className = 'picker-button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', closePicker);
  const apply = document.createElement('button');
  apply.className = 'picker-button primary';
  apply.textContent = 'Apply';
  apply.addEventListener('click', () => {
    closePicker();
    // Tout cocher ne filtre rien : autant retirer la condition.
    const values = [...chosen];
    const everything = values.length === counts.length;
    setColumnFilter(columnIndex, values.length === 0 || everything ? null : valuesFilter(columnIndex, values));
  });
  footer.append(cancel, apply);
  elements.picker.appendChild(footer);

  floating.open('picker', anchor);
  positionFloating(elements.picker, anchor);
  setOpenPanel(`filter:${columnIndex}`);
  search.focus();
}
