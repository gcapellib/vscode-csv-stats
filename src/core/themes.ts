/**
 * Les palettes.
 *
 * Le noyau vient du plugin PyCharm ; s'y ajoutent depuis des palettes conçues
 * pour la lisibilité des catégories, et un tirage au sort.
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
const WASHED: Style = { cellSaturation: 0.07, cellBrightness: 1.0, cellSaturationDark: 0.2, cellBrightnessDark: 0.28, accentSaturation: 0.34, accentBrightness: 0.58, accentBrightnessDark: 0.72 };


export interface CsvTheme {
  id: string;
  label: string;
  hues: number[];
  style: Style;
  /** Fond uni des palettes à texte coloré ; absent quand le fond porte la couleur. */
  neutral?: { light: string; dark: string };
  /** Couleur de texte unique ; absente quand le texte est coloré par colonne. */
  uniformInk?: { light: string; dark: string };
  /**
   * Encres données une à une plutôt que dérivées d'une teinte.
   *
   * Indispensable pour les palettes scientifiques : Okabe-Ito distingue son
   * bleu ciel de son bleu par la clarté, pas par la teinte — deux couleurs de
   * même teinte, que ce modèle réduirait sinon à une seule. C'est précisément
   * cet écart de clarté qui les rend discernables par un œil daltonien.
   */
  inks?: { light: string[]; dark: string[] };
  /** Amplitude de la rampe de luminosité sur l'ensemble des teintes. */
  spread: number;
  /**
   * Palette décrite en clarté et chroma perçues (OKLCH) plutôt qu'en HSB :
   * toutes ses colonnes partagent la même chroma et la même clarté de base,
   * seules la teinte et une légère alternance de clarté les distinguent.
   * Réservé aux tirages ; les palettes livrées ne le portent pas.
   */
  tone?: Tone;
}

/** Le caractère d'une palette tirée : sa saturation et sa clarté communes. */
export interface Tone {
  /** Chroma OKLCH des fonds, la même pour toutes les colonnes. */
  chroma: number;
  /** Clarté OKLCH des fonds en thème clair. */
  light: number;
  /** Clarté OKLCH des fonds en thème sombre. */
  dark: number;
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

/**
 * Palette dont les encres sont données, non dérivées. Les teintes restent
 * fournies pour que le reste du modèle (pastille d'aperçu, dégradé) continue
 * de fonctionner sans savoir d'où viennent les couleurs.
 */
function explicit(
  id: string,
  label: string,
  light: string[],
  dark: string[],
  backLight: string,
  backDark: string,
): CsvTheme {
  return {
    id,
    label,
    hues: light.map(hueOf),
    style: VIVID,
    neutral: { light: backLight, dark: backDark },
    inks: { light, dark },
    spread: 0,
  };
}

/** Teinte d'un « #rrggbb », en degrés — l'inverse partiel de hsb(). */
export function hueOf(hex: string): number {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max === min) return 0;
  const span = max - min;
  const hue =
    max === red
      ? ((green - blue) / span) % 6
      : max === green
        ? (blue - red) / span + 2
        : (red - green) / span + 4;
  return Math.round(((hue * 60) % 360 + 360) % 360);
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
  tinted('neon', 'Neon', [300, 180, 120, 60, 330, 200], VIVID, '#14001F', '#F2E4FF'),
  tinted('soft', 'Soft pastel', [340, 200, 150, 50, 270, 20], MUTED, '#2B2B2B', '#E6E6E6'),
  tinted('nordic', 'Nordic', [205, 220, 195, 230, 185, 240], MUTED, '#16222E', '#DCE6F0'),
  tinted('mint', 'Mint', [160, 150, 170, 140, 180, 130], PASTEL, '#0F2B24', '#D6F0E6'),
  tinted('meadow', 'Meadow', [95, 80, 110, 65, 125, 50], VIVID, '#1B2E0F', '#E0F2CC'),
  // Teintes reprises de palettes reconnues pour leur confort visuel : tons
  // terreux sourds, sauge et pastels poudrés (voir CHANGELOG pour les sources).
  tinted('sage', 'Sage', [95, 150, 75, 175, 120, 200], WASHED, '#1C2620', '#DCE8DE'),
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
  // Palettes conçues pour que des catégories restent distinguables, y compris
  // par un œil daltonien — c'est exactement le problème d'un tableau dont
  // chaque colonne porte une couleur.
  //
  // Les valeurs publiées sont calibrées pour des marques dans un graphique, pas
  // pour du texte : le jaune d'Okabe-Ito sur fond blanc donnait un contraste de
  // 39 pour un seuil de 60. Elles sont donc assombries en mode clair et
  // éclaircies en mode sombre juste ce qu'il faut pour passer ce seuil, la
  // teinte restant intacte — c'est elle qui porte la distinction.
  explicit(
    'okabe',
    'Okabe-Ito',
    ['#E69F00', '#56B4E9', '#009E73', '#D1C73A', '#0072B2', '#D55E00', '#CC79A7'],
    ['#E6AC29', '#70BEE9', '#1C9E7B', '#F0E661', '#207EB2', '#D57326', '#CC88AE'],
    '#FCFCFD',
    '#1E1F22',
  ),
  explicit(
    'tol-bright',
    'Tol Bright',
    ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#777777'],
    ['#5680AA', '#EE7E8C', '#348842', '#CCBE5C', '#7ED2EE', '#AA4880', '#777777'],
    '#FDFDFC',
    '#1A1C20',
  ),
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

/**
 * Les tirages au sort suivent ce que les études mesurent de l'harmonie, et non
 * plus une répartition sur tout le cercle :
 *
 * - **teintes proches** : l'harmonie d'une paire croît avec la ressemblance
 *   des teintes, et décroît avec leur écart (Schloss & Palmer, 2011, sur 992
 *   paires ; Ou & Luo, 2006, sur 1 431) ;
 * - **couleurs désaturées** : les paires harmonieuses sont « plus
 *   désaturées » ; le rouge saturé, surtout en fond, donne les combinaisons
 *   les plus disharmonieuses (Schloss & Palmer) ;
 * - **même chroma, clarté différente** : deux couleurs qui ne diffèrent que
 *   par la clarté s'accordent ; plus elles sont claires, mieux elles
 *   s'accordent (Ou & Luo) ;
 * - **teintes froides** de préférence (Schloss & Palmer) ;
 * - **ni olive ni brun** : jaune foncé et orange foncé sont les couleurs les
 *   moins aimées (Palmer & Schloss, 2010). Un fond sombre assombrit toute
 *   teinte jaune ou orange jusqu'à elles ; il les désature donc.
 *
 * Tout se calcule en OKLCH, où une même clarté se perçoit comme telle quelle
 * que soit la teinte — en HSB, un jaune paraît bien plus clair qu'un bleu au
 * même réglage.
 */
const TONES: Tone[] = [
  { chroma: 0.025, light: 0.965, dark: 0.27 }, // brume
  { chroma: 0.035, light: 0.955, dark: 0.29 }, // poudré
  { chroma: 0.05, light: 0.94, dark: 0.31 }, // pastel
  { chroma: 0.065, light: 0.925, dark: 0.33 }, // tendre
];

/** Familles de teintes : une seule, le plus souvent ; deux ou trois, rarement. */
type Harmony = 'analogous' | 'complementary' | 'split';
const HARMONIES: Harmony[] = ['analogous', 'analogous', 'analogous', 'analogous', 'complementary', 'split'];

/** Encres et fonds éprouvés : seules les teintes sont tirées au sort. */
const RANDOM_INKS: Array<[string, string]> = [
  ['#1B1B1F', '#E8E8EC'],
  ['#14301C', '#D3EBD8'],
  ['#0E2A3A', '#CFE8F5'],
  ['#241A38', '#E4D9F5'],
  ['#2A2118', '#F3E7D8'],
  ['#1C2620', '#DCE8DE'],
  ['#191C28', '#DEE2F0'],
];

const RANDOM_GROUNDS: Array<[string, string]> = [
  ['#FCFCFD', '#1E1F22'],
  ['#F7F7F4', '#14161A'],
  ['#EFF1F5', '#1E1E2E'],
  ['#FBF7FF', '#282A36'],
  ['#ECEFF4', '#2E3440'],
  ['#FDF6E3', '#002B36'],
  ['#F4F7F2', '#16211A'],
  ['#F7F3FA', '#1E1728'],
  ['#F2F6F9', '#141E28'],
];

/**
 * Les teintes d'un tirage, dans l'ordre des colonnes.
 *
 * Une famille seule se parcourt en aller-retour : la teinte glisse d'un bout
 * de l'arc à l'autre puis revient, sans jamais sauter quand elle recommence.
 * Deux ou trois familles alternent d'une colonne à l'autre ; elles ne sont
 * tirées qu'avec une chroma réduite, là où des teintes opposées cessent de
 * se heurter.
 */
function harmonyHues(harmony: Harmony, count: number, random: () => number): number[] {
  // Teintes froides deux fois sur trois : du cyan au violet, en OKLCH. Sinon
  // n'importe où, sauf dans la bande orange–jaune–vert-jaune (50° à 145°) :
  // une famille centrée là n'aurait, en thème sombre, que des gris chauds à
  // offrir une fois désaturée. Elle peut y déborder, protégée par ailleurs.
  const start = random() < 0.66 ? 190 + random() * 110 : 145 + random() * 265;
  const wrap = (hue: number) => Math.round(((hue % 360) + 360) % 360);

  if (harmony === 'analogous') {
    const arc = 30 + random() * 50;
    const half = count / 2;
    return Array.from({ length: count }, (_, column) => {
      const level = Math.min(column, count - column);
      return wrap(start - arc / 2 + (arc * level) / half);
    });
  }
  const centres = harmony === 'complementary' ? [0, 180] : [0, 150, 210];
  const width = 20;
  return Array.from({ length: count }, (_, column) => {
    const family = column % centres.length;
    const rank = Math.floor(column / centres.length);
    return wrap(start + centres[family] + (rank % 2 === 0 ? -width / 2 : width / 2));
  });
}

/**
 * Tire une palette au sort.
 *
 * Le hasard choisit une famille de teintes, son départ, un ton, une encre et
 * un fond — jamais la lisibilité : deux cents tirages sont soumis aux mêmes
 * seuils que les palettes livrées.
 */
export function randomTheme(
  family: RandomFamily,
  id: string,
  label: string,
  random: () => number = Math.random,
): CsvTheme {
  const harmony = HARMONIES[Math.floor(random() * HARMONIES.length)];
  // Toujours pair : l'aller-retour des teintes culmine sur une seule colonne.
  const count = harmony === 'split' ? 6 : random() < 0.5 ? 6 : 8;
  const hues = harmonyHues(harmony, count, random);
  const base = TONES[Math.floor(random() * TONES.length)];
  // Des teintes opposées ne s'accordent qu'adoucies.
  const tone = harmony === 'analogous' ? base : { ...base, chroma: base.chroma * 0.75 };

  if (family === 'text') {
    const [light, dark] = RANDOM_GROUNDS[Math.floor(random() * RANDOM_GROUNDS.length)];
    return { ...inked(id, label, hues, light, dark), tone };
  }
  const [inkLight, inkDark] = RANDOM_INKS[Math.floor(random() * RANDOM_INKS.length)];
  return { ...tinted(id, label, hues, VIVID, inkLight, inkDark, 0), tone };
}

/**
 * Couleurs d'une colonne pour une palette en OKLCH.
 *
 * Les colonnes voisines alternent légèrement de clarté : c'est ce qui les
 * distingue quand leurs teintes sont proches, et c'est la seule différence
 * qu'Ou & Luo trouvent harmonieuse en soi. L'alternance porte sur le rang de
 * la colonne, pas sur celui de la teinte : aucun saut au recommencement.
 */
function tonePalette(theme: CsvTheme, tone: Tone, column: number, dark: boolean): Palette {
  const hue = theme.hues[column % theme.hues.length];
  const swing = column % 2 === 0 ? 1 : -1;
  // Un orange, un jaune ou un vert-jaune assombri devient brun ou olive —
  // le minimum de préférence, « greenish brown or olive » chez Palmer &
  // Schloss : désaturé en thème sombre. Bande élargie après avoir vu passer un
  // vert-jaune à 140° qui, laissé tel quel, virait au kaki.
  const muddy = dark && hue >= 50 && hue <= 145;
  const chroma = muddy ? tone.chroma * 0.3 : tone.chroma;

  if (theme.neutral) {
    const ground = dark ? theme.neutral.dark : theme.neutral.light;
    const ink = dark ? oklch(0.82 + 0.03 * swing, 0.075, hue) : oklch(0.5 - 0.035 * swing, 0.09, hue);
    return { cell: ground, band: shiftBrightness(ground, dark ? 0.1 : -0.05), accent: ink, text: ink };
  }

  const lightness = dark ? tone.dark + 0.022 * swing : tone.light - 0.02 * swing;
  return {
    cell: oklch(lightness, chroma, hue),
    band: oklch(lightness + (dark ? 0.035 : -0.025), chroma * 1.15, hue),
    accent: dark ? oklch(0.76, 0.09, hue) : oklch(0.6, 0.1, hue),
    text: dark ? theme.uniformInk!.dark : theme.uniformInk!.light,
  };
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
  if (theme.tone) return tonePalette(theme, theme.tone, column, dark);
  const hue = theme.hues[column % theme.hues.length];
  const style = theme.style;
  const shift = offset(theme, column, dark);

  const accent = dark
    ? hsb(hue, style.accentSaturation * 0.8, style.accentBrightnessDark)
    : hsb(hue, style.accentSaturation, style.accentBrightness);

  if (theme.neutral) {
    const uniform = dark ? theme.neutral.dark : theme.neutral.light;
    if (theme.inks) {
      const list = dark ? theme.inks.dark : theme.inks.light;
      const ink = list[column % list.length];
      return {
        cell: uniform,
        band: shiftBrightness(uniform, dark ? 0.1 : -0.05),
        // L'histogramme reprend l'encre : deux couleurs pour une même colonne
        // demanderaient au lecteur de faire le lien lui-même.
        accent: ink,
        text: ink,
      };
    }
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

// ------------------------------------------------------------------ OKLCH
// Espace où une même clarté L se perçoit comme telle, quelle que soit la
// teinte (Björn Ottosson, 2020).

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function fromOklab(lightness: number, a: number, b: number): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * Couleur OKLCH vers « #rrggbb ». Hors de ce qu'un écran affiche, la chroma
 * est réduite par paliers jusqu'à y rentrer — jamais la clarté, que la
 * palette garantit.
 */
export function oklch(lightness: number, chroma: number, hueDegrees: number): string {
  const angle = (hueDegrees * Math.PI) / 180;
  for (let keep = 1; keep >= 0; keep -= 0.05) {
    const rgb = fromOklab(lightness, chroma * keep * Math.cos(angle), chroma * keep * Math.sin(angle));
    if (rgb.every((channel) => channel >= -0.001 && channel <= 1.001)) return toHex(rgb[0], rgb[1], rgb[2]);
  }
  const grey = fromOklab(lightness, 0, 0);
  return toHex(grey[0], grey[1], grey[2]);
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
