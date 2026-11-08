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
 * Une infobulle immédiate, à la place du `title` natif : celui-ci attend près d'une
 * seconde, sans réglage possible, et c'est celui de VS Code, pas le nôtre. Elle ne
 * pose que le texte ; c'est `installTips` qui l'affiche, une seule fois pour toute la
 * page, si bien que tout ce qui est créé plus tard en profite sans rien brancher.
 * Le libellé reste lisible des lecteurs d'écran : `aria-label` pour un bouton-icône,
 * `aria-description` pour ce qui a déjà son texte.
 */
export function quickTip(element: HTMLElement, text: string): void {
  element.dataset.tip = text;
  element.removeAttribute('title');
  // Un bouton-icône (un ou deux signes) n'a que ce libellé ; le reste a déjà son texte.
  element.setAttribute((element.textContent ?? '').trim().length <= 2 ? 'aria-label' : 'aria-description', text);
}

/**
 * L'écouteur unique des infobulles. Il passe après ceux du bandeau, qui montrent le
 * résumé d'une colonne au survol : sur un élément qui a sa propre infobulle, c'est
 * donc la sienne qui reste affichée. Un `title` qui aurait échappé à `quickTip` est
 * repris ici au premier survol, avant que le navigateur n'affiche le sien.
 */
export function installTips(): void {
  const tipOf = (event: Event): HTMLElement | null => {
    const holder = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip], [title]') ?? null;
    if (holder && !holder.dataset.tip) quickTip(holder, holder.getAttribute('title') ?? '');
    return holder?.dataset.tip ? holder : null;
  };
  const show = (event: MouseEvent) => {
    const holder = tipOf(event);
    if (holder) showTooltip(event, escapeText(holder.dataset.tip ?? ''));
  };
  document.addEventListener('mouseover', show);
  document.addEventListener('mousemove', show);
  document.addEventListener('mouseout', (event) => {
    const holder = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip]');
    if (holder && !holder.contains(event.relatedTarget as Node | null)) hideTooltip();
  });
  document.addEventListener('mousedown', hideTooltip);
}
