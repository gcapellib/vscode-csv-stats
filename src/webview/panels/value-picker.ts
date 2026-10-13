import { type Filter } from '../../core/filters';
import { count } from '../../core/format';
import { closePicker } from '../actions';
import { textSpan } from '../dom';
import { state } from '../state';
import { setColumnFilter, valueCounts, valuesFilter } from '../table';
import { footerButtons } from './filter-fields';

/** Au-delà, le DOM de la liste devient lourd : seules les premières lignes s'affichent. */
const PICKER_MAX_ROWS = 400;

/**
 * Liste de valeurs, à la manière d'Excel.
 *
 * Le palmarès du bandeau ne montre que quelques valeurs ; toutes les autres
 * sont noyées dans « Other » et resteraient hors d'atteinte. « Select all »
 * porte sur **toutes** les valeurs que la recherche laisse, pas seulement sur
 * les lignes dessinées, et « All except » inverse la sélection.
 */
export function renderValuesTab(parent: HTMLElement, columnIndex: number): HTMLElement {
  const counts = valueCounts(columnIndex);
  const current = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'values' }> =>
      filter.kind === 'values' && filter.column === columnIndex,
  );
  const chosen = new Set<string>(current?.values ?? []);

  const search = document.createElement('input');
  search.className = 'picker-search';
  search.type = 'search';
  search.placeholder = 'Search values…';
  parent.appendChild(search);

  const selectAll = document.createElement('label');
  selectAll.className = 'picker-row picker-all';
  const allBox = document.createElement('input');
  allBox.type = 'checkbox';
  selectAll.append(allBox, textSpan('(Select all)'));
  parent.appendChild(selectAll);

  const list = document.createElement('div');
  list.className = 'picker-list';
  parent.appendChild(list);

  const note = document.createElement('div');
  note.className = 'picker-note';
  parent.appendChild(note);

  const exceptRow = document.createElement('label');
  exceptRow.className = 'picker-blank';
  const except = document.createElement('input');
  except.type = 'checkbox';
  except.className = 'picker-except';
  except.checked = current?.exclude === true;
  exceptRow.append(except, textSpan('Keep all except the checked values'));
  parent.appendChild(exceptRow);

  let matching: Array<[string, number]> = counts;

  const render = () => {
    const needle = search.value.trim().toLowerCase();
    matching = needle === '' ? counts : counts.filter(([value]) => value.toLowerCase().includes(needle));
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
      name.title = value;
      const tally = textSpan(count(occurrences));
      tally.className = 'picker-count';
      row.append(box, name, tally);
      list.appendChild(row);
    }
    note.textContent =
      matching.length > PICKER_MAX_ROWS
        ? `${count(matching.length)} values, first ${count(PICKER_MAX_ROWS)} shown — “Select all” covers all ${count(matching.length)}`
        : `${count(matching.length)} values`;
    syncAll();
  };

  const syncAll = () => {
    let picked = 0;
    for (const [value] of matching) if (chosen.has(value)) picked++;
    allBox.checked = picked > 0 && picked === matching.length;
    allBox.indeterminate = picked > 0 && picked < matching.length;
  };

  allBox.addEventListener('change', () => {
    for (const [value] of matching) {
      if (allBox.checked) chosen.add(value);
      else chosen.delete(value);
    }
    render();
  });

  search.addEventListener('input', render);
  render();

  const apply = () => {
    closePicker();
    // Rien de coché, ou tout coché sans inversion : aucune condition à poser.
    const values = [...chosen];
    const everything = values.length === counts.length;
    const nothing = values.length === 0;
    const noFilter = except.checked ? nothing : nothing || everything;
    setColumnFilter(columnIndex, noFilter ? null : valuesFilter(columnIndex, values, except.checked));
  };
  parent.appendChild(
    footerButtons([
      ['Cancel', closePicker, false],
      ['Apply', apply, true],
    ]),
  );
  return search;
}
