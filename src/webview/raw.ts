import { rawSegments } from '../core/csv';
import { paletteFor, themeById } from '../core/themes';
import { OVERSCAN, ROW_HEIGHT } from './constants';
import { elements } from './dom';
import { paint } from './paint';
import { isDark, state } from './state';
import { vscode } from './vscode-api';

/**
 * Bascule vers le texte brut, non analysé.
 *
 * Le texte n'est demandé qu'au premier clic — jamais à l'ouverture du fichier —
 * et mis en cache ensuite : les allers-retours suivants ne coûtent plus rien.
 */
export function toggleRaw(): void {
  state.showRaw = !state.showRaw;
  elements.rawToggle.classList.toggle('active', state.showRaw);
  elements.scroller.hidden = state.showRaw;
  elements.filterBar.hidden = state.showRaw || state.filters.length === 0;
  if (state.showRaw) {
    if (state.rawLines === null && !state.rawLoading) {
      state.rawLoading = true;
      vscode.postMessage({ type: 'requestRaw' });
    }
    elements.rawScroller.hidden = false;
    paintRaw();
  } else {
    elements.rawScroller.hidden = true;
    paint();
  }
}

elements.rawToggle.addEventListener('click', toggleRaw);

/**
 * Rend la vue brute par fenêtrage, exactement comme paintRows() rend le
 * tableau : seules les lignes visibles à l'écran entrent dans le DOM, ce qui
 * tient la promesse de fluidité à cent mille lignes même pour du texte non
 * analysé, sans imposer de plafond arbitraire.
 */
export function paintRaw(retry = true): void {
  if (state.rawLoading) {
    elements.rawBody.textContent = '';
    elements.rawBody.style.height = '';
    const loading = document.createElement('div');
    loading.className = 'raw-loading';
    loading.textContent = 'Loading…';
    elements.rawBody.appendChild(loading);
    return;
  }
  const lines = state.rawLines;
  if (lines === null) return;

  const total = lines.length;
  elements.rawBody.style.height = `${total * ROW_HEIGHT}px`;
  const scrollTop = elements.rawScroller.scrollTop;
  const viewport = elements.rawScroller.clientHeight;
  // Une hauteur nulle veut dire que la mise en page n'a pas encore eu lieu.
  // Rendre malgré tout ne remplirait que l'overscan — une poignée de lignes,
  // puis du vide jusqu'au premier défilement, sans que rien ne signale l'erreur.
  // Une seule nouvelle tentative, sinon un panneau réellement replié bouclerait.
  if (viewport === 0 && retry) {
    requestAnimationFrame(() => {
      if (state.showRaw) paintRaw(false);
    });
    return;
  }
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);

  const theme = themeById(state.themeId);
  const dark = isDark();
  const gutterWidth = String(total).length;
  const fragment = document.createDocumentFragment();
  for (let index = first; index < last; index++) {
    const row = document.createElement('div');
    row.className = 'raw-line';
    row.style.top = `${index * ROW_HEIGHT}px`;
    const gutter = document.createElement('span');
    gutter.className = 'raw-gutter';
    gutter.textContent = String(index + 1).padStart(gutterWidth, ' ');
    const text = document.createElement('span');
    text.className = 'raw-text';
    for (const segment of rawSegments(lines[index], state.delimiter)) {
      const piece = document.createElement('span');
      if (segment.column < 0) {
        piece.className = 'raw-sep';
      } else {
        // La même couleur que la colonne porte dans le tableau : le fichier
        // brut se lit alors avec les mêmes repères que la vue analysée.
        piece.style.color = paletteFor(theme, segment.column, dark).accent;
      }
      piece.textContent = segment.text;
      text.appendChild(piece);
    }
    row.append(gutter, text);
    fragment.appendChild(row);
  }
  elements.rawBody.textContent = '';
  elements.rawBody.appendChild(fragment);
}

elements.rawScroller.addEventListener('scroll', () => {
  if (state.showRaw) paintRaw();
});
