/**
 * Reconnaissance du type d'une colonne.
 *
 * Deux types, et deux seulement. Un CSV n'en porte aucun — tout y est du texte —
 * si bien que toute typologie est une inférence. On s'en tient donc à celle qui
 * ne s'invente rien : une colonne dont chaque valeur renseignée se lit comme un
 * nombre est numérique, tout le reste est du texte.
 *
 * Le verdict se prend sur les **valeurs distinctes**, pas sur toutes les lignes :
 * un fichier de cent mille lignes n'a souvent que quelques centaines de valeurs
 * différentes, et l'essai coûte alors cent fois moins cher.
 */

export type ColumnType = 'numeric' | 'text';

/** En deçà, « toutes les valeurs sont distinctes » ne veut rien dire. */
export const MIN_ROWS_FOR_DISTINCT_NOTE = 20;

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

/**
 * Noms de colonnes qui désignent un identifiant : un numéro de téléphone ou un
 * code postal ne se compare pas, ne se somme pas, et une plage « de 62909 à
 * 999625132 » n'a aucun sens. Mots entiers seulement, pour ne pas prendre
 * « interval » pour « tel ».
 */
const IDENTIFIER_NAME = /(^|[^a-z])(tel|telephone|téléphone|phone|mobile|portable|fax|zip|zipcode|postal|postcode|cp|siret|siren|iban|ssn)([^a-z]|$)/i;

/** « 0612345678 », « 06000 » : un zéro initial devant un autre chiffre n'est pas un nombre. */
const LEADING_ZERO = /^0\d/;

export function looksLikeIdentifier(name: string, values: string[]): boolean {
  return IDENTIFIER_NAME.test(name) || values.some((value) => LEADING_ZERO.test(value.trim()));
}

export function decideType(values: string[], present: number, decimalComma: boolean, name = ''): ColumnType {
  if (present === 0 || values.length === 0) return 'text';
  if (looksLikeIdentifier(name, values)) return 'text';
  return values.every((value) => parseNumber(value, decimalComma) !== null) ? 'numeric' : 'text';
}
