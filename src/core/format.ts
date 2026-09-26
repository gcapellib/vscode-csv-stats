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
