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
