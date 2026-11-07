/**
 * Ce que Column details ajoute au diagnostic : des constats qu'on peut aller
 * voir, et l'étape qui les corrige à côté.
 *
 * Un constat sans geste ne fait qu'inquiéter (voir Dataset) : chaque ligne
 * ici filtre le tableau sur les cellules en cause, et porte, quand il existe,
 * le bouton de l'étape de nettoyage qui y répond — le diagnostic mène à l'action.
 */
import { type ColumnDetails } from '../../core/details';
import { type Filter } from '../../core/filters';
import { count, percent } from '../../core/format';
import { type ColumnStats } from '../../core/stats';
import { type Step } from '../../core/steps';
import { parseTemporal } from '../../core/temporal';
import { formatValue } from '../../core/values';
import { closePicker } from '../actions';
import { addStep, changeType } from '../cleaning';
import { textSpan } from '../dom';
import { palette, state } from '../state';
import { setColumnFilter, valuesFilter } from '../table';
import { finding } from './dataset';
import { barChart } from './column-details';
import { sectionTitle } from './shared';

type Action = [string, () => void];

/** Un constat cliquable, suivi des boutons d'étapes qui le corrigent. */
export function findingRow(text: string, filter: Filter | null, column: number, actions: Action[] = []): HTMLElement {
  const row = document.createElement('div');
  row.className = 'finding-row';
  const flag = finding(
    text,
    () => {
      if (!filter) return;
      closePicker();
      setColumnFilter(column, filter);
    },
    column,
  );
  if (!filter) flag.classList.remove('pickable');
  row.appendChild(flag);
  for (const [label, action] of actions) {
    const button = document.createElement('button');
    button.className = 'picker-button finding-action';
    button.textContent = label;
    button.addEventListener('click', action);
    row.appendChild(button);
  }
  return row;
}

const KIND_LABEL = { number: 'a number', date: 'a date', time: 'a time' } as const;
const KIND_TYPE = { number: 'numeric', date: 'date', time: 'time' } as const;

/**
 * Les sections ajoutées au panneau, dans l'ordre du diagnostic : ce qui
 * empêche la colonne d'avoir son type, ses outliers, ses formats, puis, pour une
 * date, sa répartition dans le temps. `reopen` rouvre le panneau après une étape,
 * pour qu'on en voie l'effet.
 */
export function detailsExtras(column: ColumnStats, details: ColumnDetails, reopen: () => void): HTMLElement[] {
  const index = column.index;
  const name = column.name;
  const parts: HTMLElement[] = [];
  const step = (make: Step) => () => {
    addStep(make);
    reopen();
  };

  // 1. Ce qui ne se lit pas dans le type — ou dans celui que la colonne aurait presque.
  if (details.offenderKind && details.offenders.length > 0) {
    const kind = details.offenderKind;
    const total = details.offenders.reduce((sum, entry) => sum + entry.count, 0);
    parts.push(sectionTitle(`Not ${KIND_LABEL[kind]} · ${count(total)}`));
    for (const entry of details.offenders.slice(0, 6)) {
      parts.push(findingRow(`${entry.value.trim()} ×${count(entry.count)}`, valuesFilter(index, [entry.value]), index));
    }
    if (details.offenders.length > 6) {
      parts.push(Object.assign(textSpan(`and ${count(details.offenders.length - 6)} more`), { className: 'picker-note' }));
    }
    const actions: Action[] = [];
    if (details.offenders.length <= 10) {
      actions.push([
        'Treat these as empty',
        step({ kind: 'empty', column: index, tokens: details.offenders.map((entry) => entry.value.trim()) }),
      ]);
    }
    if (column.type !== KIND_TYPE[kind]) {
      actions.push([
        `Change type to ${kind} (${count(total)} emptied)`,
        () => {
          changeType(index, KIND_TYPE[kind]);
          reopen();
        },
      ]);
    }
    if (actions.length > 0) parts.push(actionBar(actions));
  }

  // 2. Les outliers, au-delà de 1,5 écart interquartile : un clic les montre.
  if (column.outliers > 0 && column.q1 !== null && column.q3 !== null) {
    const spread = column.q3 - column.q1;
    const low = column.q1 - 1.5 * spread;
    const high = column.q3 + 1.5 * spread;
    const show = (value: number) => formatValue(column, value);
    const label = `${name}: outliers (< ${show(low)} or > ${show(high)})`;
    parts.push(sectionTitle('Outliers'));
    parts.push(
      findingRow(
        `${count(column.outliers)} values below ${show(low)} or above ${show(high)}`,
        { kind: 'outside', column: index, low, high, temporal: column.temporal ?? undefined, label },
        index,
      ),
    );
  }

  // 3. Les formes des valeurs : deux formes dans une colonne de codes ou de dates
  // trahissent une saisie incohérente.
  // Pas pour des nombres : « 9.9 » contre « 99.9 », c'est un ordre de grandeur,
  // pas une saisie incohérente.
  if (details.patterns.length > 1 && column.type !== 'numeric') {
    parts.push(sectionTitle('Formats'));
    for (const entry of details.patterns.slice(0, 6)) {
      const filter: Filter = { kind: 'values', column: index, values: entry.values, label: `${name} looks like ${entry.pattern}` };
      parts.push(
        findingRow(`${entry.pattern}  ·  ${count(entry.count)} (${percent(column.present === 0 ? 0 : entry.count / column.present)})`, filter, index),
      );
    }
  }

  // 4. Une date se lit aussi par année, mois, jour de la semaine et heure.
  if (column.temporal) parts.push(...timeBreakdown(column));
  return parts;
}

/** Les boutons d'étapes, sous les constats qu'ils corrigent. */
export function actionBar(actions: Action[]): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'clean-catalogue';
  for (const [label, action] of actions) {
    const button = document.createElement('button');
    button.className = 'picker-button';
    button.textContent = label;
    button.addEventListener('click', action);
    bar.appendChild(button);
  }
  return bar;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * La répartition d'une colonne de dates par année, mois, jour de la semaine et
 * heure — les distributions de Power Query. Une heure seule ne se répartit que
 * par heure. Calculée sur les lignes affichées, comme le reste du panneau.
 */
function timeBreakdown(column: ColumnStats): HTMLElement[] {
  const temporal = column.temporal;
  if (!temporal) return [];
  const years = new Map<number, number>();
  const months = new Array<number>(12).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const hours = new Array<number>(24).fill(0);
  let seen = 0;
  for (const rowIndex of state.view) {
    const raw = state.rows[rowIndex]?.[column.index] ?? '';
    const ms = parseTemporal(raw, temporal.order);
    if (ms === null) continue;
    seen++;
    const date = new Date(ms);
    hours[date.getUTCHours()]++;
    if (temporal.order === 'time') continue;
    years.set(date.getUTCFullYear(), (years.get(date.getUTCFullYear()) ?? 0) + 1);
    months[date.getUTCMonth()]++;
    weekdays[(date.getUTCDay() + 6) % 7]++;
  }
  if (seen === 0) return [];
  const colours = palette(column.index);
  const parts: HTMLElement[] = [sectionTitle('Over time')];
  if (temporal.order !== 'time') {
    if (years.size > 1) {
      const ordered = [...years.entries()].sort((left, right) => left[0] - right[0]);
      parts.push(barChart(ordered.map(([year, occurrences]) => ({ label: String(year), count: occurrences })), seen, colours, 'By year'));
    }
    parts.push(barChart(months.map((occurrences, month) => ({ label: MONTHS[month], count: occurrences })), seen, colours, 'By month'));
    parts.push(barChart(weekdays.map((occurrences, day) => ({ label: WEEKDAYS[day], count: occurrences })), seen, colours, 'By day of the week'));
  }
  if (temporal.withTime) {
    const used = hours.map((occurrences, hour) => ({ label: `${String(hour).padStart(2, '0')}h`, count: occurrences })).filter((entry) => entry.count > 0);
    parts.push(barChart(used, seen, colours, 'By hour'));
  }
  return parts;
}
