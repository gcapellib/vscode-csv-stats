import { paletteFor, themeById, type CsvTheme } from '../core/themes';
import { byId, elements, textSpan } from './dom';
import { floating, positionFloating } from './floating-setup';
import { paint } from './paint';
import { paintRaw } from './raw';
import { isDark, state } from './state';
import { paintChrome } from './toolbar';
import { vscode } from './vscode-api';
import { THEMES } from '../core/themes';

/**
 * Les trois familles, déduites de la palette elle-même plutôt que de sa position
 * dans la liste.
 *
 * Un découpage par indices figés était un piège : ajouter une palette au milieu
 * de la liste l'aurait rangée en silence dans la mauvaise famille, sans qu'aucun
 * test ne s'en aperçoive. Chaque palette sait déjà ce qu'elle est — une encre
 * unique pour un fond coloré, un fond uni pour une encre colorée, ni l'un ni
 * l'autre quand les deux portent la couleur.
 */
const THEME_GROUPS: Array<[string, typeof THEMES]> = [
  ['Coloured background', THEMES.filter((theme) => theme.uniformInk !== undefined)],
  ['Coloured text', THEMES.filter((theme) => theme.neutral !== undefined)],
  ['Both', THEMES.filter((theme) => theme.uniformInk === undefined && theme.neutral === undefined)],
];

/**
 * Aperçu d'une palette : une pastille par teinte, chacune portant son fond et un
 * trait de sa couleur de texte.
 *
 * Les deux sont nécessaires — une palette à fond uni ne se distingue que par son
 * encre, et une pastille qui n'en montrerait que le fond les rendrait toutes
 * identiques.
 */
export function swatch(theme: CsvTheme): HTMLElement {
  const dark = isDark();
  const element = document.createElement('span');
  element.className = 'swatch';
  for (let column = 0; column < 5; column++) {
    const colours = paletteFor(theme, column, dark);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = colours.band;
    const ink = document.createElement('span');
    ink.className = 'chip-ink';
    ink.style.background = colours.text;
    chip.appendChild(ink);
    element.appendChild(chip);
  }
  return element;
}

export function buildThemePicker(): void {
  elements.themePopup.textContent = '';
  for (const [label, themes] of THEME_GROUPS) {
    const heading = document.createElement('div');
    heading.className = 'theme-group';
    heading.textContent = label;
    elements.themePopup.appendChild(heading);
    for (const theme of themes) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'theme-item';
      item.setAttribute('role', 'option');
      item.dataset.id = theme.id;
      item.append(swatch(theme), textSpan(theme.label));
      // Survoler suffit à voir : une pastille de cinq carrés ne dit pas ce que
      // quarante-cinq palettes donnent sur ses propres données, et choisir à
      // l'aveugle obligeait à ouvrir le panneau autant de fois qu'il y a de
      // palettes. Le clic, lui, reste le seul geste qui engage.
      item.addEventListener('mouseenter', () => previewTheme(theme.id));
      item.addEventListener('focus', () => previewTheme(theme.id));
      item.addEventListener('click', () => {
        chosenThemeId = theme.id;
        vscode.postMessage({ type: 'selectTheme', id: theme.id });
        closeThemePopup();
        buildThemePicker();
      });
      elements.themePopup.appendChild(item);
    }
  }
  showCurrentTheme();
}

/**
 * La palette réellement choisie, par opposition à celle qu'on est en train de
 * survoler. Le panneau la restitue à sa fermeture, quelle que soit la façon dont
 * on en sort — clic ailleurs, Échap, ou le bouton lui-même.
 */
let chosenThemeId: string | null = null;

let previewFrame = 0;

/**
 * Applique une palette à l'écran sans engager le choix.
 *
 * Le bouton de la barre d'outils et la coche « courante » ne bougent pas : ils
 * disent ce qui est choisi, et rien ne l'est encore. Les repeints sont groupés
 * par frame — balayer la liste de haut en bas déclenche sinon quarante-cinq
 * reconstructions du tableau pour un seul mouvement de souris.
 */
export function previewTheme(id: string): void {
  if (state.themeId === id) return;
  state.themeId = id;
  if (previewFrame !== 0) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = 0;
    paintChrome();
    paint();
    if (state.showRaw) paintRaw();
  });
}

export function showCurrentTheme(): void {
  const theme = themeById(state.themeId);
  elements.themeLabel.textContent = theme.label;
  elements.themeSwatch.replaceWith(Object.assign(swatch(theme), { id: 'theme-swatch' }));
  elements.themeSwatch = byId('theme-swatch');
  elements.themePopup.querySelectorAll<HTMLElement>('.theme-item').forEach((item) => {
    item.classList.toggle('current', item.dataset.id === (chosenThemeId ?? state.themeId));
  });
}

export function openThemePopup(): void {
  chosenThemeId = state.themeId;
  floating.open('theme', elements.themeButton);
  positionFloating(elements.themePopup, elements.themeButton);
  elements.themeButton.setAttribute('aria-expanded', 'true');
  elements.themePopup.querySelector<HTMLElement>('.theme-item.current')?.scrollIntoView({ block: 'nearest' });
}

export function closeThemePopup(): void {
  floating.close();
}

elements.themeButton.addEventListener('click', () => {
  if (floating.isOpen('theme')) floating.close();
  else openThemePopup();
});

/**
 * Validation de l'aperçu, à la fermeture du sélecteur.
 *
 * L'aperçu ne doit pas rester collé après un clic ailleurs, un Échap ou un
 * second clic sur le bouton. Le clic sur une palette, lui, a déjà inscrit son
 * choix juste avant de fermer.
 */
export function commitThemeChoice(): void {
  elements.themeButton.setAttribute('aria-expanded', 'false');
  if (chosenThemeId !== null && chosenThemeId !== state.themeId) {
    state.themeId = chosenThemeId;
    paintChrome();
    paint();
    if (state.showRaw) paintRaw();
  }
  showCurrentTheme();
}
