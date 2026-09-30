import { type Filter } from '../core/filters';
import { floating } from './floating-setup';
import { paint } from './paint';
import { state } from './state';
import { rebuildView, recomputeStats } from './table';
import { paintFilterBar } from './toolbar';
import { ask } from './prompt';

/**
 * Ce que le panneau montre en ce moment.
 *
 * Le panneau est partagé entre Dataset, Column details et le sélecteur de
 * valeurs : sans cette distinction, un second clic sur « Dataset » ne saurait
 * pas s'il doit refermer son propre panneau ou basculer depuis un autre.
 * L'ouverture, la fermeture et le clic extérieur, eux, sont délégués à
 * `floating` — voir son enregistrement plus haut.
 */
let openPanel: string | null = null;

/** Lecture seule depuis les autres modules : une liaison importée ne s'assigne pas. */
export function getOpenPanel(): string | null {
  return openPanel;
}

export function setOpenPanel(id: string | null): void {
  openPanel = id;
}

export function closePicker(): void {
  floating.close();
}

/** Applique une condition, ou la retire si elle est déjà posée. */
export function toggleFilter(filter: Filter): void {
  const same = state.filters.findIndex(
    (existing) => existing.column === filter.column && existing.label === filter.label,
  );
  if (same >= 0) state.filters.splice(same, 1);
  else state.filters.push(filter);
  refilter();
}

export function clearFilters(): void {
  state.filters = [];
  refilter();
}

export function refilter(): void {
  rebuildView();
  // Le recalcul n'a lieu qu'ici : le mettre dans rebuildView le déclencherait à
  // chaque paquet de lignes reçu, soit cinq fois pour rien sur un gros fichier.
  recomputeStats(state.view);
  // Surtout pas de measureWidths() ici. La largeur d'une colonne tient compte du
  // texte « Min … Max … » que son bandeau doit loger ; ces chiffres changent
  // avec le filtre, et toute la feuille se decalait alors horizontalement a
  // chaque clic. Une largeur est une propriete du fichier, decidee a
  // l'ouverture.
  paintFilterBar();
  paint();
}

export function applyDrop(modelIndex: number): void {
  state.order = state.order.filter((index) => index !== modelIndex);
  paint();
}

export async function applyFilter(modelIndex: number): Promise<void> {
  const column = state.stats[modelIndex];
  const existing = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'contains' }> =>
      filter.kind === 'contains' && filter.column === modelIndex,
  );
  const entered = await ask('Filter Column', `Keep rows where « ${column.name} » contains:`, existing?.text ?? '');
  if (entered === null) return;
  state.filters = state.filters.filter((filter) => filter !== existing);
  if (entered !== '') {
    state.filters.push({
      kind: 'contains',
      column: modelIndex,
      text: entered.toLowerCase(),
      label: `${column.name} contains « ${entered} »`,
    });
  }
  refilter();
}

export async function applyRename(modelIndex: number): Promise<void> {
  const column = state.stats[modelIndex];
  const entered = await ask('Rename Column', 'New name for this column:', column.name);
  if (entered === null || entered.trim() === '') return;
  column.name = entered.trim();
  paint();
}
