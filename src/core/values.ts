/**
 * Lire et réécrire la valeur d'une cellule selon le type de sa colonne.
 *
 * Nombres, dates et heures se ramènent tous à un nombre — les dates en
 * millisecondes — pour partager histogramme, bornes, tri et filtres. Ces deux
 * fonctions sont le seul endroit où la différence se voit.
 */
import { num } from './format';
import { formatTemporal, parseTemporal, type TemporalFormat } from './temporal';
import { parseNumber, type ColumnType } from './types';

export interface TypedColumn {
  type: ColumnType;
  temporal: TemporalFormat | null;
}

/** La lecture d'une cellule en nombre ; toujours null pour une colonne texte. */
export function valueParser(column: TypedColumn, decimalComma: boolean): (raw: string) => number | null {
  if (column.type === 'numeric') return (raw) => parseNumber(raw, decimalComma);
  const temporal = column.temporal;
  if (temporal) return (raw) => parseTemporal(raw, temporal.order);
  return () => null;
}

/** Une valeur mesurée, réécrite pour l'affichage : 1,250 ou 31/01/2015. */
export function formatValue(column: TypedColumn, value: number): string {
  return column.temporal ? formatTemporal(value, column.temporal) : num(value);
}
