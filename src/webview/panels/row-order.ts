/**
 * La colonne dans l'ordre des lignes du fichier.
 *
 * L'histogramme dit comment les valeurs se répartissent ; il ne dit pas quand.
 * Un capteur qui change de régime au milieu du fichier, un bloc de cellules
 * vides, une dérive : seule la série dans son ordre le montre.
 *
 * La courbe suit la moyenne de chaque tranche de lignes, sur la plage normale
 * (celle des limites d'outliers). Les outliers n'écrasent donc pas l'échelle :
 * ils sont des points jaunes collés au bord, et les cellules vides des repères
 * rouges sur l'axe. Les valeurs-balises sont écartées, comme dans l'histogramme.
 */
import { levelShift } from '../../core/insights';
import { count } from '../../core/format';
import { type ColumnDetails } from '../../core/details';
import { type ColumnStats } from '../../core/stats';
import { type Palette } from '../../core/themes';
import { formatValue } from '../../core/values';
import { state } from '../state';
import { closePicker } from '../actions';
import { lineOf, parserOf, setColumnFilter, valuesFilter } from '../table';
import { hideTooltip, quickTip, showTooltip } from '../tooltip';

const NS = 'http://www.w3.org/2000/svg';
const WARN = 'var(--vscode-editorWarning-foreground, #cca700)';
const ERROR = 'var(--vscode-editorErrorForeground, #d03b3b)';

/** Moins de lignes que cela : la série tient dans l'histogramme. */
const MIN_ROWS = 30;
const BUCKETS = 160;

interface Bucket {
  from: number;
  to: number;
  sum: number;
  seen: number;
  above: number;
  below: number;
  empty: number;
}

export function rowOrderChart(column: ColumnStats, details: ColumnDetails, colours: Palette): HTMLElement | null {
  if (column.type !== 'numeric' || column.temporal || column.q1 === null || column.q3 === null) return null;
  const view = state.view;
  if (view.length < MIN_ROWS) return null;

  const parse = parserOf(column.index);
  const excluded = new Set(details.placeholders.flatMap((entry) => entry.tokens));
  const spread = column.q3 - column.q1;
  const low = column.q1 - 1.5 * spread;
  const high = column.q3 + 1.5 * spread;

  const size = Math.min(BUCKETS, view.length);
  const buckets: Bucket[] = Array.from({ length: size }, (_, index) => ({
    from: Math.floor((index * view.length) / size),
    to: Math.floor(((index + 1) * view.length) / size) - 1,
    sum: 0,
    seen: 0,
    above: 0,
    below: 0,
    empty: 0,
  }));
  const levels: number[] = [];
  const levelRows: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  let outliers = 0;
  const outlierRaws = new Set<string>();
  let empties = 0;
  view.forEach((rowIndex, position) => {
    const bucket = buckets[Math.min(size - 1, Math.floor((position * size) / view.length))];
    const raw = state.rows[rowIndex]?.[column.index] ?? '';
    if (raw.trim() === '') {
      bucket.empty++;
      empties++;
      return;
    }
    if (excluded.has(raw.trim())) return;
    const value = parse(raw);
    if (value === null) return;
    if (value < low) {
      bucket.below++;
      outliers++;
      outlierRaws.add(raw);
    } else if (value > high) {
      bucket.above++;
      outliers++;
      outlierRaws.add(raw);
    } else {
      bucket.sum += value;
      bucket.seen++;
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    }
    levels.push(Math.min(high, Math.max(low, value)));
    levelRows.push(position);
  });
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }

  const width = 400;
  const height = 134;
  const left = 4;
  const right = width - 4;
  const top = 12;
  const axis = 100;
  const pad = (hi - lo) * 0.08;
  const yOf = (value: number) => axis - ((value - (lo - pad)) / (hi - lo + 2 * pad)) * (axis - top);
  const xOf = (position: number) => left + (position / view.length) * (right - left);
  const show = (value: number) => formatValue(column, value);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'row-strip');
  const line = (x1: number, x2: number, y1: number, y2: number, stroke: string, extra: Record<string, string> = {}) => {
    const element = document.createElementNS(NS, 'line');
    for (const [key, value] of Object.entries({ x1, x2, y1, y2, stroke, ...extra })) element.setAttribute(key, String(value));
    svg.appendChild(element);
  };

  line(left, right, axis, axis, 'currentColor', { opacity: '0.4' });
  const middle = column.median ?? (lo + hi) / 2;
  line(left, right, yOf(middle), yOf(middle), 'currentColor', { opacity: '0.18', 'stroke-dasharray': '2 4' });

  // Un changement de niveau : un trait vertical, et les deux moyennes qu'il sépare.
  const cut = levelShift(levels);
  const shiftAt = cut === null ? null : xOf(levelRows[Math.min(levelRows.length - 1, cut)]);
  if (shiftAt !== null) line(shiftAt, shiftAt, top - 4, axis, 'currentColor', { opacity: '0.5', 'stroke-dasharray': '2 3' });

  const points = buckets.filter((bucket) => bucket.seen > 0).map((bucket) => `${xOf((bucket.from + bucket.to + 1) / 2).toFixed(1)},${yOf(bucket.sum / bucket.seen).toFixed(1)}`);
  if (points.length > 0) {
    const path = document.createElementNS(NS, 'polyline');
    path.setAttribute('points', points.join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colours.accent);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }

  for (const bucket of buckets) {
    const x = xOf((bucket.from + bucket.to + 1) / 2);
    for (const [flag, y] of [[bucket.above, top - 4], [bucket.below, axis - 2]] as const) {
      if (flag === 0) continue;
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', '3.5');
      dot.setAttribute('fill', WARN);
      svg.appendChild(dot);
    }
    if (bucket.empty > 0) {
      const mark = document.createElementNS(NS, 'rect');
      mark.setAttribute('x', String(x - 1.5));
      mark.setAttribute('y', String(axis + 3));
      mark.setAttribute('width', '3');
      mark.setAttribute('height', '9');
      mark.setAttribute('fill', ERROR);
      svg.appendChild(mark);
    }
  }

  // Les bouts de l'axe, et l'endroit du changement de niveau, dans le dessin :
  // on les lit sans quitter la courbe des yeux.
  const label = (text: string, x: number, y: number, anchor: string) => {
    const element = document.createElementNS(NS, 'text');
    element.setAttribute('x', String(x));
    element.setAttribute('y', String(y));
    element.setAttribute('text-anchor', anchor);
    element.setAttribute('font-size', '10');
    element.setAttribute('fill', 'currentColor');
    element.setAttribute('opacity', '0.75');
    element.textContent = text;
    svg.appendChild(element);
  };
  // Les numéros du fichier, ceux de la marge du tableau — pas la position dans les lignes affichées.
  const lineAt = (position: number) => lineOf(view[Math.max(0, Math.min(view.length - 1, position))]);
  label(`line ${count(lineAt(0))}`, left, height - 4, 'start');
  label(`line ${count(lineAt(view.length - 1))}`, right, height - 4, 'end');
  if (shiftAt !== null && cut !== null) {
    const row = count(lineAt(levelRows[Math.min(levelRows.length - 1, cut)]));
    label(`level change · line ${row}`, shiftAt + (shiftAt < width / 2 ? 5 : -5), top + 2, shiftAt < width / 2 ? 'start' : 'end');
  }

  // Une zone sensible par tranche : les lignes couvertes et ce qu'elles contiennent.
  for (const bucket of buckets) {
    const area = document.createElementNS(NS, 'rect');
    area.setAttribute('x', String(xOf(bucket.from)));
    area.setAttribute('y', '0');
    area.setAttribute('width', String(Math.max(1, xOf(bucket.to + 1) - xOf(bucket.from))));
    area.setAttribute('height', String(height));
    area.setAttribute('fill', 'transparent');
    area.addEventListener('mousemove', (event) => {
      const lines = [`<b>Lines ${count(lineAt(bucket.from))} – ${count(lineAt(bucket.to))}</b>`];
      if (bucket.seen > 0) lines.push(`mean ${show(bucket.sum / bucket.seen)}`);
      if (bucket.above + bucket.below > 0) lines.push(`${count(bucket.above + bucket.below)} outlier${bucket.above + bucket.below === 1 ? '' : 's'}`);
      if (bucket.empty > 0) lines.push(`${count(bucket.empty)} empty`);
      showTooltip(event, lines.join('<br>'));
    });
    area.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(area);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'chart';

  const legend = document.createElement('div');
  legend.className = 'chart-scale';
  // Chaque repère se clique : le tableau ne garde que les lignes qu'il désigne.
  const mark = (symbol: string, colour: string, text: string, onPick: () => void) => {
    const item = document.createElement('button');
    item.className = 'legend-link';
    quickTip(item, 'Show these rows in the table');
    const glyph = Object.assign(document.createElement('span'), { textContent: symbol });
    glyph.style.color = colour;
    item.append(glyph, ` ${text}`);
    item.addEventListener('click', onPick);
    legend.appendChild(item);
  };
  const pick = (values: string[], label: string) => () => {
    closePicker();
    setColumnFilter(column.index, { ...valuesFilter(column.index, values), label });
  };
  if (outliers > 0) {
    mark('●', WARN, `${count(outliers)} outlier${outliers === 1 ? '' : 's'}`, pick([...outlierRaws], `${column.name}: outliers`));
  }
  if (empties > 0) {
    mark('▮', ERROR, `${count(empties)} empty cell${empties === 1 ? '' : 's'}`, pick([''], `${column.name} is empty`));
  }
  if (details.placeholders.length > 0) {
    legend.appendChild(
      Object.assign(document.createElement('div'), { textContent: `${details.placeholders.map((entry) => entry.value).join(', ')} left out` }),
    );
  }
  wrapper.appendChild(svg);
  wrapper.appendChild(legend);
  return wrapper;
}
