/**
 * Les quarante palettes — port fidèle de celles du plugin PyCharm.
 *
 * Une palette ne fixe pas ses couleurs une à une. Elle fixe une liste de teintes
 * et un style qui en dérive les intensités, pour le thème clair comme pour le
 * sombre. Deux leviers indépendants, d'où trois familles : le fond porte la
 * couleur, le texte la porte sur fond uni, ou les deux la portent ensemble.
 */

export interface Style {
  cellSaturation: number;
  cellBrightness: number;
  cellSaturationDark: number;
  cellBrightnessDark: number;
  accentSaturation: number;
  accentBrightness: number;
  accentBrightnessDark: number;
}

const PASTEL: Style = { cellSaturation: 0.13, cellBrightness: 0.99, cellSaturationDark: 0.4, cellBrightnessDark: 0.22, accentSaturation: 0.68, accentBrightness: 0.62, accentBrightnessDark: 0.78 };
const VIVID: Style = { cellSaturation: 0.24, cellBrightness: 1.0, cellSaturationDark: 0.55, cellBrightnessDark: 0.26, accentSaturation: 0.85, accentBrightness: 0.66, accentBrightnessDark: 0.84 };
const MUTED: Style = { cellSaturation: 0.1, cellBrightness: 0.97, cellSaturationDark: 0.28, cellBrightnessDark: 0.24, accentSaturation: 0.45, accentBrightness: 0.54, accentBrightnessDark: 0.7 };
const DEEP: Style = { cellSaturation: 0.18, cellBrightness: 0.95, cellSaturationDark: 0.62, cellBrightnessDark: 0.2, accentSaturation: 0.75, accentBrightness: 0.5, accentBrightnessDark: 0.74 };
const GREY: Style = { cellSaturation: 0, cellBrightness: 0.97, cellSaturationDark: 0, cellBrightnessDark: 0.26, accentSaturation: 0, accentBrightness: 0.45, accentBrightnessDark: 0.72 };

export interface CsvTheme {
  id: string;
  label: string;
  hues: number[];
  style: Style;
  /** Fond uni des palettes à texte coloré ; absent quand le fond porte la couleur. */
  neutral?: { light: string; dark: string };
  /** Couleur de texte unique ; absente quand le texte est coloré par colonne. */
  uniformInk?: { light: string; dark: string };
  /** Amplitude de la rampe de luminosité sur l'ensemble des teintes. */
  spread: number;
}

export interface Palette {
  cell: string;
  band: string;
  accent: string;
  text: string;
}

function tinted(id: string, label: string, hues: number[], style: Style, inkLight: string, inkDark: string, spread = 0.24): CsvTheme {
  return { id, label, hues, style, uniformInk: { light: inkLight, dark: inkDark }, spread };
}

function inked(id: string, label: string, hues: number[], backLight: string, backDark: string): CsvTheme {
  return { id, label, hues, style: VIVID, neutral: { light: backLight, dark: backDark }, spread: 0 };
}

function duo(id: string, label: string, hues: number[], style: Style, spread = 0.24): CsvTheme {
  return { id, label, hues, style, spread };
}

/** Fond coloré, texte d'une seule couleur. */
const TINTED: CsvTheme[] = [
  tinted('rainbow', 'Rainbow', [210, 28, 145, 285, 48, 175, 330, 95, 258, 8], PASTEL, '#1B1B1F', '#E8E8EC', 0),
  tinted('ocean', 'Ocean', [200, 186, 212, 174, 222, 164], PASTEL, '#0E2A3A', '#CFE8F5'),
  tinted('forest', 'Forest', [140, 95, 160, 110, 80, 175], MUTED, '#14301C', '#D3EBD8'),
  tinted('lavender', 'Lavender', [270, 285, 255, 300, 240, 315], PASTEL, '#241A38', '#E4D9F5'),
  tinted('citrus', 'Citrus', [48, 60, 35, 75, 25, 90], VIVID, '#332600', '#F7EBC6'),
  tinted('neon', 'Neon', [300, 180, 120, 60, 330, 200], VIVID, '#14001F', '#F2E4FF'),
  tinted('soft', 'Soft pastel', [340, 200, 150, 50, 270, 20], MUTED, '#2B2B2B', '#E6E6E6'),
  tinted('seaside', 'Seaside', [190, 40, 175, 55, 205, 30], PASTEL, '#102B33', '#DDEFF2'),
  tinted('nordic', 'Nordic', [205, 220, 195, 230, 185, 240], MUTED, '#16222E', '#DCE6F0'),
  tinted('mint', 'Mint', [160, 150, 170, 140, 180, 130], PASTEL, '#0F2B24', '#D6F0E6'),
  tinted('meadow', 'Meadow', [95, 80, 110, 65, 125, 50], VIVID, '#1B2E0F', '#E0F2CC'),
  tinted('mono', 'Monochrome', [0, 0, 0, 0, 0, 0], GREY, '#1C1C1C', '#E0E0E0', 0.26),
];

/** Fond uni, texte coloré par colonne. */
const INKED: CsvTheme[] = [
  inked('syntax', 'Syntax', [210, 28, 140, 285, 48, 175, 330, 95], '#FCFCFD', '#1E1F22'),
  inked('console', 'Console', [120, 55, 195, 300, 15, 175, 85, 265], '#F7F7F4', '#14161A'),
  inked('candy', 'Candy', [320, 275, 190, 345, 240, 160], '#FFF9FC', '#1F1626'),
  inked('jungle', 'Jungle', [135, 95, 165, 75, 150, 110], '#F5FBF5', '#0F2015'),
  inked('steel', 'Steel', [210, 198, 226, 188, 240, 178], '#F6F8FA', '#1A1F26'),
  inked('prism', 'Prism', [0, 45, 90, 135, 180, 225, 270, 315], '#FFFFFF', '#121316'),
  inked('dawn', 'Dawn', [20, 340, 45, 300, 5, 260], '#FFFAF5', '#241C22'),
  // Cinq palettes qui reprennent l'esprit des thèmes d'éditeur les plus répandus
  // — fond sombre presque neutre, encre franche mais jamais criarde. Les teintes
  // sont rangées pour que deux colonnes voisines s'écartent le plus possible :
  // l'ordre du nuancier d'origine mettait parfois deux oranges côte à côte.
  inked('mocha', 'Mocha', [343, 41, 189, 23, 267, 115, 316, 217], '#EFF1F5', '#1E1E2E'),
  inked('midnight', 'Midnight', [326, 191, 135, 31, 265, 0, 65], '#FBF7FF', '#282A36'),
  inked('frost', 'Frost', [193, 354, 92, 213, 40, 311, 14], '#ECEFF4', '#2E3440'),
  inked('solar', 'Solar', [45, 331, 175, 18, 237, 68, 1, 205], '#FDF6E3', '#002B36'),
  inked('ember', 'Ember', [4, 162, 42, 343, 101, 27, 61], '#FBF1C7', '#282828'),
];

/** Fond teinté et texte coloré, tous deux par colonne. */
const DUO: CsvTheme[] = [
  duo('rainbow-duo', 'Rainbow duo', [210, 28, 145, 285, 48, 175, 330, 95, 258, 8], PASTEL, 0),
  duo('forest-duo', 'Forest duo', [140, 95, 160, 110, 80, 175], MUTED),
  duo('mint-duo', 'Mint duo', [160, 150, 170, 140, 180, 130], PASTEL),
  duo('vineyard-duo', 'Vineyard duo', [330, 280, 350, 120, 300, 20], PASTEL),
  duo('prism-duo', 'Prism duo', [0, 45, 90, 135, 180, 225, 270, 315], PASTEL, 0),
];

export const THEMES: CsvTheme[] = [...TINTED, ...INKED, ...DUO];

export const DEFAULT_THEME = THEMES[0];

/**
 * Les palettes tirées au sort puis gardées, ajoutées à celles d'origine.
 *
 * Elles vivent à part : les palettes livrées avec l'extension ne peuvent pas
 * être supprimées, celles-ci si. Un seul point de résolution (`themeById`)
 * pour que tout le reste — le bandeau, les cellules, le dégradé — n'ait pas à
 * savoir d'où vient la palette qu'il applique.
 */
let custom: CsvTheme[] = [];

/**
 * La palette tirée au sort mais pas encore gardée.
 *
 * Elle doit être résoluble comme les autres — sans quoi tout ce qui peint
 * (bandeau, cellules, dégradé) retomberait sur la palette par défaut et le
 * tirage n'aurait aucun effet visible. D'où son passage par ce même point de
 * résolution, plutôt qu'une variable gardée dans la vue.
 */
let draft: CsvTheme | null = null;

export function setCustomThemes(themes: CsvTheme[]): void {
  custom = themes;
}

export function customThemes(): CsvTheme[] {
  return custom;
}

export function setDraftTheme(theme: CsvTheme | null): void {
  draft = theme;
}

export function draftTheme(): CsvTheme | null {
  return draft;
}

export function allThemes(): CsvTheme[] {
  return draft === null ? [...THEMES, ...custom] : [...THEMES, ...custom, draft];
}

export function themeById(id: string | undefined): CsvTheme {
  return allThemes().find((theme) => theme.id === id) ?? DEFAULT_THEME;
}

/** Les deux familles qu'un tirage peut produire. */
export type RandomFamily = 'background' | 'text';

const RANDOM_STYLES: Style[] = [PASTEL, VIVID, MUTED, DEEP];

/** Encres et fonds éprouvés : seules les teintes sont tirées au sort. */
const RANDOM_INKS: Array<[string, string]> = [
  ['#1B1B1F', '#E8E8EC'],
  ['#14301C', '#D3EBD8'],
  ['#0E2A3A', '#CFE8F5'],
  ['#241A38', '#E4D9F5'],
];

const RANDOM_GROUNDS: Array<[string, string]> = [
  ['#FCFCFD', '#1E1F22'],
  ['#F7F7F4', '#14161A'],
  ['#EFF1F5', '#1E1E2E'],
  ['#FBF7FF', '#282A36'],
  ['#ECEFF4', '#2E3440'],
];

/**
 * Tire une palette au sort.
 *
 * Les teintes ne sont pas tirées indépendamment : elles sont réparties sur le
 * cercle chromatique à intervalle régulier, à partir d'un angle de départ
 * aléatoire, avec une secousse qui ne dépasse jamais le sixième de
 * l'intervalle — deux teintes restent donc séparées d'au moins deux tiers de
 * celui-ci. Une secousse plus large (le tiers) a été essayée puis rejetée :
 * elle laissait deux teintes se rapprocher à 15°, ce qui passe inaperçu sur un
 * style saturé mais rend deux colonnes identiques sur un style discret comme
 * MUTED. Le reste (styles, encres, fonds) est puisé dans des valeurs déjà
 * éprouvées : le hasard porte sur la couleur, jamais sur la lisibilité.
 */
export function randomTheme(
  family: RandomFamily,
  id: string,
  label: string,
  random: () => number = Math.random,
): CsvTheme {
  const count = 6 + Math.floor(random() * 3); // 6, 7 ou 8 teintes
  const step = 360 / count;
  const start = random() * 360;
  const hues = Array.from({ length: count }, (_, index) =>
    Math.round((start + index * step + (random() - 0.5) * (step / 3) + 360) % 360),
  );

  if (family === 'text') {
    const [light, dark] = RANDOM_GROUNDS[Math.floor(random() * RANDOM_GROUNDS.length)];
    return inked(id, label, hues, light, dark);
  }
  const style = RANDOM_STYLES[Math.floor(random() * RANDOM_STYLES.length)];
  const [inkLight, inkDark] = RANDOM_INKS[Math.floor(random() * RANDOM_INKS.length)];
  // La rampe de luminosité n'est pas décorative : c'est elle qui distingue deux
  // colonnes voisines quand le fond est peu saturé. Un tirage qui la supprimait
  // une fois sur deux produisait, avec le style MUTED, des colonnes
  // indiscernables — écart mesuré à 5 pour un seuil de 10, alors même que les
  // teintes étaient séparées de 36°.
  //
  // Elle est proportionnelle au nombre de teintes, et non fixe : répartie sur
  // sept marches plutôt que cinq, une rampe de 0,24 s'aplatit au point de ne
  // plus rien distinguer (écart 8). C'est le pas entre deux colonnes qui doit
  // rester constant, pas l'amplitude totale.
  return tinted(id, label, hues, style, inkLight, inkDark, 0.05 * (hues.length - 1));
}

/**
 * Décalage de luminosité de la colonne, toujours dirigé **vers** le centre de
 * l'échelle : la rampe s'assombrit sur fond clair et s'éclaircit sur fond sombre.
 * Une rampe qui irait dans les deux sens viendrait buter contre le blanc ou le
 * noir, et les colonnes en bout de palette deviendraient indiscernables.
 */
function offset(theme: CsvTheme, column: number, dark: boolean): number {
  if (theme.spread === 0) return 0;
  const steps = Math.max(1, theme.hues.length - 1);
  const distance = (theme.spread * (column % theme.hues.length)) / steps;
  return dark ? distance : -distance;
}

export function paletteFor(theme: CsvTheme, column: number, dark: boolean): Palette {
  const hue = theme.hues[column % theme.hues.length];
  const style = theme.style;
  const shift = offset(theme, column, dark);

  const accent = dark
    ? hsb(hue, style.accentSaturation * 0.8, style.accentBrightnessDark)
    : hsb(hue, style.accentSaturation, style.accentBrightness);

  if (theme.neutral) {
    const uniform = dark ? theme.neutral.dark : theme.neutral.light;
    return {
      cell: uniform,
      band: shiftBrightness(uniform, dark ? 0.1 : -0.05),
      accent,
      text: dark ? hsb(hue, 0.58, 0.95) : hsb(hue, 0.88, 0.5),
    };
  }

  const cell = dark
    ? hsb(hue, style.cellSaturationDark, style.cellBrightnessDark + shift)
    : hsb(hue, style.cellSaturation, style.cellBrightness + shift);
  const band = dark
    ? hsb(hue, style.cellSaturationDark * 1.1, style.cellBrightnessDark + 0.08 + shift)
    : hsb(hue, style.cellSaturation * 2, style.cellBrightness - 0.03 + shift);
  const text = theme.uniformInk
    ? dark
      ? theme.uniformInk.dark
      : theme.uniformInk.light
    : dark
      ? hsb(hue, 0.38, 0.97)
      : hsb(hue, 0.95, 0.32);

  return { cell, band, accent, text };
}

/** Convertit un « #rrggbb » en rgba, pour pouvoir l'atténuer sans y perdre le texte. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Dégradé horizontal tissé dans les teintes d'un thème.
 *
 * Sans lui, la barre de filtres et la barre des boutons empruntaient un gris
 * neutre sans rapport avec la palette choisie juste en dessous. L'opacité reste
 * faible : boutons, pastilles et texte doivent rester lisibles par-dessus, le
 * dégradé ne fait que teinter le fond derrière eux.
 */
export function gradientFor(theme: CsvTheme, dark: boolean, alpha = 0.3): string {
  const stops = theme.hues.map((_, index) => withAlpha(paletteFor(theme, index, dark).accent, alpha));
  if (stops.length === 0) return 'none';
  if (stops.length === 1) return `linear-gradient(90deg, ${stops[0]}, ${stops[0]})`;
  const steps = stops.map((colour, index) => `${colour} ${Math.round((index / (stops.length - 1)) * 100)}%`);
  return `linear-gradient(90deg, ${steps.join(', ')})`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Teinte en degrés, saturation et luminosité entre 0 et 1, vers un « #rrggbb ». */
export function hsb(hueDegrees: number, saturation: number, brightness: number): string {
  const h = (((hueDegrees % 360) + 360) % 360) / 60;
  const s = clamp(saturation, 0, 1);
  const v = clamp(brightness, 0.05, 1);
  const chroma = v * s;
  const second = chroma * (1 - Math.abs((h % 2) - 1));
  const sector = Math.floor(h) % 6;
  const [red, green, blue] = (
    [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ] as const
  )[sector];
  const base = v - chroma;
  return toHex(red + base, green + base, blue + base);
}

function toHex(red: number, green: number, blue: number): string {
  const part = (value: number) =>
    Math.round(clamp(value, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(red)}${part(green)}${part(blue)}`;
}

function shiftBrightness(hex: string, amount: number): string {
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  const value = Math.max(red, green, blue);
  const target = clamp(value + amount, 0.03, 1);
  const factor = value === 0 ? 0 : target / value;
  return value === 0 ? toHex(target, target, target) : toHex(red * factor, green * factor, blue * factor);
}
