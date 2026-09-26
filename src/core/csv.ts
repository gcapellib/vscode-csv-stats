/**
 * Décodage, détection du délimiteur et parsing d'un fichier CSV.
 *
 * Mêmes règles que le plugin PyCharm du même nom : les deux doivent lire un
 * fichier donné exactement de la même façon, sans quoi les statistiques
 * annoncées d'un côté contrediraient celles de l'autre.
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
  delimiter: string;
  /** Vrai si le fichier dépassait la limite de lignes et a été tronqué. */
  truncated: boolean;
}

/** Garde-fou mémoire : au-delà, la table est tronquée et le signale. */
export const MAX_ROWS = 500_000;

const BOM = '﻿';

/** Délimiteurs candidats, par ordre de préférence en cas d'égalité. */
const CANDIDATE_DELIMITERS = [',', ';'];

export function decode(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/**
 * Choisit le délimiteur le plus plausible en comptant, hors guillemets, les
 * occurrences de chaque candidat sur les premières lignes.
 *
 * Un délimiteur dont le compte est stable d'une ligne à l'autre l'emporte sur un
 * délimiteur plus fréquent mais erratique : c'est la régularité qui signale la
 * structure, pas le volume. Un fichier à point-virgule dont les nombres portent
 * une virgule décimale est ainsi lu correctement.
 */
export function detectDelimiter(text: string, sampleLines = 20): string {
  let best = CANDIDATE_DELIMITERS[0];
  let bestScore = -1;
  for (const candidate of CANDIDATE_DELIMITERS) {
    const counts = countPerLine(text, candidate, sampleLines);
    if (counts.length === 0 || counts[0] === 0) continue;
    const first = counts[0];
    const consistent = counts.filter((count) => count === first).length;
    const score = first + (100 * consistent) / counts.length;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function countPerLine(text: string, delimiter: string, sampleLines: number): number[] {
  const counts: number[] = [];
  let inQuotes = false;
  let current = 0;
  for (let i = 0; i < text.length && counts.length < sampleLines; i++) {
    const character = text[i];
    if (character === '"') inQuotes = !inQuotes;
    else if (inQuotes) continue;
    else if (character === delimiter) current++;
    else if (character === '\n') {
      counts.push(current);
      current = 0;
    }
  }
  if (counts.length < sampleLines && current > 0) counts.push(current);
  return counts;
}

/**
 * Parse [text] en table.
 *
 * Une ligne entièrement blanche n'est pas une ligne de données : elle est
 * ignorée, tout comme le saut de ligne final. Les lignes plus courtes que
 * l'en-tête sont complétées, pour que la table reste rectangulaire.
 */
export function parse(
  text: string,
  delimiter: string = detectDelimiter(text),
  maxRows: number = MAX_ROWS,
  onRowsRead: (rows: number) => void = () => undefined,
): CsvTable {
  const records = new RecordReader(text, delimiter);
  const first = records.next();
  if (first === null) {
    return { headers: [], rows: [], delimiter, truncated: false };
  }

  const headers = first.map((raw, index) => raw.trim() || `column ${index + 1}`);
  const width = headers.length;
  const rows: string[][] = [];
  let truncated = false;

  for (;;) {
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    const record = records.next();
    if (record === null) break;
    const row = new Array<string>(width);
    for (let i = 0; i < width; i++) row[i] = i < record.length ? record[i] : '';
    rows.push(row);
    if (rows.length % 10_000 === 0) onRowsRead(rows.length);
  }
  onRowsRead(rows.length);
  return { headers, rows, delimiter, truncated };
}

/**
 * Lecteur RFC 4180 : guillemets, guillemets échappés par doublement, délimiteurs
 * et sauts de ligne à l'intérieur d'un champ.
 */
class RecordReader {
  private position = 0;

  constructor(private readonly text: string, private readonly delimiter: string) {}

  /** Renvoie le prochain enregistrement non vide, ou null à la fin du texte. */
  next(): string[] | null {
    for (;;) {
      if (this.position >= this.text.length) return null;
      const record = this.readRecord();
      // Une ligne blanche ne porte aucune donnée : un seul champ, vide.
      if (record.length === 1 && record[0] === '') continue;
      return record;
    }
  }

  private readRecord(): string[] {
    const fields: string[] = [];
    let field = '';
    let quoted = false;
    let inQuotes = false;

    while (this.position < this.text.length) {
      const character = this.text[this.position];

      if (inQuotes) {
        if (character === '"') {
          if (this.text[this.position + 1] === '"') {
            field += '"';
            this.position += 2;
            continue;
          }
          inQuotes = false;
          this.position++;
          continue;
        }
        field += character;
        this.position++;
        continue;
      }

      if (character === '"' && field === '' && !quoted) {
        quoted = true;
        inQuotes = true;
        this.position++;
        continue;
      }
      if (character === this.delimiter) {
        fields.push(field);
        field = '';
        quoted = false;
        this.position++;
        continue;
      }
      if (character === '\n') {
        this.position++;
        fields.push(field);
        return fields;
      }
      if (character === '\r') {
        this.position++;
        if (this.text[this.position] === '\n') this.position++;
        fields.push(field);
        return fields;
      }
      field += character;
      this.position++;
    }

    fields.push(field);
    return fields;
  }
}
