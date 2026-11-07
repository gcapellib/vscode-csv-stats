/**
 * Dates et heures.
 *
 * Une date se lit comme un nombre : des millisecondes depuis 1970, en UTC pour
 * qu'aucun changement d'heure ne décale une valeur. Tout ce qui sert déjà aux
 * nombres — histogramme, bornes, médiane, tri, filtres — s'applique alors tel
 * quel ; seuls la lecture et l'affichage changent.
 *
 * Trois écritures, et seulement celles qui ne laissent pas de doute :
 * - `ymd` : 2015-01-31, 2015/01/31, avec ou sans heure — l'année en tête ne se
 *   confond avec rien ;
 * - `dmy` : 31/01/2015, 31.01.2015, 31-01-2015 — retenue seulement si une valeur
 *   au moins tranche (un jour au-delà de 12). Sur 01/02/2015 seul, rien ne dit
 *   si c'est le 1er février ou le 2 janvier : la colonne reste du texte, et le
 *   menu permet de la lire en date ;
 * - `time` : 12:52, 12:52:01, sans date — une durée depuis minuit.
 *
 * L'écriture américaine 01/31/2015 n'est pas reconnue : la lire supposerait de
 * parier entre elle et la française sur toutes les dates ambiguës.
 */

export type TemporalOrder = 'ymd' | 'dmy' | 'time';

export interface TemporalFormat {
  order: TemporalOrder;
  /** Vrai si au moins une valeur porte une heure : l'affichage la montre alors. */
  withTime: boolean;
}

const CLOCK = String.raw`(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?`;
const YMD = new RegExp(String.raw`^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[T ]${CLOCK})?$`);
const DMY = new RegExp(String.raw`^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?:[ T]${CLOCK})?$`);
const TIME = new RegExp(`^${CLOCK}$`);
const HAS_CLOCK = /\d:\d{2}/;
const DAY_MS = 86_400_000;

/** Millisecondes depuis minuit, ou null pour une heure impossible (25:00, 12:61). */
function clock(hours?: string, minutes?: string, seconds?: string, fraction?: string): number | null {
  if (hours === undefined) return 0;
  const h = Number(hours);
  const m = Number(minutes);
  const s = seconds === undefined ? 0 : Number(seconds);
  if (h > 23 || m > 59 || s > 59) return null;
  const ms = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, '0'));
  return ((h * 60 + m) * 60 + s) * 1000 + ms;
}

/** Le jour en millisecondes UTC, ou null pour une date impossible (31/02, mois 13). */
function calendar(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? ms : null;
}

/** Lit une cellule selon l'écriture de sa colonne, ou renvoie null. */
export function parseTemporal(raw: string, order: TemporalOrder): number | null {
  const text = raw.trim();
  if (order === 'time') {
    const match = TIME.exec(text);
    return match ? clock(match[1], match[2], match[3], match[4]) : null;
  }
  const match = (order === 'ymd' ? YMD : DMY).exec(text);
  if (!match) return null;
  const [year, month, day] =
    order === 'ymd'
      ? [Number(match[1]), Number(match[3]), Number(match[4])]
      : [Number(match[4]), Number(match[3]), Number(match[1])];
  const date = calendar(year, month, day);
  const time = clock(match[5], match[6], match[7], match[8]);
  return date === null || time === null ? null : date + time;
}

/**
 * L'écriture commune à toutes les valeurs, ou null s'il n'y en a pas — ou si
 * l'écriture jour/mois/an n'est jamais tranchée.
 */
export function detectTemporal(values: string[]): TemporalFormat | null {
  if (values.length === 0) return null;
  const withTime = values.some((value) => HAS_CLOCK.test(value));
  for (const order of ['ymd', 'time'] as const) {
    if (values.every((value) => parseTemporal(value, order) !== null)) {
      return { order, withTime: order === 'time' || withTime };
    }
  }
  let decisive = false;
  for (const value of values) {
    if (parseTemporal(value, 'dmy') === null) return null;
    if (Number(DMY.exec(value.trim())?.[1]) > 12) decisive = true;
  }
  return decisive ? { order: 'dmy', withTime } : null;
}

/**
 * L'écriture d'une colonne lue en date ou en heure, même sans détection nette :
 * sous un filtre qui ne garde que des jours ≤ 12, ou quand le type est forcé
 * depuis le menu. On prend l'écriture qui lit le plus de valeurs.
 */
export function temporalFormatFor(values: string[], kind: 'date' | 'time'): TemporalFormat {
  if (kind === 'time') return { order: 'time', withTime: true };
  const strict = detectTemporal(values);
  if (strict && strict.order !== 'time') return strict;
  const readable = (order: TemporalOrder) => values.filter((value) => parseTemporal(value, order) !== null).length;
  return {
    order: readable('dmy') > readable('ymd') ? 'dmy' : 'ymd',
    withTime: values.some((value) => HAS_CLOCK.test(value)),
  };
}

const two = (value: number) => String(value).padStart(2, '0');

function clockText(ms: number): string {
  const inDay = ((ms % DAY_MS) + DAY_MS) % DAY_MS;
  const seconds = Math.floor(inDay / 1000);
  const text = `${two(Math.floor(seconds / 3600))}:${two(Math.floor(seconds / 60) % 60)}`;
  return seconds % 60 === 0 ? text : `${text}:${two(seconds % 60)}`;
}

/** Réécrit une valeur dans la convention du fichier : 31/01/2015 reste 31/01/2015. */
export function formatTemporal(ms: number, format: TemporalFormat): string {
  if (format.order === 'time') {
    const seconds = Math.floor((((ms % DAY_MS) + DAY_MS) % DAY_MS) / 1000);
    return `${two(Math.floor(seconds / 3600))}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`;
  }
  const date = new Date(ms);
  const [y, m, d] = [date.getUTCFullYear(), two(date.getUTCMonth() + 1), two(date.getUTCDate())];
  const day = format.order === 'ymd' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
  return format.withTime ? `${day} ${clockText(ms)}` : day;
}

/**
 * La valeur en littéral pandas : `pd.Timestamp("2015-01-31")` pour une date,
 * `pd.Timedelta("12:52:01")` pour une heure seule, que le code généré lit
 * comme une durée depuis minuit.
 */
export function pandasTemporal(ms: number, format: TemporalFormat): string {
  if (format.order === 'time') return `pd.Timedelta(${JSON.stringify(formatTemporal(ms, format))})`;
  const iso = new Date(ms).toISOString();
  const midnight = ms % DAY_MS === 0;
  const text = midnight ? iso.slice(0, 10) : iso.endsWith('.000Z') ? iso.slice(0, 19).replace('T', ' ') : iso.slice(0, 23).replace('T', ' ');
  return `pd.Timestamp(${JSON.stringify(text)})`;
}

/**
 * Lit une date tapée dans un filtre : d'abord dans l'écriture de la colonne,
 * puis en ISO, toujours sans ambiguïté.
 */
export function parseTyped(text: string, format: TemporalFormat): number | null {
  return parseTemporal(text, format.order) ?? (format.order === 'time' ? null : parseTemporal(text, 'ymd'));
}
