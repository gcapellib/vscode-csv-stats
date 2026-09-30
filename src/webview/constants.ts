import { type ColumnType } from '../core/types';

/** Les réglages chiffrés de la vue, réunis pour qu'aucun ne se perde au milieu du code. */

export const ROW_HEIGHT = 22;
/**
 * Largeur plancher, bandeau déployé : il doit rester lisible — « Distinct 196
 * (65.3%) », un palmarès avec ses pourcentages, un histogramme qui veuille dire
 * quelque chose. Replié, plus rien n'exige cette place et une colonne n'a plus
 * qu'à loger son titre et ses valeurs, d'où un plancher bien plus bas : voir le
 * plus de colonnes possible est précisément la raison de replier.
 */
export const MIN_WIDTH = 210;
export const MIN_WIDTH_FOLDED = 90;
/**
 * Place que les deux boutons de l'en-tête prennent au titre.
 *
 * Sans elle, la largeur ne couvrait que le texte et les boutons le
 * rognaient — invisible tant que le plancher de 210 px absorbait l'écart,
 * flagrant dès que replier les bandeaux le fait tomber.
 */
export const HEAD_BUTTONS = 46;
export const MAX_WIDTH = 460;
/**
 * Hauteur de l'histogramme. Le bandeau peut se replier d'un clic, donc il n'a
 * plus à être avare de sa place : un graphique lisible vaut mieux qu'un
 * graphique qui tient.
 */
export const HIST_HEIGHT = 84;
export const WIDTH_SAMPLE_ROWS = 60;
export const OVERSCAN = 8;

export const COLUMN_TYPES: ColumnType[] = ['numeric', 'text'];

export const TYPE_LABELS: Record<ColumnType, string> = { numeric: 'Numeric', text: 'Text' };

/**
 * Durée du pliage du bandeau **et** du glissement des colonnes.
 *
 * Une seule constante pour les deux : ils décrivent un même geste, et deux
 * valeurs même voisines se verraient — l'une des deux moitiés de l'écran
 * finirait avant l'autre. Les désynchroniser demanderait donc de le vouloir.
 */
export const FOLD_MS = 90;
