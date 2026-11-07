import { elements, textSpan } from '../dom';
import { palette } from '../state';

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

export function sectionTitle(text: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'section-title';
  // Le texte dans son propre élément : un dégradé posé dessus couvre le mot, pas
  // toute la largeur du panneau.
  element.appendChild(Object.assign(document.createElement('span'), { textContent: text }));
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
