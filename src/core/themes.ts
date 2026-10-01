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
   * Palette tirée au sort : ses couleurs exactes, pour les deux thèmes.
   * Elles sont copiées dans la palette plutôt que désignées par un nom, pour
   * qu'une palette gardée ne dépende d'aucune table susceptible de changer.
   * Réservé aux tirages ; les palettes livrées ne le portent pas.
   */
  sample?: Sample;
}

/** Ce qu'un tirage affiche dans un thème, clair ou sombre. */
export interface SampleMode {
  /** Fond du tableau, quand c'est le texte qui porte la couleur. */
  ground: string;
  /**
   * Les couleurs du dégradé, dans l'ordre du chemin. Le tableau les parcourt
   * en aller-retour : il ne saute jamais de la dernière à la première.
   */
  colours: string[];
}

export interface Sample {
  /** La forme du chemin tiré : du sombre au clair, promenade pastel… */
  source: string;
  /** Couleur au fond des cellules (vrai) ou au texte (faux). */
  tint: boolean;
  light: SampleMode;
  dark: SampleMode;
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
 * Les tirages au sort tracent un dégradé : un chemin dans l'espace des
 * couleurs, où la clarté et la teinte changent ensemble, pas à pas.
 *
 * C'est le principe commun aux palettes jugées harmonieuses à l'essai — crème,
 * menthe, vert d'eau ; indigo, lavande, rose ; marine, rouge, ambre, beige.
 * Les cinq versions précédentes faisaient l'inverse : même clarté pour toutes
 * les colonnes, seule la teinte sautait de l'une à l'autre — des couleurs
 * juxtaposées, jamais un dégradé. Les illustrateurs appellent la règle sous-
 * jacente « hue shifting » : en s'éclaircissant, une couleur glisse vers le
 * chaud ; en s'assombrissant, vers le froid.
 *
 * Six formes de chemin, relevées sur treize palettes de référence ; le hasard
 * choisit la forme, le départ, le sens et l'amplitude. Tout se calcule en
 * OKLCH, où une même clarté se perçoit comme telle quelle que soit la teinte.
 */
type PathKind = 'rise' | 'fade' | 'pastel' | 'diverging' | 'vivid' | 'saturate';
const PATH_KINDS: PathKind[] = ['rise', 'rise', 'fade', 'pastel', 'pastel', 'diverging', 'vivid', 'vivid', 'saturate'];

interface Point {
  l: number;
  c: number;
  h: number;
}

/** Écart minimal entre deux colonnes voisines : le seuil que tiennent les palettes livrées. */
const MIN_APART = 12;

const NEUTRAL_GROUNDS = { light: '#FBFBFC', dark: '#1E1F22' };

/** Part de la saturation gardée au fond des cellules. */
const CELL_SOFTNESS = 0.55;

function between(low: number, high: number, random: () => number): number {
  return low + (high - low) * random();
}

/** Une teinte qui va de `from` à `from + span`, dans un sens ou dans l'autre. */
function sweep(from: number, span: number, t: number): number {
  return (((from + span * t) % 360) + 360) % 360;
}

/** Les points d'un chemin, de cinq à sept. */
function tracePath(kind: PathKind, random: () => number): Point[] {
  const count = 5 + Math.floor(random() * 3);
  const start = random() * 360;
  const direction = random() < 0.5 ? -1 : 1;
  const at = (build: (t: number) => Point) => Array.from({ length: count }, (_, i) => build(i / (count - 1)));
  switch (kind) {
    case 'rise': {
      // Du sombre au clair, la teinte glissant de 60 à 200° en chemin.
      const span = direction * between(60, 200, random);
      const [dark, light, peak] = [between(0.3, 0.45, random), between(0.88, 0.95, random), between(0.1, 0.17, random)];
      const points = at((t) => ({ l: dark + (light - dark) * t, c: 0.04 + (peak - 0.04) * Math.sin(Math.PI * Math.min(1, t * 1.15)), h: sweep(start, span, t) }));
      return random() < 0.5 ? points : points.reverse();
    }
    case 'fade': {
      // Du clair au moyen : crème, menthe, vert d'eau.
      const span = direction * between(60, 170, random);
      const [top, bottom, peak] = [between(0.93, 0.97, random), between(0.62, 0.74, random), between(0.09, 0.14, random)];
      return at((t) => ({ l: top + (bottom - top) * t, c: 0.035 + (peak - 0.035) * t, h: sweep(start, span, t) }));
    }
    case 'pastel': {
      // Tout reste clair, seule la teinte se promène, parfois loin.
      const span = direction * between(80, 220, random);
      const [low, high, chroma] = [between(0.76, 0.84, random), between(0.86, 0.94, random), between(0.07, 0.12, random)];
      return at((t) => ({ l: low + (high - low) * t, c: chroma * (1 - 0.2 * t), h: sweep(start, span, t) }));
    }
    case 'diverging': {
      // Deux couleurs soutenues, qui pâlissent jusqu'à se rejoindre au centre.
      const other = start + direction * between(120, 210, random);
      const [end, chroma] = [between(0.42, 0.62, random), between(0.11, 0.17, random)];
      return at((t) => {
        const distance = Math.abs(t - 0.5) * 2;
        return { l: 0.94 + (end - 0.94) * distance, c: 0.025 + (chroma - 0.025) * distance, h: t < 0.5 ? start : ((other % 360) + 360) % 360 };
      });
    }
    case 'vivid': {
      // Des couleurs franches qui se suivent de loin : ambre, cramoisi, prune,
      // sarcelle, cyan. Sans ancre sombre au départ : essayée, elle faisait un
      // bond de clarté que le reste du chemin ne faisait jamais.
      const span = direction * between(150, 260, random);
      return at((t) => ({ l: 0.6 + 0.18 * Math.sin(Math.PI * t), c: between(0.13, 0.17, random), h: sweep(start, span, t) }));
    }
    case 'saturate': {
      // Une seule famille, du gris pâle à la couleur pleine puis au sombre.
      // Jamais vers l'orange ou le jaune : du gris à eux, le chemin passe
      // forcément par le kaki.
      const family = start >= 30 && start <= 145 ? start + 150 : start;
      return at((t) => ({ l: 0.92 - 0.55 * t, c: 0.01 + 0.16 * Math.sin(Math.PI * Math.min(1, t * 0.85)), h: sweep(family, direction * 25, t) }));
    }
  }
}

/**
 * Brun, ocre, kaki ou olive — les couleurs les moins aimées (Palmer & Schloss,
 * 2010), rejetées à chaque essai.
 *
 * Le brun n'est pas qu'une affaire de clarté : un orange ou un jaune peu
 * saturé se lit tan ou ocre même assez clair, et un orange saturé ne se lit
 * orange qu'au-dessus d'une clarté d'environ 0,7. Une première définition, qui
 * ne visait que les couleurs foncées (sous 0,6), laissait passer des fonds
 * ocre et kaki, et un orange brûlé — vus sur la planche de contrôle.
 */
function muddy(hex: string, large: boolean): boolean {
  const [lightness, a, b] = toOklab(hex);
  const chroma = Math.hypot(a, b);
  if (chroma < 0.015) return false;
  const hue = (((Math.atan2(b, a) * 180) / Math.PI) % 360 + 360) % 360;
  // Vieux rose sombre et terne : taupe, apparu dès que les fonds ont été
  // adoucis (#C59CA4, clarté 0,73). Plus clair, il reste un rose poudré —
  // celui d'une palette de référence, vers 0,79.
  if (hue < 30 && lightness < 0.76 && chroma < 0.06) return true;
  // Rouge-orangé : bordeaux s'il est foncé ; en aplat, terracotta jusqu'à une
  // clarté de 0,7, au-delà de laquelle il se lit saumon.
  if (hue >= 15 && hue < 30) return lightness < (large ? 0.7 : 0.45);
  // Orange : brun s'il est sombre, tan s'il est terne.
  // Beige rosé (#D7B9AC, clarté 0,81) : un orange presque gris doit être très clair.
  if (hue >= 30 && hue < 75) {
    return lightness < (large ? 0.72 : 0.68) || (lightness < 0.8 && chroma < 0.1) || (lightness < 0.86 && chroma < 0.05);
  }
  // Jaune : il ne se lit jaune — citron, ambre — que très clair ; plus bas, il
  // vire moutarde, vu sur la planche de contrôle à une clarté de 0,72.
  if (hue >= 75 && hue < 110) return lightness < 0.84;
  // Vert-jaune : olive s'il est sombre ou soutenu sans être clair, kaki s'il est terne.
  // Un vert-jaune vif ne se lit citron vert qu'à partir d'une clarté de 0,8,
  // en fond comme en texte.
  if (hue >= 110 && hue <= 145) {
    return lightness < 0.6 || (chroma >= 0.1 && lightness < 0.8) || (lightness < 0.78 && chroma < 0.1);
  }
  return false;
}

/**
 * La couleur d'un point, éclaircie juste ce qu'il faut pour ne pas brunir :
 * plutôt que de retirer une couleur du chemin, ce qui casserait le dégradé.
 */
function clean(point: Point, large: boolean): string {
  return oklch(cleanLightness(point, large), point.c, point.h);
}

/** La clarté qu'il faut à un point pour ne pas brunir. */
function cleanLightness(point: Point, large: boolean): number {
  let lightness = point.l;
  while (muddy(oklch(lightness, point.c, point.h), large) && lightness < 0.95) lightness += 0.02;
  return lightness;
}

/** Écart le plus grand sur une composante : ce que l'œil distingue d'une colonne à l'autre. */
function apart(first: string, second: string): number {
  return Math.max(...[1, 3, 5].map((at) => Math.abs(parseInt(first.slice(at, at + 2), 16) - parseInt(second.slice(at, at + 2), 16))));
}

/**
 * La même suite en couleur de texte sur fond neutre : la clarté est ramenée
 * dans une plage lisible, dans le même ordre, si bien que le dégradé demeure.
 */
function asInk(points: Point[], dark: boolean): string[] {
  const lightness = points.map((point) => point.l);
  const [low, high] = [Math.min(...lightness), Math.max(...lightness)];
  return points.map((point) => {
    const t = high > low ? (point.l - low) / (high - low) : 0.5;
    const l = dark ? 0.68 + 0.22 * t : 0.38 + 0.22 * t;
    // Sur fond clair, un texte jaune assez clair pour ne pas virer moutarde
    // ne se lirait plus : il glisse vers l'orange ou le vert, ses voisins.
    const hue = !dark && point.h >= 75 && point.h < 145 ? (point.h < 110 ? 65 : 150) : point.h;
    // Une encre peu saturée se lit grise, ou kaki dans les teintes chaudes.
    return clean({ l, c: Math.max(point.c, 0.1), h: hue }, false);
  });
}

/**
 * Tire une palette au sort. Un chemin dont deux couleurs successives se
 * confondent — il arrive qu'une promenade pastel soit trop courte — est
 * retracé, plutôt que livré avec deux colonnes jumelles.
 */
export function randomTheme(
  family: RandomFamily,
  id: string,
  label: string,
  random: () => number = Math.random,
): CsvTheme {
  const tint = family === 'background';
  let kind: PathKind = 'rise';
  let light: string[] = [];
  let darkColours: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    kind = PATH_KINDS[Math.floor(random() * PATH_KINDS.length)];
    const points = tracePath(kind, random);
    // Un fond sombre reste sourd, comme l'indigo nuit des palettes de
    // référence : sombre et saturé à la fois, c'était le premier rejet.
    // Au fond des cellules, la couleur est adoucie : à pleine intensité, un
    // grand aplat est trop fort (médiane de chroma 0,084, jusqu'à 0,171),
    // jugé tel à l'essai. La clarté ne bouge pas : le dégradé reste le même.
    const cells = points.map((point) => ({ ...point, c: Math.min(point.c * CELL_SOFTNESS, point.l < 0.5 ? 0.06 : 1) }));
    // Un fond qu'il faudrait trop éclaircir pour ne pas brunir déformerait le
    // dégradé — un bond au milieu du chemin : on retrace plutôt. Jamais à la
    // dernière tentative, qui doit toujours livrer une palette.
    const last = attempt === 39;
    if (!last && tint && cells.some((point) => cleanLightness(point, true) - point.l > 0.08)) continue;
    light = tint ? cells.map((point) => clean(point, true)) : asInk(points, false);
    darkColours = tint ? light : asInk(points, true);
    const steps = [light, darkColours].flatMap((list) => list.slice(1).map((colour, i) => apart(list[i], colour)));
    if (Math.min(...steps) >= MIN_APART) break;
  }
  const sample: Sample = {
    source: kind,
    tint,
    light: { ground: NEUTRAL_GROUNDS.light, colours: light },
    dark: { ground: NEUTRAL_GROUNDS.dark, colours: darkColours },
  };
  return { id, label, hues: darkColours.map(hueOf), style: VIVID, spread: 0, sample };
}

/** Rang de la couleur d'une colonne : le dégradé, puis le chemin inverse. */
function pingPong(column: number, count: number): number {
  if (count < 2) return 0;
  const period = 2 * (count - 1);
  const step = column % period;
  return step < count ? step : period - step;
}

/** Texte noir ou blanc, selon ce qui se lit le mieux sur ce fond. */
function inkFor(cell: string): string {
  return toOklab(cell)[0] > 0.66 ? '#1B1B1F' : '#F4F4F6';
}

/** Couleurs d'une colonne pour une palette tirée. */
function samplePalette(sample: Sample, column: number, dark: boolean): Palette {
  const mode = dark ? sample.dark : sample.light;
  const colour = mode.colours[pingPong(column, mode.colours.length)];
  if (!sample.tint) {
    return { cell: mode.ground, band: shiftBrightness(mode.ground, dark ? 0.1 : -0.05), accent: colour, text: colour };
  }
  // La couleur telle quelle au fond, comme dans un nuancier ; le bandeau et
  // l'histogramme en reprennent la teinte, l'un un peu plus soutenu, l'autre
  // assez contrasté pour se lire dessus.
  const text = inkFor(colour);
  const [l, a, b] = toOklab(colour);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  const contrasted = l > 0.66 ? l - 0.38 : l + 0.32;
  // Sur un fond jaune ou orange, la même teinte assombrie serait un brun ou
  // un olive : l'histogramme passe alors au gris foncé, à peine teinté.
  let accent = oklch(contrasted, Math.max(Math.hypot(a, b), 0.08), hue);
  if (muddy(accent, false)) accent = oklch(contrasted, 0, hue);
  return { cell: colour, band: shiftBrightness(colour, l > 0.66 ? -0.05 : 0.06), accent, text };
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
  if (theme.sample) return samplePalette(theme.sample, column, dark);
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

function toOklab(hex: string): [number, number, number] {
  const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const [red, green, blue] = [1, 3, 5].map((at) => linear(parseInt(hex.slice(at, at + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
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
