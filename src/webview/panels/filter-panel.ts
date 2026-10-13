import { type CellFilter } from '../../core/filters';
import { setOpenPanel } from '../actions';
import { elements } from '../dom';
import { floating, positionFloating } from '../floating-setup';
import { state } from '../state';
import { renderNumberTab } from './number-tab';
import { renderTextTab } from './text-tab';
import { renderValuesTab } from './value-picker';

type Tab = 'values' | 'text' | 'number';

/** Au-delà, une liste à cocher ne sert plus à rien : on propose d'abord une condition. */
const LIST_MAX_DISTINCT = 200;

/**
 * Le panneau de filtre d'une colonne, au même endroit quel que soit son type.
 *
 * Une colonne numérique n'a qu'un onglet, « Number ». Une colonne texte en a
 * deux : « Values » (la liste à cocher) et « Text » (contient, commence par…).
 * Celui qui s'ouvre d'abord dépend de la condition déjà posée, sinon du nombre
 * de valeurs distinctes : cocher une valeur parmi deux mille n'a aucun sens.
 */
export function openFilterPanel(columnIndex: number, anchor: HTMLElement, preferred?: Tab): void {
  const column = state.stats[columnIndex];
  const numeric = column?.type === 'numeric';
  const tabs: Tab[] = numeric ? ['number'] : ['values', 'text'];
  const existing = state.filters.find(
    (filter): filter is CellFilter => filter.kind !== 'duplicates' && filter.kind !== 'distinct' && filter.column === columnIndex,
  );
  const fallback: Tab = numeric
    ? 'number'
    : existing?.kind === 'text'
      ? 'text'
      : existing?.kind === 'values'
        ? 'values'
        : (column?.distinct ?? 0) <= LIST_MAX_DISTINCT
          ? 'values'
          : 'text';
  let active: Tab = preferred && tabs.includes(preferred) ? preferred : fallback;

  const panel = elements.picker;
  const render = (): HTMLElement => {
    panel.textContent = '';
    const title = document.createElement('div');
    title.className = 'picker-title';
    title.textContent = column?.name ?? '';
    panel.appendChild(title);

    if (tabs.length > 1) {
      const bar = document.createElement('div');
      bar.className = 'picker-tabs';
      for (const tab of tabs) {
        const button = document.createElement('button');
        button.className = tab === active ? 'picker-tab on' : 'picker-tab';
        button.textContent = tab === 'values' ? 'Values' : 'Text';
        button.addEventListener('click', () => {
          active = tab;
          const target = render();
          positionFloating(panel, anchor);
          target.focus({ preventScroll: true });
        });
        bar.appendChild(button);
      }
      panel.appendChild(bar);
    }

    if (active === 'values') return renderValuesTab(panel, columnIndex);
    if (active === 'text') return renderTextTab(panel, columnIndex);
    return renderNumberTab(panel, columnIndex);
  };

  const target = render();
  floating.open('picker', anchor);
  positionFloating(panel, anchor);
  setOpenPanel(`filter:${columnIndex}`);
  // Le focus vient après l'ouverture, sans défilement : donné à un champ d'un
  // panneau encore masqué, il faisait défiler le tableau, et ce défilement
  // refermait aussitôt le panneau.
  target.focus({ preventScroll: true });
}
