import { applyDrop } from './actions';
import { COLUMN_TYPES, TYPE_LABELS } from './constants';
import { elements } from './dom';
import { floating, positionFloating } from './floating-setup';
import { openDetails } from './panels/column-details';
import { openRangePicker } from './panels/range-picker';
import { openValuePicker } from './panels/value-picker';
import { state } from './state';
import { applySort } from './table';
import { vscode } from './vscode-api';
import { applyFilter, applyRename } from './actions';

/**
 * Toutes ces actions sont des actions de vue : le fichier n'est jamais réécrit.
 * Renommer, retirer ou retyper une colonne change ce qui est affiché, et rouvrir
 * l'onglet rend l'état d'origine.
 */
/** Colonne dont le menu « ⋯ » est ouvert, pour que son bouton le referme. */
let menuColumn: number | null = null;

export function openMenu(modelIndex: number, anchor: HTMLElement): void {
  if (floating.isOpen('menu') && menuColumn === modelIndex) {
    floating.close();
    return;
  }
  menuColumn = modelIndex;
  const column = state.stats[modelIndex];
  type Entry = [string, () => void] | 'separator' | { heading: string };
  const entries: Entry[] = [
    ['Column details…', () => openDetails(modelIndex, anchor)],
    'separator',
    ['Sort ascending', () => applySort(modelIndex, true)],
    ['Sort descending', () => applySort(modelIndex, false)],
    [
      column.type === 'numeric' ? 'Filter by range…' : 'Filter by value…',
      () => (column.type === 'numeric' ? openRangePicker(modelIndex, anchor) : openValuePicker(modelIndex, anchor)),
    ],
    ['Filter by text…', () => void applyFilter(modelIndex)],
    'separator',
    ['Rename column', () => void applyRename(modelIndex)],
    ['Drop column', () => applyDrop(modelIndex)],
    'separator',
    { heading: 'Read this column as' },
    ...COLUMN_TYPES.map(
      (type): Entry => [
        // La coche dit ce que la colonne est aujourd'hui, détecté ou forcé.
        `${type === column.type ? '\u2713' : '\u2007'}  ${TYPE_LABELS[type]}`,
        () => vscode.postMessage({ type: 'changeType', index: modelIndex, forced: type }),
      ],
    ),
  ];

  elements.menu.textContent = '';
  for (const entry of entries) {
    if (entry === 'separator') {
      elements.menu.appendChild(document.createElement('hr'));
      continue;
    }
    if ('heading' in entry) {
      const heading = document.createElement('div');
      heading.className = 'menu-heading';
      heading.textContent = entry.heading;
      elements.menu.appendChild(heading);
      continue;
    }
    const [label, action] = entry;
    const item = document.createElement('button');
    item.className = 'menu-item';
    item.textContent = label;
    item.addEventListener('click', () => {
      closeMenu();
      action();
    });
    elements.menu.appendChild(item);
  }

  floating.open('menu', anchor);
  positionFloating(elements.menu, anchor);
}

export function closeMenu(): void {
  floating.close();
}

/** Appelé quand le menu se ferme, quel que soit le chemin (voir floating.ts). */
export function resetMenuColumn(): void {
  menuColumn = null;
}
