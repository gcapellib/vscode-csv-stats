import { type Filter } from '../core/filters';
import { count, num } from '../core/format';
import { compute } from '../core/stats';
import { parseNumber } from '../core/types';
import { closePicker, getOpenPanel, refilter } from './actions';
import { HEAD_BUTTONS, MAX_WIDTH, MIN_WIDTH, MIN_WIDTH_FOLDED, OVERSCAN, ROW_HEIGHT, WIDTH_SAMPLE_ROWS } from './constants';
import { elements } from './dom';
import { closeMenu } from './menu';
import { paint } from './paint';
import { openRangePicker } from './panels/range-picker';
import { openValuePicker } from './panels/value-picker';
import { palette, state } from './state';
import { hideTooltip } from './tooltip';

/**
 * Largeur de chaque colonne.
 *
 * `withBand` dit si les bornes du bandeau entrent dans le calcul : elles
 * imposent souvent bien plus de place que les cellules elles-mêmes — « Min
 * 10,001   Max 10,300 » contre « 10001 ». Bandeau replié, cette contrainte
 * n'existe plus et les colonnes se resserrent, ce qui est tout l'intérêt de le
 * replier : en voir davantage à l'écran.
 */
export function measureWidths(withBand = state.bandVisible): void {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = getComputedStyle(document.body).font || '13px sans-serif';
  if (context) context.font = font;
  const widthOf = (text: string) => (context ? context.measureText(text).width : text.length * 7);

  const sampled = Math.min(state.rows.length, WIDTH_SAMPLE_ROWS);
  state.widths = state.headers.map((header, index) => {
    // Le titre doit tenir en entier : il nomme la colonne, et une colonne dont
    // on lit « dep… » n'est plus identifiée. Les valeurs, elles, n'ont pas les
    // boutons au-dessus d'elles.
    let widest = widthOf(header) + HEAD_BUTTONS;
    for (let row = 0; row < sampled; row++) {
      const value = state.rows[row]?.[index];
      if (value) widest = Math.max(widest, widthOf(value));
    }
    const column = state.stats[index];
    if (withBand && column && column.min !== null) {
      // La colonne doit loger ce que son bandeau annonce : des bornes tronquées
      // en « Min 98,… » ne renseignent plus sur rien.
      // La colonne doit loger les deux lignes de bornes : tronquées, elles ne
      // renseignent plus sur rien.
      const pair = (left: string, right: string) => widthOf(left) + widthOf(right) + 24;
      // Les deux bornes sont mesurees sur la plus longue des deux : un filtre
      // peut restreindre à « Min 999,999 » là où le fichier entier affichait
      // « Min 0 », et la largeur ne se rediscute plus apres l'ouverture.
      const longest = (left: number, right: number) =>
        widthOf(num(left)) >= widthOf(num(right)) ? num(left) : num(right);
      const bound = longest(column.min ?? 0, column.max ?? 0);
      const central = longest(column.mean ?? 0, column.median ?? 0);
      widest = Math.max(
        widest,
        pair(`Min ${bound}`, `Max ${bound}`),
        column.mean === null ? 0 : pair(`Mean ${central}`, `Median ${central}`),
      );
    }
    const floor = withBand ? MIN_WIDTH : MIN_WIDTH_FOLDED;
    return Math.round(Math.min(MAX_WIDTH, Math.max(floor, widest + 28)));
  });
}

export function totalWidth(): number {
  return state.order.reduce((sum, index) => sum + state.widths[index], 0);
}

/** Une ligne satisfait-elle la condition ? */
export function matches(cells: string[], filter: Filter, rowIndex: number): boolean {
  if (filter.kind === 'duplicates') return filter.rows.has(rowIndex);
  const raw = cells[filter.column] ?? '';
  switch (filter.kind) {
    case 'contains':
      return raw.toLowerCase().includes(filter.text);
    case 'values':
      return filter.values.includes(raw);
    case 'range': {
      const value = parseNumber(raw, state.delimiter === ';');
      if (value === null) return false;
      // La dernière classe inclut sa borne haute, sinon le maximum lui-même
      // serait exclu de l'intervalle qui le contient.
      return value >= filter.low && (filter.last ? value <= filter.high : value < filter.high);
    }
  }
}

/** Indices des lignes retenues par les filtres actifs. */
export function filteredRows(): number[] {
  const rows = state.rows;
  if (state.filters.length === 0) return rows.map((_, index) => index);
  const kept: number[] = [];
  for (let row = 0; row < rows.length; row++) {
    const cells = rows[row];
    if (cells && state.filters.every((filter) => matches(cells, filter, row))) kept.push(row);
  }
  return kept;
}

/**
 * Recalcule les bandeaux sur les seules lignes retenues.
 *
 * C'est tout l'intérêt du filtrage croisé : les colonnes ne se lisent plus côte
 * à côte mais conditionnées les unes par les autres — « parmi les trajets
 * annulés, à quoi ressemble la distribution des retards ».
 */
export function recomputeStats(kept: number[]): void {
  const subset = {
    headers: state.headers,
    rows: kept.map((index) => state.rows[index]).filter(Boolean),
    delimiter: state.delimiter,
    truncated: false,
  };
  const names = state.stats.map((column) => column.name);
  state.stats = state.headers.map((_, index) => {
    const recomputed = compute(subset, index, state.forcedTypes.get(index));
    // Les renommages sont un état d'affichage : ils survivent au recalcul.
    recomputed.name = names[index] ?? recomputed.name;
    return recomputed;
  });
}

export function rebuildView(): void {
  const view: number[] = filteredRows();

  const sort = state.sort;
  if (sort) {
    const numeric = state.stats[sort.index]?.type === 'numeric';
    const decimalComma = state.delimiter === ';';
    const direction = sort.ascending ? 1 : -1;
    view.sort((left, right) => {
      const a = state.rows[left]?.[sort.index] ?? '';
      const b = state.rows[right]?.[sort.index] ?? '';
      if (numeric) {
        const x = parseNumber(a, decimalComma);
        const y = parseNumber(b, decimalComma);
        // Les cellules illisibles vont en fin de tri, quel que soit le sens.
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return (x - y) * direction;
      }
      return a.localeCompare(b) * direction;
    });
  }
  state.view = view;
}

export function paintHead(): void {
  elements.head.textContent = '';
  for (const modelIndex of state.order) {
    const cell = document.createElement('div');
    cell.className = 'head-cell';
    cell.style.width = `${state.widths[modelIndex]}px`;

    // Le titre ne trie plus : seule la flèche le fait. Un titre cliquable qui
    // réordonnait tout sans rien annoncer surprenait plus qu'il ne servait,
    // maintenant qu'un bouton dit ce qu'il fait.
    const name = document.createElement('span');
    name.className = 'head-name';
    name.textContent = state.stats[modelIndex].name;
    // Bandeau replié, les colonnes se resserrent au point de tronquer le titre :
    // le survol reste alors le seul moyen de le lire en entier.
    name.title = state.stats[modelIndex].name;

    // Deux boutons permanents plutôt que des gestes à deviner : le tri ne se
    // devinait qu'en cliquant le titre, et le filtre dormait dans le menu « ⋯ ».
    const filter = headButton('\u25BE', 'Filter this column', (event) => {
      event.stopPropagation();
      openColumnFilter(modelIndex, filter);
    });
    filter.classList.toggle('on', state.filters.some((active) => active.column === modelIndex));

    const sorted = state.sort?.index === modelIndex;
    const sort = headButton(
      sorted ? (state.sort?.ascending ? '\u2191' : '\u2193') : '\u21C5',
      'Sort ascending, then descending, then back to the file order',
      (event) => {
        event.stopPropagation();
        cycleSort(modelIndex);
      },
    );
    sort.classList.toggle('on', sorted);

    cell.append(name, filter, sort);
    elements.head.appendChild(cell);
  }
}

export function headButton(glyph: string, title: string, action: (event: MouseEvent) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'head-button';
  button.type = 'button';
  button.textContent = glyph;
  button.title = title;
  button.addEventListener('click', action);
  return button;
}

/** Trois états, et non deux : croissant, décroissant, puis retour à l'ordre du
 * fichier. Sans le troisième, l'ordre d'origine est perdu dès le premier clic
 * et rien ne permet d'y revenir. */
export function cycleSort(modelIndex: number): void {
  if (state.sort?.index !== modelIndex) state.sort = { index: modelIndex, ascending: true };
  else if (state.sort.ascending) state.sort = { index: modelIndex, ascending: false };
  else state.sort = null;
  rebuildView();
  paint();
}

/** Le panneau du bouton de gauche : la liste des valeurs, ou les bornes. */
export function openColumnFilter(modelIndex: number, anchor: HTMLElement): void {
  // Le bouton qui ouvre referme : sans quoi le second clic rouvrait le même
  // panneau, et le seul moyen d'en sortir était de cliquer ailleurs.
  if (getOpenPanel() === `filter:${modelIndex}`) {
    closePicker();
    return;
  }
  const column = state.stats[modelIndex];
  if (column?.type === 'numeric') openRangePicker(modelIndex, anchor);
  else openValuePicker(modelIndex, anchor);
}

export function paintRows(): void {
  const total = state.view.length;
  elements.body.style.height = `${total * ROW_HEIGHT}px`;
  const scrollTop = elements.scroller.scrollTop;
  const viewport = elements.scroller.clientHeight;
  const first = Math.max(0, Math.floor((scrollTop - elements.body.offsetTop) / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);

  const fragment = document.createDocumentFragment();
  for (let position = first; position < last; position++) {
    const rowIndex = state.view[position];
    const cells = state.rows[rowIndex];
    if (!cells) continue;
    const row = document.createElement('div');
    const isSelected = state.selected.has(rowIndex);
    row.className = isSelected ? 'row selected' : 'row';
    row.style.top = `${position * ROW_HEIGHT}px`;
    for (const modelIndex of state.order) {
      const colours = palette(modelIndex);
      const cell = document.createElement('div');
      const isActive = state.active?.row === rowIndex && state.active.column === modelIndex;
      cell.className = state.stats[modelIndex].type === 'numeric' ? 'cell num' : 'cell';
      if (isActive) cell.classList.add('active');
      cell.style.width = `${state.widths[modelIndex]}px`;
      // La teinte de colonne reste posée même sur une ligne marquée : le
      // marquage se fait par un voile par-dessus, non en remplaçant la couleur.
      cell.style.background = colours.cell;
      cell.style.color = colours.text;
      cell.textContent = cells[modelIndex] ?? '';
      cell.addEventListener('mousedown', (event) =>
        select(rowIndex, modelIndex, event.ctrlKey || event.metaKey),
      );
      row.appendChild(cell);
    }
    fragment.appendChild(row);
  }
  elements.body.textContent = '';
  elements.body.appendChild(fragment);
}

export function select(rowIndex: number, columnIndex: number, add: boolean): void {
  state.active = { row: rowIndex, column: columnIndex };
  if (add) {
    if (!state.selected.delete(rowIndex)) state.selected.add(rowIndex);
  } else {
    const alone = state.selected.size === 1 && state.selected.has(rowIndex);
    state.selected.clear();
    if (!alone) state.selected.add(rowIndex);
    else state.active = null;
  }
  updateSelectionCount();
  paintRows();
}

export function updateSelectionCount(): void {
  elements.selection.textContent = state.selected.size === 0 ? '' : `${count(state.selected.size)} selected`;
}

elements.scroller.addEventListener('scroll', () => {
  if (state.ready) paintRows();
  hideTooltip();
  closeMenu();
});

export function applySort(modelIndex: number, ascending: boolean): void {
  state.sort = { index: modelIndex, ascending };
  rebuildView();
  paint();
}

/**
 * Construit la condition « la colonne vaut l'une de ces valeurs ».
 *
 * Une seule pastille quel que soit le nombre de valeurs : c'est une seule
 * condition, et la relire doit rester aussi simple que la poser.
 */
export function valuesFilter(columnIndex: number, values: string[]): Filter {
  const name = state.stats[columnIndex]?.name ?? `column ${columnIndex + 1}`;
  // Une valeur bordée d'espaces se met entre guillemets : sans eux, « Nantes »
  // et « Nantes  » se lisent pareil, et le compte affiché paraît faux.
  const show = (value: string) =>
    value === '' ? '(blank)' : value !== value.trim() ? JSON.stringify(value) : value;
  const shown = values.slice(0, 3).map(show).join(', ');
  const rest = values.length > 3 ? ` +${values.length - 3}` : '';
  return {
    kind: 'values',
    column: columnIndex,
    values,
    label: values.length === 1 ? `${name} = ${show(values[0])}` : `${name} ∈ {${shown}${rest}}`,
  };
}

/** Remplace la condition posée sur cette colonne, ou la retire si vide. */
export function setColumnFilter(columnIndex: number, filter: Filter | null): void {
  state.filters = state.filters.filter((existing) => existing.column !== columnIndex);
  if (filter) state.filters.push(filter);
  refilter();
}

/**
 * Effectifs des valeurs d'une colonne, comptés en tenant compte des **autres**
 * filtres mais pas du sien.
 *
 * C'est le comportement d'Excel, et le seul qui ne piège pas : si sa propre
 * condition comptait, décocher une valeur la ferait disparaître de la liste où
 * on venait de la décocher.
 */
export function valueCounts(columnIndex: number): Array<[string, number]> {
  const others = state.filters.filter((filter) => filter.column !== columnIndex);
  const counts = new Map<string, number>();
  for (let index = 0; index < state.rows.length; index++) {
    const cells = state.rows[index];
    if (!cells) continue;
    if (!others.every((filter) => matches(cells, filter, index))) continue;
    const raw = cells[columnIndex] ?? '';
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1));
}

/** La table telle qu'elle est après filtrage : c'est sur elle qu'on analyse. */
export function currentTable() {
  return {
    headers: state.headers,
    rows: state.view.map((index) => state.rows[index]).filter(Boolean),
    delimiter: state.delimiter,
    truncated: false,
  };
}
