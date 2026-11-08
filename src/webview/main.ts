/**
 * Le point d'entrée de la vue : câblage, et rien d'autre.
 *
 * Chaque zone vit dans son propre module — bandeau, tableau, vue brute, menu,
 * panneaux, barre d'outils, sélecteur de palettes. Ce fichier se contente de
 * les relier : recevoir les messages de l'hôte, enregistrer les panneaux
 * flottants, poser les écouteurs globaux.
 */
import { count } from '../core/format';
import { setCustomThemes, themeById, type CsvTheme } from '../core/themes';
import { type ColumnStats } from '../core/stats';
import { vscode } from './vscode-api';
import { elements } from './dom';
import { palette, state } from './state';
import { floating, positionFloating } from './floating-setup';
import { paint } from './paint';
import { cancelField } from './prompt';
import { installTips } from './tooltip';
import { measureWidths, rebuildView, select, selectedRowsText } from './table';
import { paintRaw } from './raw';
import { openMenu, resetMenuColumn } from './menu';
import { setOpenPanel } from './actions';
import { paintChrome, toggleInsights } from './toolbar';
import { buildThemePicker, commitThemeChoice } from './theme-picker';

// --------------------------------------------------------- panneaux flottants

floating.register('menu', {
  element: elements.menu,
  onClose: resetMenuColumn,
});

floating.register('theme', {
  element: elements.themePopup,
  onClose: commitThemeChoice,
});

floating.register('picker', {
  element: elements.picker,
  onClose: () => {
    elements.picker.classList.remove('wide');
    elements.datasetButton.classList.remove('active');
    elements.cleanButton.classList.remove('active');
    setOpenPanel(null);
  },
});

// Le thème clair/sombre de VS Code change sous nos pieds : les palettes en
// dépendent, il faut donc tout repeindre.
new MutationObserver(() => {
  if (!state.ready) return;
  buildThemePicker();
  paint();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as Record<string, unknown>;
  switch (message.type) {
    case 'head':
      state.headers = message.headers as string[];
      state.stats = message.stats as ColumnStats[];
      state.delimiter = message.delimiter as string;
      state.rowCount = message.rowCount as number;
      state.fileName = (message.fileName as string) ?? '';
      state.order = state.headers.map((_, index) => index);
      // Les palettes gardées d'une session précédente doivent être connues
      // avant de résoudre la palette courante : elle en fait peut-être partie.
      setCustomThemes((message.customThemes as CsvTheme[]) ?? []);
      state.themeId = themeById(message.theme as string | undefined).id;
      if (message.insights === false) toggleInsights(false, false);
      elements.shape.textContent = `${count(state.rowCount)} rows × ${count(state.headers.length)} columns`;
      if (message.truncated) {
        elements.notice.textContent = `Truncated: only the first ${count(state.rowCount)} rows are analysed.`;
      }
      buildThemePicker();
      paintChrome();
      break;
    case 'rows': {
      const start = message.start as number;
      const chunk = message.rows as string[][];
      const lines = message.lines as number[] | undefined;
      for (let i = 0; i < chunk.length; i++) {
        // L'original et l'affiché partagent les mêmes lignes tant qu'aucune
        // étape n'a rien changé : une étape copie une ligne avant d'y toucher.
        state.original[start + i] = chunk[i];
        state.rows[start + i] = chunk[i];
        state.source[start + i] = start + i;
        if (lines) {
          state.originalLines[start + i] = lines[i];
          state.lines[start + i] = lines[i];
        }
      }
      if (!state.ready && state.rows.length > 0) {
        measureWidths();
        state.ready = true;
      }
      rebuildView();
      paint();
      break;
    }
    case 'failed':
      elements.scroller.remove();
      elements.notice.textContent = message.message as string;
      break;
    case 'raw': {
      // Un « \r » final par ligne, quand le fichier vient de Windows : retiré
      // pour l'affichage, la ligne elle-même reste intacte au caractère près.
      const text = message.text as string;
      state.rawLines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
      state.rawLoading = false;
      if (state.showRaw) paintRaw();
      break;
    }
  }
});

// ------------------------------------------------------------ clics globaux

// Un seul écouteur pour tout ce qui flotte : avant, trois gestionnaires
// indépendants (menu, thème, panneau) portaient chacun leur propre exception
// au clic extérieur, écrite à des moments différents — le panneau n'avait pas
// la sienne, ce qui a laissé un bug (le second clic ne refermait rien)
// survivre plusieurs versions avant d'être corrigé en 0.15.1.
document.addEventListener('mousedown', (event) => {
  // Le volet de saisie fait partie du menu qui l'a ouvert : le toucher n'est pas « ailleurs ».
  if (elements.field.contains(event.target as Node)) return;
  floating.handleOutsideClick(event.target);
  if (floating.current === null) cancelField();
});
floating.onAnyClose = cancelField;
installTips();

// Un glissé de souris sur « Distinct », « Missing » ou une valeur du bandeau
// finit par un `click` sur cet élément : sans ce garde, il déclenchait le
// filtre au lieu de laisser le texte sélectionné, donc impossible à copier.
// En phase de capture pour passer avant les gestionnaires de chaque ligne.
document.addEventListener(
  'click',
  (event) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && (event.target as HTMLElement).closest('#band')) {
      event.stopPropagation();
    }
  },
  true,
);

// Clic droit sur une valeur : le « Copier » du menu natif de VS Code ne copiait
// rien dans ce webview, que la valeur soit sélectionnée ou non. On le remplace
// par un menu à nous dont « Copy » passe par l'hôte (vscode.env.clipboard), seul
// chemin fiable. Sans sélection sur la valeur visée, c'est la valeur entière qui
// est copiée ; un clic droit dans une sélection faite à la main copie celle-ci.
document.addEventListener('contextmenu', (event) => {
  // Sur un en-tête : le menu de la colonne, comme dans Excel et Power Query.
  // Copier son nom y reste possible.
  const head = (event.target as HTMLElement).closest<HTMLElement>('.head-cell');
  if (head?.dataset.column !== undefined) {
    event.preventDefault();
    openMenu(Number(head.dataset.column), head);
    return;
  }
  const gutter = (event.target as HTMLElement).closest('.row > .gutter');
  if (gutter) {
    event.preventDefault();
    const rowIndex = Number((gutter.parentElement as HTMLElement).dataset.row);
    if (!state.selected.has(rowIndex)) select(rowIndex, 0, false);
    const rows = state.selected.size;
    showCopyMenu(rows === 1 ? 'Copy row' : `Copy ${rows} rows`, selectedRowsText(), event, gutter as HTMLElement, null);
    return;
  }
  const target = (event.target as HTMLElement).closest('.cell, .stat, .value, .head-name');
  if (!target || target.closest('input, textarea')) return;
  event.preventDefault();
  const selection = window.getSelection();
  if (!selection) return;
  if (selection.isCollapsed || !selection.containsNode(target, true)) {
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  // La couleur du menu est celle de la colonne visée, pas celle du dernier menu ouvert.
  const owner = target.closest<HTMLElement>('[data-column]')?.dataset.column;
  showCopyMenu('Copy', selection.toString(), event, target as HTMLElement, owner === undefined ? null : Number(owner));
});

function showCopyMenu(label: string, text: string, event: MouseEvent, anchor: HTMLElement, column: number | null): void {
  elements.menu.textContent = '';
  elements.menu.style.borderTopColor = column === null ? '' : palette(column).accent;
  const item = document.createElement('button');
  item.className = 'menu-item';
  item.textContent = label;
  item.addEventListener('click', () => {
    floating.close();
    vscode.postMessage({ type: 'copy', text });
  });
  elements.menu.appendChild(item);
  floating.open('menu', anchor);
  positionFloating(elements.menu, anchor);
  elements.menu.style.left = `${event.clientX}px`;
  elements.menu.style.top = `${event.clientY}px`;
}

// Lignes marquées et pas de texte sélectionné : c'est elles qu'on copie, en
// tableur. Deux chemins, car VS Code ne déclenche pas toujours le même : la
// touche (écrite par l'hôte) et l'événement `copy` du navigateur (déclenché
// aussi par le « Copier » de l'éditeur). Les deux écrivent le même texte, donc
// l'ordre dans lequel ils arrivent ne change rien — et aucun ne laisse passer
// une sélection de texte périmée, qui ne donnait que la première cellule.
function rowsToCopy(): string | null {
  if (!(window.getSelection()?.isCollapsed ?? true) || state.selected.size === 0) return null;
  return selectedRowsText();
}

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') return;
  if ((event.target as HTMLElement).closest('input, textarea')) return;
  const text = rowsToCopy();
  if (text === null) return;
  event.preventDefault();
  vscode.postMessage({ type: 'copy', text });
});

document.addEventListener('copy', (event) => {
  if ((event.target as HTMLElement).closest?.('input, textarea')) return;
  const text = rowsToCopy();
  if (text === null) return;
  event.preventDefault();
  event.clipboardData?.setData('text/plain', text);
  vscode.postMessage({ type: 'copy', text });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') floating.close();
});

vscode.postMessage({ type: 'ready' });
