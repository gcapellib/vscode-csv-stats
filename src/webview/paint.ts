import { elements } from './dom';
import { palette, state } from './state';
import { paintBand } from './band';
import { gutterWidth, paintHead, paintRows, totalWidth } from './table';
import { paintFilterBar } from './toolbar';

/**
 * Le repeint complet de la feuille.
 *
 * Dans son propre module plutôt que dans main.ts : presque toutes les zones
 * l'appellent après avoir changé l'état, et le faire dépendre du point
 * d'entrée les ferait toutes dépendre de lui.
 */
/**
 * Les deux barres du haut — boutons et filtres — couvrent exactement les
 * colonnes : elles commencent au bord de la première, après la gouttière des
 * numéros de ligne, et finissent au bord de la dernière, ou à celui de la
 * fenêtre quand les colonnes dépassent. Pleine largeur, elles montraient leur
 * coin arrondi — celui du webview — au-dessus d'une gouttière sombre, comme un
 * corps étranger à côté du tableau.
 */
/** La largeur sous laquelle la barre d'outils ne descend pas, quel que soit le nombre de colonnes. */
const MIN_BAR = 560;

export function alignBars(): void {
  if (!state.ready) return;
  const scroller = elements.scroller;
  const scrollbar = scroller.offsetWidth - scroller.clientWidth;
  // Un plancher : avec une ou deux colonnes, la barre ne se réduit pas à leur
  // largeur — ses boutons n'y tiendraient plus.
  const left = gutterWidth();
  const room = Math.max(0, scroller.clientWidth - left - MIN_BAR);
  const spare = Math.min(Math.max(0, scroller.clientWidth - totalWidth()), room);
  const root = document.documentElement.style;
  root.setProperty('--bar-left', `${left}px`);
  root.setProperty('--bar-right', `${spare + scrollbar}px`);
}

window.addEventListener('resize', alignBars);

export function paint(): void {
  if (!state.ready) return;
  // Le liseré des menus et des panneaux : l'accent de la première colonne.
  document.documentElement.style.setProperty('--float-accent', palette(state.order[0] ?? 0).accent);
  elements.sheet.style.width = `${totalWidth()}px`;
  alignBars();
  paintBand();
  paintHead();
  paintRows();
  paintFilterBar();
}
