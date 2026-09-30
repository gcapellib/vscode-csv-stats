import { computeDetails, type ColumnDetails } from '../../core/details';
import { count, num, percent } from '../../core/format';
import { type ColumnStats } from '../../core/stats';
import { type Palette } from '../../core/themes';
import { closePicker, setOpenPanel } from '../actions';
import { floating, positionFloating } from '../floating-setup';
import { palette, state } from '../state';
import { currentTable } from '../table';
import { addRow, footer, grid, panelTitle, sectionTitle } from './shared';
import { elements, textSpan } from '../dom';
import { valueCounts } from '../table';

/**
 * Panneau de détail d'une colonne.
 *
 * Le bandeau doit rester compact ; tout ce qu'il ne peut pas porter sans devenir
 * illisible vient ici, à un clic.
 */
export function openDetails(columnIndex: number, anchor: HTMLElement): void {
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
  floating.open('picker', anchor);
  positionFloating(elements.picker, anchor);
  setOpenPanel(`details:${columnIndex}`);
}

/** Au-delà, un classement de valeurs ne montre plus qu'une forêt de barres égales. */
const MAX_BARS = 20;

/**
 * Le graphique qui dit quelque chose, plutôt que toujours le même.
 *
 * Une mesure mérite son histogramme ; une nomenclature, un classement de ses
 * valeurs ; du texte libre, ni l'un ni l'autre — toutes ses valeurs y valant
 * une occurrence — mais la répartition de ses longueurs, qui révèle les champs
 * tronqués et les bourrages d'espaces.
 */
export function distributionChart(column: ColumnStats, details: ColumnDetails, colours: Palette): HTMLElement {
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
export function rankedValues(columnIndex: number): Array<{ label: string; count: number }> {
  const counts = valueCounts(columnIndex);
  const top = counts.slice(0, MAX_BARS).map(([value, occurrences]) => ({
    label: value === '' ? '(blank)' : value,
    count: occurrences,
  }));
  const rest = counts.slice(MAX_BARS).reduce((sum, [, occurrences]) => sum + occurrences, 0);
  if (rest > 0) top.push({ label: `Other (${count(counts.length - MAX_BARS)} values)`, count: rest });
  return top;
}

export function barChart(
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
export function markedHistogram(column: ColumnStats, colours: Palette): HTMLElement {
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
