/**
 * Mise en forme des nombres affichés dans les bandeaux.
 *
 * Convention anglaise, comme le reste de l'interface : séparateur de milliers par
 * virgule et point décimal, quelles que soient les conventions du fichier lu — le
 * tableau, lui, montre les cellules telles qu'elles sont écrites.
 */

const INTEGERS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const DECIMALS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function count(value: number): string {
  return INTEGERS.format(value);
}

export function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function num(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return INTEGERS.format(value);
  const magnitude = Math.abs(value);
  if (magnitude >= 1e7 || (value !== 0 && magnitude < 1e-4)) return value.toExponential(3);
  return DECIMALS.format(value);
}

/**
 * Une date, en ISO. L'heure n'apparaît que si elle porte une information : une
 * colonne de dates pures n'a pas à traîner des « 00:00 » partout.
 */
export function date(epochMs: number): string {
  const value = new Date(epochMs);
  const day = value.toISOString().slice(0, 10);
  const hasTime = value.getUTCHours() || value.getUTCMinutes() || value.getUTCSeconds();
  return hasTime ? `${day} ${value.toISOString().slice(11, 16)}` : day;
}

/** Une borne de colonne, lue selon son type. */
export function bound(value: number, type: string): string {
  return type === 'date' ? date(value) : num(value);
}
