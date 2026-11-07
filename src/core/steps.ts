/**
 * Les étapes de nettoyage, et leur application.
 *
 * Le fichier d'origine n'est jamais touché : il reste en mémoire tel qu'il a été
 * lu, et la liste des étapes est rejouée dessus à chaque changement — comme les
 * « Étapes appliquées » de Power Query. Retirer une étape, c'est rejouer la
 * liste sans elle ; rien n'est défait à la main.
 *
 * Ce qui change les données est une étape (renommer, retirer une colonne,
 * changer un type, Trim…). Ce qui change seulement la façon de regarder —
 * filtres, tri, largeurs, palette — n'en est pas une, et n'entre pas dans la
 * copie sauvegardée.
 *
 * Les colonnes sont désignées par leur index dans le fichier : un renommage ou
 * un retrait ne décale jamais les étapes qui suivent.
 */
import { parseTemporal, temporalFormatFor } from './temporal';
import { parseNumber, type ColumnType } from './types';

export type CaseMode = 'lower' | 'upper' | 'title';

export type Step =
  | { kind: 'rename'; column: number; name: string }
  | { kind: 'remove'; column: number }
  | { kind: 'type'; column: number; type: ColumnType }
  | { kind: 'trim'; column: number }
  | { kind: 'clean'; column: number }
  | { kind: 'case'; column: number; mode: CaseMode }
  | { kind: 'replace'; column: number; from: string; to: string }
  | { kind: 'empty'; column: number; tokens: string[] }
  | { kind: 'fillDown'; column: number }
  | { kind: 'dropEmpty'; column: number }
  | { kind: 'round'; column: number; digits: number }
  | { kind: 'removeDuplicates' }
  | { kind: 'removeBlankRows' };

export interface Cleaned {
  rows: string[][];
  /** Pour chaque ligne obtenue, l'index de sa ligne d'origine. */
  source: number[];
  /** Ce que chaque étape a touché : cellules modifiées ou lignes retirées. */
  effects: number[];
  /** Nom courant de chaque colonne, par index d'origine. */
  names: string[];
  removed: Set<number>;
  /** Types imposés par une étape « Change type ». */
  types: Map<number, ColumnType>;
}

/** Caractères de contrôle et espaces de largeur nulle : ce que « Clean » retire. */
// eslint-disable-next-line no-control-regex -- c'est précisément ces caractères qu'on retire
const INVISIBLE = /[\u0000-\u001F\u007F​-‍﻿]/g;
const ROW_JOIN = String.fromCharCode(1);

export function columnOf(step: Step): number | null {
  return 'column' in step ? step.column : null;
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** La transformation d'une cellule, pour les étapes qui ne regardent qu'elle. */
function cellTransform(step: Step): ((raw: string) => string) | null {
  switch (step.kind) {
    case 'trim':
      return (raw) => raw.trim();
    case 'clean':
      return (raw) => raw.replace(INVISIBLE, '');
    case 'case':
      return step.mode === 'lower' ? (raw) => raw.toLowerCase() : step.mode === 'upper' ? (raw) => raw.toUpperCase() : titleCase;
    case 'replace':
      return (raw) => (raw === step.from ? step.to : raw);
    case 'empty': {
      const tokens = new Set(step.tokens.map((token) => token.trim()));
      return (raw) => (tokens.has(raw.trim()) ? '' : raw);
    }
    default:
      return null;
  }
}

export function applySteps(original: string[][], headers: string[], steps: Step[], decimalComma: boolean): Cleaned {
  let rows = original;
  let source = original.map((_, index) => index);
  const names = [...headers];
  const removed = new Set<number>();
  const types = new Map<number, ColumnType>();
  const effects: number[] = [];
  // Une ligne n'est copiée qu'au premier changement : l'original reste intact.
  let copied = new Set<number>();
  const setCell = (row: number, column: number, value: string) => {
    if (!copied.has(row)) {
      rows[row] = [...rows[row]];
      copied.add(row);
    }
    rows[row][column] = value;
  };
  const ownRows = () => {
    if (rows === original) rows = [...original];
  };

  for (const step of steps) {
    let effect = 0;
    const transform = cellTransform(step);
    if (transform && 'column' in step) {
      ownRows();
      for (let row = 0; row < rows.length; row++) {
        const raw = rows[row][step.column] ?? '';
        const next = transform(raw);
        if (next !== raw) {
          setCell(row, step.column, next);
          effect++;
        }
      }
    } else {
      switch (step.kind) {
        case 'rename':
          names[step.column] = step.name;
          break;
        case 'remove':
          removed.add(step.column);
          break;
        case 'type': {
          types.set(step.column, step.type);
          // Comme Power Query : ce qui ne se lit pas dans le nouveau type
          // devient vide, plutôt que de rester une valeur que le type dément.
          if (step.type === 'text') break;
          const values = [...new Set(rows.map((row) => row[step.column] ?? '').filter((raw) => raw.trim() !== ''))];
          const parse =
            step.type === 'numeric'
              ? (raw: string) => parseNumber(raw, decimalComma)
              : ((order) => (raw: string) => parseTemporal(raw, order))(temporalFormatFor(values, step.type).order);
          ownRows();
          for (let row = 0; row < rows.length; row++) {
            const raw = rows[row][step.column] ?? '';
            if (raw.trim() !== '' && parse(raw) === null) {
              setCell(row, step.column, '');
              effect++;
            }
          }
          break;
        }
        case 'fillDown': {
          ownRows();
          let last = '';
          for (let row = 0; row < rows.length; row++) {
            const raw = rows[row][step.column] ?? '';
            if (raw.trim() === '') {
              if (last !== '') {
                setCell(row, step.column, last);
                effect++;
              }
            } else last = raw;
          }
          break;
        }
        case 'round': {
          ownRows();
          for (let row = 0; row < rows.length; row++) {
            const raw = rows[row][step.column] ?? '';
            const value = parseNumber(raw, decimalComma);
            if (value === null) continue;
            let written = String(Number(value.toFixed(step.digits)));
            if (decimalComma) written = written.replace('.', ',');
            if (written !== raw.trim()) {
              setCell(row, step.column, written);
              effect++;
            }
          }
          break;
        }
        case 'removeDuplicates':
        case 'dropEmpty':
        case 'removeBlankRows': {
          const seen = new Set<string>();
          const keep: number[] = [];
          rows.forEach((row, index) => {
            const drop =
              step.kind === 'removeBlankRows'
                ? row.every((cell) => cell.trim() === '')
                : step.kind === 'dropEmpty'
                  ? (row[step.column] ?? '').trim() === ''
                  : seen.has(row.join(ROW_JOIN)) || (seen.add(row.join(ROW_JOIN)), false);
            if (!drop) keep.push(index);
          });
          effect = rows.length - keep.length;
          rows = keep.map((index) => rows[index]);
          source = keep.map((index) => source[index]);
          // Les index changent : les lignes déjà copiées le restent, mais le
          // registre repart de zéro pour ne pas viser les mauvaises.
          copied = new Set(keep.map((_, position) => position).filter((position) => rows[position] !== original[source[position]]));
          break;
        }
      }
    }
    effects.push(effect);
  }
  return { rows, source, effects, names, removed, types };
}

const CASE_LABELS: Record<CaseMode, string> = { lower: 'lowercase', upper: 'UPPERCASE', title: 'Capitalize Each Word' };
const TYPE_NAMES: Record<ColumnType, string> = { numeric: 'number', date: 'date', time: 'time', text: 'text' };

/** Le libellé d'une étape, avec le nom de colonne qu'elle avait à ce moment-là. */
export function describeStep(step: Step, nameOf: (column: number) => string): string {
  const name = 'column' in step ? nameOf(step.column) : '';
  switch (step.kind) {
    case 'rename':
      return `Rename ${name} → ${step.name}`;
    case 'remove':
      return `Remove column ${name}`;
    case 'type':
      return `Change type of ${name} to ${TYPE_NAMES[step.type]}`;
    case 'trim':
      return `Trim spaces in ${name}`;
    case 'clean':
      return `Clean invisible characters in ${name}`;
    case 'case':
      return `${CASE_LABELS[step.mode]} in ${name}`;
    case 'replace':
      return `Replace « ${step.from} » with « ${step.to} » in ${name}`;
    case 'empty':
      return `Treat ${step.tokens.join(', ')} as empty in ${name}`;
    case 'fillDown':
      return `Fill down ${name}`;
    case 'dropEmpty':
      return `Remove rows where ${name} is empty`;
    case 'round':
      return `Round ${name} to ${step.digits} decimal${step.digits === 1 ? '' : 's'}`;
    case 'removeDuplicates':
      return 'Remove duplicate rows';
    case 'removeBlankRows':
      return 'Remove blank rows';
  }
}

/** Ce qu'une étape a fait : « −7 rows », « 20 cells », ou rien pour un renommage. */
export function describeEffect(step: Step, effect: number): string {
  if (step.kind === 'removeDuplicates' || step.kind === 'removeBlankRows' || step.kind === 'dropEmpty') return `−${effect} row${effect === 1 ? '' : 's'}`;
  if (step.kind === 'rename' || step.kind === 'remove') return '';
  if (step.kind === 'type') return effect === 0 ? '' : `${effect} emptied`;
  return `${effect} cell${effect === 1 ? '' : 's'}`;
}

/**
 * Les lignes pandas des étapes, dans l'ordre. Chaque colonne est nommée comme
 * elle s'appelle à ce point de la recette : après un renommage, son nouveau nom.
 */
export function stepsToPandas(steps: Step[], headers: string[], dayFirst: (column: number) => boolean): string[] {
  const names = [...headers];
  const lines: string[] = [];
  for (const step of steps) {
    const column = 'column' in step ? `df[${JSON.stringify(names[step.column])}]` : '';
    switch (step.kind) {
      case 'rename':
        lines.push(`df = df.rename(columns={${JSON.stringify(names[step.column])}: ${JSON.stringify(step.name)}})`);
        names[step.column] = step.name;
        break;
      case 'remove':
        lines.push(`df = df.drop(columns=[${JSON.stringify(names[step.column])}])`);
        break;
      case 'type':
        lines.push(
          step.type === 'numeric'
            ? `${column} = pd.to_numeric(${column}, errors="coerce")`
            : step.type === 'date'
              ? `${column} = pd.to_datetime(${column}, ${dayFirst(step.column) ? 'dayfirst=True, ' : ''}errors="coerce")`
              : step.type === 'time'
                ? `${column} = pd.to_timedelta(${column}, errors="coerce")`
                : `${column} = ${column}.astype("string")`,
        );
        break;
      case 'trim':
        lines.push(`${column} = ${column}.str.strip()`);
        break;
      case 'clean':
        lines.push(`${column} = ${column}.str.replace(r"[\\x00-\\x1f\\x7f\\u200b-\\u200d\\ufeff]", "", regex=True)`);
        break;
      case 'case':
        lines.push(`${column} = ${column}.str.${step.mode === 'title' ? 'title' : step.mode}()`);
        break;
      case 'replace':
        lines.push(`${column} = ${column}.replace(${JSON.stringify(step.from)}, ${step.to === '' ? 'pd.NA' : JSON.stringify(step.to)})`);
        break;
      case 'empty':
        lines.push(`${column} = ${column}.replace(${JSON.stringify(step.tokens)}, pd.NA)`);
        break;
      case 'fillDown':
        lines.push(`${column} = ${column}.ffill()`);
        break;
      case 'dropEmpty':
        lines.push(`df = df[${column}.notna() & (${column}.astype(str).str.strip() != "")]`);
        break;
      case 'round':
        lines.push(`${column} = ${column}.round(${step.digits})`);
        break;
      case 'removeDuplicates':
        lines.push('df = df.drop_duplicates()');
        break;
      case 'removeBlankRows':
        lines.push('df = df.dropna(how="all")');
        break;
    }
  }
  return lines;
}

/** Le nom de la copie nettoyée : `dragons.csv` → `dragons.clean.csv`. */
export function cleanCopyName(fileName: string, attempt = 1): string {
  const base = fileName.replace(/\.csv$/i, '');
  return `${base}.clean${attempt > 1 ? `-${attempt}` : ''}.csv`;
}

/**
 * Le tableau nettoyé, en CSV : mêmes séparateur et colonnes que l'affichage,
 * un champ entre guillemets dès qu'il contient le séparateur, un guillemet, un
 * retour à la ligne ou des espaces en bord.
 */
export function toCsv(headers: string[], rows: string[][], columns: number[], delimiter: string): string {
  const field = (value: string) =>
    value.includes(delimiter) || /["\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value;
  const line = (cells: string[]) => columns.map((column) => field(cells[column] ?? '')).join(delimiter);
  return [line(headers), ...rows.map(line)].join('\n') + '\n';
}
