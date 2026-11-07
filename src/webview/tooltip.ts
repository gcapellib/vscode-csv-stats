import { elements } from './dom';

export function showTooltip(event: MouseEvent, html: string): void {
  elements.tooltip.innerHTML = html;
  elements.tooltip.hidden = false;
  const bounds = elements.tooltip.getBoundingClientRect();
  const x = Math.min(event.clientX + 12, window.innerWidth - bounds.width - 8);
  const y = Math.min(event.clientY + 16, window.innerHeight - bounds.height - 8);
  elements.tooltip.style.left = `${Math.max(4, x)}px`;
  elements.tooltip.style.top = `${Math.max(4, y)}px`;
}

export function hideTooltip(): void {
  elements.tooltip.hidden = true;
}

function escapeText(text: string): string {
  return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
}

/**
 * Une infobulle immédiate sur un bouton, à la place du `title` natif : celui-ci
 * attend près d'une seconde, sans réglage possible, et les boutons d'en-tête —
 * filtre, tri, balai — ne disaient ce qu'ils font qu'à qui patientait. Le
 * libellé reste lisible des lecteurs d'écran par `aria-label`.
 */
export function quickTip(element: HTMLElement, text: string): void {
  element.setAttribute('aria-label', text);
  element.dataset.tip = text;
  element.removeAttribute('title');
  if (element.dataset.tipBound) return;
  element.dataset.tipBound = '1';
  const show = (event: MouseEvent) => {
    // Le bandeau affiche le résumé de la colonne au survol : sans cet arrêt,
    // il remplacerait aussitôt l'infobulle du bouton.
    event.stopPropagation();
    showTooltip(event, escapeText(element.dataset.tip ?? ''));
  };
  element.addEventListener('mouseenter', show);
  element.addEventListener('mousemove', show);
  element.addEventListener('mouseleave', hideTooltip);
  element.addEventListener('mousedown', hideTooltip);
}
