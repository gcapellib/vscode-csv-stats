import { type ColumnStats } from '../core/stats';
import { type ColumnType } from '../core/types';
import { paletteFor, THEMES, themeById, type Palette } from '../core/themes';
import { type Filter } from '../core/filters';

/**
 * L'état de la vue, partagé par tous les modules du webview.
 *
 * Un seul objet mutable plutôt qu'un store avec réducteurs : le projet est
 * encore petit, et un store générique n'aurait de sens qu'une fois cet objet
 * vraiment mis à l'épreuve par plusieurs contributeurs. Voir REFACTOR-PLAN.md.
 */
export interface State {
  headers: string[];
  rows: string[][];
  stats: ColumnStats[];
  delimiter: string;
  rowCount: number;
  /** Index de colonne du modèle, dans l'ordre d'affichage ; « Drop » en retire. */
  order: number[];
  widths: number[];
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
  themeId: string;
  ready: boolean;
  /** Texte brut du fichier, demandé une seule fois au premier clic sur « Raw ». */
  rawLines: string[] | null;
  rawLoading: boolean;
  showRaw: boolean;
}

export const state: State = {
  headers: [],
  rows: [],
  stats: [],
  delimiter: ',',
  rowCount: 0,
  order: [],
  widths: [],
  sort: null,
  filters: [],
  forcedTypes: new Map(),
  view: [],
  bandVisible: true,
  fileName: '',
  selected: new Set<number>(),
  active: null,
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
