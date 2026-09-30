import { FloatingManager } from './floating';

/**
 * Un seul registre pour le menu, le sélecteur de thème et le panneau — voir
 * webview/floating.ts pour la raison d'être de cette unification.
 *
 * L'instance vit ici plutôt que dans main.ts pour que chaque zone puisse
 * l'utiliser sans dépendre du point d'entrée. Les `register()`, eux, restent
 * dans main.ts : leurs `onClose` touchent à plusieurs zones à la fois, ce qui
 * en fait du câblage, pas de la mécanique.
 */
export const floating = new FloatingManager();

/** Positionne un élément flottant sous son ancre, sans déborder de la fenêtre. */
export function positionFloating(panel: HTMLElement, anchor: HTMLElement): void {
  // Mesurer un élément encore « hidden » renvoie une taille nulle, et le
  // panneau se calait hors écran. On le rend donc invisible mais présent, le
  // temps de connaître ses dimensions réelles.
  panel.style.visibility = 'hidden';
  panel.hidden = false;
  const box = anchor.getBoundingClientRect();
  const size = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - size.width - 8))}px`;
  panel.style.top = `${Math.max(4, Math.min(box.bottom + 2, window.innerHeight - size.height - 8))}px`;
  panel.style.visibility = 'visible';
}
