import { cellMatches, type Filter } from '../core/filters';
import { count } from '../core/format';
import { compute } from '../core/stats';
import { isMeasurable } from '../core/types';
import { formatValue, valueParser } from '../core/values';
import { closePicker, getOpenPanel, refilter } from './actions';
import { HEAD_BUTTONS, MAX_WIDTH, MIN_WIDTH, MIN_WIDTH_FOLDED, OVERSCAN, RESIZE_MAX, RESIZE_MIN, ROW_HEIGHT, WIDTH_SAMPLE_ROWS } from './constants';
import { elements } from './dom';
import { stepsOn } from './cleaning';
import { icon } from './icons';
import { closeMenu, openMenu } from './menu';
import { paint } from './paint';
import { openFilterPanel } from './panels/filter-panel';
import { distinctText, uniqueText } from './band';
import { resizeHandle } from './resize';
import { blendHex, readableOn, themeById } from '../core/themes';
import { themeColour } from './colour';
import { isDark, palette, state } from './state';
import { hideTooltip, quickTip } from './tooltip';

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
  const widthOf = textMeasurer();
  state.widths = state.headers.map((_, index) => {
    const auto = autoWidth(index, withBand, widthOf);
    const manual = state.manualWidths.get(index);
    if (manual === undefined) return auto;
    // Une largeur choisie à la main l'emporte sur ce calcul — sauf, bandeau
    // ouvert, à descendre sous la largeur par défaut : une colonne resserrée
    // bandeau replié y écrasait ses histogrammes et ses bornes. Elle remonte
    // alors au plancher ; élargie, elle garde sa largeur.
    return withBand ? Math.max(manual, auto) : manual;
  });
}

/** Mesure un texte dans la police du tableau. */
function textMeasurer(): (text: string) => number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = getComputedStyle(document.body).font || '13px sans-serif';
  if (context) context.font = font;
  return (text: string) => (context ? context.measureText(text).width : text.length * 7);
}

/** Une cellule de bandeau invisible, pour mesurer une ligne comme elle s'affichera. */
let probe: { cell: HTMLDivElement; line: HTMLDivElement } | null = null;

/** Largeur qu'il faut à une cellule de bandeau pour loger cette ligne entière, marges comprises. */
function bandLineWidth(text: string): number {
  if (!probe) {
    const cell = document.createElement('div');
    cell.className = 'band-cell';
    cell.style.cssText = 'position:absolute;visibility:hidden;left:-10000px;top:0;display:inline-block;width:auto';
    const line = document.createElement('div');
    line.className = 'stat';
    line.style.display = 'inline-block';
    cell.appendChild(line);
    document.body.appendChild(cell);
    probe = { cell, line };
  }
  probe.line.textContent = text;
  return Math.ceil(probe.cell.getBoundingClientRect().width);
}

/** Marge intérieure d'une cellule, bordure comprise. */
const CELL_PADDING = 28;

/** Ce qu'il faut pour lire le titre en entier, ses deux boutons à côté. */
function titleWidth(index: number, widthOf: (text: string) => number): number {
  return widthOf(state.headers[index]) + HEAD_BUTTONS + CELL_PADDING;
}

/**
 * Largeur automatique d'une colonne. `capped` borne le résultat à MAX_WIDTH :
 * sans cette borne, c'est la largeur qui montre tout — valeurs et bandeau —
 * celle que vise le double-clic quand il élargit.
 */
function autoWidth(index: number, withBand: boolean, widthOf: (text: string) => number, capped = true, rows = WIDTH_SAMPLE_ROWS): number {
  const sampled = Math.min(state.rows.length, rows);
  // Le titre doit tenir en entier : il nomme la colonne, et une colonne dont
  // on lit « dep… » n'est plus identifiée. Les valeurs, elles, n'ont pas les
  // boutons au-dessus d'elles.
  let widest = widthOf(state.headers[index]) + HEAD_BUTTONS;
  for (let row = 0; row < sampled; row++) {
    const value = state.rows[row]?.[index];
    if (value) widest = Math.max(widest, widthOf(value));
  }
  const column = state.stats[index];
  if (withBand && column && column.min !== null) {
    // La colonne doit loger les deux lignes de bornes : tronquées, elles ne
    // renseignent plus sur rien.
    const pair = (left: string, right: string) => widthOf(left) + widthOf(right) + 24;
    // Les deux bornes sont mesurées sur la plus longue des deux : un filtre
    // peut restreindre à « Min 999,999 » là où le fichier entier affichait
    // « Min 0 », et la largeur ne se rediscute plus après l'ouverture.
    const show = (value: number) => formatValue(column, value);
    const longest = (left: number, right: number) =>
      widthOf(show(left)) >= widthOf(show(right)) ? show(left) : show(right);
    const bound = longest(column.min ?? 0, column.max ?? 0);
    const central = longest(column.mean ?? 0, column.median ?? 0);
    widest = Math.max(
      widest,
      pair(`Min ${bound}`, `Max ${bound}`),
      column.mean === null ? 0 : pair(`Mean ${central}`, `Median ${central}`),
    );
  }
  const floor = withBand ? MIN_WIDTH : MIN_WIDTH_FOLDED;
  // La ligne « Distinct … (… of filled) », en gras : sans elle, la base de la
  // part se coupait en « of fi… ». Mesurée telle qu'elle s'affiche, marges
  // comprises, et non devinée : un facteur fixe appliqué à une mesure en
  // maigre suffisait sur un poste, pas sur la machine de la CI, dont les
  // polices sont plus larges — six lignes coupées sur wines.csv.
  // La ligne « Unique », de même gabarit, peut être la plus longue des deux :
  // « Unique 598 (100.0% of filled) » contre « Distinct 598 (98.8% of filled) ».
  const band = withBand && column ? Math.max(bandLineWidth(distinctText(column)), bandLineWidth(uniqueText(column))) : 0;
  const fitted = Math.max(floor, widest + CELL_PADDING, band);
  return Math.round(capped ? Math.min(MAX_WIDTH, fitted) : Math.min(RESIZE_MAX, fitted));
}

/**
 * Les deux largeurs entre lesquelles bascule le double-clic.
 *
 * `compact` est la plus étroite permise : bandeau ouvert, la largeur par
 * défaut, qui affiche bien l'histogramme et les bornes — resserrer autour du
 * seul titre les écrasait ; bandeau replié, le titre lu en entier, boutons
 * compris. C'est aussi le plancher du glissé. `full` montre tout, sur un
 * échantillon plus large que le calcul ordinaire, puisqu'il s'agit justement
 * de ne rien couper.
 */
export function fitWidths(index: number): { compact: number; full: number } {
  const widthOf = textMeasurer();
  const compact = state.bandVisible
    ? autoWidth(index, true, widthOf)
    : Math.round(Math.max(RESIZE_MIN, titleWidth(index, widthOf)));
  const full = Math.max(compact, autoWidth(index, state.bandVisible, widthOf, false, WIDTH_SAMPLE_ROWS * 10));
  return { compact, full };
}

export function totalWidth(): number {
  return gutterWidth() + state.order.reduce((sum, index) => sum + state.widths[index], 0);
}

/**
 * Numéro de ligne du fichier, celui de la vue Raw : il ne bouge ni avec le tri
 * ni avec le filtre, et sert à retrouver une ligne dans l'éditeur. Sans le
 * numéro reçu, l'en-tête étant la ligne 1, la première donnée est la ligne 2.
 */
export function lineOf(rowIndex: number): number {
  return state.lines[rowIndex] ?? rowIndex + 2;
}

/** Largeur de la gouttière : assez pour le plus grand numéro du fichier. */
export function gutterWidth(): number {
  const digits = String(lineOf(Math.max(0, state.rows.length - 1))).length;
  // Mesuré une fois par nombre de chiffres : appelée à chaque ligne peinte.
  if (gutterMeasured?.digits !== digits) {
    gutterMeasured = { digits, width: Math.ceil(textMeasurer()('0') * digits) + 20 };
  }
  return gutterMeasured.width;
}

let gutterMeasured: { digits: number; width: number } | null = null;

/** Cellule de gouttière, vide en tête : elle garde en place les colonnes du bandeau et de l'en-tête. */
export function gutterCell(text = ''): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = 'gutter';
  cell.style.width = `${gutterWidth()}px`;
  cell.textContent = text;
  return cell;
}

/**
 * La lecture des cellules d'une colonne en nombre, selon son type : nombre,
 * date ou heure. Une colonne texte ne se lit pas — null partout.
 */
export function parserOf(columnIndex: number): (raw: string) => number | null {
  const column = state.stats[columnIndex];
  return column ? valueParser(column, state.delimiter === ';') : () => null;
}

/** Une ligne satisfait-elle la condition ? */
export function matches(cells: string[], filter: Filter, rowIndex: number): boolean {
  if (filter.kind === 'duplicates') return filter.rows.has(rowIndex);
  // Jugés sur l'ensemble des lignes retenues : voir filteredRows.
  if (filter.kind === 'distinct' || filter.kind === 'unique') return true;
  return cellMatches(cells[filter.column] ?? '', filter, parserOf(filter.column));
}

/** Indices des lignes retenues par les filtres actifs. */
export function filteredRows(): number[] {
  const rows = state.rows;
  if (state.filters.length === 0) return rows.map((_, index) => index);
  let kept: number[] = [];
  for (let row = 0; row < rows.length; row++) {
    const cells = rows[row];
    if (cells && state.filters.every((filter) => matches(cells, filter, row))) kept.push(row);
  }
  // « Une ligne par valeur » et « valeurs vues une fois » portent sur ce que
  // les autres conditions ont laissé, dans l'ordre où on les a posés.
  for (const filter of state.filters) {
    if (filter.kind === 'distinct') {
      // La première ligne retenue de chaque valeur, les vides comptant pour une.
      const seen = new Set<string>();
      kept = kept.filter((row) => {
        const raw = state.rows[row]?.[filter.column] ?? '';
        const key = raw.trim() === '' ? '' : raw;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else if (filter.kind === 'unique') {
      // Le même compte que le bandeau : les vides ne sont pas des valeurs.
      const occurrences = new Map<string, number>();
      for (const row of kept) {
        const raw = state.rows[row]?.[filter.column] ?? '';
        if (raw.trim() !== '') occurrences.set(raw, (occurrences.get(raw) ?? 0) + 1);
      }
      kept = kept.filter((row) => occurrences.get(state.rows[row]?.[filter.column] ?? '') === 1);
    }
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
  // Le type est une propriété du fichier, pas du sous-ensemble : redeviné sur
  // les seules lignes retenues, une colonne numérique réduite à ses cellules
  // vides passait « text », et son filtre comme son tri changeaient de nature.
  const types = state.stats.map((column) => column.type);
  state.stats = state.headers.map((_, index) => {
    const recomputed = compute(subset, index, state.forcedTypes.get(index) ?? types[index]);
    // Les renommages sont un état d'affichage : ils survivent au recalcul.
    recomputed.name = names[index] ?? recomputed.name;
    return recomputed;
  });
}

/**
 * Sous le filtre des doublons, le groupe de chaque ligne : son rang (l'ordre
 * de première apparition) et toutes les lignes identiques. Sert à les montrer
 * côte à côte, à alterner le fond d'un groupe à l'autre et à dire, dans la
 * gouttière, où se trouvent les autres.
 */
let duplicateGroup = new Map<number, { rank: number; members: number[] }>();

function indexDuplicates(): void {
  duplicateGroup = new Map();
  for (const filter of state.filters) {
    if (filter.kind !== 'duplicates') continue;
    filter.groups.forEach((members, rank) => {
      for (const row of members) duplicateGroup.set(row, { rank, members });
    });
  }
}

export function rebuildView(): void {
  indexDuplicates();
  const view: number[] = filteredRows();
  // Les lignes identiques l'une sous l'autre, pour les comparer d'un coup
  // d'œil ; un tri choisi dans l'en-tête passe devant.
  if (!state.sort && duplicateGroup.size > 0) {
    view.sort(
      (left, right) => (duplicateGroup.get(left)?.rank ?? 0) - (duplicateGroup.get(right)?.rank ?? 0) || left - right,
    );
  }

  const sort = state.sort;
  if (sort) {
    // Dates et heures se trient comme des nombres : 02/01/2016 après 03/01/2015.
    const measurable = isMeasurable(state.stats[sort.index]?.type ?? 'text');
    const parse = parserOf(sort.index);
    const direction = sort.ascending ? 1 : -1;
    view.sort((left, right) => {
      const a = state.rows[left]?.[sort.index] ?? '';
      const b = state.rows[right]?.[sort.index] ?? '';
      if (measurable) {
        const x = parse(a);
        const y = parse(b);
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
  elements.head.appendChild(gutterCell());
  // Une palette à en-têtes colorés : le fond de l'en-tête est celui de VS Code voilé à
  // 14 % de la couleur de la colonne (voir main.css) ; c'est sur lui que le nom doit se lire.
  const coloured = themeById(state.themeId).headInk === true;
  const headGround = coloured ? themeColour('--vscode-editorGroupHeader-tabsBackground', isDark() ? '#252526' : '#f3f3f3') : '';
  for (const modelIndex of state.order) {
    const cell = document.createElement('div');
    cell.className = 'head-cell';
    cell.style.width = `${state.widths[modelIndex]}px`;
    // Le filet et le voile de l'en-tête reprennent la couleur de la colonne.
    const accent = palette(modelIndex).accent;
    cell.style.setProperty('--col', accent);
    // Le texte de l'en-tête — nom et boutons — prend la couleur de la colonne.
    if (coloured) cell.style.color = readableOn(accent, blendHex(headGround, accent, 0.14));
    if (state.selectedColumn === modelIndex) cell.classList.add('selected');
    // Comme un clic sur une cellule marque sa ligne : un clic sur l'en-tête
    // marque sa colonne. Les boutons et la poignée gardent leur propre geste.
    cell.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.head-button, .col-resizer')) return;
      if (hasTextSelection()) return;
      selectColumn(modelIndex);
    });

    // Le titre ne trie plus : seule la flèche le fait. Un titre cliquable qui
    // réordonnait tout sans rien annoncer surprenait plus qu'il ne servait,
    // maintenant qu'un bouton dit ce qu'il fait.
    const name = document.createElement('span');
    name.className = 'head-name';
    name.textContent = state.stats[modelIndex].name;
    // Bandeau replié, les colonnes se resserrent au point de tronquer le titre :
    // le survol reste alors le seul moyen de le lire en entier.
    quickTip(name, state.stats[modelIndex].name);

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

    // Agir sur la colonne : le balai ouvre son menu de nettoyage, comme le
    // clic droit sur l'en-tête (voir main.ts).
    const clean = headButton('', 'Clean this column', (event) => {
      event.stopPropagation();
      openMenu(modelIndex, clean);
    });
    clean.classList.add('clean');
    clean.appendChild(icon('sparkles'));
    // Une colonne déjà nettoyée le montre : son balai prend l'accent de la colonne.
    const steps = stepsOn(modelIndex);
    if (steps > 0) {
      clean.classList.add('on');
      clean.style.color = palette(modelIndex).accent;
      quickTip(clean, `Clean this column — ${steps} step${steps === 1 ? '' : 's'} applied`);
    }
    cell.dataset.column = String(modelIndex);

    // Le nettoyage d'abord, à gauche du filtre et du tri.
    cell.append(name, clean, filter, sort, resizeHandle(modelIndex));
    elements.head.appendChild(cell);
  }
}

export function headButton(glyph: string, title: string, action: (event: MouseEvent) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'head-button';
  button.type = 'button';
  button.textContent = glyph;
  quickTip(button, title);
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

/** Le panneau du bouton de filtre : liste de valeurs, condition texte ou nombre. */
export function openColumnFilter(modelIndex: number, anchor: HTMLElement): void {
  // Le bouton qui ouvre referme : sans quoi le second clic rouvrait le même
  // panneau, et le seul moyen d'en sortir était de cliquer ailleurs.
  if (getOpenPanel() === `filter:${modelIndex}`) {
    closePicker();
    return;
  }
  openFilterPanel(modelIndex, anchor);
}

// Fenêtre de lignes actuellement peinte, pour ne pas tout reconstruire quand un
// défilement d'un pixel (ou le défilement automatique d'un glissé) n'a rien
// changé : reconstruire détruit la sélection de texte en cours.
let paintedWindow = '';

export function paintRows(onlyIfMoved = false): void {
  const total = state.view.length;
  elements.body.style.height = `${total * ROW_HEIGHT}px`;
  const scrollTop = elements.scroller.scrollTop;
  const viewport = elements.scroller.clientHeight;
  const first = Math.max(0, Math.floor((scrollTop - elements.body.offsetTop) / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);

  const windowKey = `${first}:${last}:${total}`;
  if (onlyIfMoved && windowKey === paintedWindow) return;
  paintedWindow = windowKey;

  const fragment = document.createDocumentFragment();
  for (let position = first; position < last; position++) {
    const rowIndex = state.view[position];
    const cells = state.rows[rowIndex];
    if (!cells) continue;
    const row = document.createElement('div');
    const isSelected = state.selected.has(rowIndex);
    row.className = isSelected ? 'row selected' : 'row';
    row.style.top = `${position * ROW_HEIGHT}px`;
    row.dataset.row = String(rowIndex);
    const gutter = gutterCell(String(lineOf(rowIndex)));
    gutter.addEventListener('mousedown', (event) => startRowDrag(event, position));
    row.appendChild(gutter);
    // Un groupe de doublons sur deux prend le fond du bandeau de chaque
    // colonne : un léger décalage de sa propre teinte, donc assorti au thème.
    const duplicate = duplicateGroup.get(rowIndex);
    const shaded = duplicate !== undefined && duplicate.rank % 2 === 1;
    if (duplicate) {
      const others = duplicate.members.filter((member) => member !== rowIndex).map(lineOf);
      quickTip(gutter, `Same as line${others.length > 1 ? 's' : ''} ${others.join(', ')}`);
    }
    for (const modelIndex of state.order) {
      const colours = palette(modelIndex);
      const cell = document.createElement('div');
      const isActive = state.active?.row === rowIndex && state.active.column === modelIndex;
      cell.className = isMeasurable(state.stats[modelIndex].type) ? 'cell num' : 'cell';
      cell.dataset.column = String(modelIndex);
      if (isActive) cell.classList.add('active');
      if (state.selectedColumn === modelIndex) cell.classList.add('column-selected');
      cell.style.width = `${state.widths[modelIndex]}px`;
      // La teinte de colonne reste posée même sur une ligne marquée : le
      // marquage se fait par un voile par-dessus, non en remplaçant la couleur.
      cell.style.background = shaded ? colours.band : colours.cell;
      cell.style.color = colours.text;
      cell.textContent = cells[modelIndex] ?? '';
      // Une cellule qu'une étape a changée se souligne à l'accent de sa
      // colonne, et dit au survol ce qu'elle valait dans le fichier.
      const before = changedFrom(rowIndex, modelIndex);
      if (before !== null) {
        cell.classList.add('changed');
        cell.style.textDecorationColor = colours.accent;
        quickTip(cell, before === '' ? 'Was empty' : `Was « ${before} »`);
      }
      // Au `click` et non au `mousedown` : repeindre les lignes dès l'appui
      // remplaçait la cellule sous le curseur et détruisait la sélection de
      // texte avant même qu'elle commence (ni glissé, ni double-clic, ni Ctrl+C).
      cell.addEventListener('click', (event) => {
        if (hasTextSelection()) return;
        select(rowIndex, modelIndex, event.ctrlKey || event.metaKey);
      });
      row.appendChild(cell);
    }
    fragment.appendChild(row);
  }
  elements.body.textContent = '';
  elements.body.appendChild(fragment);
}

/** La valeur d'origine d'une cellule qu'une étape a changée, ou null si elle est intacte. */
function changedFrom(rowIndex: number, column: number): string | null {
  if (state.steps.length === 0) return null;
  const original = state.original[state.source[rowIndex] ?? rowIndex];
  const now = state.rows[rowIndex];
  if (!original || original === now) return null;
  const before = original[column] ?? '';
  return before === (now?.[column] ?? '') ? null : before;
}

/** Vrai quand l'utilisateur vient de sélectionner du texte : le clic n'est alors qu'un geste de copie. */
function hasTextSelection(): boolean {
  return !(window.getSelection()?.isCollapsed ?? true);
}

/** Position, dans la vue, de la ligne sous une ordonnée d'écran. */
function positionAt(clientY: number): number {
  const top = elements.body.getBoundingClientRect().top;
  return Math.min(state.view.length - 1, Math.max(0, Math.floor((clientY - top) / ROW_HEIGHT)));
}

/**
 * Clic sur un numéro de ligne : la ligne entière est marquée ; glisser sur
 * plusieurs numéros marque l'intervalle ; Ctrl/Cmd ajoute ou retire une ligne.
 * Comme dans un tableur, le numéro est la poignée de la ligne.
 */
function startRowDrag(event: MouseEvent, anchor: number): void {
  if (event.button !== 0) return;
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  const additive = event.ctrlKey || event.metaKey;
  const anchorRow = state.view[anchor];
  const wasAlone = state.selected.size === 1 && state.selected.has(anchorRow);
  const base = additive ? new Set(state.selected) : new Set<number>();
  state.selectedColumn = null;
  state.active = null;
  let moved = false;

  const apply = (last: number) => {
    state.selected = new Set(base);
    const [from, to] = anchor <= last ? [anchor, last] : [last, anchor];
    for (let position = from; position <= to; position++) {
      const row = state.view[position];
      if (additive && anchor === last) {
        if (base.has(row)) state.selected.delete(row);
        else state.selected.add(row);
      } else state.selected.add(row);
    }
    updateSelectionCount();
    paintHead();
    paintRows();
  };
  apply(anchor);

  const move = (pointer: MouseEvent) => {
    const position = positionAt(pointer.clientY);
    if (position !== anchor) moved = true;
    apply(position);
  };
  const stop = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', stop);
    if (!moved && wasAlone && !additive) {
      state.selected.clear();
      updateSelectionCount();
      paintRows();
    }
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);
}

/** Valeur d'un champ pour un tableur : entre guillemets si elle contient tabulation, saut de ligne ou guillemet. */
function spreadsheetField(value: string): string {
  return /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Les lignes marquées, dans l'ordre affiché : colonnes séparées par une tabulation, lignes par un saut de ligne. */
export function selectedRowsText(): string {
  const lines: string[] = [];
  for (const rowIndex of state.view) {
    if (!state.selected.has(rowIndex)) continue;
    const cells = state.rows[rowIndex] ?? [];
    lines.push(state.order.map((modelIndex) => spreadsheetField(cells[modelIndex] ?? '')).join('\t'));
  }
  return lines.join('\n');
}

/** Un second clic sur la même colonne la démarque, comme pour une ligne. */
export function selectColumn(modelIndex: number): void {
  state.selectedColumn = state.selectedColumn === modelIndex ? null : modelIndex;
  state.selected.clear();
  state.active = null;
  updateSelectionCount();
  paintHead();
  paintRows();
}

export function select(rowIndex: number, columnIndex: number, add: boolean): void {
  const hadColumn = state.selectedColumn !== null;
  state.selectedColumn = null;
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
  if (hadColumn) paintHead();
  paintRows();
}

export function updateSelectionCount(): void {
  const column = state.selectedColumn === null ? null : state.stats[state.selectedColumn]?.name;
  elements.selection.textContent =
    column !== undefined && column !== null
      ? `Column “${column}” selected`
      : state.selected.size === 0
        ? ''
        : `${count(state.selected.size)} selected`;
}

elements.scroller.addEventListener('scroll', () => {
  if (state.ready) paintRows(true);
  hideTooltip();
  closeMenu();
});

/**
 * Construit la condition « la colonne vaut l'une de ces valeurs ».
 *
 * Une seule pastille quel que soit le nombre de valeurs : c'est une seule
 * condition, et la relire doit rester aussi simple que la poser.
 */
export function valuesFilter(columnIndex: number, values: string[], exclude = false): Filter {
  const name = state.stats[columnIndex]?.name ?? `column ${columnIndex + 1}`;
  // Une valeur bordée d'espaces se met entre guillemets : sans eux, « Nantes »
  // et « Nantes  » se lisent pareil, et le compte affiché paraît faux.
  const show = (value: string) =>
    value === '' ? '(blank)' : value !== value.trim() ? JSON.stringify(value) : value;
  const shown = values.slice(0, 3).map(show).join(', ');
  const rest = values.length > 3 ? ` +${values.length - 3}` : '';
  const label = exclude
    ? values.length === 1
      ? `${name} ≠ ${show(values[0])}`
      : `${name} ∉ {${shown}${rest}}`
    : values.length === 1
      ? `${name} = ${show(values[0])}`
      : `${name} ∈ {${shown}${rest}}`;
  return { kind: 'values', column: columnIndex, values, ...(exclude ? { exclude: true } : {}), label };
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

/**
 * Les valeurs d'une colonne sur **toutes** les lignes nettoyées, filtres ignorés.
 *
 * Une étape de nettoyage porte sur tout le fichier, pas sur ce qui est affiché :
 * ce qu'elle « touche » se compte donc ici — le menu de colonne et le panneau Clean
 * donnent ainsi les mêmes chiffres, quels que soient les filtres actifs.
 */
export function allValueCounts(columnIndex: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const cells of state.rows) {
    const raw = cells[columnIndex] ?? '';
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()];
}

/** La table telle qu'elle est après filtrage : c'est sur elle qu'on analyse. */
export function currentTable() {
  return {
    headers: state.headers,
    rows: state.view.map((index) => state.rows[index]).filter(Boolean),
    delimiter: state.delimiter,
    encoding: state.encoding,
    truncated: false,
  };
}
