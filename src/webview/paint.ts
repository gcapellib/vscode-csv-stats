import { elements } from './dom';
import { state } from './state';
import { paintBand } from './band';
import { paintHead, paintRows, totalWidth } from './table';
import { paintFilterBar } from './toolbar';

/**
 * Le repeint complet de la feuille.
 *
 * Dans son propre module plutôt que dans main.ts : presque toutes les zones
 * l'appellent après avoir changé l'état, et le faire dépendre du point
 * d'entrée les ferait toutes dépendre de lui.
 */
export function paint(): void {
  if (!state.ready) return;
  elements.sheet.style.width = `${totalWidth()}px`;
  paintBand();
  paintHead();
  paintRows();
  paintFilterBar();
}
