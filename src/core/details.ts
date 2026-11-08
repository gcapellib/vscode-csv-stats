/**
 * Analyse approfondie d'une colonne, et du fichier entier.
 *
 * Tout ce qui suit ne se calcule qu'à l'ouverture d'un panneau. Le bandeau, lui,
 * se recalcule à chaque filtre : y faire entrer ces parcours supplémentaires
 * coûterait cher pour une information qu'on ne regarde qu'à la demande.
 */
import type { CsvTable } from './csv';
import {
  garbledValues,
  numericPlaceholders,
  pandasHints,
  sequenceGaps,
  summaryWithout,
  temporalPlaceholders,
  type Garbled,
  type Gaps,
  type Placeholder,
  type Summary,
} from './insights';
import { parseTemporal, type TemporalFormat } from './temporal';
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
  /** Les valeurs en cause, pour pouvoir aller les voir dans le tableau. */
  caseVariantValues: string[];
  /** Valeurs portant un espace en tête ou en fin. */
  spacePadded: number;
  spacePaddedValues: string[];
  /** Chiffres uniquement, dont certains commencent par un zéro. */
  leadingZeros: boolean;
  /** Type que pandas donnerait à la colonne, et ce qui l'en empêche. */
  pandasType: string;
  /** L'écriture des dates ou heures de la colonne, pour `parse_dates` ; null sinon. */
  temporal: TemporalFormat | null;
  /** Des heures écrites sans secondes (12:52), que `pd.to_timedelta` refuse telles quelles. */
  timeWithoutSeconds: boolean;
  blockers: string[];
  /** Répartition des longueurs, pour les colonnes à forte cardinalité. */
  lengths: Array<{ length: number; count: number }>;
  /**
   * Les valeurs qui ne se lisent pas dans le type de la colonne — ou dans celui
   * qu'elle aurait presque : une colonne de texte dont 80 % des valeurs sont des
   * nombres liste les autres. `offenderKind` dit lequel ; null s'il n'y a rien.
   */
  offenders: Array<{ value: string; count: number }>;
  offenderKind: 'number' | 'date' | 'time' | null;
  /**
   * Les formes des valeurs — `A-9999`, `99/99/9999` —, de la plus fréquente à
   * la plus rare : deux formes dans une colonne de codes ou de dates trahissent
   * une saisie incohérente. Vide pour du texte libre, où chaque valeur a la
   * sienne.
   */
  patterns: Array<{ pattern: string; count: number; values: string[] }>;
  /** Des valeurs qui tiennent la place d'une absence (`-999`), si la colonne en a. */
  placeholders: Placeholder[];
  /** Les chiffres de la colonne sans ces valeurs ; null s'il n'y en a pas. */
  withoutPlaceholders: Summary | null;
  /** Des valeurs dont les accents sont devenus deux caractères (`CafÃ©`), avec leur correction. */
  garbled: Garbled[];
  /** Les trous d'une suite régulière (identifiants, jours) ; null si ce n'en est pas une. */
  gaps: Gaps | null;
  /** Ce que pandas gagnerait à lire autrement : type entier, plus petit, catégorie. */
  hints: string[];
  /**
   * Pour une colonne presque unique (un identifiant, une clé) : les valeurs qui
   * s'y répètent malgré tout, et le nombre de lignes concernées.
   */
  repeats: { values: string[]; rows: number; distinct: number } | null;
}

/**
 * La forme d'une valeur : chaque chiffre devient 9, chaque suite de majuscules
 * A, chaque suite de minuscules a ; le reste ne bouge pas. Les chiffres gardent
 * leur nombre — `OEUF-053` et `SYN-0424` diffèrent —, les lettres non, sans
 * quoi chaque nom propre aurait sa forme.
 */
export function valuePattern(raw: string): string {
  return raw.trim().replace(/\d/g, '9').replace(/\p{Lu}+/gu, 'A').replace(/\p{Ll}+/gu, 'a');
}

/** Au-delà, ce sont des textes libres : leurs formes ne disent rien. */
const MAX_PATTERNS = 12;
/** Part minimale des valeurs lisibles pour qu'une colonne de texte soit dite « presque » d'un type. */
const ALMOST = 0.8;

function isNullToken(raw: string): boolean {
  const word = raw.trim().toLowerCase();
  return PANDAS_DEFAULT_NA.has(word) || EXTRA_NA.has(word);
}

export function computeDetails(
  table: CsvTable,
  columnIndex: number,
  type: ColumnType,
  temporal: TemporalFormat | null = null,
): ColumnDetails {
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
  let timeWithoutSeconds = false;

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
      offenders.set(raw, (offenders.get(raw) ?? 0) + 1);
    }
    if (temporal?.order === 'time' && /^\d{1,2}:\d{2}$/.test(trimmed)) timeWithoutSeconds = true;
    if (temporal && parseTemporal(raw, temporal.order) === null) {
      offenders.set(raw, (offenders.get(raw) ?? 0) + 1);
    }
  }

  let caseVariants = 0;
  const caseVariantValues: string[] = [];
  for (const variants of folded.values()) {
    if (variants.size > 1) {
      caseVariants += variants.size;
      caseVariantValues.push(...variants);
    }
  }
  const spacePaddedValues = [...counts.keys()].filter((raw) => raw !== raw.trim());

  const nullTokens = [...nullCounts.entries()]
    .map(([value, count]) => ({ value, count, known: PANDAS_DEFAULT_NA.has(value.toLowerCase()) }))
    .sort((left, right) => right.count - left.count);
  const nullTotal = nullTokens.reduce((sum, token) => sum + token.count, 0);

  const blockers: string[] = [];
  let pandasType = 'object';
  if (temporal) {
    // Une heure seule devient une durée depuis minuit : `parse_dates` lui
    // collerait la date du jour.
    pandasType = temporal.order === 'time' ? 'timedelta64[ns]' : 'datetime64[ns]';
  } else if (type === 'numeric') {
    const anyDecimal = [...counts.keys()].some((raw) => !Number.isInteger(parseNumber(raw, decimalComma) ?? 0.5));
    // Des entiers et une cellule vide : pandas n'a pas d'entier sans valeur, il lit des flottants.
    pandasType = anyDecimal || empty + whitespaceOnly > 0 ? 'float64' : 'int64';
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
  // Les valeurs hors type : celles de la colonne typée, ou, pour du texte, celles
  // qui l'empêchent d'être un nombre ou une date alors que presque tout l'est.
  let offenderKind: ColumnDetails['offenderKind'] = temporal ? (temporal.order === 'time' ? 'time' : 'date') : type === 'numeric' ? 'number' : null;
  let offenderEntries = [...offenders.entries()];
  if (offenderKind === null && present > 0) {
    const readers: Array<[NonNullable<ColumnDetails['offenderKind']>, (raw: string) => boolean]> = [
      ['number', (raw) => parseNumber(raw, decimalComma) !== null],
      ['date', (raw) => parseTemporal(raw, 'ymd') !== null || parseTemporal(raw, 'dmy') !== null],
      ['time', (raw) => parseTemporal(raw, 'time') !== null],
    ];
    for (const [kind, reads] of readers) {
      const failing = [...counts.entries()].filter(([raw]) => !reads(raw));
      const failed = failing.reduce((sum, [, occurrences]) => sum + occurrences, 0);
      if (failed > 0 && (present - failed) / present >= ALMOST) {
        offenderKind = kind;
        offenderEntries = failing;
        break;
      }
    }
  }
  const offenderList = offenderEntries
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count);
  if (offenderList.length === 0) offenderKind = null;

  const byPattern = new Map<string, { count: number; values: string[] }>();
  for (const [raw, occurrences] of counts) {
    const pattern = valuePattern(raw);
    let entry = byPattern.get(pattern);
    if (!entry) byPattern.set(pattern, (entry = { count: 0, values: [] }));
    entry.count += occurrences;
    entry.values.push(raw);
  }
  const patterns =
    byPattern.size > MAX_PATTERNS
      ? []
      : [...byPattern.entries()].map(([pattern, entry]) => ({ pattern, ...entry })).sort((left, right) => right.count - left.count);

  const entries = [...counts.entries()];
  const reader = (raw: string) => parseNumber(raw, decimalComma);
  let placeholders: Placeholder[] = [];
  if (type === 'numeric' && !temporal) placeholders = numericPlaceholders(entries, reader);
  else if (temporal) placeholders = temporalPlaceholders(entries);
  const excluded = new Set(placeholders.flatMap((entry) => entry.tokens));
  const withoutPlaceholders = placeholders.length > 0 && type === 'numeric' && !temporal ? summaryWithout(entries, reader, excluded) : null;

  const garbled = type === 'text' && !temporal ? garbledValues(entries) : [];
  const gaps = temporal
    ? sequenceGaps(entries, (raw) => parseTemporal(raw, temporal.order), true)
    : type === 'numeric'
      ? sequenceGaps(entries, reader, false)
      : null;

  let hints: string[] = [];
  let repeats: ColumnDetails['repeats'] = null;
  if (!temporal) {
    let integersOnly = true;
    let low = Infinity;
    let high = -Infinity;
    let digits = 0;
    if (type === 'numeric') {
      for (const raw of counts.keys()) {
        const value = parseNumber(raw, decimalComma);
        if (value === null) continue;
        if (!Number.isInteger(value)) integersOnly = false;
        if (value < low) low = value;
        if (value > high) high = value;
        digits = Math.max(digits, raw.replace(/[^0-9]/g, '').replace(/^0+/, '').length);
      }
    }
    hints = pandasHints({
      kind: type === 'numeric' ? 'numeric' : nullTotal === 0 && !offenderKind ? 'text' : 'other',
      rows: table.rows.length,
      present,
      gaps: empty + whitespaceOnly,
      distinct: counts.size,
      integersOnly,
      min: low,
      max: high,
      digits,
    });
    // Une colonne presque unique est une clé qui s'ignore : ses répétitions sont l'intérêt.
    const keyLike = (type !== 'numeric' || integersOnly) && present >= 20 && counts.size >= present * 0.9;
    if (keyLike) {
      const repeated = entries.filter(([raw, occurrences]) => occurrences > 1 && !excluded.has(raw.trim()));
      if (repeated.length > 0) {
        repeats = {
          values: repeated.map(([raw]) => raw),
          rows: repeated.reduce((sum, [, occurrences]) => sum + occurrences, 0),
          distinct: counts.size,
        };
      }
    }
  }

  return {
    garbled,
    gaps,
    placeholders,
    withoutPlaceholders,
    hints,
    repeats,
    empty,
    whitespaceOnly,
    nullTokens,
    effectiveMissing: empty + whitespaceOnly + nullTokens.filter((token) => token.known).reduce((sum, token) => sum + token.count, 0),
    singletons: [...counts.values()].filter((occurrences) => occurrences === 1).length,
    minLength: minLength === Number.POSITIVE_INFINITY ? 0 : minLength,
    maxLength,
    meanLength: present === 0 ? 0 : lengthSum / present,
    caseVariants,
    caseVariantValues,
    spacePadded,
    spacePaddedValues,
    leadingZeros: digitsOnly && sawLeadingZero,
    pandasType,
    temporal,
    timeWithoutSeconds,
    blockers,
    offenders: offenderList,
    offenderKind,
    patterns,
    lengths: [...lengthCounts.entries()]
      .map(([length, count]) => ({ length, count }))
      .sort((left, right) => left.length - right.length),
  };
}

/**
 * Un constat, accompagné de ce qu'il faut pour aller le vérifier.
 *
 * Un diagnostic qu'on ne peut pas aller voir dans les données ne sert qu'à
 * inquiéter : chaque constat porte donc les valeurs fautives, de quoi filtrer le
 * tableau sur elles d'un clic.
 */
export interface Finding {
  column: number;
  text: string;
  values: string[];
  /** Le genre du constat, pour proposer l'étape qui le corrige. */
  fix: 'case' | 'trim' | 'empty' | 'encoding';
}

export interface DatasetDetails {
  rows: number;
  columns: number;
  /** Lignes strictement identiques à une autre, la première exceptée. */
  duplicateRows: number;
  /** Leurs index, pour pouvoir les afficher. */
  duplicateRowIndices: number[];
  /**
   * Chaque ensemble de lignes identiques, original compris, dans l'ordre de
   * sa première apparition : de quoi les montrer côte à côte.
   */
  duplicateGroups: number[][];
  /** Jetons d'absence à passer à pandas, ceux qu'il ne connaît pas déjà. */
  /** Colonnes à lire en texte pour préserver leurs zéros de tête. */
  stringColumns: string[];
  /** Colonnes de dates, pour `parse_dates`. */
  dateColumns: string[];
  /** Vrai si l'une d'elles s'écrit jour/mois/an : pandas lit alors `dayfirst=True`. */
  dayFirst: boolean;
  /** Colonnes d'heures seules, converties ensuite en durées ; `pad` si certaines n'ont pas de secondes. */
  timeColumns: Array<{ name: string; pad: boolean }>;
  findings: Finding[];
}

export function computeDataset(table: CsvTable, details: ColumnDetails[]): DatasetDetails {
  const byContent = new Map<string, number[]>();
  const duplicateRowIndices: number[] = [];
  table.rows.forEach((row, index) => {
    const key = row.join(ROW_JOIN);
    const group = byContent.get(key);
    if (group) {
      group.push(index);
      duplicateRowIndices.push(index);
    } else byContent.set(key, [index]);
  });
  // Les groupes, dans l'ordre de leur première apparition : la Map garde
  // l'ordre d'insertion.
  const duplicateGroups = [...byContent.values()].filter((group) => group.length > 1);

  const stringColumns: string[] = [];
  const dateColumns: string[] = [];
  const timeColumns: Array<{ name: string; pad: boolean }> = [];
  let dayFirst = false;
  const findings: Finding[] = [];
  details.forEach((column, index) => {
    const name = table.headers[index] ?? `column ${index + 1}`;
    if (column.temporal?.order === 'time') timeColumns.push({ name, pad: column.timeWithoutSeconds });
    else if (column.temporal) {
      dateColumns.push(name);
      if (column.temporal.order === 'dmy') dayFirst = true;
    }
    if (column.leadingZeros) stringColumns.push(name);
    if (column.caseVariants > 0) {
      findings.push({
        column: index,
        text: `${name}: ${column.caseVariants} values differ only by case`,
        values: column.caseVariantValues,
        fix: 'case',
      });
    }
    if (column.spacePadded > 0) {
      findings.push({
        column: index,
        text: `${name}: ${column.spacePadded} values padded with spaces`,
        values: column.spacePaddedValues,
        fix: 'trim',
      });
    }
    if (column.garbled.length > 0) {
      findings.push({
        column: index,
        text: `${name}: ${column.garbled.reduce((sum, entry) => sum + entry.count, 0)} values with garbled characters (${column.garbled[0].value} → ${column.garbled[0].fixed})`,
        values: column.garbled.map((entry) => entry.value),
        fix: 'encoding',
      });
    }
    for (const placeholder of column.placeholders) {
      findings.push({
        column: index,
        text: `${name}: ${placeholder.value} ×${placeholder.count} looks like a missing value`,
        values: placeholder.raws,
        fix: 'empty',
      });
    }
    if (column.nullTokens.length > 0) {
      const list = column.nullTokens.map((token) => `${token.value} x${token.count}`).join(', ');
      findings.push({
        column: index,
        text: `${name}: missing written as ${list}`,
        values: column.nullTokens.map((token) => token.value),
        fix: 'empty',
      });
    }
  });

  return {
    rows: table.rows.length,
    columns: table.headers.length,
    duplicateRows: duplicateRowIndices.length,
    duplicateRowIndices,
    duplicateGroups,
    stringColumns,
    dateColumns,
    dayFirst,
    timeColumns,
    findings,
  };
}

/** Le `pd.read_csv` correspondant à ce que le plugin a détecté. */
export function readCsvSnippet(fileName: string, table: CsvTable, dataset: DatasetDetails): string {
  const options: string[] = [`    ${JSON.stringify(fileName)},`];
  if (table.delimiter !== ',') options.push(`    sep=${JSON.stringify(table.delimiter)},`);
  if (table.delimiter === ';') options.push('    decimal=",",');
  // Les noms de Python : cp1252 pour windows-1252 ; « utf-16 » lit la marque d'ordre des octets.
  if (table.encoding === 'windows-1252') options.push('    encoding="cp1252",');
  else if (table.encoding === 'utf-16le' || table.encoding === 'utf-16be') options.push('    encoding="utf-16",');
  if (dataset.stringColumns.length > 0) {
    const mapping = dataset.stringColumns.map((name) => `${JSON.stringify(name)}: "string"`).join(', ');
    options.push(`    dtype={${mapping}},`);
  }
  if (dataset.dateColumns.length > 0) {
    options.push(`    parse_dates=[${dataset.dateColumns.map((name) => JSON.stringify(name)).join(', ')}],`);
    if (dataset.dayFirst) options.push('    dayfirst=True,');
  }
  const read = `import pandas as pd\n\ndf = pd.read_csv(\n${options.join('\n')}\n)`;
  // Une heure seule n'a pas de date : une durée depuis minuit la compare et la trie.
  const times = dataset.timeColumns.map(({ name, pad }) => {
    const column = `df[${JSON.stringify(name)}]`;
    // « 12:52 » doit devenir « 12:52:00 » : pd.to_timedelta exige les secondes.
    const source = pad ? `${column}.str.replace(r"^(\\d{1,2}:\\d{2})$", r"\\1:00", regex=True)` : column;
    return `${column} = pd.to_timedelta(${source})`;
  });
  return [read, ...times].join('\n');
}
