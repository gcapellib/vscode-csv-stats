/**
 * Statistiques par colonne.
 *
 * Le parcours est colonne par colonne — et non ligne par ligne — pour que la
 * table de fréquences soit libérée avant de passer à la colonne suivante : une
 * seule table vit à la fois, quel que soit le nombre de colonnes. Tout ce qui
 * suit se calcule ensuite sur les seules valeurs distinctes, pondérées par leur
 * effectif.
 */
import type { CsvTable } from './csv';
import { decideType, parseNumber, MIN_ROWS_FOR_DISTINCT_NOTE, type ColumnType } from './types';

export { parseNumber, type ColumnType } from './types';

/** Une valeur et sa part dans les valeurs renseignées de la colonne. */
export interface ValueShare {
  value: string;
  count: number;
  share: number;
}

export interface ColumnStats {
  /** Modifiable : « Rename column » ne touche pas au fichier, seulement à l'affichage. */
  name: string;
  index: number;
  type: ColumnType;
  /** Nombre de lignes de la table. */
  total: number;
  missing: number;
  /** Valeurs distinctes parmi les valeurs renseignées. */
  distinct: number;
  present: number;
  missingShare: number;
  distinctShare: number;
  min: number | null;
  max: number | null;
  /** Vrai quand chaque valeur renseignée n'apparaît qu'une fois. */
  allDistinct: boolean;
  /** Statistiques descriptives ; nulles hors colonne numérique. */
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  deviation: number | null;
  /** Valeurs hors de [Q1 − 1,5 IQR ; Q3 + 1,5 IQR]. */
  outliers: number;
  /** 20 classes entre min et max ; vide pour une colonne texte. */
  histogram: number[];
  /** Valeurs les plus fréquentes ; vide pour une colonne mesurable. */
  top: ValueShare[];
  /** Ce que le palmarès laisse de côté, pour que les parts totalisent 100 %. */
  otherCount: number;
  otherShare: number;
}

export const HISTOGRAM_BINS = 20;
const TOP_VALUES = 3;

export function isMissing(raw: string): boolean {
  return raw.trim() === '';
}

export function compute(table: CsvTable, columnIndex: number, forced?: ColumnType): ColumnStats {
  const decimalComma = table.delimiter === ';';
  const counts = new Map<string, number>();
  let missing = 0;

  for (const row of table.rows) {
    const raw = row[columnIndex];
    if (isMissing(raw)) {
      missing++;
      continue;
    }
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  const total = table.rows.length;
  const present = total - missing;
  const keys = [...counts.keys()];
  const name = table.headers[columnIndex] ?? `column ${columnIndex + 1}`;
  const type = forced ?? decideType(keys, present, decimalComma);

  const stats: ColumnStats = {
    name,
    index: columnIndex,
    type,
    total,
    missing,
    distinct: counts.size,
    present,
    missingShare: total === 0 ? 0 : missing / total,
    distinctShare: present === 0 ? 0 : counts.size / present,
    allDistinct: counts.size === present && present >= MIN_ROWS_FOR_DISTINCT_NOTE,
    min: null,
    max: null,
    mean: null,
    median: null,
    q1: null,
    q3: null,
    deviation: null,
    outliers: 0,
    histogram: [],
    top: [],
    otherCount: 0,
    otherShare: 0,
  };

  if (type === 'numeric') {
    fillDistribution(stats, counts, decimalComma);
    // Un type forcé peut ne rien donner de mesurable : mieux vaut un palmarès
    // qu'un histogramme vide.
    if (stats.min !== null) return stats;
    stats.histogram = [];
  }

  fillTopValues(stats, counts);
  return stats;
}

function fillDistribution(stats: ColumnStats, counts: Map<string, number>, decimalComma: boolean): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = 0;
  for (const raw of counts.keys()) {
    const value = parseNumber(raw, decimalComma);
    if (value === null) continue;
    seen++;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (seen === 0) return;

  stats.min = min;
  stats.max = max;
  const span = max - min;
  const histogram = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const [raw, occurrences] of counts) {
    const value = parseNumber(raw, decimalComma);
    if (value === null) continue;
    const bin =
      span <= 0 ? 0 : Math.min(HISTOGRAM_BINS - 1, Math.floor(((value - min) / span) * HISTOGRAM_BINS));
    histogram[bin] += occurrences;
  }
  stats.histogram = histogram;
  fillDescriptive(stats, counts, decimalComma);
}

/**
 * Moyenne, médiane, quartiles et écart-type.
 *
 * Tout se tire de la table de fréquences, parcourue une fois triée : les
 * quantiles n'exigent pas de trier les lignes, seulement les valeurs distinctes,
 * souvent cent fois moins nombreuses.
 */
function fillDescriptive(stats: ColumnStats, counts: Map<string, number>, decimalComma: boolean): void {
  const pairs: Array<[number, number]> = [];
  let population = 0;
  let sum = 0;
  for (const [raw, occurrences] of counts) {
    const value = parseNumber(raw, decimalComma);
    if (value === null) continue;
    pairs.push([value, occurrences]);
    population += occurrences;
    sum += value * occurrences;
  }
  if (population === 0) return;
  pairs.sort((left, right) => left[0] - right[0]);

  const mean = sum / population;
  stats.mean = mean;

  let squares = 0;
  for (const [value, occurrences] of pairs) squares += occurrences * (value - mean) ** 2;
  // Écart-type d'échantillon : le fichier est une observation, pas la population
  // entière. Sur une seule valeur, la dispersion n'a pas de sens.
  stats.deviation = population > 1 ? Math.sqrt(squares / (population - 1)) : 0;

  const quantile = (fraction: number): number => {
    // Interpolation linéaire entre statistiques d'ordre, comme numpy.
    const position = fraction * (population - 1);
    const lowIndex = Math.floor(position);
    const weight = position - lowIndex;
    const low = orderStatistic(pairs, lowIndex);
    const high = weight === 0 ? low : orderStatistic(pairs, lowIndex + 1);
    return low + (high - low) * weight;
  };
  stats.q1 = quantile(0.25);
  stats.median = quantile(0.5);
  stats.q3 = quantile(0.75);

  const spread = stats.q3 - stats.q1;
  const floor = stats.q1 - 1.5 * spread;
  const ceiling = stats.q3 + 1.5 * spread;
  let outliers = 0;
  for (const [value, occurrences] of pairs) {
    if (value < floor || value > ceiling) outliers += occurrences;
  }
  stats.outliers = outliers;
}

/** Valeur de rang `index` dans la série, lue depuis les effectifs cumulés. */
function orderStatistic(pairs: Array<[number, number]>, index: number): number {
  let seen = 0;
  for (const [value, occurrences] of pairs) {
    seen += occurrences;
    if (index < seen) return value;
  }
  return pairs[pairs.length - 1][0];
}

function fillTopValues(stats: ColumnStats, counts: Map<string, number>): void {
  const ordered = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0),
  );
  stats.top = ordered.slice(0, TOP_VALUES).map(([value, count]) => ({
    value,
    count,
    share: stats.present === 0 ? 0 : count / stats.present,
  }));
  const taken = stats.top.reduce((sum, entry) => sum + entry.count, 0);
  stats.otherCount = stats.present - taken;
  stats.otherShare = stats.present === 0 ? 0 : stats.otherCount / stats.present;
}

/** Statistiques de toutes les colonnes. `onColumnDone` alimente la progression. */
export function computeAll(table: CsvTable, onColumnDone: (done: number) => void = () => undefined): ColumnStats[] {
  const stats: ColumnStats[] = [];
  for (let index = 0; index < table.headers.length; index++) {
    stats.push(compute(table, index));
    onColumnDone(index + 1);
  }
  return stats;
}
