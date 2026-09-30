/**
 * La vue : bandeau de statistiques au-dessus d'un tableau virtualisé.
 *
 * Le tableau n'affiche que les lignes visibles — seule façon de rester fluide à
 * cent mille lignes. Le bandeau et l'en-tête restent collés en haut et défilent
 * horizontalement avec les colonnes, si bien que l'alignement est structurel.
 */
import { count, num, percent } from '../core/format';
import { compute, type ColumnStats } from '../core/stats';
import {
  computeDataset,
  computeDetails,
  readCsvSnippet,
  type ColumnDetails,
} from '../core/details';
import { rawSegments } from '../core/csv';
import { parseNumber, type ColumnType } from '../core/types';
import { paletteFor, THEMES, themeById, gradientFor, type CsvTheme, type Palette } from '../core/themes';
import { datasetTransformLines as coreDatasetTransformLines, type Filter } from '../core/filters';
import { foldRanking } from '../core/stats';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

const ROW_HEIGHT = 22;
/**
 * Largeur plancher, bandeau déployé : il doit rester lisible — « Distinct 196
 * (65.3%) », un palmarès avec ses pourcentages, un histogramme qui veuille dire
 * quelque chose. Replié, plus rien n'exige cette place et une colonne n'a plus
 * qu'à loger son titre et ses valeurs, d'où un plancher bien plus bas : voir le
 * plus de colonnes possible est précisément la raison de replier.
 */
const MIN_WIDTH = 210;
const MIN_WIDTH_FOLDED = 90;
/**
 * Place que les deux boutons de l'en-tête prennent au titre.
 *
 * Sans elle, la largeur ne couvrait que le texte et les boutons le
 * rognaient — invisible tant que le plancher de 210 px absorbait l'écart,
 * flagrant dès que replier les bandeaux le fait tomber.
 */
const HEAD_BUTTONS = 46;
const MAX_WIDTH = 460;
/**
 * Hauteur de l'histogramme. Le bandeau peut se replier d'un clic, donc il n'a
 * plus à être avare de sa place : un graphique lisible vaut mieux qu'un
 * graphique qui tient.
 */
const HIST_HEIGHT = 84;
const WIDTH_SAMPLE_ROWS = 60;
const OVERSCAN = 8;

const COLUMN_TYPES: ColumnType[] = ['numeric', 'text'];

const TYPE_LABELS: Record<ColumnType, string> = { numeric: 'Numeric', text: 'Text' };

const elements = {
  toolbar: byId('toolbar'),
  insightsToggle: byId('insights-toggle'),
  datasetButton: byId('dataset-button'),
  themeButton: byId('theme-button'),
  themeSwatch: byId('theme-swatch'),
  themeLabel: byId('theme-label'),
  themePopup: byId('theme-popup'),
  shape: byId('shape'),
  selection: byId('selection'),
  filterBar: byId('filters'),
  notice: byId('notice'),
  rawToggle: byId('raw-toggle'),
  rawScroller: byId('raw-scroller'),
  rawBody: byId('raw-body'),
  scroller: byId('scroller'),
  sheet: byId('sheet'),
  band: byId('band'),
  head: byId('head'),
  body: byId('body'),
  tooltip: byId('tooltip'),
  menu: byId('menu'),
  picker: byId('picker'),
};

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element #${id}`);
  return element;
}

/**
 * Une condition de filtrage. Elles se combinent par ET.
 *
 * Chacune porte son propre libellé : la barre de filtres doit pouvoir dire ce
 * qu'elle retient sans avoir à reconstituer la phrase depuis les données.
 */
interface State {
  headers: string[];
  rows: string[][];
  stats: ColumnStats[];
  delimiter: string;
  rowCount: number;
  /** Index de colonne du modèle, dans l'ordre d'affichage ; « Drop » en retire. */
  order: number[];
  widths: number[];
  sort: { index: number; ascending: boolean } | null;
  filters: Filter[];
  /** Types imposés depuis le menu, à réappliquer après chaque recalcul. */
  forcedTypes: Map<number, ColumnType>;
  /** Lignes retenues après filtre et tri, par index de modèle. */
  view: number[];
  bandVisible: boolean;
  fileName: string;
  /**
   * Lignes sélectionnées, par index du modèle et non de l'affichage : la
   * sélection survit ainsi au tri comme au filtrage.
   */
  selected: Set<number>;
  /** Cellule cliquée en dernier : la ligne se teinte, celle-ci s'encadre. */
  active: { row: number; column: number } | null;
  themeId: string;
  ready: boolean;
  /** Texte brut du fichier, demandé une seule fois au premier clic sur « Raw ». */
  rawLines: string[] | null;
  rawLoading: boolean;
  showRaw: boolean;
}

const state: State = {
  headers: [],
  rows: [],
  stats: [],
  delimiter: ',',
  rowCount: 0,
  order: [],
  widths: [],
  sort: null,
  filters: [],
  forcedTypes: new Map(),
  view: [],
  bandVisible: true,
  fileName: '',
  selected: new Set<number>(),
  active: null,
  themeId: THEMES[0].id,
  ready: false,
  rawLines: null,
  rawLoading: false,
  showRaw: false,
};

// ------------------------------------------------------------------- couleurs

function isDark(): boolean {
  const classes = document.body.classList;
  return classes.contains('vscode-dark') || classes.contains('vscode-high-contrast');
}

function palette(modelIndex: number): Palette {
  return paletteFor(themeById(state.themeId), modelIndex, isDark());
}

new MutationObserver(() => {
  if (!state.ready) return;
  buildThemePicker();
  paint();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// ------------------------------------------------------------------- messages

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as Record<string, unknown>;
  switch (message.type) {
    case 'head':
      state.headers = message.headers as string[];
      state.stats = message.stats as ColumnStats[];
      state.delimiter = message.delimiter as string;
      state.rowCount = message.rowCount as number;
      state.fileName = (message.fileName as string) ?? '';
      state.order = state.headers.map((_, index) => index);
      state.themeId = themeById(message.theme as string | undefined).id;
      if (message.insights === false) toggleInsights(false, false);
      elements.shape.textContent = `${count(state.rowCount)} rows × ${count(state.headers.length)} columns`;
      if (message.truncated) {
        elements.notice.textContent = `Truncated: only the first ${count(state.rowCount)} rows are analysed.`;
      }
      buildThemePicker();
      paintChrome();
      break;
    case 'rows': {
      const start = message.start as number;
      const chunk = message.rows as string[][];
      for (let i = 0; i < chunk.length; i++) state.rows[start + i] = chunk[i];
      if (!state.ready && state.rows.length > 0) {
        measureWidths();
        state.ready = true;
      }
      rebuildView();
      paint();
      break;
    }
    case 'columnStats': {
      const index = message.index as number;
      state.stats[index] = message.stats as ColumnStats;
      rebuildView();
      paint();
      break;
    }
    case 'failed':
      elements.scroller.remove();
      elements.notice.textContent = message.message as string;
      break;
    case 'promptResult':
      resolvePrompt(message.token as string, message.value as string | null);
      break;
    case 'raw': {
      // Un « \r » final par ligne, quand le fichier vient de Windows : retiré
      // pour l'affichage, la ligne elle-même reste intacte au caractère près.
      const text = message.text as string;
      state.rawLines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
      state.rawLoading = false;
      if (state.showRaw) paintRaw();
      break;
    }
  }
});

// --------------------------------------------------------------------- dialogues

const pending = new Map<string, (value: string | null) => void>();

function ask(title: string, prompt: string, value: string): Promise<string | null> {
  const token = `${Date.now()}-${Math.random()}`;
  return new Promise((resolve) => {
    pending.set(token, resolve);
    vscode.postMessage({ type: 'prompt', token, title, prompt, value });
  });
}

function resolvePrompt(token: string, value: string | null): void {
  const resolve = pending.get(token);
  if (!resolve) return;
  pending.delete(token);
  resolve(value);
}

// ------------------------------------------------------------------- géométrie

/**
 * Largeur de chaque colonne.
 *
 * `withBand` dit si les bornes du bandeau entrent dans le calcul : elles
 * imposent souvent bien plus de place que les cellules elles-mêmes — « Min
 * 10,001   Max 10,300 » contre « 10001 ». Bandeau replié, cette contrainte
 * n'existe plus et les colonnes se resserrent, ce qui est tout l'intérêt de le
 * replier : en voir davantage à l'écran.
 */
function measureWidths(withBand = state.bandVisible): void {
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

function totalWidth(): number {
  return state.order.reduce((sum, index) => sum + state.widths[index], 0);
}

// ------------------------------------------------------------- filtre et tri

/** Une ligne satisfait-elle la condition ? */
function matches(cells: string[], filter: Filter, rowIndex: number): boolean {
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
function filteredRows(): number[] {
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
function recomputeStats(kept: number[]): void {
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

function rebuildView(): void {
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

// ---------------------------------------------------------------------- rendu

function paint(): void {
  if (!state.ready) return;
  elements.sheet.style.width = `${totalWidth()}px`;
  paintBand();
  paintHead();
  paintRows();
  paintFilterBar();
}

function paintBand(): void {
  elements.band.hidden = !state.bandVisible;
  if (!state.bandVisible) return;
  elements.band.textContent = '';
  for (const modelIndex of state.order) {
    elements.band.appendChild(bandCell(modelIndex));
  }
}

function bandCell(modelIndex: number): HTMLElement {
  const column = state.stats[modelIndex];
  const colours = palette(modelIndex);
  const cell = document.createElement('div');
  cell.className = 'band-cell';
  cell.style.width = `${state.widths[modelIndex]}px`;
  cell.style.background = colours.band;
  cell.style.color = colours.text;
  cell.style.borderTopColor = colours.accent;

  const dots = document.createElement('button');
  dots.className = 'dots';
  dots.textContent = '⋯';
  dots.title = 'Column actions';
  dots.addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu(modelIndex, dots);
  });
  cell.appendChild(dots);

  cell.appendChild(line('type', column.type));
  cell.appendChild(line('stat', `Missing ${count(column.missing)} (${percent(column.missingShare)})`));
  cell.appendChild(line('stat', `Distinct ${count(column.distinct)} (${percent(column.distinctShare)})`));
  if (column.allDistinct) cell.appendChild(line('note', 'every value occurs once'));

  // Le corps du bandeau — histogramme ou palmarès — est un bloc à part, pour
  // qu'un seul écart le sépare du décompte au-dessus, quel que soit son contenu.
  const body = document.createElement('div');
  body.className = column.histogram.length > 0 ? 'band-body stretch' : 'band-body';
  if (column.histogram.length > 0) {
    body.appendChild(histogram(column, colours, state.widths[modelIndex]));
    const bounds = document.createElement('div');
    bounds.className = 'bounds';
    const min = document.createElement('span');
    min.textContent = `Min ${num(column.min ?? 0)}`;
    const max = document.createElement('span');
    max.textContent = `Max ${num(column.max ?? 0)}`;
    bounds.append(min, max);
    body.appendChild(bounds);
    if (column.mean !== null) {
      const central = document.createElement('div');
      central.className = 'bounds';
      central.append(
        textSpan(`Mean ${num(column.mean)}`),
        textSpan(`Median ${num(column.median ?? 0)}`),
      );
      body.appendChild(central);
    }
  } else {
    // La règle des sept lignes vit dans core/stats.ts, testée là-bas : ici on ne
    // fait plus qu'en dessiner le résultat.
    const { shown, otherCount, otherShare } = foldRanking(column.top, column.otherCount, column.present);

    for (const share of shown) {
      body.appendChild(
        valueLine(share.value, share.share, colours.text, colours.accent, false, () =>
          toggleFilter(valuesFilter(modelIndex, [share.value])),
        ),
      );
    }
    if (column.top.length === 0) body.appendChild(line('type', 'no values'));
    if (otherCount > 0) {
      // Inerte : la liste complète s'ouvre par le bouton de filtre de l'en-tête,
      // toujours visible. Un « Other » cliquable doublait ce geste tout en
      // laissant croire qu'on peut filtrer sur « le reste », ce qui ne veut
      // rien dire.
      body.appendChild(valueLine('Other', otherShare, colours.text, colours.text, true));
    }
  }
  cell.appendChild(body);

  cell.addEventListener('mousemove', (event) => {
    if ((event.target as HTMLElement).closest('.bar')) return;
    showTooltip(event, summaryOf(column));
  });
  cell.addEventListener('mouseleave', hideTooltip);
  return cell;
}

function line(className: string, text: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

function valueLine(
  label: string,
  share: number,
  colour: string,
  shareColour: string,
  dim = false,
  onPick?: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = dim ? 'value dim' : 'value';
  if (onPick) {
    row.classList.add('pickable');
    row.addEventListener('click', onPick);
  }
  const name = document.createElement('span');
  name.className = 'value-name';
  name.textContent = label;
  name.style.color = colour;
  const part = document.createElement('span');
  part.textContent = percent(share);
  part.style.color = shareColour;
  row.append(name, part);
  return row;
}

/**
 * Histogramme en SVG : chaque classe non vide garde au moins un pixel, faute de
 * quoi un creux se confondrait avec une absence de données.
 */
function histogram(column: ColumnStats, colours: Palette, width: number): SVGSVGElement {
  const height = HIST_HEIGHT;
  const inner = width - 20;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'hist');
  svg.setAttribute('width', String(inner));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${inner} ${height}`);
  // Le dessin reste exprimé dans un repère de 84 unités ; « none » laisse le
  // navigateur l'étirer verticalement jusqu'à la hauteur que le CSS lui donne,
  // sans que le code des barres ait à connaître cette hauteur.
  svg.setAttribute('preserveAspectRatio', 'none');

  const peak = Math.max(...column.histogram, 0);
  const bins = column.histogram.length;
  const span = (column.max ?? 0) - (column.min ?? 0);

  for (let index = 0; index < bins; index++) {
    const value = column.histogram[index];
    const left = Math.round((inner * index) / bins);
    const right = Math.round((inner * (index + 1)) / bins);
    const barHeight = value === 0 || peak === 0 ? 0 : Math.max(1, Math.round(((height - 3) * value) / peak));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'bar');
    rect.setAttribute('x', String(left));
    rect.setAttribute('y', String(height - 3 - barHeight));
    rect.setAttribute('width', String(Math.max(1, right - left - 1)));
    rect.setAttribute('height', String(barHeight));
    rect.setAttribute('fill', colours.accent);
    // Zone de survol pleine hauteur : viser une barre basse ne doit pas
    // demander de précision au pixel.
    const target = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    target.setAttribute('class', 'bar');
    target.setAttribute('x', String(left));
    target.setAttribute('y', '0');
    target.setAttribute('width', String(Math.max(1, right - left)));
    target.setAttribute('height', String(height));
    target.setAttribute('fill', 'transparent');
    const low = (column.min ?? 0) + (span * index) / bins;
    const high = index === bins - 1 ? (column.max ?? 0) : (column.min ?? 0) + (span * (index + 1)) / bins;
    const range = span <= 0 ? num(column.min ?? 0) : `${num(low)} – ${num(high)}`;
    const share = column.present === 0 ? 0 : value / column.present;
    target.addEventListener('mousemove', (event) => {
      event.stopPropagation();
      showTooltip(event as MouseEvent, `<b>${escape(range)}</b><br>Count: <b>${count(value)}</b> (${percent(share)})`);
    });
    target.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTooltip();
      toggleFilter({
        kind: 'range',
        column: column.index,
        low,
        high,
        last: index === bins - 1,
        label: `${column.name} ${range}`,
      });
    });
    target.classList.add('pickable');
    svg.append(rect, target);
  }
  return svg;
}

function summaryOf(column: ColumnStats): string {
  return (
    `<b>${escape(column.name)}</b><br>${column.type}<br>` +
    `Missing ${count(column.missing)} (${percent(column.missingShare)})<br>` +
    `Distinct ${count(column.distinct)} (${percent(column.distinctShare)})`
  );
}

function paintHead(): void {
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

function headButton(glyph: string, title: string, action: (event: MouseEvent) => void): HTMLButtonElement {
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
function cycleSort(modelIndex: number): void {
  if (state.sort?.index !== modelIndex) state.sort = { index: modelIndex, ascending: true };
  else if (state.sort.ascending) state.sort = { index: modelIndex, ascending: false };
  else state.sort = null;
  rebuildView();
  paint();
}

/** Le panneau du bouton de gauche : la liste des valeurs, ou les bornes. */
function openColumnFilter(modelIndex: number, anchor: HTMLElement): void {
  // Le bouton qui ouvre referme : sans quoi le second clic rouvrait le même
  // panneau, et le seul moyen d'en sortir était de cliquer ailleurs.
  if (openPanel === `filter:${modelIndex}`) {
    closePicker();
    return;
  }
  const column = state.stats[modelIndex];
  if (column?.type === 'numeric') openRangePicker(modelIndex, anchor);
  else openValuePicker(modelIndex, anchor);
  pickerToggle = anchor;
}

function paintRows(): void {
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

// ------------------------------------------------------------- vue brute

/**
 * Bascule vers le texte brut, non analysé.
 *
 * Le texte n'est demandé qu'au premier clic — jamais à l'ouverture du fichier —
 * et mis en cache ensuite : les allers-retours suivants ne coûtent plus rien.
 */
function toggleRaw(): void {
  state.showRaw = !state.showRaw;
  elements.rawToggle.classList.toggle('active', state.showRaw);
  elements.scroller.hidden = state.showRaw;
  elements.filterBar.hidden = state.showRaw || state.filters.length === 0;
  if (state.showRaw) {
    if (state.rawLines === null && !state.rawLoading) {
      state.rawLoading = true;
      vscode.postMessage({ type: 'requestRaw' });
    }
    elements.rawScroller.hidden = false;
    paintRaw();
  } else {
    elements.rawScroller.hidden = true;
    paint();
  }
}

elements.rawToggle.addEventListener('click', toggleRaw);

/**
 * Rend la vue brute par fenêtrage, exactement comme paintRows() rend le
 * tableau : seules les lignes visibles à l'écran entrent dans le DOM, ce qui
 * tient la promesse de fluidité à cent mille lignes même pour du texte non
 * analysé, sans imposer de plafond arbitraire.
 */
function paintRaw(retry = true): void {
  if (state.rawLoading) {
    elements.rawBody.textContent = '';
    elements.rawBody.style.height = '';
    const loading = document.createElement('div');
    loading.className = 'raw-loading';
    loading.textContent = 'Loading…';
    elements.rawBody.appendChild(loading);
    return;
  }
  const lines = state.rawLines;
  if (lines === null) return;

  const total = lines.length;
  elements.rawBody.style.height = `${total * ROW_HEIGHT}px`;
  const scrollTop = elements.rawScroller.scrollTop;
  const viewport = elements.rawScroller.clientHeight;
  // Une hauteur nulle veut dire que la mise en page n'a pas encore eu lieu.
  // Rendre malgré tout ne remplirait que l'overscan — une poignée de lignes,
  // puis du vide jusqu'au premier défilement, sans que rien ne signale l'erreur.
  // Une seule nouvelle tentative, sinon un panneau réellement replié bouclerait.
  if (viewport === 0 && retry) {
    requestAnimationFrame(() => {
      if (state.showRaw) paintRaw(false);
    });
    return;
  }
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);

  const theme = themeById(state.themeId);
  const dark = isDark();
  const gutterWidth = String(total).length;
  const fragment = document.createDocumentFragment();
  for (let index = first; index < last; index++) {
    const row = document.createElement('div');
    row.className = 'raw-line';
    row.style.top = `${index * ROW_HEIGHT}px`;
    const gutter = document.createElement('span');
    gutter.className = 'raw-gutter';
    gutter.textContent = String(index + 1).padStart(gutterWidth, ' ');
    const text = document.createElement('span');
    text.className = 'raw-text';
    for (const segment of rawSegments(lines[index], state.delimiter)) {
      const piece = document.createElement('span');
      if (segment.column < 0) {
        piece.className = 'raw-sep';
      } else {
        // La même couleur que la colonne porte dans le tableau : le fichier
        // brut se lit alors avec les mêmes repères que la vue analysée.
        piece.style.color = paletteFor(theme, segment.column, dark).accent;
      }
      piece.textContent = segment.text;
      text.appendChild(piece);
    }
    row.append(gutter, text);
    fragment.appendChild(row);
  }
  elements.rawBody.textContent = '';
  elements.rawBody.appendChild(fragment);
}

elements.rawScroller.addEventListener('scroll', () => {
  if (state.showRaw) paintRaw();
});

function select(rowIndex: number, columnIndex: number, add: boolean): void {
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

function updateSelectionCount(): void {
  elements.selection.textContent = state.selected.size === 0 ? '' : `${count(state.selected.size)} selected`;
}

elements.scroller.addEventListener('scroll', () => {
  if (state.ready) paintRows();
  hideTooltip();
  closeMenu();
});

// -------------------------------------------------------------------- bulles

function showTooltip(event: MouseEvent, html: string): void {
  elements.tooltip.innerHTML = html;
  elements.tooltip.hidden = false;
  const bounds = elements.tooltip.getBoundingClientRect();
  const x = Math.min(event.clientX + 12, window.innerWidth - bounds.width - 8);
  const y = Math.min(event.clientY + 16, window.innerHeight - bounds.height - 8);
  elements.tooltip.style.left = `${Math.max(4, x)}px`;
  elements.tooltip.style.top = `${Math.max(4, y)}px`;
}

function hideTooltip(): void {
  elements.tooltip.hidden = true;
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
}

// ------------------------------------------------------- menu d'une colonne

/**
 * Toutes ces actions sont des actions de vue : le fichier n'est jamais réécrit.
 * Renommer, retirer ou retyper une colonne change ce qui est affiché, et rouvrir
 * l'onglet rend l'état d'origine.
 */
/** Colonne dont le menu « ⋯ » est ouvert, pour que son bouton le referme. */
let menuColumn: number | null = null;

function openMenu(modelIndex: number, anchor: HTMLElement): void {
  if (menuColumn === modelIndex && !elements.menu.hidden) {
    closeMenu();
    return;
  }
  menuColumn = modelIndex;
  const column = state.stats[modelIndex];
  type Entry = [string, () => void] | 'separator' | { heading: string };
  const entries: Entry[] = [
    ['Column details…', () => openDetails(modelIndex, anchor)],
    'separator',
    ['Sort ascending', () => applySort(modelIndex, true)],
    ['Sort descending', () => applySort(modelIndex, false)],
    [
      column.type === 'numeric' ? 'Filter by range…' : 'Filter by value…',
      () => (column.type === 'numeric' ? openRangePicker(modelIndex, anchor) : openValuePicker(modelIndex, anchor)),
    ],
    ['Filter by text…', () => void applyFilter(modelIndex)],
    'separator',
    ['Rename column', () => void applyRename(modelIndex)],
    ['Drop column', () => applyDrop(modelIndex)],
    'separator',
    { heading: 'Read this column as' },
    ...COLUMN_TYPES.map(
      (type): Entry => [
        // La coche dit ce que la colonne est aujourd'hui, détecté ou forcé.
        `${type === column.type ? '\u2713' : '\u2007'}  ${TYPE_LABELS[type]}`,
        () => vscode.postMessage({ type: 'changeType', index: modelIndex, forced: type }),
      ],
    ),
  ];

  elements.menu.textContent = '';
  for (const entry of entries) {
    if (entry === 'separator') {
      elements.menu.appendChild(document.createElement('hr'));
      continue;
    }
    if ('heading' in entry) {
      const heading = document.createElement('div');
      heading.className = 'menu-heading';
      heading.textContent = entry.heading;
      elements.menu.appendChild(heading);
      continue;
    }
    const [label, action] = entry;
    const item = document.createElement('button');
    item.className = 'menu-item';
    item.textContent = label;
    item.addEventListener('click', () => {
      closeMenu();
      action();
    });
    elements.menu.appendChild(item);
  }

  // Mesurer un élément encore « hidden » renvoie une taille nulle, et le menu
  // se calait alors hors écran. On le rend donc invisible mais présent, le temps
  // de connaître ses dimensions réelles.
  const box = anchor.getBoundingClientRect();
  elements.menu.style.visibility = 'hidden';
  elements.menu.hidden = false;
  const menuBox = elements.menu.getBoundingClientRect();
  elements.menu.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - menuBox.width - 8))}px`;
  elements.menu.style.top = `${Math.max(4, Math.min(box.bottom + 2, window.innerHeight - menuBox.height - 8))}px`;
  elements.menu.style.visibility = 'visible';
}

function closeMenu(): void {
  elements.menu.hidden = true;
  menuColumn = null;
}

// Fermeture au clic en dehors. On écarte explicitement le bouton d'ouverture au
// lieu de compter sur un stopPropagation : un vrai clic souris refermait le menu
// dans la foulée de son ouverture, là où un clic programmatique ne le faisait pas.
document.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  if (elements.menu.hidden) return;
  if (elements.menu.contains(target) || target.closest('.dots')) return;
  closeMenu();
});

function applySort(modelIndex: number, ascending: boolean): void {
  state.sort = { index: modelIndex, ascending };
  rebuildView();
  paint();
}

async function applyFilter(modelIndex: number): Promise<void> {
  const column = state.stats[modelIndex];
  const existing = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'contains' }> =>
      filter.kind === 'contains' && filter.column === modelIndex,
  );
  const entered = await ask('Filter Column', `Keep rows where « ${column.name} » contains:`, existing?.text ?? '');
  if (entered === null) return;
  state.filters = state.filters.filter((filter) => filter !== existing);
  if (entered !== '') {
    state.filters.push({
      kind: 'contains',
      column: modelIndex,
      text: entered.toLowerCase(),
      label: `${column.name} contains « ${entered} »`,
    });
  }
  refilter();
}

/**
 * Construit la condition « la colonne vaut l'une de ces valeurs ».
 *
 * Une seule pastille quel que soit le nombre de valeurs : c'est une seule
 * condition, et la relire doit rester aussi simple que la poser.
 */
function valuesFilter(columnIndex: number, values: string[]): Filter {
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
function setColumnFilter(columnIndex: number, filter: Filter | null): void {
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
function valueCounts(columnIndex: number): Array<[string, number]> {
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

/** Au-delà, la liste devient illisible : la recherche prend le relais. */
const PICKER_MAX_ROWS = 400;

/** Au-delà, un classement de valeurs ne montre plus qu'une forêt de barres égales. */
const MAX_BARS = 20;

/** La table telle qu'elle est après filtrage : c'est sur elle qu'on analyse. */
function currentTable() {
  return {
    headers: state.headers,
    rows: state.view.map((index) => state.rows[index]).filter(Boolean),
    delimiter: state.delimiter,
    truncated: false,
  };
}

/**
 * Sélecteur de valeurs, à la manière d'Excel.
 *
 * Le palmarès du bandeau ne montre que trois valeurs ; toutes les autres sont
 * noyées dans « Other » et resteraient hors d'atteinte. Ce panneau les rend
 * toutes sélectionnables, et la recherche lui permet de tenir même sur une
 * colonne à plusieurs milliers de valeurs distinctes.
 */
function openValuePicker(columnIndex: number, anchor: HTMLElement): void {
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

  placeFloating(elements.picker, anchor);
  openPanel = `filter:${columnIndex}`;
  search.focus();
}

/**
 * Pendant numérique du sélecteur : deux bornes saisies à la main.
 *
 * Une liste de valeurs n'a pas de sens sur une mesure continue, et les tranches
 * de l'histogramme ne permettent pas de demander « entre 0 et 10 ».
 */
function openRangePicker(columnIndex: number, anchor: HTMLElement): void {
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

  placeFloating(elements.picker, anchor);
  openPanel = `filter:${columnIndex}`;
  low.focus();
}

/**
 * Panneau de détail d'une colonne.
 *
 * Le bandeau doit rester compact ; tout ce qu'il ne peut pas porter sans devenir
 * illisible vient ici, à un clic.
 */
function openDetails(columnIndex: number, anchor: HTMLElement): void {
  const column = state.stats[columnIndex];
  if (!column) return;
  const table = currentTable();
  const details = computeDetails(table, columnIndex, column.type);

  elements.picker.textContent = '';
  elements.picker.classList.add('wide');
  elements.picker.appendChild(panelTitle(column.name, `${column.type} · pandas ${details.pandasType}`));

  const scope = document.createElement('div');
  scope.className = 'picker-note';
  scope.textContent =
    state.filters.length > 0
      ? `computed on the ${count(column.total)} rows kept by the active filters`
      : `computed on all ${count(column.total)} rows`;
  elements.picker.appendChild(scope);

  for (const blocker of details.blockers) {
    const flag = document.createElement('div');
    flag.className = 'flag';
    flag.textContent = blocker;
    elements.picker.appendChild(flag);
  }

  elements.picker.appendChild(sectionTitle('Completeness'));
  const completeness = grid();
  addRow(completeness, 'Empty', count(details.empty));
  addRow(completeness, 'Whitespace only', count(details.whitespaceOnly));
  for (const token of details.nullTokens) {
    addRow(completeness, `Written as ${token.value}`, `${count(token.count)}${token.known ? ' · pandas NA' : ''}`);
  }
  // Sans jeton d'absence, ce total répète exactement ce que le bandeau affiche
  // sous « Missing ». Il ne s'affiche donc que lorsqu'il en diffère.
  if (details.nullTokens.length > 0) {
    addRow(
      completeness,
      'Effectively missing',
      `${count(details.effectiveMissing)} (${percent(column.total === 0 ? 0 : details.effectiveMissing / column.total)})`,
    );
  }
  addRow(
    completeness,
    'Values seen once',
    `${count(details.singletons)}${column.distinct === 0 ? '' : ` of ${count(column.distinct)} distinct`}`,
  );
  elements.picker.appendChild(completeness);

  elements.picker.appendChild(sectionTitle('Distribution'));
  elements.picker.appendChild(distributionChart(column, details, palette(columnIndex)));

  if (column.mean !== null) {
    elements.picker.appendChild(sectionTitle('Statistics'));
    const numbers = grid();
    addRow(numbers, 'Min', num(column.min ?? 0));
    addRow(numbers, 'Max', num(column.max ?? 0));
    addRow(numbers, 'Mean', num(column.mean));
    addRow(numbers, 'Median', num(column.median ?? 0));
    addRow(numbers, 'Q1', num(column.q1 ?? 0));
    addRow(numbers, 'Q3', num(column.q3 ?? 0));
    addRow(numbers, 'Std deviation', num(column.deviation ?? 0));
    addRow(numbers, 'Outliers', count(column.outliers));
    elements.picker.appendChild(numbers);
  } else {
    elements.picker.appendChild(sectionTitle('Text'));
    const text = grid();
    addRow(text, 'Length min / max', `${count(details.minLength)} / ${count(details.maxLength)}`);
    addRow(text, 'Length mean', num(Math.round(details.meanLength * 10) / 10));
    addRow(text, 'Case variants', count(details.caseVariants));
    addRow(text, 'Padded with spaces', count(details.spacePadded));
    elements.picker.appendChild(text);
  }

  elements.picker.appendChild(footer([['Close', closePicker, true]]));
  placeFloating(elements.picker, anchor);
  openPanel = `details:${columnIndex}`;
}

/**
 * Le graphique qui dit quelque chose, plutôt que toujours le même.
 *
 * Une mesure mérite son histogramme ; une nomenclature, un classement de ses
 * valeurs ; du texte libre, ni l'un ni l'autre — toutes ses valeurs y valant
 * une occurrence — mais la répartition de ses longueurs, qui révèle les champs
 * tronqués et les bourrages d'espaces.
 */
function distributionChart(column: ColumnStats, details: ColumnDetails, colours: Palette): HTMLElement {
  if (column.histogram.length > 0) return markedHistogram(column, colours);
  const mostlyUnique = column.present > 0 && column.distinct / column.present > 0.6;
  if (mostlyUnique && details.lengths.length > 1) {
    return barChart(
      details.lengths.map((entry) => ({ label: `${entry.length} chars`, count: entry.count })),
      column.present,
      colours,
      'Value length',
    );
  }
  const ranked = rankedValues(column.index);
  return barChart(ranked, column.present, colours, 'Most frequent values');
}

/** Valeurs les plus fréquentes, le reste regroupé pour ne pas noyer le graphique. */
function rankedValues(columnIndex: number): Array<{ label: string; count: number }> {
  const counts = valueCounts(columnIndex);
  const top = counts.slice(0, MAX_BARS).map(([value, occurrences]) => ({
    label: value === '' ? '(blank)' : value,
    count: occurrences,
  }));
  const rest = counts.slice(MAX_BARS).reduce((sum, [, occurrences]) => sum + occurrences, 0);
  if (rest > 0) top.push({ label: `Other (${count(counts.length - MAX_BARS)} values)`, count: rest });
  return top;
}

function barChart(
  entries: Array<{ label: string; count: number }>,
  total: number,
  colours: Palette,
  caption: string,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart list';
  wrapper.appendChild(Object.assign(textSpan(caption), { className: 'chart-caption' }));
  const peak = Math.max(...entries.map((entry) => entry.count), 1);
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = textSpan(entry.label);
    label.className = 'bar-label';
    label.title = entry.label;
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${(entry.count / peak) * 100}%`;
    fill.style.background = colours.accent;
    track.appendChild(fill);
    const tally = textSpan(`${count(entry.count)} · ${percent(total === 0 ? 0 : entry.count / total)}`);
    tally.className = 'bar-count';
    row.append(label, track, tally);
    wrapper.appendChild(row);
  }
  return wrapper;
}

/**
 * Histogramme en grand, avec médiane et quartiles posés dessus.
 *
 * Une boîte à moustaches redessinait des chiffres déjà écrits, et demandait
 * qu'on sache la lire. Ici la forme se lit sans formation, et les quartiles s'y
 * ajoutent au lieu de s'y substituer.
 */
function markedHistogram(column: ColumnStats, colours: Palette): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart';
  const width = 316;
  const height = 150;
  const bottom = height - 26;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'big-hist');

  const bins = column.histogram;
  const peak = Math.max(...bins, 1);
  for (let index = 0; index < bins.length; index++) {
    const left = 6 + ((width - 12) * index) / bins.length;
    const right = 6 + ((width - 12) * (index + 1)) / bins.length;
    const barHeight = bins[index] === 0 ? 0 : Math.max(1, (bottom - 8) * (bins[index] / peak));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(left));
    rect.setAttribute('y', String(bottom - barHeight));
    rect.setAttribute('width', String(Math.max(1, right - left - 1)));
    rect.setAttribute('height', String(barHeight));
    rect.setAttribute('fill', colours.accent);
    svg.appendChild(rect);
  }

  const min = column.min ?? 0;
  const span = (column.max ?? 0) - min || 1;
  const mark = (value: number, label: string) => {
    const x = 6 + ((value - min) / span) * (width - 12);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', '4');
    line.setAttribute('y2', String(bottom));
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', label === 'Median' ? '2' : '1');
    line.setAttribute('stroke-dasharray', label === 'Median' ? '' : '3 3');
    line.setAttribute('opacity', '0.75');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(Math.min(width - 28, Math.max(2, x + 3))));
    text.setAttribute('y', String(bottom + 12));
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', 'currentColor');
    text.setAttribute('opacity', '0.75');
    text.textContent = label;
    svg.append(line, text);
  };
  mark(column.q1 ?? 0, 'Q1');
  mark(column.median ?? 0, 'Median');
  mark(column.q3 ?? 0, 'Q3');

  const scale = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  scale.setAttribute('x', '6');
  scale.setAttribute('y', String(height - 4));
  scale.setAttribute('font-size', '10');
  scale.setAttribute('fill', 'currentColor');
  scale.setAttribute('opacity', '0.6');
  scale.textContent = `${num(min)} … ${num(column.max ?? 0)}`;
  svg.appendChild(scale);

  wrapper.appendChild(svg);
  return wrapper;
}

/**
 * Panneau du fichier entier.
 *
 * Il ne paraphrase pas ce que les colonnes disent déjà : il répond à « que vaut
 * ce fichier, et comment je le charge ». D'où l'appel `pd.read_csv` en tête,
 * puis la vue d'ensemble des colonnes qu'il faudrait sinon ouvrir une à une.
 */
/**
 * Traduit une condition de filtrage en une ligne pandas.
 *
 * Le panneau affiche des chiffres calculés sur le sous-ensemble filtré ; sans
 * cette traduction, le code copié depuis « Dataset… » relirait les 7 200 lignes
 * du fichier au lieu des 12 que le panneau vient d'analyser — une incohérence
 * entre ce que l'outil montre et ce qu'il exporte.
 */
/**
 * Rassemble l'état courant pour core/filters.ts, qui ne connaît que des
 * données — noms déjà résolus, jamais un index à retrouver dans state.
 */
function datasetTransformLines(): string[] {
  const nameOf = (index: number): string => state.stats[index]?.name ?? `column ${index + 1}`;

  const renamed = state.headers
    .map((original, index) => ({ original, current: nameOf(index) }))
    .filter(({ original, current }) => current !== original);

  const dropped = state.headers
    .map((_, index) => index)
    .filter((index) => !state.order.includes(index))
    .map(nameOf);

  const filters = state.filters.map((filter) => ({ filter, columnName: nameOf(filter.column) }));

  const sort = state.sort ? { columnName: nameOf(state.sort.index), ascending: state.sort.ascending } : null;

  return coreDatasetTransformLines({ renamed, dropped, filters, sort });
}

function openDataset(anchor: HTMLElement): void {
  const table = currentTable();
  const details = state.headers.map((_, index) =>
    computeDetails(table, index, state.stats[index]?.type ?? 'text'),
  );
  const dataset = computeDataset(table, details);

  elements.picker.textContent = '';
  elements.picker.classList.add('wide');
  const filtered = state.filters.length > 0;
  elements.picker.appendChild(
    panelTitle(
      state.fileName || 'Dataset',
      filtered
        ? `reflects the ${count(table.rows.length)} rows kept by the active filters`
        : 'what this file is, and how to load it',
    ),
  );

  elements.picker.appendChild(sectionTitle('Read it with pandas'));
  // Le code reproduit tout ce qui change la forme du dataframe affiche a
  // l'ecran, pas seulement les filtres : un renommage ou un retrait de
  // colonne non reproduits, et le code genererait un DataFrame different de
  // celui que le panneau vient d'analyser — ou pire, une KeyError si un
  // filtre porte sur le nom renomme d'une colonne que le code n'a jamais
  // renommee.
  const lines = [readCsvSnippet(state.fileName || 'data.csv', table, dataset), ...datasetTransformLines()];
  const snippet = lines.join('\n');
  const code = document.createElement('pre');
  code.className = 'snippet';
  code.textContent = snippet;
  elements.picker.appendChild(code);
  const copy = document.createElement('button');
  copy.className = 'picker-button';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(snippet);
    copy.textContent = 'Copied';
    window.setTimeout(() => (copy.textContent = 'Copy'), 1200);
  });
  elements.picker.appendChild(copy);

  elements.picker.appendChild(sectionTitle('Columns'));
  const info = document.createElement('div');
  info.className = 'info-table';
  info.append(head('Column'), head('Non-null'), head('Dtype'));
  // Une colonne retiree du tableau (Drop column) n'a plus sa place ici : le
  // code genere ci-dessous la supprime aussi, le panneau doit dire pareil.
  for (const index of state.order) {
    const name = state.headers[index];
    const stats = state.stats[index];
    const column = details[index];
    // Non-nuls tels que pandas les compterait après l'appel ci-dessus, jetons
    // d'absence compris : sans quoi les deux moitiés du panneau se
    // contrediraient.
    const nonNull = (stats?.total ?? 0) - column.effectiveMissing;
    const row = document.createElement('button');
    row.className = 'info-name';
    row.textContent = stats?.name ?? name;
    row.title = 'Open this column';
    row.addEventListener('click', () => {
      closePicker();
      openDetails(index, anchor);
    });
    info.append(
      row,
      Object.assign(textSpan(count(nonNull)), { className: 'info-cell' }),
      Object.assign(textSpan(column.pandasType), { className: 'info-cell dim' }),
    );
  }
  elements.picker.appendChild(info);

  elements.picker.appendChild(sectionTitle('Findings'));
  const list = document.createElement('div');
  list.className = 'findings';

  if (dataset.duplicateRows > 0) {
    list.appendChild(
      finding(`${count(dataset.duplicateRows)} rows are exact duplicates of another`, () => {
        closePicker();
        setColumnFilter(-1, {
          kind: 'duplicates',
          column: -1,
          rows: new Set(dataset.duplicateRowIndices.map((index) => state.view[index] ?? index)),
          label: `${count(dataset.duplicateRows)} duplicate rows`,
        });
      }),
    );
  }
  for (const entry of dataset.findings) {
    list.appendChild(
      finding(entry.text, () => {
        closePicker();
        setColumnFilter(entry.column, valuesFilter(entry.column, entry.values));
      }),
    );
  }
  if (list.childElementCount === 0) list.appendChild(Object.assign(textSpan('Nothing to report.'), { className: 'picker-note' }));
  elements.picker.appendChild(list);

  elements.picker.appendChild(footer([['Close', closePicker, true]]));
  placeFloating(elements.picker, anchor);
  openPanel = 'dataset';
  elements.datasetButton.classList.add('active');
}

function head(text: string): HTMLElement {
  return Object.assign(textSpan(text), { className: 'info-head' });
}

/** Un constat qu'on peut aller vérifier : le clic filtre le tableau dessus. */
function finding(text: string, onPick: () => void): HTMLElement {
  const item = document.createElement('button');
  item.className = 'flag pickable';
  item.title = 'Show these rows in the table';
  item.textContent = text;
  item.addEventListener('click', onPick);
  return item;
}

// ------------------------------------------------- fabriques de panneaux

function panelTitle(title: string, subtitle: string): HTMLElement {
  const wrapper = document.createElement('div');
  const main = document.createElement('div');
  main.className = 'picker-title';
  main.textContent = title;
  const sub = document.createElement('div');
  sub.className = 'picker-note';
  sub.textContent = subtitle;
  wrapper.append(main, sub);
  return wrapper;
}

function sectionTitle(text: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'section-title';
  element.textContent = text;
  return element;
}

function grid(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'detail-grid';
  return element;
}

function addRow(target: HTMLElement, label: string, value: string): void {
  target.append(textSpan(label), Object.assign(textSpan(value), { className: 'detail-value' }));
}

function footer(buttons: Array<[string, () => void, boolean]>): HTMLElement {
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

/**
 * Ce que le panneau montre en ce moment.
 *
 * Le panneau est partage entre Dataset, Column details et le selecteur de
 * valeurs : sans cette distinction, un second clic sur « Dataset » ne saurait
 * pas s'il doit refermer son propre panneau ou basculer depuis un autre.
 */
let openPanel: string | null = null;

/**
 * Le bouton qui referme le panneau, quand il en existe un.
 *
 * Sans cette exception, le clic extérieur fermait le panneau **avant** que le
 * clic n'atteigne le bouton, lequel le rouvrait dans la foulée : le panneau
 * semblait ne jamais se refermer. Seuls les boutons qui font réellement
 * bascule y figurent — « ⋯ » ouvre le menu, pas le panneau, et doit donc
 * continuer à le fermer.
 */
let pickerToggle: HTMLElement | null = null;

function closePicker(): void {
  elements.picker.classList.remove('wide');
  elements.picker.hidden = true;
  openPanel = null;
  pickerToggle = null;
  elements.datasetButton.classList.remove('active');
}

/** Positionne un panneau sous son ancre, sans déborder de la fenêtre. */
function placeFloating(panel: HTMLElement, anchor: HTMLElement): void {
  if (panel === elements.picker) {
    // Chaque ouvreur pose ensuite sa propre clé ; celui qui oublierait de le
    // faire laisse simplement un panneau qu'aucun bouton ne referme, jamais un
    // panneau qui se referme au mauvais moment.
    openPanel = null;
    pickerToggle = null;
    elements.datasetButton.classList.remove('active');
  }
  panel.style.visibility = 'hidden';
  panel.hidden = false;
  const box = anchor.getBoundingClientRect();
  const size = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - size.width - 8))}px`;
  panel.style.top = `${Math.max(4, Math.min(box.bottom + 2, window.innerHeight - size.height - 8))}px`;
  panel.style.visibility = 'visible';
}

/** Applique une condition, ou la retire si elle est déjà posée. */
function toggleFilter(filter: Filter): void {
  const same = state.filters.findIndex(
    (existing) => existing.column === filter.column && existing.label === filter.label,
  );
  if (same >= 0) state.filters.splice(same, 1);
  else state.filters.push(filter);
  refilter();
}

function clearFilters(): void {
  state.filters = [];
  refilter();
}

/**
 * Affiche les conditions actives.
 *
 * Sans cette barre, on filtre trois fois, on oublie ce qui est retenu, et on lit
 * des chiffres partiels en les croyant complets. C'est la moitié de la
 * fonctionnalité, pas sa décoration.
 */
/** Teinte les deux barres du haut : celle des boutons et celle des filtres. */
function paintChrome(): void {
  const gradient = gradientFor(themeById(state.themeId), isDark());
  elements.toolbar.style.backgroundImage = gradient;
  elements.filterBar.style.backgroundImage = gradient;
}

function paintFilterBar(): void {
  elements.filterBar.textContent = '';
  elements.filterBar.hidden = state.filters.length === 0;
  paintChrome();
  if (elements.filterBar.hidden) return;

  const summary = document.createElement('span');
  summary.className = 'filter-summary';
  summary.textContent = `${count(state.view.length)} of ${count(state.rows.length)} rows`;
  elements.filterBar.appendChild(summary);

  for (const filter of state.filters) {
    const chip = document.createElement('button');
    chip.className = 'chip-filter';
    chip.title = 'Remove this filter';
    chip.append(document.createTextNode(filter.label), cross());
    chip.addEventListener('click', () => {
      state.filters = state.filters.filter((other) => other !== filter);
      refilter();
    });
    elements.filterBar.appendChild(chip);
  }

  const clear = document.createElement('button');
  clear.className = 'chip-clear';
  clear.textContent = 'Clear all';
  clear.addEventListener('click', clearFilters);
  elements.filterBar.appendChild(clear);
}

function cross(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'chip-cross';
  mark.textContent = '\u00D7';
  return mark;
}

function refilter(): void {
  rebuildView();
  // Le recalcul n'a lieu qu'ici : le mettre dans rebuildView le déclencherait à
  // chaque paquet de lignes reçu, soit cinq fois pour rien sur un gros fichier.
  recomputeStats(state.view);
  // Surtout pas de measureWidths() ici. La largeur d'une colonne tient compte du
  // texte « Min … Max … » que son bandeau doit loger ; ces chiffres changent
  // avec le filtre, et toute la feuille se decalait alors horizontalement a
  // chaque clic. Une largeur est une propriete du fichier, decidee a
  // l'ouverture.
  paintFilterBar();
  paint();
}

async function applyRename(modelIndex: number): Promise<void> {
  const column = state.stats[modelIndex];
  const entered = await ask('Rename Column', 'New name for this column:', column.name);
  if (entered === null || entered.trim() === '') return;
  column.name = entered.trim();
  paint();
}

function applyDrop(modelIndex: number): void {
  state.order = state.order.filter((index) => index !== modelIndex);
  paint();
}

/**
 * Replie ou deplie les bandeaux.
 *
 * L'interrupteur vit dans la barre d'outils, et non dans le bandeau : quand il y
 * etait, le replier supprimait le seul bouton capable de le rappeler.
 */
/**
 * Durée du pliage du bandeau **et** du glissement des colonnes.
 *
 * Une seule constante pour les deux : ils décrivent un même geste, et deux
 * valeurs même voisines se verraient — l'une des deux moitiés de l'écran
 * finirait avant l'autre. Les désynchroniser demanderait donc de le vouloir.
 */
const FOLD_MS = 90;
/** Une bascule en annule une autre : sans ce jeton, deux animations de largeur
 * se disputeraient state.widths à chaque frame. */
let widthRun = 0;

function toggleInsights(visible = !state.bandVisible, animate = true): void {
  const changed = visible !== state.bandVisible;
  state.bandVisible = visible;
  elements.insightsToggle.setAttribute('aria-expanded', String(visible));
  elements.insightsToggle.classList.toggle('folded', !visible);
  const chevron = elements.insightsToggle.querySelector('.chevron');
  if (chevron) chevron.textContent = '\u25BE';
  vscode.postMessage({ type: 'setInsights', visible });

  // Le bandeau est peint avant l'animation : il faut sa hauteur naturelle pour
  // savoir vers quoi — ou depuis quoi — animer.
  const before = elements.band.getBoundingClientRect().height;
  // Les largeurs se rediscutent ici, et seulement ici : c'est un geste
  // délibéré dont le déplacement est justement l'effet recherché, à la
  // différence d'un filtre où il n'était qu'une nuisance.
  const from = state.widths.slice();
  if (state.ready) measureWidths();
  const to = state.widths.slice();

  if (!changed || !animate || reducedMotion()) {
    paint();
    return;
  }
  // Repeint d'abord dans les largeurs de départ, sinon la première frame
  // montrerait déjà l'état final et l'animation n'aurait plus rien à jouer.
  state.widths = from;
  paint();
  foldBand(visible ? 0 : before, visible ? elements.band.getBoundingClientRect().height : 0);
  animateWidths(from, to);
}

/** Fait glisser les colonnes d'une largeur à l'autre. */
function animateWidths(from: number[], to: number[]): void {
  const run = ++widthRun;
  const start = performance.now();
  const step = () => {
    if (run !== widthRun) return;
    const ratio = Math.min(1, (performance.now() - start) / FOLD_MS);
    const eased = 1 - (1 - ratio) * (1 - ratio);
    state.widths = to.map((target, index) => {
      const origin = from[index] ?? target;
      return Math.round(origin + (target - origin) * eased);
    });
    paint();
    if (ratio < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Anime la hauteur du bandeau, sans conteneur supplémentaire.
 *
 * Le bandeau et l'en-tête forment un seul bloc collant : y glisser un wrapper
 * ramènerait le défaut où le texte des lignes débordait au-dessus des titres.
 * On anime donc l'élément lui-même, d'une hauteur mesurée à l'autre, et on lui
 * rend sa hauteur automatique à la fin — une hauteur figée en pixels mentirait
 * dès que le contenu change.
 */
function foldBand(from: number, to: number): void {
  const band = elements.band;
  if (to === 0) band.hidden = false;
  band.style.overflow = 'hidden';
  const animation = band.animate(
    [{ height: `${from}px` }, { height: `${to}px` }],
    { duration: FOLD_MS, easing: 'ease-out' },
  );
  animation.onfinish = () => {
    band.style.overflow = '';
    band.style.height = '';
    band.hidden = !state.bandVisible;
  };
}

elements.insightsToggle.addEventListener('click', () => toggleInsights());
elements.datasetButton.addEventListener('click', () => {
  // Une bascule, comme « Raw » et « Insights » : un second clic referme. Mais
  // seulement s'il s'agit bien du panneau Dataset — venant de « Column
  // details », le clic doit basculer vers Dataset, pas tout fermer.
  if (openPanel === 'dataset') {
    closePicker();
    return;
  }
  openDataset(elements.datasetButton);
  pickerToggle = elements.datasetButton;
});

// ----------------------------------------------------------------- palettes

/**
 * Les trois familles, déduites de la palette elle-même plutôt que de sa position
 * dans la liste.
 *
 * Un découpage par indices figés était un piège : ajouter une palette au milieu
 * de la liste l'aurait rangée en silence dans la mauvaise famille, sans qu'aucun
 * test ne s'en aperçoive. Chaque palette sait déjà ce qu'elle est — une encre
 * unique pour un fond coloré, un fond uni pour une encre colorée, ni l'un ni
 * l'autre quand les deux portent la couleur.
 */
const THEME_GROUPS: Array<[string, typeof THEMES]> = [
  ['Coloured background', THEMES.filter((theme) => theme.uniformInk !== undefined)],
  ['Coloured text', THEMES.filter((theme) => theme.neutral !== undefined)],
  ['Both', THEMES.filter((theme) => theme.uniformInk === undefined && theme.neutral === undefined)],
];

/**
 * Aperçu d'une palette : une pastille par teinte, chacune portant son fond et un
 * trait de sa couleur de texte.
 *
 * Les deux sont nécessaires — une palette à fond uni ne se distingue que par son
 * encre, et une pastille qui n'en montrerait que le fond les rendrait toutes
 * identiques.
 */
function swatch(theme: CsvTheme): HTMLElement {
  const dark = isDark();
  const element = document.createElement('span');
  element.className = 'swatch';
  for (let column = 0; column < 5; column++) {
    const colours = paletteFor(theme, column, dark);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = colours.band;
    const ink = document.createElement('span');
    ink.className = 'chip-ink';
    ink.style.background = colours.text;
    chip.appendChild(ink);
    element.appendChild(chip);
  }
  return element;
}

function buildThemePicker(): void {
  elements.themePopup.textContent = '';
  for (const [label, themes] of THEME_GROUPS) {
    const heading = document.createElement('div');
    heading.className = 'theme-group';
    heading.textContent = label;
    elements.themePopup.appendChild(heading);
    for (const theme of themes) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'theme-item';
      item.setAttribute('role', 'option');
      item.dataset.id = theme.id;
      item.append(swatch(theme), textSpan(theme.label));
      // Survoler suffit à voir : une pastille de cinq carrés ne dit pas ce que
      // quarante-cinq palettes donnent sur ses propres données, et choisir à
      // l'aveugle obligeait à ouvrir le panneau autant de fois qu'il y a de
      // palettes. Le clic, lui, reste le seul geste qui engage.
      item.addEventListener('mouseenter', () => previewTheme(theme.id));
      item.addEventListener('focus', () => previewTheme(theme.id));
      item.addEventListener('click', () => {
        chosenThemeId = theme.id;
        vscode.postMessage({ type: 'selectTheme', id: theme.id });
        closeThemePopup();
        buildThemePicker();
      });
      elements.themePopup.appendChild(item);
    }
  }
  showCurrentTheme();
}

function textSpan(text: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

/**
 * La palette réellement choisie, par opposition à celle qu'on est en train de
 * survoler. Le panneau la restitue à sa fermeture, quelle que soit la façon dont
 * on en sort — clic ailleurs, Échap, ou le bouton lui-même.
 */
let chosenThemeId: string | null = null;
let previewFrame = 0;

/**
 * Applique une palette à l'écran sans engager le choix.
 *
 * Le bouton de la barre d'outils et la coche « courante » ne bougent pas : ils
 * disent ce qui est choisi, et rien ne l'est encore. Les repeints sont groupés
 * par frame — balayer la liste de haut en bas déclenche sinon quarante-cinq
 * reconstructions du tableau pour un seul mouvement de souris.
 */
function previewTheme(id: string): void {
  if (state.themeId === id) return;
  state.themeId = id;
  if (previewFrame !== 0) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = 0;
    paintChrome();
    paint();
    if (state.showRaw) paintRaw();
  });
}

function showCurrentTheme(): void {
  const theme = themeById(state.themeId);
  elements.themeLabel.textContent = theme.label;
  elements.themeSwatch.replaceWith(Object.assign(swatch(theme), { id: 'theme-swatch' }));
  elements.themeSwatch = byId('theme-swatch');
  elements.themePopup.querySelectorAll<HTMLElement>('.theme-item').forEach((item) => {
    item.classList.toggle('current', item.dataset.id === (chosenThemeId ?? state.themeId));
  });
}

function openThemePopup(): void {
  chosenThemeId = state.themeId;
  elements.themePopup.style.visibility = 'hidden';
  elements.themePopup.hidden = false;
  const box = elements.themeButton.getBoundingClientRect();
  const popup = elements.themePopup.getBoundingClientRect();
  elements.themePopup.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - popup.width - 8))}px`;
  elements.themePopup.style.top = `${Math.max(4, Math.min(box.bottom + 2, window.innerHeight - popup.height - 8))}px`;
  elements.themePopup.style.visibility = 'visible';
  elements.themeButton.setAttribute('aria-expanded', 'true');
  elements.themePopup.querySelector<HTMLElement>('.theme-item.current')?.scrollIntoView({ block: 'nearest' });
}

function closeThemePopup(): void {
  elements.themePopup.hidden = true;
  elements.themeButton.setAttribute('aria-expanded', 'false');
  // Toute sortie du panneau passe par ici : l'aperçu ne peut donc pas rester
  // collé après un clic ailleurs, un Échap ou un second clic sur le bouton. Le
  // clic sur une palette, lui, a déjà inscrit son choix juste avant.
  if (chosenThemeId !== null && chosenThemeId !== state.themeId) {
    state.themeId = chosenThemeId;
    paintChrome();
    paint();
    if (state.showRaw) paintRaw();
  }
  showCurrentTheme();
}

elements.themeButton.addEventListener('click', () => {
  if (elements.themePopup.hidden) openThemePopup();
  else closeThemePopup();
});

document.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  if (elements.themePopup.hidden) return;
  if (elements.themePopup.contains(target) || elements.themeButton.contains(target)) return;
  closeThemePopup();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeThemePopup();
    closeMenu();
    closePicker();
  }
});

document.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  if (elements.picker.hidden || elements.picker.contains(target)) return;
  if (pickerToggle?.contains(target)) return;
  closePicker();
});

vscode.postMessage({ type: 'ready' });
