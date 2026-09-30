import {
  customThemes,
  draftTheme,
  paletteFor,
  randomTheme,
  setCustomThemes,
  setDraftTheme,
  themeById,
  type CsvTheme,
  type RandomFamily,
} from '../core/themes';
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

/** Les deux familles s'alternent d'un tirage à l'autre, comme demandé. */
let nextFamily: RandomFamily = 'background';

function themeItem(theme: CsvTheme, removable: boolean): HTMLElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'theme-item';
  item.setAttribute('role', 'option');
  item.dataset.id = theme.id;
  item.append(swatch(theme), textSpan(theme.label));
  // Survoler suffit à voir : une pastille de cinq carrés ne dit pas ce qu'une
  // palette donne sur ses propres données, et choisir à l'aveugle obligeait à
  // ouvrir le panneau autant de fois qu'il y a de palettes. Le clic, lui,
  // reste le seul geste qui engage.
  item.addEventListener('mouseenter', () => previewTheme(theme.id));
  item.addEventListener('focus', () => previewTheme(theme.id));
  item.addEventListener('click', () => {
    chosenThemeId = theme.id;
    vscode.postMessage({ type: 'selectTheme', id: theme.id });
    closeThemePopup();
    buildThemePicker();
  });

  if (!removable) return item;

  // Seules les palettes personnelles se retirent — gardées ou simplement
  // tirées ; celles livrées avec l'extension restent, quoi qu'il arrive.
  const remove = document.createElement('span');
  remove.className = 'theme-remove';
  remove.textContent = '\u00D7';
  remove.title = theme === draftTheme() ? 'Discard this draw' : 'Remove this palette';
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    if (theme === draftTheme()) {
      setDraftTheme(null);
    } else {
      setCustomThemes(customThemes().filter((kept) => kept.id !== theme.id));
      vscode.postMessage({ type: 'deleteTheme', id: theme.id });
    }
    // La palette retirée était peut-être celle en cours : themeById retombe
    // alors sur la palette par défaut, et l'écran doit suivre.
    if (state.themeId === theme.id) {
      state.themeId = themeById(undefined).id;
      chosenThemeId = state.themeId;
      vscode.postMessage({ type: 'selectTheme', id: state.themeId });
      paintChrome();
      paint();
      if (state.showRaw) paintRaw();
    }
    buildThemePicker();
  });
  item.appendChild(remove);
  return item;
}

export function buildThemePicker(): void {
  elements.themePopup.textContent = '';

  // Seule la liste défile : la rangée de boutons reste visible, sinon tirer
  // une palette demande d'abord de dérouler vingt-neuf lignes pour retrouver
  // le bouton.
  const list = document.createElement('div');
  list.className = 'theme-list';

  const groups: Array<[string, CsvTheme[], boolean]> = THEME_GROUPS.map(
    ([label, themes]) => [label, themes, false] as [string, CsvTheme[], boolean],
  );
  const mine = [...customThemes()];
  const draft = draftTheme();
  if (draft !== null) mine.push(draft);
  if (mine.length > 0) groups.push(['My palettes', mine, true]);

  for (const [label, themes, removable] of groups) {
    const heading = document.createElement('div');
    heading.className = 'theme-group';
    heading.textContent = label;
    list.appendChild(heading);
    for (const theme of themes) {
      list.appendChild(themeItem(theme, removable));
    }
  }

  elements.themePopup.append(list, randomRow());
  showCurrentTheme();
}

/**
 * La rangée du bas : tirer, puis garder.
 *
 * Tirer applique aussitôt, sans fermer le panneau — on peut donc enchaîner les
 * tirages jusqu'à tomber sur une palette qui plaît, et seulement alors la
 * garder.
 */
function randomRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'theme-random';

  const draw = document.createElement('button');
  draw.type = 'button';
  draw.className = 'theme-draw';
  draw.textContent = '\u2728 Random palette';
  draw.title = 'Draw a new palette, alternating coloured background and coloured text';
  draw.addEventListener('click', (event) => {
    event.stopPropagation();
    const family = nextFamily;
    nextFamily = family === 'background' ? 'text' : 'background';
    const id = `custom-${Date.now()}`;
    setDraftTheme(randomTheme(family, id, `Palette ${customThemes().length + 1}`));
    state.themeId = id;
    chosenThemeId = id;
    paintChrome();
    paint();
    if (state.showRaw) paintRaw();
    buildThemePicker();
  });

  const keep = document.createElement('button');
  keep.type = 'button';
  keep.className = 'theme-keep';
  keep.textContent = '\u2661 Keep';
  keep.title = 'Add this palette to your own list';
  keep.disabled = draftTheme() === null;
  keep.addEventListener('click', (event) => {
    event.stopPropagation();
    const kept = draftTheme();
    if (kept === null) return;
    setDraftTheme(null);
    setCustomThemes([...customThemes(), kept]);
    vscode.postMessage({ type: 'saveTheme', theme: kept });
    vscode.postMessage({ type: 'selectTheme', id: kept.id });
    buildThemePicker();
  });

  row.append(draw, keep);
  return row;
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
