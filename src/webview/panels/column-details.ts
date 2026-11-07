import { computeDetails, type ColumnDetails } from '../../core/details';
import { count, num, percent } from '../../core/format';
import { type ColumnStats } from '../../core/stats';
import { type Palette } from '../../core/themes';
import { formatValue } from '../../core/values';
import { closePicker, setOpenPanel } from '../actions';
import { floating, positionFloating } from '../floating-setup';
import { palette, state } from '../state';
import { currentTable, parserOf } from '../table';
import { addRow, footer, grid, panelTitle, sectionTitle, tintPanel } from './shared';
import { elements, textSpan } from '../dom';
import { valueCounts } from '../table';
import { hideTooltip, showTooltip } from '../tooltip';
import { addStep } from '../cleaning';
import { actionBar, detailsExtras } from './details-extras';

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
  const details = computeDetails(table, columnIndex, column.type, column.temporal);

  elements.picker.textContent = '';
  elements.picker.classList.add('wide');
  tintPanel(columnIndex);
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
  // Le constat mène à l'étape : les jetons d'absence se traitent comme vides,
  // d'un clic, sans retaper ce que le panneau vient d'énumérer.
  const reopen = () => openDetails(columnIndex, anchor);
  if (details.nullTokens.length > 0) {
    const tokens = details.nullTokens.map((token) => token.value);
    elements.picker.appendChild(
      actionBar([
        [
          `Treat ${tokens.join(', ')} as empty`,
          () => {
            addStep({ kind: 'empty', column: columnIndex, tokens });
            reopen();
          },
        ],
      ]),
    );
  }

  elements.picker.appendChild(sectionTitle('Distribution'));
  elements.picker.appendChild(distributionChart(column, details, palette(columnIndex)));

  for (const part of detailsExtras(column, details, reopen)) elements.picker.appendChild(part);

  if (column.mean !== null) {
    elements.picker.appendChild(sectionTitle('Statistics'));
    const numbers = grid();
    const show = (value: number) => formatValue(column, value);
    addRow(numbers, 'Min', show(column.min ?? 0));
    addRow(numbers, 'Max', show(column.max ?? 0));
    addRow(numbers, 'Mean', show(column.mean));
    addRow(numbers, 'Median', show(column.median ?? 0));
    addRow(numbers, 'Q1', show(column.q1 ?? 0));
    addRow(numbers, 'Q3', show(column.q3 ?? 0));
    // Un écart-type de dates en millisecondes ne dit rien à personne : la
    // dispersion d'une frise se lit sur Q1 et Q3.
    if (!column.temporal) addRow(numbers, 'Std deviation', num(column.deviation ?? 0));
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
    const fixes: Array<[string, () => void]> = [];
    if (details.spacePadded > 0) {
      fixes.push([
        `Trim ${count(details.spacePadded)} padded values`,
        () => {
          addStep({ kind: 'trim', column: columnIndex });
          reopen();
        },
      ]);
    }
    if (details.caseVariants > 0) {
      fixes.push([
        'Capitalize Each Word',
        () => {
          addStep({ kind: 'case', column: columnIndex, mode: 'title' });
          reopen();
        },
      ]);
    }
    if (fixes.length > 0) elements.picker.appendChild(actionBar(fixes));
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
  // La liste compte les vides sous « (blank) » : ses parts se rapportent donc
  // au total des lignes. Rapportées aux seules valeurs renseignées, elles
  // donnaient « (blank) 149 % ».
  const ranked = rankedValues(column.index);
  return barChart(ranked, column.total, colours, 'Most frequent values');
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
const NS = 'http://www.w3.org/2000/svg';

function svgText(
  content: string,
  x: number,
  y: number,
  options: { anchor?: 'start' | 'middle' | 'end'; size?: number; opacity?: number; weight?: number } = {},
): SVGTextElement {
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('text-anchor', options.anchor ?? 'middle');
  text.setAttribute('font-size', String(options.size ?? 10));
  text.setAttribute('fill', 'currentColor');
  text.setAttribute('opacity', String(options.opacity ?? 0.85));
  if (options.weight) text.setAttribute('font-weight', String(options.weight));
  text.textContent = content;
  return text;
}

/**
 * Une échelle ronde pour l'axe des effectifs : un maximum et des graduations
 * (0, 10, 20…) qui se lisent sans calcul, au lieu du pic exact de la plus haute
 * barre.
 */
function niceScale(peak: number): { max: number; ticks: number[] } {
  const raw = Math.max(peak, 1) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? magnitude * 10);
  const max = Math.ceil(peak / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max; value += step) ticks.push(value);
  return { max, ticks };
}

/**
 * Histogramme en grand : tout se lit d'un coup d'œil.
 *
 * - **À gauche**, une échelle des effectifs, avec des repères discrets : l'ordre
 *   de grandeur des barres se voit sans nombre posé dessus. L'effectif exact, la
 *   tranche et sa part sont dans l'infobulle de chaque barre.
 * - **En haut**, Q1, la médiane et Q3 avec leur valeur, centrés sur leur trait ;
 *   un nom qui toucherait son voisin descend d'une ligne.
 * - **Les outliers ont leur barre hachurée à chaque bout.** Sous elle, le minimum
 *   (ou le maximum) ; au pied de la plage normale, la borne où ils commencent,
 *   reliée à l'axe par un trait.
 *
 * Une boîte à moustaches redessinait des chiffres déjà écrits, et demandait
 * qu'on sache la lire : la forme se lit sans formation, et les quartiles s'y
 * ajoutent au lieu de s'y substituer.
 */
export function markedHistogram(column: ColumnStats, colours: Palette): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart';
  const width = 340;
  const top = 36;
  const bottom = 158;
  const height = 192;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'big-hist');
  const show = (value: number) => formatValue(column, value);

  const lowOutliers = (column.histLow ?? column.min ?? 0) > (column.min ?? 0);
  const highOutliers = (column.histHigh ?? column.max ?? 0) < (column.max ?? 0);
  const fenceLow = column.histLow ?? column.min ?? 0;
  const fenceHigh = column.histHigh ?? column.max ?? 0;

  // Les outliers ont leur propre barre à chaque bout : les barres du milieu ne
  // couvrent que la plage normale. Le calcul des statistiques les range dans les
  // barres des bords ; on les en retire ici pour les montrer à part.
  const parse = parserOf(column.index);
  let lowCount = 0;
  let highCount = 0;
  if (lowOutliers || highOutliers) {
    for (const [raw, occurrences] of valueCounts(column.index)) {
      const value = parse(raw);
      if (value === null) continue;
      if (lowOutliers && value < fenceLow) lowCount += occurrences;
      else if (highOutliers && value > fenceHigh) highCount += occurrences;
    }
  }
  const bins = [...column.histogram];
  if (lowOutliers) bins[0] -= lowCount;
  if (highOutliers) bins[bins.length - 1] -= highCount;
  const scale = niceScale(Math.max(...bins, lowCount, highCount, 1));

  const axisWidth = 28;
  const plotLeft = 6 + axisWidth;
  const plotRight = width - 6;
  const zone = 34;
  const x0 = plotLeft + (lowOutliers ? zone : 0);
  const x1 = plotRight - (highOutliers ? zone : 0);
  const barLeft = (index: number) => x0 + ((x1 - x0) * index) / bins.length;
  const room = bottom - top - 14;
  const heightOf = (value: number) => (value === 0 ? 0 : Math.max(1, (room * value) / scale.max));
  const share = (value: number) => percent(column.present === 0 ? 0 : value / column.present);
  const plural = (value: number) => `${count(value)} value${value === 1 ? '' : 's'}`;

  // La hachure des barres d'outliers.
  const defs = document.createElementNS(NS, 'defs');
  const pattern = document.createElementNS(NS, 'pattern');
  pattern.setAttribute('id', 'outlier-hatch');
  pattern.setAttribute('width', '5');
  pattern.setAttribute('height', '5');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  const stripe = document.createElementNS(NS, 'line');
  stripe.setAttribute('x1', '0');
  stripe.setAttribute('x2', '0');
  stripe.setAttribute('y1', '0');
  stripe.setAttribute('y2', '5');
  stripe.setAttribute('stroke', '#000');
  stripe.setAttribute('stroke-opacity', '0.4');
  stripe.setAttribute('stroke-width', '2');
  pattern.appendChild(stripe);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // L'échelle des effectifs : un repère discret par graduation.
  for (const tick of scale.ticks) {
    const y = bottom - (room * tick) / scale.max;
    const guide = document.createElementNS(NS, 'line');
    guide.setAttribute('x1', String(plotLeft));
    guide.setAttribute('x2', String(plotRight));
    guide.setAttribute('y1', String(y));
    guide.setAttribute('y2', String(y));
    guide.setAttribute('stroke', 'currentColor');
    guide.setAttribute('opacity', tick === 0 ? '0.45' : '0.14');
    svg.appendChild(guide);
    svg.appendChild(svgText(count(tick), plotLeft - 5, y + 3, { anchor: 'end', size: 9, opacity: 0.7 }));
  }

  // Une zone sensible par barre, pour l'infobulle : la tranche, l'effectif, la part.
  const hit = (left: number, right: number, html: string) => {
    const area = document.createElementNS(NS, 'rect');
    area.setAttribute('x', String(left));
    area.setAttribute('y', String(top));
    area.setAttribute('width', String(Math.max(1, right - left)));
    area.setAttribute('height', String(bottom - top));
    area.setAttribute('fill', 'transparent');
    area.addEventListener('mousemove', (event) => showTooltip(event, html));
    area.addEventListener('mouseleave', hideTooltip);
    return area;
  };
  const hits: SVGElement[] = [];

  const step = (fenceHigh - fenceLow) / bins.length;
  for (let index = 0; index < bins.length; index++) {
    const left = barLeft(index);
    const right = barLeft(index + 1);
    const barHeight = heightOf(bins[index]);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(left));
    rect.setAttribute('y', String(bottom - barHeight));
    rect.setAttribute('width', String(Math.max(1, right - left - 1)));
    rect.setAttribute('height', String(barHeight));
    rect.setAttribute('fill', colours.accent);
    svg.appendChild(rect);
    const range = step <= 0 ? show(fenceLow) : `${show(fenceLow + step * index)} – ${show(fenceLow + step * (index + 1))}`;
    hits.push(hit(left, right, `<b>${range}</b><br>${plural(bins[index])} (${share(bins[index])})`));
  }

  // Les barres des outliers, hachurées.
  const outlierBar = (left: number, value: number, label: string) => {
    const barHeight = heightOf(value);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(left));
    rect.setAttribute('y', String(bottom - barHeight));
    rect.setAttribute('width', String(zone - 8));
    rect.setAttribute('height', String(barHeight));
    rect.setAttribute('fill', colours.accent);
    svg.appendChild(rect);
    const hatch = rect.cloneNode() as SVGRectElement;
    hatch.setAttribute('fill', 'url(#outlier-hatch)');
    svg.appendChild(hatch);
    hits.push(hit(left - 2, left + zone - 6, `<b>${label}</b><br>${plural(value)} (${share(value)})`));
  };
  const axis = bottom + 14;
  const tickLabel = (x: number, value: string, caption: string, anchor: 'start' | 'middle' | 'end') => {
    svg.appendChild(svgText(value, x, axis, { anchor, size: 10, opacity: 0.95 }));
    svg.appendChild(svgText(caption, x, axis + 11, { anchor, size: 9, opacity: 0.6 }));
  };
  const joint = (x: number) => {
    const tick = document.createElementNS(NS, 'line');
    tick.setAttribute('x1', String(x));
    tick.setAttribute('x2', String(x));
    tick.setAttribute('y1', String(bottom));
    tick.setAttribute('y2', String(bottom + 6));
    tick.setAttribute('stroke', 'currentColor');
    tick.setAttribute('opacity', '0.7');
    svg.appendChild(tick);
  };
  if (lowOutliers) {
    outlierBar(plotLeft + 2, lowCount, `Outliers below ${show(fenceLow)}`);
    tickLabel(plotLeft + 2 + (zone - 8) / 2, show(column.min ?? 0), 'min', 'middle');
    joint(x0);
    svg.appendChild(svgText(show(fenceLow), x0 + 3, axis, { anchor: 'start', size: 10, opacity: 0.95 }));
  } else {
    tickLabel(plotLeft, show(column.min ?? 0), 'min', 'start');
  }
  if (highOutliers) {
    outlierBar(x1 + 6, highCount, `Outliers above ${show(fenceHigh)}`);
    tickLabel(x1 + 6 + (zone - 8) / 2, show(column.max ?? 0), 'max', 'middle');
    joint(x1);
    svg.appendChild(svgText(show(fenceHigh), x1 - 3, axis, { anchor: 'end', size: 10, opacity: 0.95 }));
  } else {
    tickLabel(plotRight, show(column.max ?? 0), 'max', 'end');
  }

  // Les traits, et leurs valeurs en haut, alignés dessus.
  const span = fenceHigh - fenceLow || 1;
  const xOf = (value: number) => x0 + Math.max(0, Math.min(1, (value - fenceLow) / span)) * (x1 - x0);
  const background = 'fill: var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526))';
  const ends: number[] = [];
  const labelled: Array<[string, number]> = [
    ['Q1', column.q1 ?? 0],
    ['Median', column.median ?? 0],
    ['Q3', column.q3 ?? 0],
  ];
  const labels: SVGElement[] = [];
  for (const [name, value] of labelled) {
    const x = xOf(value);
    const text = `${name} ${show(value)}`;
    const textWidth = text.length * 5.8 + 6;
    const left = Math.min(width - textWidth - 2, Math.max(2, x - textWidth / 2));
    let row = ends.findIndex((end) => end + 4 <= left);
    if (row === -1) row = Math.min(ends.length, 1);
    ends[row] = left + textWidth;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(10 + row * 13));
    line.setAttribute('y2', String(bottom));
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', name === 'Median' ? '2' : '1');
    line.setAttribute('stroke-dasharray', name === 'Median' ? '' : '3 3');
    line.setAttribute('opacity', '0.75');
    svg.appendChild(line);
    // Un fond sous le nom, pour qu'un trait voisin ne le traverse pas.
    const plate = document.createElementNS(NS, 'rect');
    plate.setAttribute('x', String(left));
    plate.setAttribute('y', String(row * 13));
    plate.setAttribute('width', String(textWidth));
    plate.setAttribute('height', '13');
    plate.setAttribute('rx', '3');
    plate.setAttribute('style', background);
    labels.push(plate, svgText(text, left + textWidth / 2, 10 + row * 13, { size: 10, opacity: 1, weight: name === 'Median' ? 600 : 400 }));
  }
  for (const label of labels) svg.appendChild(label);
  // Les zones sensibles en dernier : elles reçoivent le survol par-dessus les traits.
  for (const area of hits) svg.appendChild(area);

  wrapper.appendChild(svg);
  if (lowOutliers || highOutliers) {
    wrapper.appendChild(
      Object.assign(
        textSpan(
          `Hatched bars: outliers${lowOutliers ? ` below ${show(fenceLow)}` : ''}${lowOutliers && highOutliers ? ' and' : ''}${highOutliers ? ` above ${show(fenceHigh)}` : ''}.`,
        ),
        { className: 'chart-scale' },
      ),
    );
  }
  return wrapper;
}
