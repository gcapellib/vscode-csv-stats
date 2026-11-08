import { correlationMatrix, type NumericColumn } from '../../core/insights';
import { count } from '../../core/format';
import { closePicker, setOpenPanel } from '../actions';
import { elements } from '../dom';
import { floating, positionFloating } from '../floating-setup';
import { icon } from '../icons';
import { palette, state } from '../state';
import { quickTip } from '../tooltip';
import { openDetails } from './column-details';
import { footer, panelTitle, tintPanel } from './shared';

/**
 * La carte de chaleur des corrélations : ce qu'on dessine en premier quand on explore un
 * jeu de données pour le modèle. Une case par paire de colonnes numériques, rouge quand
 * elles montent ensemble, bleue quand l'une monte quand l'autre descend, d'autant plus
 * pleine que le lien est fort.
 *
 * Elle ne suppose rien du fichier : 2 colonnes ou 40, noms courts ou interminables, paires
 * incalculables (trop peu de lignes en commun, colonne constante) laissées vides.
 */

/** Au-delà, la carte devient illisible : on garde les premières colonnes et on le dit. */
const MAX_COLUMNS = 40;
const SVG = 'http://www.w3.org/2000/svg';
/** La largeur utile du panneau large, marges comprises. */
const AVAILABLE = 450;
const LABEL_CHARS = 16;

function shorten(name: string): string {
  return name.length > LABEL_CHARS ? `${name.slice(0, LABEL_CHARS - 1)}…` : name;
}

function node<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

/** Le code qui dessine la même carte avec seaborn, sur les noms de colonnes courants. */
export function heatmapSnippet(names: string[]): string {
  const list = names.map((name) => JSON.stringify(name)).join(', ');
  return [
    'import matplotlib.pyplot as plt',
    'import seaborn as sns',
    '',
    `corr = df[[${list}]].corr()`,
    'sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", vmin=-1, vmax=1)',
    'plt.show()',
  ].join('\n');
}

export function openHeatmap(anchor: HTMLElement, columns: NumericColumn[], rows: string[][], back: () => void): void {
  const shown = columns.slice(0, MAX_COLUMNS);
  const matrix = correlationMatrix(rows, shown);
  const names = shown.map((column) => state.stats[column.index]?.name ?? column.name);
  const n = shown.length;

  elements.picker.textContent = '';
  elements.picker.classList.add('wide');
  tintPanel(null);
  const filtered = state.filters.length > 0;
  elements.picker.appendChild(
    panelTitle(
      'Correlations',
      `Pearson · ${n} numeric column${n === 1 ? '' : 's'} · ${filtered ? `the ${count(rows.length)} rows kept by the filters` : `${count(rows.length)} rows`}`,
    ),
  );

  // Les dimensions suivent le nombre de colonnes : des cases larges quand il y en a peu,
  // serrées (sans chiffres) quand il y en a beaucoup, et le tout se réduit à la largeur du panneau.
  const left = Math.min(150, 14 + Math.max(...names.map((name) => shorten(name).length)) * 6.4);
  const cell = Math.max(12, Math.min(40, Math.floor((AVAILABLE - left) / n)));
  const top = 10 + Math.min(LABEL_CHARS, Math.max(...names.map((name) => shorten(name).length))) * 4.6;
  const width = left + n * cell + 8;
  const height = top + n * cell + 6;
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', class: 'heatmap' });
  svg.setAttribute('aria-label', `Correlation matrix of ${n} numeric columns`);

  const open = (index: number) => () => {
    closePicker();
    openDetails(index, anchor);
  };
  const digits = cell >= 34 ? 2 : cell >= 22 ? 1 : -1;
  const font = cell >= 34 ? 11 : 10;

  shown.forEach((column, i) => {
    const colour = palette(column.index).accent;
    // Étiquette de ligne, à gauche, alignée à droite contre la grille.
    const row = node('text', { x: left - 6, y: top + i * cell + cell / 2, 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'heat-label', fill: colour });
    row.textContent = shorten(names[i]);
    quickTip(row as unknown as HTMLElement, `${names[i]} — open this column`);
    row.addEventListener('click', open(column.index));
    svg.appendChild(row);
    // Étiquette de colonne, au-dessus, inclinée pour tenir dans la largeur d'une case.
    const x = left + i * cell + cell / 2;
    const heading = node('text', { x, y: top - 6, transform: `rotate(-50 ${x} ${top - 6})`, 'text-anchor': 'start', class: 'heat-label', fill: colour });
    heading.textContent = shorten(names[i]);
    quickTip(heading as unknown as HTMLElement, `${names[i]} — open this column`);
    heading.addEventListener('click', open(column.index));
    svg.appendChild(heading);
  });

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = matrix[i][j];
      const x = left + j * cell;
      const y = top + i * cell;
      const box = node('rect', { x: x + 0.5, y: y + 0.5, width: cell - 1, height: cell - 1, rx: 2, class: i === j ? 'heat-cell heat-diagonal' : 'heat-cell' });
      if (r !== null && i !== j) {
        box.style.fill = r >= 0 ? 'var(--heat-positive)' : 'var(--heat-negative)';
        // Une racine : un lien de 0,4 doit se voir autant qu'il compte, sur fond sombre comme clair.
        box.setAttribute('fill-opacity', String(Math.min(1, 0.1 + 0.9 * Math.abs(r) ** 0.7)));
      }
      // Un seul survol par case : les deux colonnes et le coefficient.
      quickTip(
        box as unknown as HTMLElement,
        i === j ? names[i] : r === null ? `${names[i]} ↔ ${names[j]}: not enough rows in common to tell` : `${names[i]} ↔ ${names[j]}: ${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(3)}`,
      );
      svg.appendChild(box);
      if (digits >= 0) {
        const label = node('text', { x: x + cell / 2, y: y + cell / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'heat-value', 'font-size': font });
        label.textContent = i === j ? '1' : r === null ? '–' : r.toFixed(digits).replace(/^(-?)0\./, '$1.');
        svg.appendChild(label);
      }
    }
  }

  const scroller = document.createElement('div');
  scroller.className = 'heatmap-wrap';
  scroller.appendChild(svg);
  elements.picker.appendChild(scroller);

  const legend = document.createElement('div');
  legend.className = 'heat-legend';
  const bar = document.createElement('span');
  bar.className = 'heat-scale';
  legend.append(Object.assign(document.createElement('span'), { textContent: '−1' }), bar, Object.assign(document.createElement('span'), { textContent: '+1' }));
  quickTip(legend, 'Blue: one rises when the other falls. Red: they rise together.');
  elements.picker.appendChild(legend);

  if (columns.length > MAX_COLUMNS) {
    elements.picker.appendChild(
      Object.assign(document.createElement('div'), { className: 'picker-note', textContent: `Only the first ${MAX_COLUMNS} of ${columns.length} numeric columns are shown.` }),
    );
  }

  const snippet = heatmapSnippet(names);
  const copy = document.createElement('button');
  copy.className = 'picker-button';
  copy.append(icon('copy', 13), document.createTextNode('Copy pandas code'));
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(snippet);
    copy.lastChild!.textContent = 'Copied';
    window.setTimeout(() => (copy.lastChild!.textContent = 'Copy pandas code'), 1200);
  });
  const backButton = document.createElement('button');
  backButton.className = 'picker-button';
  backButton.append(icon('back', 13), document.createTextNode('Dataset'));
  backButton.addEventListener('click', back);
  const bar2 = footer([['Close', closePicker, true]]);
  bar2.prepend(backButton, copy);
  elements.picker.appendChild(bar2);

  floating.open('picker', anchor);
  positionFloating(elements.picker, anchor);
  setOpenPanel('dataset');
  elements.datasetButton.classList.add('active');
}
