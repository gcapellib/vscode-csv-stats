/**
 * Analyse approfondie d'une colonne, et du fichier entier.
 *
 * Tout ce qui suit ne se calcule qu'à l'ouverture d'un panneau. Le bandeau, lui,
 * se recalcule à chaque filtre : y faire entrer ces parcours supplémentaires
 * coûterait cher pour une information qu'on ne regarde qu'à la demande.
 */
import type { CsvTable } from './csv';
import { parseNumber, type ColumnType } from './types';

/**
 * Écritures de l'absence que pandas écarte déjà sans qu'on lui demande rien.
 *
 * Les signaler reste utile — elles expliquent pourquoi une colonne bascule en
 * `object` — mais il ne faut surtout pas les remettre dans `na_values` : ce
 * serait du bruit dans le code produit.
 */
const PANDAS_DEFAULT_NA = new Set(['na', 'n/a', '#na', '#n/a', 'nan', '-nan', 'null', 'none', '<na>', 'nil']);

/** Celles que pandas ne connaît pas, et qu'il faut donc lui donner. */
const EXTRA_NA = new Set(['-', '--', '?', '.', 'nc', 'n.c.', 'inconnu', 'unknown', 'vide', 'empty']);

/** Séparateur interdit dans une cellule, pour comparer des lignes entières. */
const ROW_JOIN = String.fromCharCode(1);

export interface NullToken {
  value: string;
  count: number;
  /** Vrai si pandas l'écarte déjà par défaut. */
  known: boolean;
}

export interface ColumnDetails {
  empty: number;
  whitespaceOnly: number;
  nullTokens: NullToken[];
  /** Manquants réels si les jetons ci-dessus étaient traités comme absents. */
  effectiveMissing: number;
  /**
   * Valeurs n'apparaissant qu'une seule fois.
   *
   * Contrairement à « présentes moins distinctes », ce compte ne se déduit pas
   * des deux totaux déjà affichés : il distingue une poignée de valeurs lourdes
   * suivies d'une longue traîne de cas uniques d'une répartition régulière.
   */
  singletons: number;
  minLength: number;
  maxLength: number;
  meanLength: number;
  /** Valeurs qui ne se distinguent d'une autre que par la casse. */
  caseVariants: number;
  /** Valeurs portant un espace en tête ou en fin. */
  spacePadded: number;
  /** Chiffres uniquement, dont certains commencent par un zéro. */
  leadingZeros: boolean;
  /** Type que pandas donnerait à la colonne, et ce qui l'en empêche. */
  pandasType: string;
  blockers: string[];
  /** Répartition des longueurs, pour les colonnes à forte cardinalité. */
  lengths: Array<{ length: number; count: number }>;
}

function isNullToken(raw: string): boolean {
  const word = raw.trim().toLowerCase();
  return PANDAS_DEFAULT_NA.has(word) || EXTRA_NA.has(word);
}

export function computeDetails(table: CsvTable, columnIndex: number, type: ColumnType): ColumnDetails {
  const decimalComma = table.delimiter === ';';
  const counts = new Map<string, number>();
  const nullCounts = new Map<string, number>();
  const folded = new Map<string, Set<string>>();
  const lengthCounts = new Map<number, number>();
  const offenders = new Map<string, number>();
  let empty = 0;
  let whitespaceOnly = 0;
  let spacePadded = 0;
  let lengthSum = 0;
  let minLength = Number.POSITIVE_INFINITY;
  let maxLength = 0;
  let present = 0;
  let digitsOnly = true;
  let sawLeadingZero = false;

  for (const row of table.rows) {
    const raw = row[columnIndex] ?? '';
    if (raw === '') {
      empty++;
      continue;
    }
    if (raw.trim() === '') {
      whitespaceOnly++;
      continue;
    }
    present++;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    if (isNullToken(raw)) nullCounts.set(raw.trim(), (nullCounts.get(raw.trim()) ?? 0) + 1);
    if (raw !== raw.trim()) spacePadded++;

    const trimmed = raw.trim();
    lengthSum += trimmed.length;
    if (trimmed.length < minLength) minLength = trimmed.length;
    if (trimmed.length > maxLength) maxLength = trimmed.length;
    lengthCounts.set(trimmed.length, (lengthCounts.get(trimmed.length) ?? 0) + 1);

    const key = trimmed.toLowerCase();
    let variants = folded.get(key);
    if (!variants) folded.set(key, (variants = new Set()));
    variants.add(trimmed);

    if (/^\d+$/.test(trimmed)) {
      if (trimmed.length > 1 && trimmed.startsWith('0')) sawLeadingZero = true;
    } else {
      digitsOnly = false;
    }

    if (type === 'numeric' && parseNumber(raw, decimalComma) === null) {
      offenders.set(trimmed, (offenders.get(trimmed) ?? 0) + 1);
    }
  }

  let caseVariants = 0;
  for (const variants of folded.values()) if (variants.size > 1) caseVariants += variants.size;

  const nullTokens = [...nullCounts.entries()]
    .map(([value, count]) => ({ value, count, known: PANDAS_DEFAULT_NA.has(value.toLowerCase()) }))
    .sort((left, right) => right.count - left.count);
  const nullTotal = nullTokens.reduce((sum, token) => sum + token.count, 0);

  const blockers: string[] = [];
  let pandasType = 'object';
  if (type === 'numeric') {
    const anyDecimal = [...counts.keys()].some((raw) => !Number.isInteger(parseNumber(raw, decimalComma) ?? 0.5));
    pandasType = anyDecimal ? 'float64' : 'int64';
    if (decimalComma) blockers.push('needs decimal="," or it reads as object');
  } else if (nullTotal > 0 && present > nullTotal) {
    const restIsNumeric = [...counts.keys()]
      .filter((raw) => !isNullToken(raw))
      .every((raw) => parseNumber(raw, decimalComma) !== null);
    if (restIsNumeric) {
      const list = nullTokens.map((token) => token.value).join(', ');
      blockers.push(`would be numeric if ${list} counted as missing`);
    }
  }
  if (digitsOnly && sawLeadingZero) blockers.push('leading zeros are lost unless dtype is "string"');
  for (const [value, count] of [...offenders.entries()].slice(0, 3)) {
    blockers.push(`${count} value(s) not numeric: ${value}`);
  }

  return {
    empty,
    whitespaceOnly,
    nullTokens,
    effectiveMissing: empty + whitespaceOnly + nullTotal,
    singletons: [...counts.values()].filter((occurrences) => occurrences === 1).length,
    minLength: minLength === Number.POSITIVE_INFINITY ? 0 : minLength,
    maxLength,
    meanLength: present === 0 ? 0 : lengthSum / present,
    caseVariants,
    spacePadded,
    leadingZeros: digitsOnly && sawLeadingZero,
    pandasType,
    blockers,
    lengths: [...lengthCounts.entries()]
      .map(([length, count]) => ({ length, count }))
      .sort((left, right) => left.length - right.length),
  };
}

export interface DatasetDetails {
  rows: number;
  columns: number;
  /** Lignes strictement identiques à une autre, la première exceptée. */
  duplicateRows: number;
  /** Jetons d'absence à passer à pandas, ceux qu'il ne connaît pas déjà. */
  extraNaValues: string[];
  /** Colonnes à lire en texte pour préserver leurs zéros de tête. */
  stringColumns: string[];
  notes: string[];
}

export function computeDataset(table: CsvTable, details: ColumnDetails[]): DatasetDetails {
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of table.rows) {
    const key = row.join(ROW_JOIN);
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const extra = new Set<string>();
  const stringColumns: string[] = [];
  const notes: string[] = [];
  details.forEach((column, index) => {
    const name = table.headers[index] ?? `column ${index + 1}`;
    for (const token of column.nullTokens) if (!token.known) extra.add(token.value);
    if (column.leadingZeros) stringColumns.push(name);
    if (column.caseVariants > 0) notes.push(`${name}: ${column.caseVariants} values differ only by case`);
    if (column.spacePadded > 0) notes.push(`${name}: ${column.spacePadded} values padded with spaces`);
    if (column.nullTokens.length > 0) {
      const list = column.nullTokens.map((token) => `${token.value} x${token.count}`).join(', ');
      notes.push(`${name}: missing written as ${list}`);
    }
  });

  return {
    rows: table.rows.length,
    columns: table.headers.length,
    duplicateRows,
    extraNaValues: [...extra].sort(),
    stringColumns,
    notes,
  };
}

/** Le `pd.read_csv` correspondant à ce que le plugin a détecté. */
export function readCsvSnippet(fileName: string, table: CsvTable, dataset: DatasetDetails): string {
  const options: string[] = [`    ${JSON.stringify(fileName)},`];
  if (table.delimiter !== ',') options.push(`    sep=${JSON.stringify(table.delimiter)},`);
  if (table.delimiter === ';') options.push('    decimal=",",');
  if (dataset.extraNaValues.length > 0) {
    const list = dataset.extraNaValues.map((value) => JSON.stringify(value)).join(', ');
    options.push(`    na_values=[${list}],`);
  }
  if (dataset.stringColumns.length > 0) {
    const mapping = dataset.stringColumns.map((name) => `${JSON.stringify(name)}: "string"`).join(', ');
    options.push(`    dtype={${mapping}},`);
  }
  return `import pandas as pd\n\ndf = pd.read_csv(\n${options.join('\n')}\n)`;
}
