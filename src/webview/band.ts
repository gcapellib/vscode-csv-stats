import { count, percent } from '../core/format';
import { binBounds, foldRanking, type ColumnStats } from '../core/stats';
import { formatValue } from '../core/values';
import { type Palette } from '../core/themes';
import { closePicker, getOpenPanel, toggleFilter } from './actions';
import { HIST_HEIGHT } from './constants';
import { elements, textSpan } from './dom';
import { icon } from './icons';
import { openDetails } from './panels/column-details';
import { palette, state } from './state';
import { gutterCell, valuesFilter } from './table';
import { hideTooltip, quickTip, showTooltip } from './tooltip';

export function paintBand(): void {
  elements.band.hidden = !state.bandVisible;
  if (!state.bandVisible) return;
  elements.band.textContent = '';
  elements.band.appendChild(gutterCell());
  for (const modelIndex of state.order) {
    elements.band.appendChild(bandCell(modelIndex));
  }
}

export function bandCell(modelIndex: number): HTMLElement {
  const column = state.stats[modelIndex];
  const colours = palette(modelIndex);
  const cell = document.createElement('div');
  cell.dataset.column = String(modelIndex);
  cell.className = 'band-cell';
  cell.style.width = `${state.widths[modelIndex]}px`;
  cell.style.background = colours.band;
  cell.style.color = colours.text;
  cell.style.borderTopColor = colours.accent;

  // Le bandeau sert à comprendre la colonne : son bouton en ouvre la version
  // longue. Agir sur la colonne passe par le balai de l'en-tête.
  const details = document.createElement('button');
  details.className = 'dots';
  details.appendChild(icon('chart'));
  quickTip(details, 'Column details');
  details.addEventListener('click', (event) => {
    event.stopPropagation();
    // Un second clic sur le bouton qui a ouvert le panneau le referme.
    if (getOpenPanel() === `details:${modelIndex}`) {
      closePicker();
      return;
    }
    openDetails(modelIndex, details);
  });
  cell.appendChild(details);

  // L'index de la colonne dans le tableau tel qu'il est, compté depuis 0
  // comme pandas : une colonne retirée renumérote les suivantes, comme
  // df.drop le fait — c'est le nombre qu'attend df.iloc[:, n] sur le df du
  // code Dataset, qui reproduit ces retraits.
  const position = state.order.indexOf(modelIndex);
  const kind = line('type', `${column.type} \u00b7 #${position}`);
  quickTip(kind, `Column ${position} of the table as it stands, counted from 0 as pandas does: df.iloc[:, ${position}]`);
  cell.appendChild(kind);
  const missing = line('stat', `Missing ${count(column.missing)} (${percent(column.missingShare)})`);
  // Un vide n'est pas une valeur du type de la colonne, c'est un état de la
  // cellule : il se filtre partout de la même façon, numérique compris — ce
  // que seule la liste des valeurs du texte permettait jusqu'ici.
  if (column.missing > 0) {
    missing.classList.add('pickable');
    quickTip(missing, 'Keep only the rows where this column is empty');
    missing.addEventListener('click', () => toggleFilter(valuesFilter(modelIndex, [''])));
  } else {
    // Rien à filtrer : grisé, pour qu'on voie d'un coup d'œil où sont les
    // vides. Identique à un « Missing » cliquable, il trompait — on cliquait
    // « Missing 0 » sans que rien ne se passe.
    missing.classList.add('none');
    quickTip(missing, 'No empty cells');
  }
  cell.appendChild(missing);
  // La part des distinctes se rapporte aux valeurs renseignées, pas au total
  // comme « Missing » juste au-dessus — la convention de pandas (nunique /
  // count) et de ydata-profiling. Une latitude vide à 49 % et distincte à
  // 99,7 % paraissait contradictoire : la base est désormais écrite.
  // Cliquer « Distinct » garde une ligne par valeur distincte — le tableau
  // compte alors autant de lignes que le chiffre affiché. Même geste que
  // « Missing » : la ligne de statistique est aussi son filtre.
  const distinct = line('stat', distinctText(column));
  if (column.distinct > 0) {
    distinct.classList.add('pickable');
    quickTip(distinct, 'Keep one row per distinct value (the first one)');
    distinct.addEventListener('click', () =>
      toggleFilter({ kind: 'distinct', column: modelIndex, label: `${column.name}: one row per value` }),
    );
  }
  cell.appendChild(distinct);
  // Les valeurs vues une seule fois — l'« unique » de Power Query. Dans une
  // nomenclature, ce sont souvent des fautes de frappe que le palmarès range
  // sous « Other » ; le clic les montre. Égal à Distinct, il dit ce que disait
  // l'ancienne note « every value occurs once ».
  const unique = line('stat', uniqueText(column));
  if (column.unique > 0) {
    unique.classList.add('pickable');
    quickTip(unique, 'Keep only the rows whose value occurs once in this column');
    unique.addEventListener('click', () =>
      toggleFilter({ kind: 'unique', column: modelIndex, label: `${column.name}: values seen once` }),
    );
  } else {
    unique.classList.add('none');
    quickTip(unique, 'Every value occurs more than once');
  }
  cell.appendChild(unique);

  // Le corps du bandeau — histogramme ou palmarès — est un bloc à part, pour
  // qu'un seul écart le sépare du décompte au-dessus, quel que soit son contenu.
  const body = document.createElement('div');
  body.className = column.histogram.length > 0 ? 'band-body stretch' : 'band-body';
  if (column.histogram.length > 0) {
    body.appendChild(histogram(column, colours, state.widths[modelIndex]));
    const bounds = document.createElement('div');
    bounds.className = 'bounds';
    const min = document.createElement('span');
    min.textContent = `Min ${formatValue(column, column.min ?? 0)}`;
    const max = document.createElement('span');
    max.textContent = `Max ${formatValue(column, column.max ?? 0)}`;
    bounds.append(min, max);
    body.appendChild(bounds);
    if (column.mean !== null) {
      const central = document.createElement('div');
      central.className = 'bounds';
      central.append(
        textSpan(`Mean ${formatValue(column, column.mean)}`),
        textSpan(`Median ${formatValue(column, column.median ?? 0)}`),
      );
      body.appendChild(central);
    }
  } else {
    // La règle des sept lignes vit dans core/stats.ts, testée là-bas : ici on ne
    // fait plus qu'en dessiner le résultat.
    // Parts rapportées au total des lignes, vides compris : ils figurent dans
    // le classement sous « (blank) », à leur rang.
    const { shown, otherCount, otherShare } = foldRanking(column.top, column.otherCount, column.total);

    for (const share of shown) {
      body.appendChild(
        valueLine(share.value === '' ? '(blank)' : share.value, share.share, colours.text, colours.accent, false, () =>
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

/** « Distinct 1,547 (99.7% of filled) » : la base de la part est dite. */
export function distinctText(column: ColumnStats): string {
  return `Distinct ${count(column.distinct)} (${percent(column.distinctShare)} of filled)`;
}

/** « Unique 166 (27.3% of filled) » : même base que Distinct, une ligne par valeur unique. */
export function uniqueText(column: ColumnStats): string {
  const share = column.present === 0 ? 0 : column.unique / column.present;
  return `Unique ${count(column.unique)} (${percent(share)} of filled)`;
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
    const [low, high] = binBounds(column, index);
    const range =
      span <= 0 ? formatValue(column, column.min ?? 0) : `${formatValue(column, low)} – ${formatValue(column, high)}`;
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
        temporal: column.temporal ?? undefined,
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
    `${distinctText(column)}<br>` +
    uniqueText(column)
  );
}

export function escape(text: string): string {
  return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
}
