import { type ColumnStats } from '../core/stats';
import { type ColumnType } from '../core/types';
import { paletteFor, THEMES, themeById, type Palette } from '../core/themes';
import { type Filter } from '../core/filters';
import { type Step } from '../core/steps';

/**
 * L'état de la vue, partagé par tous les modules du webview.
 *
 * Un seul objet mutable plutôt qu'un store avec réducteurs : le projet est
 * encore petit, et un store générique n'aurait de sens qu'une fois cet objet
 * vraiment mis à l'épreuve par plusieurs contributeurs. Voir REFACTOR-PLAN.md.
 */
export interface State {
  headers: string[];
  /** Le fichier tel qu'il a été lu. Jamais modifié : les étapes se rejouent dessus. */
  original: string[][];
  originalLines: number[];
  /** Les étapes de nettoyage, dans l'ordre ; voir core/steps.ts. */
  steps: Step[];
  /** Ce que chaque étape a touché, au dernier passage. */
  effects: number[];
  /** Pour chaque ligne affichée, l'index de sa ligne d'origine. */
  source: number[];
  /** Les lignes après les étapes : ce que montrent le tableau et les bandeaux. */
  rows: string[][];
  /** Numéro de ligne du fichier de chaque ligne, comme dans la vue Raw ; voir lineOf. */
  lines: number[];
  stats: ColumnStats[];
  delimiter: string;
  rowCount: number;
  /** Index de colonne du modèle, dans l'ordre d'affichage ; « Drop » en retire. */
  order: number[];
  widths: number[];
  /**
   * Largeurs choisies à la main, par index du modèle. Elles priment sur le
   * calcul automatique, qui se refait pourtant — au repli du bandeau par
   * exemple : sans cette mémoire, le geste serait défait sans prévenir.
   */
  manualWidths: Map<number, number>;
  sort: { index: number; ascending: boolean } | null;
  filters: Filter[];
  /** Types imposés depuis le menu, à réappliquer après chaque recalcul. */
  forcedTypes: Map<number, ColumnType>;
  /** Lignes retenues après filtre et tri, par index de modèle. */
  view: number[];
  bandVisible: boolean;
  fileName: string;
  /**
   * Lignes sélectionnées, par index du modèle et non de l'affichage : la
   * sélection survit ainsi au tri comme au filtrage.
   */
  selected: Set<number>;
  /** Cellule cliquée en dernier : la ligne se teinte, celle-ci s'encadre. */
  active: { row: number; column: number } | null;
  /** Colonne marquée par un clic sur son en-tête : toutes ses cellules se teintent. */
  selectedColumn: number | null;
  themeId: string;
  ready: boolean;
  /** Texte brut du fichier, demandé une seule fois au premier clic sur « Raw ». */
  rawLines: string[] | null;
  rawLoading: boolean;
  showRaw: boolean;
}

export const state: State = {
  headers: [],
  original: [],
  originalLines: [],
  steps: [],
  effects: [],
  source: [],
  rows: [],
  lines: [],
  stats: [],
  delimiter: ',',
  rowCount: 0,
  order: [],
  widths: [],
  manualWidths: new Map(),
  sort: null,
  filters: [],
  forcedTypes: new Map(),
  view: [],
  bandVisible: true,
  fileName: '',
  selected: new Set<number>(),
  active: null,
  selectedColumn: null,
  themeId: THEMES[0].id,
  ready: false,
  rawLines: null,
  rawLoading: false,
  showRaw: false,
};

export function isDark(): boolean {
  const classes = document.body.classList;
  return classes.contains('vscode-dark') || classes.contains('vscode-high-contrast');
}

export function palette(modelIndex: number): Palette {
  return paletteFor(themeById(state.themeId), modelIndex, isDark());
}
