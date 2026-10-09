import { RESIZE_MAX, RESIZE_MIN } from './constants';
import { paint } from './paint';
import { state } from './state';
import { fitWidths } from './table';

/**
 * Redimensionner une colonne à la main.
 *
 * La poignée occupe le bord droit de l'en-tête. Le glissé est suivi sur la
 * fenêtre entière, à la souris — VS Code est une application de bureau —
 * et non sur la poignée : l'en-tête est reconstruit à chaque repeint, si bien que la poignée sous le curseur est remplacée en plein
 * geste — des écouteurs posés sur elle se tairaient au premier mouvement.
 */
export function resizeHandle(modelIndex: number): HTMLDivElement {
  const handle = document.createElement('div');
  handle.className = 'col-resizer';
  handle.title = 'Drag to resize · double-click to widen, again to shrink to the title';
  handle.addEventListener('mousedown', (event) => startResize(event, modelIndex));
  return handle;
}

/**
 * Le double-clic bascule entre deux largeurs : élargie jusqu'à tout montrer
 * — valeurs et bandeau, au-delà du plafond du calcul automatique — puis
 * resserrée au plus juste autour du titre, ses deux boutons à côté. Une
 * colonne déjà assez large pour tout montrer se resserre au premier.
 *
 * Reconnu au second appui (event.detail), et non par l'événement dblclick :
 * celui-ci n'est émis que si les deux clics touchent le même élément, or
 * l'en-tête peut avoir été reconstruit entre les deux — le premier essai,
 * vérifié au vrai double-clic, ne réinitialisait jamais rien. Et sur un
 * mousedown, pas un pointerdown : dans Chromium, le compteur de clics d'un
 * pointerdown vaut toujours zéro.
 */
function fit(modelIndex: number): void {
  const { title, full } = fitWidths(modelIndex);
  const width = state.widths[modelIndex] < full ? full : title;
  state.widths[modelIndex] = width;
  state.manualWidths.set(modelIndex, width);
  paint();
}

function startResize(event: MouseEvent, modelIndex: number): void {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.detail >= 2) {
    fit(modelIndex);
    return;
  }
  const startX = event.clientX;
  const startWidth = state.widths[modelIndex];
  let frame = 0;
  let moved = false;
  document.body.classList.add('resizing');

  const move = (pointer: MouseEvent) => {
    moved = true;
    const width = Math.round(Math.min(RESIZE_MAX, Math.max(RESIZE_MIN, startWidth + pointer.clientX - startX)));
    state.widths[modelIndex] = width;
    state.manualWidths.set(modelIndex, width);
    // Un repeint par image au plus : un glissé émet bien plus d'événements
    // que l'écran n'affiche d'images.
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
    }
  };
  const stop = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', stop);
    document.body.classList.remove('resizing');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    // Un simple clic, sans glissé, ne repeint rien : repeindre remplacerait
    // la poignée sous le curseur entre les deux clics d'un double-clic.
    if (moved) paint();
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);
}
