import { count, num, percent } from '../core/format';
import { foldRanking, type ColumnStats } from '../core/stats';
import { type Palette } from '../core/themes';
import { toggleFilter } from './actions';
import { HIST_HEIGHT } from './constants';
import { elements, textSpan } from './dom';
import { openMenu } from './menu';
import { palette, state } from './state';
import { valuesFilter } from './table';
import { hideTooltip, showTooltip } from './tooltip';

export function paintBand(): void {
  elements.band.hidden = !state.bandVisible;
  if (!state.bandVisible) return;
  elements.band.textContent = '';
  for (const modelIndex of state.order) {
    elements.band.appendChild(bandCell(modelIndex));
  }
}

export function bandCell(modelIndex: number): HTMLElement {
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

export function line(className: string, text: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

export function valueLine(
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
export function histogram(column: ColumnStats, colours: Palette, width: number): SVGSVGElement {
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

export function summaryOf(column: ColumnStats): string {
  return (
    `<b>${escape(column.name)}</b><br>${column.type}<br>` +
    `Missing ${count(column.missing)} (${percent(column.missingShare)})<br>` +
    `Distinct ${count(column.distinct)} (${percent(column.distinctShare)})`
  );
}

export function escape(text: string): string {
  return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
}
