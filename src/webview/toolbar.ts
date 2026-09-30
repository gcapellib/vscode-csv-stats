import { count } from '../core/format';
import { gradientFor, themeById } from '../core/themes';
import { clearFilters, closePicker, getOpenPanel, refilter } from './actions';
import { FOLD_MS } from './constants';
import { elements } from './dom';
import { paint } from './paint';
import { openDataset } from './panels/dataset';
import { isDark, state } from './state';
import { measureWidths } from './table';
import { vscode } from './vscode-api';

/**
 * Affiche les conditions actives.
 *
 * Sans cette barre, on filtre trois fois, on oublie ce qui est retenu, et on lit
 * des chiffres partiels en les croyant complets. C'est la moitié de la
 * fonctionnalité, pas sa décoration.
 */
/** Teinte les deux barres du haut : celle des boutons et celle des filtres. */
export function paintChrome(): void {
  const gradient = gradientFor(themeById(state.themeId), isDark());
  elements.toolbar.style.backgroundImage = gradient;
  elements.filterBar.style.backgroundImage = gradient;
}

export function paintFilterBar(): void {
  elements.filterBar.textContent = '';
  elements.filterBar.hidden = state.filters.length === 0;
  paintChrome();
  if (elements.filterBar.hidden) return;

  const summary = document.createElement('span');
  summary.className = 'filter-summary';
  summary.textContent = `${count(state.view.length)} of ${count(state.rows.length)} rows`;
  elements.filterBar.appendChild(summary);

  for (const filter of state.filters) {
    const chip = document.createElement('button');
    chip.className = 'chip-filter';
    chip.title = 'Remove this filter';
    chip.append(document.createTextNode(filter.label), cross());
    chip.addEventListener('click', () => {
      state.filters = state.filters.filter((other) => other !== filter);
      refilter();
    });
    elements.filterBar.appendChild(chip);
  }

  const clear = document.createElement('button');
  clear.className = 'chip-clear';
  clear.textContent = 'Clear all';
  clear.addEventListener('click', clearFilters);
  elements.filterBar.appendChild(clear);
}

export function cross(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'chip-cross';
  mark.textContent = '\u00D7';
  return mark;
}

/** Une bascule en annule une autre : sans ce jeton, deux animations de largeur
 * se disputeraient state.widths à chaque frame. */
let widthRun = 0;

export function toggleInsights(visible = !state.bandVisible, animate = true): void {
  const changed = visible !== state.bandVisible;
  state.bandVisible = visible;
  elements.insightsToggle.setAttribute('aria-expanded', String(visible));
  elements.insightsToggle.classList.toggle('folded', !visible);
  const chevron = elements.insightsToggle.querySelector('.chevron');
  if (chevron) chevron.textContent = '\u25BE';
  vscode.postMessage({ type: 'setInsights', visible });

  // Le bandeau est peint avant l'animation : il faut sa hauteur naturelle pour
  // savoir vers quoi — ou depuis quoi — animer.
  const before = elements.band.getBoundingClientRect().height;
  // Les largeurs se rediscutent ici, et seulement ici : c'est un geste
  // délibéré dont le déplacement est justement l'effet recherché, à la
  // différence d'un filtre où il n'était qu'une nuisance.
  const from = state.widths.slice();
  if (state.ready) measureWidths();
  const to = state.widths.slice();

  if (!changed || !animate || reducedMotion()) {
    paint();
    return;
  }
  // Repeint d'abord dans les largeurs de départ, sinon la première frame
  // montrerait déjà l'état final et l'animation n'aurait plus rien à jouer.
  state.widths = from;
  paint();
  foldBand(visible ? 0 : before, visible ? elements.band.getBoundingClientRect().height : 0);
  animateWidths(from, to);
}

/** Fait glisser les colonnes d'une largeur à l'autre. */
export function animateWidths(from: number[], to: number[]): void {
  const run = ++widthRun;
  const start = performance.now();
  const step = () => {
    if (run !== widthRun) return;
    const ratio = Math.min(1, (performance.now() - start) / FOLD_MS);
    const eased = 1 - (1 - ratio) * (1 - ratio);
    state.widths = to.map((target, index) => {
      const origin = from[index] ?? target;
      return Math.round(origin + (target - origin) * eased);
    });
    paint();
    if (ratio < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Anime la hauteur du bandeau, sans conteneur supplémentaire.
 *
 * Le bandeau et l'en-tête forment un seul bloc collant : y glisser un wrapper
 * ramènerait le défaut où le texte des lignes débordait au-dessus des titres.
 * On anime donc l'élément lui-même, d'une hauteur mesurée à l'autre, et on lui
 * rend sa hauteur automatique à la fin — une hauteur figée en pixels mentirait
 * dès que le contenu change.
 */
export function foldBand(from: number, to: number): void {
  const band = elements.band;
  if (to === 0) band.hidden = false;
  band.style.overflow = 'hidden';
  const animation = band.animate(
    [{ height: `${from}px` }, { height: `${to}px` }],
    { duration: FOLD_MS, easing: 'ease-out' },
  );
  animation.onfinish = () => {
    band.style.overflow = '';
    band.style.height = '';
    band.hidden = !state.bandVisible;
  };
}

elements.insightsToggle.addEventListener('click', () => toggleInsights());

elements.datasetButton.addEventListener('click', () => {
  // Une bascule, comme « Raw » et « Insights » : un second clic referme. Mais
  // seulement s'il s'agit bien du panneau Dataset — venant de « Column
  // details », le clic doit basculer vers Dataset, pas tout fermer.
  if (getOpenPanel() === 'dataset') {
    closePicker();
    return;
  }
  openDataset(elements.datasetButton);
});
