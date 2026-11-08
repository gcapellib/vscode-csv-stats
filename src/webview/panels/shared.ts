import { elements, textSpan } from '../dom';
import { icon, type IconName } from '../icons';
import { palette } from '../state';
import { quickTip } from '../tooltip';

/**
 * Le liseré du panneau flottant : l'accent de la colonne dont il parle — filtre,
 * Column details — comme le menu de cette colonne ; sans colonne (Dataset,
 * Clean), celui de la première, posé par paint.ts. À appeler à chaque ouverture,
 * sans quoi un panneau garde la couleur du précédent.
 */
export function tintPanel(columnIndex: number | null): void {
  const accent = columnIndex === null ? '' : palette(columnIndex).accent;
  elements.picker.style.borderTopColor = accent;
  // Sans colonne (Dataset, Clean) : le titre prend le dégradé de l'en-tête.
  elements.picker.classList.toggle('file-panel', columnIndex === null);
  // Les titres de section reprennent la couleur de la colonne : on ne s'y perd pas.
  if (accent) elements.picker.style.setProperty('--column-accent', accent);
  else elements.picker.style.removeProperty('--column-accent');
}

export function panelTitle(title: string, subtitle: string, columnIndex: number | null = null): HTMLElement {
  const wrapper = document.createElement('div');
  const main = document.createElement('div');
  main.className = 'picker-title';
  main.textContent = title;
  if (columnIndex !== null) main.style.color = palette(columnIndex).accent;
  const sub = document.createElement('div');
  sub.className = 'picker-note';
  sub.textContent = subtitle;
  wrapper.append(main);
  if (subtitle) wrapper.append(sub);
  return wrapper;
}

/**
 * Un titre de section : en gras, à gauche, avec une petite icône comme les entrées du menu
 * d'une colonne, et si besoin un bouton à son extrémité droite.
 */
export function sectionTitle(text: string, glyph?: IconName, action?: { label: string; glyph: IconName; onClick: () => void; tip: string }): HTMLElement {
  const element = document.createElement('div');
  element.className = 'section-title';
  if (glyph) element.appendChild(icon(glyph, 14));
  // Le texte dans son propre élément : un dégradé posé dessus couvre le mot, pas
  // toute la largeur du panneau.
  element.appendChild(Object.assign(document.createElement('span'), { textContent: text }));
  if (action) {
    const button = document.createElement('button');
    button.className = 'picker-button title-action';
    button.append(icon(action.glyph, 13), document.createTextNode(action.label));
    quickTip(button, action.tip);
    button.addEventListener('click', action.onClick);
    element.appendChild(button);
  }
  return element;
}

export function grid(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'detail-grid';
  return element;
}

export function addRow(target: HTMLElement, label: string, value: string): void {
  target.append(textSpan(label), Object.assign(textSpan(value), { className: 'detail-value' }));
}

export function footer(buttons: Array<[string, () => void, boolean]>): HTMLElement {
  const element = document.createElement('div');
  element.className = 'picker-footer';
  for (const [label, action, primary] of buttons) {
    const button = document.createElement('button');
    button.className = primary ? 'picker-button primary' : 'picker-button';
    button.textContent = label;
    button.addEventListener('click', action);
    element.appendChild(button);
  }
  return element;
}

/** Les sections repliables ouvertes : leur état survit à la réouverture du panneau (après une étape, par exemple). */
const openedSections = new Set<string>();

/**
 * Une section qui se déplie d'un clic, repliée par défaut : Column details est une fenêtre de coup
 * d'œil — les graphiques, les chiffres, ce qui est à vérifier —, le reste est à un clic sans
 * rallonger le panneau. Son contenu ne se construit qu'à la première ouverture.
 */
export function collapsibleSection(title: string, glyph: IconName, build: () => HTMLElement[], onToggle: () => void): HTMLElement[] {
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'section-title section-toggle';
  const chevron = Object.assign(document.createElement('span'), { className: 'section-chevron' });
  header.append(icon(glyph, 14), Object.assign(document.createElement('span'), { textContent: title }), chevron);
  const body = document.createElement('div');
  body.className = 'section-body';
  let built = false;
  const show = (visible: boolean) => {
    if (visible && !built) {
      built = true;
      body.append(...build());
    }
    body.hidden = !visible;
    chevron.textContent = visible ? '\u25BE' : '\u25B8';
    header.setAttribute('aria-expanded', String(visible));
  };
  show(openedSections.has(title));
  header.addEventListener('click', () => {
    const visible = body.hidden;
    if (visible) openedSections.add(title);
    else openedSections.delete(title);
    show(visible);
    onToggle();
  });
  return [header, body];
}
