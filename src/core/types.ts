/**
 * Reconnaissance du type d'une colonne.
 *
 * Le verdict se prend sur les **valeurs distinctes**, pas sur toutes les lignes :
 * un fichier de cent mille lignes n'a souvent que quelques centaines de valeurs
 * différentes, et l'essai d'analyse coûte alors cent fois moins cher.
 */

export type ColumnType = 'numeric' | 'date' | 'boolean' | 'id' | 'categorical' | 'text';

/** Au-delà, une colonne texte n'est plus une nomenclature mais du texte libre. */
export const MAX_CATEGORIES = 25;

/** En deçà, « toutes les valeurs sont distinctes » ne veut rien dire. */
const MIN_ROWS_FOR_ID = 20;

/** Noms qui annoncent un identifiant plutôt qu'une mesure. */
const ID_NAME = /(^|[_\s-])(id|ids|code|ref|uuid|guid|key|num|numero|number)([_\s-]|$)/i;

const TRUE_WORDS = new Set(['true', 'yes', 'y', 'oui', 'vrai', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', 'non', 'faux', '0']);

/** Chiffres, séparateur décimal point, exposant optionnel. */
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const SPACES = /[   ]/g;

export function parseNumber(raw: string, decimalComma: boolean): number | null {
  let text = raw.trim();
  if (text === '') return null;
  text = text.replace(SPACES, '');
  if (decimalComma && text.includes(',') && !text.includes('.')) text = text.replace(',', '.');
  if (!NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function isBooleanWord(raw: string): boolean {
  const word = raw.trim().toLowerCase();
  return TRUE_WORDS.has(word) || FALSE_WORDS.has(word);
}

export function isTruthy(raw: string): boolean {
  return TRUE_WORDS.has(raw.trim().toLowerCase());
}

/** Ordre des composantes d'une date écrite avec des séparateurs. */
export type DateOrder = 'iso' | 'dmy' | 'mdy';

const ISO = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})([T ](\d{1,2}):(\d{2})(:(\d{2}))?)?/;
const SLASHED = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})([T ](\d{1,2}):(\d{2})(:(\d{2}))?)?/;

function toEpoch(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Rejette les dates qui « débordent » — le 31 février deviendrait le 3 mars.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

export function parseDate(raw: string, order: DateOrder): number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (order === 'iso') {
    const match = ISO.exec(text);
    if (!match) return null;
    return toEpoch(+match[1], +match[2], +match[3], +(match[5] ?? 0), +(match[6] ?? 0), +(match[8] ?? 0));
  }
  const match = SLASHED.exec(text);
  if (!match) return null;
  const first = +match[1];
  const second = +match[2];
  const [day, month] = order === 'dmy' ? [first, second] : [second, first];
  return toEpoch(+match[3], month, day, +(match[5] ?? 0), +(match[6] ?? 0), +(match[8] ?? 0));
}

/**
 * Détermine, pour une colonne entière, comment lire ses dates — ou null si ce
 * n'en sont pas.
 *
 * L'ambiguïté entre jour/mois et mois/jour ne se tranche pas valeur par valeur :
 * `03/04/2026` est lisible des deux façons. Elle se tranche sur la colonne, en
 * cherchant une valeur dont une composante dépasse 12. Faute d'indice, on retient
 * l'ordre jour/mois, majoritaire hors des États-Unis.
 */
export function detectDateOrder(values: string[]): DateOrder | null {
  if (values.length === 0) return null;
  if (values.every((value) => parseDate(value, 'iso') !== null)) return 'iso';

  let firstOverTwelve = false;
  let secondOverTwelve = false;
  for (const value of values) {
    const match = SLASHED.exec(value.trim());
    if (!match) return null;
    if (+match[1] > 12) firstOverTwelve = true;
    if (+match[2] > 12) secondOverTwelve = true;
  }
  // Les deux composantes dépassent 12 : ce ne sont pas des dates.
  if (firstOverTwelve && secondOverTwelve) return null;
  const order: DateOrder = secondOverTwelve ? 'mdy' : 'dmy';
  return values.every((value) => parseDate(value, order) !== null) ? order : null;
}

function hasNoInnerSpace(value: string): boolean {
  return !/\s/.test(value.trim());
}

/** Toutes les valeurs s'écrivent avec le même nombre de chiffres. */
function hasConstantWidth(values: string[]): boolean {
  const width = values[0].trim().replace(/^[+-]/, '').length;
  return values.every((value) => value.trim().replace(/^[+-]/, '').length === width);
}

export interface Verdict {
  type: ColumnType;
  /** Renseigné pour une colonne date, pour relire les valeurs de la même façon. */
  dateOrder?: DateOrder;
}

/**
 * Décide du type d'une colonne à partir de ses valeurs distinctes.
 *
 * L'ordre des essais n'est pas indifférent : booléen avant numérique, sans quoi
 * une colonne de 0 et de 1 passerait pour une mesure ; identifiant après
 * numérique, pour ne réclamer ce statut qu'aux entiers.
 */
export function decideType(values: string[], present: number, decimalComma: boolean, name = ''): Verdict {
  if (present === 0 || values.length === 0) return { type: 'text' };

  if (values.length <= 2 && values.every(isBooleanWord)) return { type: 'boolean' };

  const allDistinct = values.length === present && present >= MIN_ROWS_FOR_ID;

  const numbers = values.map((value) => parseNumber(value, decimalComma));
  if (numbers.every((value) => value !== null)) {
    const allIntegers = (numbers as number[]).every((value) => Number.isInteger(value));
    // Des entiers tous distincts ne suffisent pas : une mesure fine en produit
    // aussi. Il faut un second indice — une largeur constante, marque des
    // numérotations, ou un nom qui annonce la couleur.
    if (allIntegers && allDistinct && (ID_NAME.test(name) || hasConstantWidth(values))) {
      return { type: 'id' };
    }
    return { type: 'numeric' };
  }

  const dateOrder = detectDateOrder(values);
  if (dateOrder) return { type: 'date', dateOrder };

  // Du texte tout distinct n'est pas forcément une référence : un commentaire
  // libre l'est aussi. Une référence ne contient pas d'espace, et se reconnaît
  // à sa régularité ou à son nom.
  if (allDistinct && values.every(hasNoInnerSpace) && (ID_NAME.test(name) || hasConstantWidth(values))) {
    return { type: 'id' };
  }
  if (values.length <= MAX_CATEGORIES) return { type: 'categorical' };
  return { type: 'text' };
}
