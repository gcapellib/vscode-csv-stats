/**
 * La vue : bandeau de statistiques au-dessus d'un tableau virtualisé.
 *
 * Le tableau n'affiche que les lignes visibles — seule façon de rester fluide à
 * cent mille lignes. Le bandeau et l'en-tête restent collés en haut et défilent
 * horizontalement avec les colonnes, si bien que l'alignement est structurel.
 */
import { count, num, percent } from '../core/format';
import { type ColumnStats } from '../core/stats';
import { parseNumber, type ColumnType } from '../core/types';
import { paletteFor, THEMES, themeById, type CsvTheme, type Palette } from '../core/themes';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

const ROW_HEIGHT = 22;
const MIN_WIDTH = 210;
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
  themeButton: byId('theme-button'),
  themeSwatch: byId('theme-swatch'),
  themeLabel: byId('theme-label'),
  themePopup: byId('theme-popup'),
  shape: byId('shape'),
  notice: byId('notice'),
  scroller: byId('scroller'),
  sheet: byId('sheet'),
  band: byId('band'),
  head: byId('head'),
  body: byId('body'),
  tooltip: byId('tooltip'),
  menu: byId('menu'),
};

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element #${id}`);
  return element;
}

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
  filters: Map<number, string>;
  /** Lignes retenues après filtre et tri, par index de modèle. */
  view: number[];
  bandVisible: boolean;
  themeId: string;
  ready: boolean;
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
  filters: new Map(),
  view: [],
  bandVisible: true,
  themeId: THEMES[0].id,
  ready: false,
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
      state.order = state.headers.map((_, index) => index);
      state.themeId = themeById(message.theme as string | undefined).id;
      if (message.insights === false) toggleInsights(false);
      elements.shape.textContent = `${count(state.rowCount)} rows × ${count(state.headers.length)} columns`;
      if (message.truncated) {
        elements.notice.textContent = `Truncated: only the first ${count(state.rowCount)} rows are analysed.`;
      }
      buildThemePicker();
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

function measureWidths(): void {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = getComputedStyle(document.body).font || '13px sans-serif';
  if (context) context.font = font;
  const widthOf = (text: string) => (context ? context.measureText(text).width : text.length * 7);

  const sampled = Math.min(state.rows.length, WIDTH_SAMPLE_ROWS);
  state.widths = state.headers.map((header, index) => {
    let widest = widthOf(header);
    for (let row = 0; row < sampled; row++) {
      const value = state.rows[row]?.[index];
      if (value) widest = Math.max(widest, widthOf(value));
    }
    const column = state.stats[index];
    if (column && column.min !== null) {
      // La colonne doit loger ce que son bandeau annonce : des bornes tronquées
      // en « Min 98,… » ne renseignent plus sur rien.
      widest = Math.max(
        widest,
        widthOf(`Min ${num(column.min ?? 0)}`) + widthOf(`Max ${num(column.max ?? 0)}`) + 16,
      );
    }
    return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest + 28)));
  });
}

function totalWidth(): number {
  return state.order.reduce((sum, index) => sum + state.widths[index], 0);
}

// ------------------------------------------------------------- filtre et tri

function rebuildView(): void {
  const rows = state.rows;
  let view: number[] = [];
  if (state.filters.size === 0) {
    view = rows.map((_, index) => index);
  } else {
    const clauses = [...state.filters.entries()].map(([index, text]) => ({ index, text: text.toLowerCase() }));
    for (let row = 0; row < rows.length; row++) {
      const cells = rows[row];
      if (!cells) continue;
      if (clauses.every((clause) => (cells[clause.index] ?? '').toLowerCase().includes(clause.text))) view.push(row);
    }
  }

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
  body.className = 'band-body';
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
  } else {
    for (const share of column.top) {
      body.appendChild(valueLine(share.value, share.share, colours.text, colours.accent));
    }
    if (column.top.length === 0) body.appendChild(line('type', 'no values'));
    if (column.otherCount > 0) body.appendChild(valueLine('Other', column.otherShare, colours.text, colours.text, true));
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

function valueLine(label: string, share: number, colour: string, shareColour: string, dim = false): HTMLElement {
  const row = document.createElement('div');
  row.className = dim ? 'value dim' : 'value';
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
    cell.textContent = state.stats[modelIndex].name;
    if (state.sort?.index === modelIndex) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = state.sort.ascending ? ' ↑' : ' ↓';
      cell.appendChild(arrow);
    }
    cell.addEventListener('click', () => {
      const ascending = state.sort?.index === modelIndex ? !state.sort.ascending : true;
      state.sort = { index: modelIndex, ascending };
      rebuildView();
      paint();
    });
    elements.head.appendChild(cell);
  }
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
    row.className = 'row';
    row.style.top = `${position * ROW_HEIGHT}px`;
    for (const modelIndex of state.order) {
      const colours = palette(modelIndex);
      const cell = document.createElement('div');
      cell.className = state.stats[modelIndex].type === 'numeric' ? 'cell num' : 'cell';
      cell.style.width = `${state.widths[modelIndex]}px`;
      cell.style.background = colours.cell;
      cell.style.color = colours.text;
      cell.textContent = cells[modelIndex] ?? '';
      row.appendChild(cell);
    }
    fragment.appendChild(row);
  }
  elements.body.textContent = '';
  elements.body.appendChild(fragment);
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
function openMenu(modelIndex: number, anchor: HTMLElement): void {
  const column = state.stats[modelIndex];
  type Entry = [string, () => void] | 'separator' | { heading: string };
  const entries: Entry[] = [
    ['Sort ascending', () => applySort(modelIndex, true)],
    ['Sort descending', () => applySort(modelIndex, false)],
    ['Filter…', () => void applyFilter(modelIndex)],
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
  const entered = await ask('Filter Column', `Keep rows where « ${column.name} » contains:`, state.filters.get(modelIndex) ?? '');
  if (entered === null) return;
  if (entered === '') state.filters.delete(modelIndex);
  else state.filters.set(modelIndex, entered);
  rebuildView();
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
function toggleInsights(visible = !state.bandVisible): void {
  state.bandVisible = visible;
  elements.insightsToggle.setAttribute('aria-expanded', String(visible));
  const chevron = elements.insightsToggle.querySelector('.chevron');
  if (chevron) chevron.textContent = visible ? '\u25BE' : '\u25B8';
  vscode.postMessage({ type: 'setInsights', visible });
  paint();
}

elements.insightsToggle.addEventListener('click', () => toggleInsights());

// ----------------------------------------------------------------- palettes

const THEME_GROUPS: Array<[string, typeof THEMES]> = [
  ['Coloured background', THEMES.slice(0, 20)],
  ['Coloured text', THEMES.slice(20, 30)],
  ['Both', THEMES.slice(30)],
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
      item.addEventListener('click', () => {
        state.themeId = theme.id;
        vscode.postMessage({ type: 'selectTheme', id: theme.id });
        closeThemePopup();
        buildThemePicker();
        paint();
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

function showCurrentTheme(): void {
  const theme = themeById(state.themeId);
  elements.themeLabel.textContent = theme.label;
  elements.themeSwatch.replaceWith(Object.assign(swatch(theme), { id: 'theme-swatch' }));
  elements.themeSwatch = byId('theme-swatch');
  elements.themePopup.querySelectorAll<HTMLElement>('.theme-item').forEach((item) => {
    item.classList.toggle('current', item.dataset.id === state.themeId);
  });
}

function openThemePopup(): void {
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
  }
});

vscode.postMessage({ type: 'ready' });
