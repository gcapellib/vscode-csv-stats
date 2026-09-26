/**
 * Statistiques par colonne — mêmes règles que le plugin PyCharm du même nom.
 */
import type { CsvTable } from './csv';

export type ColumnType = 'numeric' | 'text';

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
  /** 20 classes entre min et max ; vide pour une colonne texte. */
  histogram: number[];
  /** Trois valeurs les plus fréquentes ; vide pour une colonne numérique. */
  top: ValueShare[];
  /** Ce que le top 3 laisse de côté, pour que les parts totalisent 100 %. */
  otherCount: number;
  otherShare: number;
}

export const HISTOGRAM_BINS = 20;
const TOP_VALUES = 3;

/** Chiffres, séparateur décimal point, exposant optionnel. */
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

const SPACES = /[   ]/g;

/**
 * Convertit une cellule en nombre, ou renvoie null.
 *
 * `decimalComma` est vrai pour les fichiers à point-virgule, où la virgule est le
 * séparateur décimal usuel. Les espaces, y compris insécables, sont traités comme
 * séparateurs de milliers.
 */
export function parseNumber(raw: string, decimalComma: boolean): number | null {
  let text = raw.trim();
  if (text === '') return null;
  text = text.replace(SPACES, '');
  if (decimalComma && text.includes(',') && !text.includes('.')) text = text.replace(',', '.');
  if (!NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function isMissing(raw: string): boolean {
  return raw.trim() === '';
}

/**
 * Statistiques d'une colonne, en une passe sur la colonne seule.
 *
 * Le parcours est colonne par colonne — et non ligne par ligne — pour que la
 * table de fréquences soit libérée avant de passer à la colonne suivante : une
 * seule table vit à la fois, quel que soit le nombre de colonnes.
 *
 * `forced` vient du menu de la colonne. Forcer « numeric » retient les seules
 * valeurs qui se lisent comme des nombres, sans exiger qu'elles le soient toutes
 * — c'est précisément parce que la colonne ne l'est pas tout à fait qu'on force.
 */
export function compute(table: CsvTable, columnIndex: number, forced?: ColumnType): ColumnStats {
  const decimalComma = table.delimiter === ';';
  const counts = new Map<string, number>();
  let missing = 0;
  let numeric = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const row of table.rows) {
    const raw = row[columnIndex];
    if (isMissing(raw)) {
      missing++;
      continue;
    }
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    const value = parseNumber(raw, decimalComma);
    if (value !== null) {
      numeric++;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  const total = table.rows.length;
  const present = total - missing;
  const isNumeric =
    forced === 'text' ? false : forced === 'numeric' ? numeric > 0 : present > 0 && numeric === present;
  const name = table.headers[columnIndex] ?? `column ${columnIndex + 1}`;

  const base = {
    name,
    index: columnIndex,
    total,
    missing,
    distinct: counts.size,
    present,
    missingShare: total === 0 ? 0 : missing / total,
    distinctShare: present === 0 ? 0 : counts.size / present,
  };

  if (!isNumeric) {
    const top = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
      .slice(0, TOP_VALUES)
      .map(([value, count]) => ({ value, count, share: present === 0 ? 0 : count / present }));
    const taken = top.reduce((sum, entry) => sum + entry.count, 0);
    return {
      ...base,
      type: 'text',
      min: null,
      max: null,
      histogram: [],
      top,
      otherCount: present - taken,
      otherShare: present === 0 ? 0 : (present - taken) / present,
    };
  }

  const histogram = new Array<number>(HISTOGRAM_BINS).fill(0);
  const span = max - min;
  for (const [raw, occurrences] of counts) {
    const value = parseNumber(raw, decimalComma);
    if (value === null) continue;
    const bin =
      span <= 0 ? 0 : Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor(((value - min) / span) * HISTOGRAM_BINS)));
    histogram[bin] += occurrences;
  }

  return {
    ...base,
    type: 'numeric',
    min,
    max,
    histogram,
    top: [],
    otherCount: 0,
    otherShare: 0,
  };
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
