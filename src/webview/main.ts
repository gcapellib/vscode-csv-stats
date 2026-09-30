/**
 * Le point d'entrée de la vue : câblage, et rien d'autre.
 *
 * Chaque zone vit dans son propre module — bandeau, tableau, vue brute, menu,
 * panneaux, barre d'outils, sélecteur de palettes. Ce fichier se contente de
 * les relier : recevoir les messages de l'hôte, enregistrer les panneaux
 * flottants, poser les écouteurs globaux.
 */
import { count } from '../core/format';
import { themeById } from '../core/themes';
import { type ColumnStats } from '../core/stats';
import { vscode } from './vscode-api';
import { elements } from './dom';
import { state } from './state';
import { floating } from './floating-setup';
import { paint } from './paint';
import { resolvePrompt } from './prompt';
import { measureWidths, rebuildView } from './table';
import { paintRaw } from './raw';
import { resetMenuColumn } from './menu';
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
      for (let i = 0; i < chunk.length; i++) state.rows[start + i] = chunk[i];
      if (!state.ready && state.rows.length > 0) {
        measureWidths();
        state.ready = true;
      }
      rebuildView();
      paint();
      break;
    }
    case 'columnStats': {
      const index = message.index as number;
      state.stats[index] = message.stats as ColumnStats;
      rebuildView();
      paint();
      break;
    }
    case 'failed':
      elements.scroller.remove();
      elements.notice.textContent = message.message as string;
      break;
    case 'promptResult':
      resolvePrompt(message.token as string, message.value as string | null);
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
  floating.handleOutsideClick(event.target);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') floating.close();
});

vscode.postMessage({ type: 'ready' });
