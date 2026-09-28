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
  tinted('sunset', 'Sunset', [12, 28, 340, 45, 5, 320], VIVID, '#3A1410', '#FBDCD2'),
  tinted('lavender', 'Lavender', [270, 285, 255, 300, 240, 315], PASTEL, '#241A38', '#E4D9F5'),
  tinted('citrus', 'Citrus', [48, 60, 35, 75, 25, 90], VIVID, '#332600', '#F7EBC6'),
  tinted('terracotta', 'Terracotta', [18, 30, 8, 40, 350, 25], MUTED, '#3A1F14', '#F0D8C8'),
  tinted('slate', 'Slate', [215, 215, 215, 215, 215, 215], MUTED, '#1A2129', '#D5DDE6'),
  tinted('neon', 'Neon', [300, 180, 120, 60, 330, 200], VIVID, '#14001F', '#F2E4FF'),
  tinted('soft', 'Soft pastel', [340, 200, 150, 50, 270, 20], MUTED, '#2B2B2B', '#E6E6E6'),
  tinted('seaside', 'Seaside', [190, 40, 175, 55, 205, 30], PASTEL, '#102B33', '#DDEFF2'),
  tinted('vineyard', 'Vineyard', [330, 280, 350, 120, 300, 20], DEEP, '#2E0F22', '#F0D6E4'),
  tinted('nordic', 'Nordic', [205, 220, 195, 230, 185, 240], MUTED, '#16222E', '#DCE6F0'),
  tinted('sand', 'Sand', [35, 45, 25, 55, 15, 40], MUTED, '#33281A', '#EFE3D0'),
  tinted('mint', 'Mint', [160, 150, 170, 140, 180, 130], PASTEL, '#0F2B24', '#D6F0E6'),
  tinted('coral', 'Coral', [8, 350, 20, 335, 30, 0], VIVID, '#38141A', '#FBD9DD'),
  tinted('ink', 'Ink', [225, 232, 218, 238, 212, 244], DEEP, '#0B1220', '#C9D6EC'),
  tinted('copper', 'Copper', [22, 32, 12, 42, 2, 28], DEEP, '#2E1A0E', '#F2DCC4'),
  tinted('meadow', 'Meadow', [95, 80, 110, 65, 125, 50], VIVID, '#1B2E0F', '#E0F2CC'),
  tinted('mono', 'Monochrome', [0, 0, 0, 0, 0, 0], GREY, '#1C1C1C', '#E0E0E0', 0.26),
];

/** Fond uni, texte coloré par colonne. */
const INKED: CsvTheme[] = [
  inked('syntax', 'Syntax', [210, 28, 140, 285, 48, 175, 330, 95], '#FCFCFD', '#1E1F22'),
  inked('console', 'Console', [120, 55, 195, 300, 15, 175, 85, 265], '#F7F7F4', '#14161A'),
  inked('blueprint', 'Blueprint', [205, 190, 222, 174, 236, 160], '#F2F6FB', '#10203A'),
  inked('candy', 'Candy', [320, 275, 190, 345, 240, 160], '#FFF9FC', '#1F1626'),
  inked('amber', 'Amber', [38, 18, 52, 6, 30, 62], '#FFFBF2', '#241A0E'),
  inked('jungle', 'Jungle', [135, 95, 165, 75, 150, 110], '#F5FBF5', '#0F2015'),
  inked('berry', 'Berry', [330, 290, 350, 265, 310, 245], '#FDF5FA', '#1E1226'),
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
  duo('ocean-duo', 'Ocean duo', [200, 186, 212, 174, 222, 164], PASTEL),
  duo('forest-duo', 'Forest duo', [140, 95, 160, 110, 80, 175], MUTED),
  duo('sunset-duo', 'Sunset duo', [12, 28, 340, 45, 5, 320], PASTEL),
  duo('lavender-duo', 'Lavender duo', [270, 285, 255, 300, 240, 315], PASTEL),
  duo('citrus-duo', 'Citrus duo', [48, 60, 35, 75, 25, 90], MUTED),
  duo('terracotta-duo', 'Terracotta duo', [18, 30, 8, 40, 350, 25], MUTED),
  duo('mint-duo', 'Mint duo', [160, 150, 170, 140, 180, 130], PASTEL),
  duo('vineyard-duo', 'Vineyard duo', [330, 280, 350, 120, 300, 20], PASTEL),
  duo('prism-duo', 'Prism duo', [0, 45, 90, 135, 180, 225, 270, 315], PASTEL, 0),
];

export const THEMES: CsvTheme[] = [...TINTED, ...INKED, ...DUO];

export const DEFAULT_THEME = THEMES[0];

export function themeById(id: string | undefined): CsvTheme {
  return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
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
