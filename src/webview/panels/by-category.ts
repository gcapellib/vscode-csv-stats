/**
 * La mesure moyenne de chaque catégorie : « le poids d'un œuf selon la couleur ».
 *
 * C'est la question qu'on se pose juste après la distribution d'une mesure, et
 * le tableau croisé d'Excel y répond. La colonne de texte proposée par défaut
 * est celle qui explique le plus la mesure ; le menu en propose d'autres. Un
 * clic sur une barre filtre le tableau sur la catégorie.
 */
import { groupMeans, type Grouping } from '../../core/insights';
import { count, percent } from '../../core/format';
import { type ColumnDetails } from '../../core/details';
import { type ColumnStats } from '../../core/stats';
import { type Palette } from '../../core/themes';
import { formatValue } from '../../core/values';
import { closePicker } from '../actions';
import { textSpan } from '../dom';
import { state } from '../state';
import { parserOf, setColumnFilter, valuesFilter } from '../table';
import { sectionTitle } from './shared';

/** La catégorie choisie pour chaque mesure, gardée d'une ouverture à l'autre. */
const chosen = new Map<number, number>();

/** Une catégorie a de quoi être comparée à partir de 2 valeurs, et jusqu'à 30. */
const MAX_CATEGORIES = 30;

interface Candidate {
  index: number;
  name: string;
  grouping: Grouping;
}

function candidatesFor(column: ColumnStats, details: ColumnDetails): Candidate[] {
  const parse = parserOf(column.index);
  const excluded = new Set(details.placeholders.flatMap((entry) => entry.tokens));
  const found: Candidate[] = [];
  for (const other of state.stats) {
    if (!other || other.index === column.index || other.type !== 'text') continue;
    if (!state.order.includes(other.index) || other.distinct < 2 || other.distinct > MAX_CATEGORIES) continue;
    const pairs: Array<[string, number]> = [];
    for (const rowIndex of state.view) {
      const row = state.rows[rowIndex];
      if (!row) continue;
      const raw = row[column.index] ?? '';
      if (raw.trim() === '' || excluded.has(raw.trim())) continue;
      const value = parse(raw);
      if (value !== null) pairs.push([row[other.index] ?? '', value]);
    }
    const grouping = groupMeans(pairs);
    if (grouping) found.push({ index: other.index, name: other.name, grouping });
  }
  return found.sort((left, right) => right.grouping.explained - left.grouping.explained);
}

export function byCategory(column: ColumnStats, details: ColumnDetails, colours: Palette, rerender: () => void): HTMLElement[] {
  // Un identifiant (presque tout distinct) n'est pas une mesure : le comparer par groupe n'apprend rien.
  if (column.type !== 'numeric' || column.temporal || column.present < 30 || column.distinct >= column.present * 0.9) return [];
  const candidates = candidatesFor(column, details);
  if (candidates.length === 0) return [];
  const current = candidates.find((candidate) => candidate.index === chosen.get(column.index)) ?? candidates[0];

  const parts: HTMLElement[] = [sectionTitle('By category')];
  const choice = document.createElement('label');
  choice.className = 'category-choice';
  choice.append('Average by ');
  const select = document.createElement('select');
  select.className = 'category-select';
  for (const candidate of candidates) {
    const option = document.createElement('option');
    option.value = String(candidate.index);
    option.textContent = `${candidate.name} · ${percent(candidate.grouping.explained)}`;
    option.selected = candidate === current;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    chosen.set(column.index, Number(select.value));
    rerender();
  });
  choice.appendChild(select);
  parts.push(choice);

  const { groups, explained, hidden } = current.grouping;
  parts.push(
    Object.assign(
      textSpan(
        explained < 0.05
          ? `${current.name} makes little difference: the groups look alike.`
          : `${current.name} explains ${percent(explained)} of the variation.`,
      ),
      { className: 'picker-note' },
    ),
  );

  const floor = Math.min(0, ...groups.map((group) => group.mean));
  const top = Math.max(...groups.map((group) => group.mean));
  const list = document.createElement('div');
  list.className = 'chart list';
  for (const group of groups) {
    const row = document.createElement('div');
    row.className = 'bar-row pickable-row';
    row.title = 'Show these rows in the table';
    const label = textSpan(group.key === '' ? '(blank)' : group.key);
    label.className = 'bar-label';
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${top === floor ? 100 : ((group.mean - floor) / (top - floor)) * 100}%`;
    fill.style.background = colours.accent;
    track.appendChild(fill);
    const tally = textSpan(`${formatValue(column, group.mean)} · ${count(group.count)}`);
    tally.className = 'bar-count';
    row.append(label, track, tally);
    row.addEventListener('click', () => {
      closePicker();
      setColumnFilter(current.index, valuesFilter(current.index, [group.key]));
    });
    list.appendChild(row);
  }
  parts.push(list);
  if (hidden > 0) parts.push(Object.assign(textSpan(`and ${count(hidden)} smaller group${hidden === 1 ? '' : 's'}`), { className: 'picker-note' }));
  return parts;
}
