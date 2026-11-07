/**
 * Ce que le panneau de détail ajoute au diagnostic d'une colonne : des valeurs
 * qui ressemblent à une absence déguisée, la série dans l'ordre des lignes, les
 * colonnes qui varient ensemble, et ce que pandas ferait mieux.
 *
 * Tout est pur : le webview ne fait que dessiner ce qui sort d'ici.
 */

/** Une valeur qui tient la place d'une absence — `-999`, `9999`, `1900-01-01`. */
export interface Placeholder {
  /** Telle qu'elle est écrite le plus souvent dans le fichier. */
  value: string;
  /** Toutes ses écritures rognées (`-999`, `-999.0`), pour l'étape « traiter comme vide ». */
  tokens: string[];
  /** Les mêmes, telles qu'elles sont dans le fichier — espaces compris : ce que le filtre doit retrouver. */
  raws: string[];
  count: number;
}

/** Les valeurs-balises les plus courantes dans les exports de capteurs et de bases. */
const KNOWN_NUMERIC = new Set([-99999, -9999, -999, -99, 99, 999, 9999, 99999, 9999999]);
const KNOWN_DATES = new Set(['1900-01-01', '1970-01-01', '9999-12-31', '0000-00-00', '01/01/1900', '1/1/1900', '31/12/9999', '1900-01-00']);

/** Un nombre isolé qui revient au moins 3 fois est plus qu'un hasard. */
const MIN_SPIKE = 3;

export interface Quartiles {
  q1: number;
  median: number;
  q3: number;
}

/** Quartiles pondérés par les effectifs, interpolés comme numpy. */
export function quartilesOf(pairs: Array<[number, number]>): Quartiles | null {
  const sorted = [...pairs].sort((left, right) => left[0] - right[0]);
  const total = sorted.reduce((sum, [, occurrences]) => sum + occurrences, 0);
  if (total === 0) return null;
  const at = (rank: number): number => {
    let seen = 0;
    for (const [value, occurrences] of sorted) {
      seen += occurrences;
      if (rank < seen) return value;
    }
    return sorted[sorted.length - 1][0];
  };
  const quantile = (fraction: number): number => {
    const position = fraction * (total - 1);
    const low = Math.floor(position);
    const weight = position - low;
    const lower = at(low);
    return weight === 0 ? lower : lower + (at(low + 1) - lower) * weight;
  };
  return { q1: quantile(0.25), median: quantile(0.5), q3: quantile(0.75) };
}

/**
 * Les valeurs numériques qui tiennent la place d'une absence.
 *
 * Une valeur est suspecte si elle est connue pour ça (`-999`) et sort de la
 * masse, ou si elle sort de la masse et se répète à l'identique : une mesure
 * continue ne retombe pas trois fois sur le même extrême. Un entier légitime
 * (`999` dans une colonne qui monte à 1 500) n'est jamais un outlier, donc
 * jamais soupçonné.
 */
export function numericPlaceholders(entries: Array<[string, number]>, parse: (raw: string) => number | null): Placeholder[] {
  const byValue = new Map<number, Array<[string, number]>>();
  for (const [raw, occurrences] of entries) {
    const value = parse(raw);
    if (value === null) continue;
    const group = byValue.get(value);
    if (group) group.push([raw, occurrences]);
    else byValue.set(value, [[raw, occurrences]]);
  }
  const pairs: Array<[number, number]> = [...byValue.entries()].map(([value, group]) => [value, group.reduce((sum, [, n]) => sum + n, 0)]);
  const quartiles = quartilesOf(pairs);
  if (!quartiles) return [];
  const spread = quartiles.q3 - quartiles.q1;
  const low = quartiles.q1 - 1.5 * spread;
  const high = quartiles.q3 + 1.5 * spread;
  const found: Placeholder[] = [];
  for (const [value, count] of pairs) {
    if (value >= low && value <= high) continue;
    if (count < (KNOWN_NUMERIC.has(value) ? 2 : MIN_SPIKE)) continue;
    found.push(placeholderOf(byValue.get(value) ?? [], count));
  }
  // Une balise qui domine (plus d'un quart des lignes) tire les quartiles vers elle et
  // n'a plus rien d'extérieur : on la juge alors sur ce qui reste une fois les balises
  // connues mises de côté.
  const flagged = new Set(found.map((entry) => entry.value));
  const candidates = pairs.filter(([value, count]) => count >= 2 && KNOWN_NUMERIC.has(value) && !flagged.has(placeholderOf(byValue.get(value) ?? [], count).value));
  if (candidates.length > 0) {
    const rest = pairs.filter(([value]) => !candidates.some(([other]) => other === value));
    const restQuartiles = quartilesOf(rest);
    if (restQuartiles) {
      const restSpread = restQuartiles.q3 - restQuartiles.q1;
      const restLow = restQuartiles.q1 - 1.5 * restSpread;
      const restHigh = restQuartiles.q3 + 1.5 * restSpread;
      for (const [value, count] of candidates) {
        if (value < restLow || value > restHigh) found.push(placeholderOf(byValue.get(value) ?? [], count));
      }
    }
  }
  return found.sort((left, right) => right.count - left.count);
}

function placeholderOf(group: Array<[string, number]>, count: number): Placeholder {
  const sorted = [...group].sort((left, right) => right[1] - left[1]);
  return { value: sorted[0][0].trim(), tokens: sorted.map(([raw]) => raw.trim()), raws: sorted.map(([raw]) => raw), count };
}

/** Les dates-balises : `1900-01-01`, `9999-12-31`. */
export function temporalPlaceholders(entries: Array<[string, number]>): Placeholder[] {
  return entries
    .filter(([raw, count]) => count >= 2 && KNOWN_DATES.has(raw.trim()))
    .map(([raw, count]) => ({ value: raw.trim(), tokens: [raw.trim()], raws: [raw], count }))
    .sort((left, right) => right.count - left.count);
}

export interface Summary {
  min: number;
  max: number;
  mean: number;
  median: number;
  deviation: number;
  count: number;
}

/** Les chiffres de la colonne si certaines valeurs n'y étaient pas. */
export function summaryWithout(
  entries: Array<[string, number]>,
  parse: (raw: string) => number | null,
  excluded: Set<string>,
): Summary | null {
  const pairs: Array<[number, number]> = [];
  let count = 0;
  let sum = 0;
  for (const [raw, occurrences] of entries) {
    if (excluded.has(raw.trim())) continue;
    const value = parse(raw);
    if (value === null) continue;
    pairs.push([value, occurrences]);
    count += occurrences;
    sum += value * occurrences;
  }
  if (count === 0) return null;
  const mean = sum / count;
  let squares = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const [value, occurrences] of pairs) {
    squares += occurrences * (value - mean) ** 2;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const quartiles = quartilesOf(pairs);
  return { min, max, mean, median: quartiles?.median ?? mean, deviation: count > 1 ? Math.sqrt(squares / (count - 1)) : 0, count };
}

/**
 * Où le niveau d'une série change, s'il change : l'indice de la coupure qui
 * sépare le mieux deux moyennes, à condition que l'écart dépasse un écart-type
 * de l'intérieur des segments — un bruit régulier ne coupe jamais.
 */
export function levelShift(values: number[]): number | null {
  const n = values.length;
  if (n < 40) return null;
  // Une montée ou une descente régulière est une tendance, pas un saut : une
  // colonne d'identifiants ne « change » nulle part.
  const trend = pearson(values.map((_, index) => index), values);
  if (trend !== null && Math.abs(trend) >= 0.9) return null;
  const sums = new Float64Array(n + 1);
  const squares = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sums[i + 1] = sums[i] + values[i];
    squares[i + 1] = squares[i] + values[i] ** 2;
  }
  const step = Math.max(1, Math.floor(n / 200));
  let best: number | null = null;
  let bestScore = 0;
  for (let k = Math.ceil(n * 0.1); k <= Math.floor(n * 0.9); k += step) {
    const leftMean = sums[k] / k;
    const rightMean = (sums[n] - sums[k]) / (n - k);
    const within = squares[n] - squares[k] - (sums[n] - sums[k]) ** 2 / (n - k) + (squares[k] - sums[k] ** 2 / k);
    const sigma = Math.sqrt(within / (n - 2));
    if (sigma === 0) continue;
    const effect = Math.abs(leftMean - rightMean) / sigma;
    const score = effect * Math.sqrt((k * (n - k)) / n);
    if (effect >= 1 && score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return bestScore >= 8 ? best : null;
}

/** Coefficient de Pearson ; null s'il n'y a pas de quoi le calculer. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 20) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

export interface NumericColumn {
  index: number;
  name: string;
  /** Les écritures à ignorer (valeurs-balises). */
  excluded: Set<string>;
  parse: (raw: string) => number | null;
}

export interface Correlation {
  left: number;
  right: number;
  r: number;
}

/** Au-delà, on regarde un échantillon régulier : la corrélation n'en change pas. */
const SAMPLE = 20000;

/** Les paires de colonnes numériques les plus liées, de |r| décroissant. */
export function topCorrelations(rows: string[][], columns: NumericColumn[], threshold = 0.5, limit = 6): Correlation[] {
  const stride = Math.max(1, Math.ceil(rows.length / SAMPLE));
  const found: Correlation[] = [];
  for (let a = 0; a < columns.length; a++) {
    for (let b = a + 1; b < columns.length; b++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < rows.length; i += stride) {
        const rawX = rows[i]?.[columns[a].index] ?? '';
        const rawY = rows[i]?.[columns[b].index] ?? '';
        if (columns[a].excluded.has(rawX.trim()) || columns[b].excluded.has(rawY.trim())) continue;
        const x = columns[a].parse(rawX);
        const y = columns[b].parse(rawY);
        if (x === null || y === null) continue;
        xs.push(x);
        ys.push(y);
      }
      const r = pearson(xs, ys);
      if (r !== null && Math.abs(r) >= threshold) found.push({ left: columns[a].index, right: columns[b].index, r });
    }
  }
  return found.sort((left, right) => Math.abs(right.r) - Math.abs(left.r)).slice(0, limit);
}

export interface TypeFacts {
  kind: 'numeric' | 'text' | 'other';
  rows: number;
  present: number;
  /** Des cellules vides ou de simples espaces : pandas y met NaN. */
  gaps: number;
  distinct: number;
  integersOnly: boolean;
  min: number;
  max: number;
  /** Plus grand nombre de chiffres significatifs vus dans une valeur. */
  digits: number;
}

const MEGABYTE = 1024 * 1024;

/** Ce que pandas gagnerait à lire autrement. Jamais appliqué sans qu'on le demande. */
export function pandasHints(facts: TypeFacts): string[] {
  const hints: string[] = [];
  if (facts.kind === 'numeric' && facts.integersOnly) {
    if (facts.gaps > 0) {
      hints.push('Integers, but the empty cells make pandas read float64 · dtype="Int64" keeps them as integers');
    } else {
      const size = facts.min >= -128 && facts.max <= 127 ? 1 : facts.min >= -32768 && facts.max <= 32767 ? 2 : facts.min >= -2147483648 && facts.max <= 2147483647 ? 4 : 8;
      const saved = facts.rows * (8 - size);
      if (size < 8 && saved >= MEGABYTE / 2) hints.push(`int${size * 8} is enough (range ${facts.min} to ${facts.max}) · saves about ${(saved / MEGABYTE).toFixed(1)} MB`);
    }
  } else if (facts.kind === 'numeric' && facts.digits <= 7 && facts.rows * 4 >= MEGABYTE / 2) {
    hints.push(`At most ${facts.digits} significant digits: float32 is enough · saves about ${((facts.rows * 4) / MEGABYTE).toFixed(1)} MB`);
  } else if (facts.kind === 'text' && facts.present >= 1000 && facts.distinct <= 100 && facts.distinct <= facts.present * 0.05) {
    hints.push(`${facts.distinct} different values over ${facts.present} rows · dtype="category" takes far less memory`);
  }
  return hints;
}

// ── Valeurs presque identiques ─────────────────────────────────────────────

export interface SimilarGroup {
  /** La graphie la plus fréquente : celle vers laquelle fusionner. */
  canonical: string;
  count: number;
  variants: Array<{ value: string; count: number }>;
}

/** Au-delà, comparer deux à deux coûterait trop cher pour ce que ça rapporte. */
const MAX_DISTINCT = 2500;

/** La valeur sans casse, sans accent ni ponctuation : `Étoile` et `etoile!` se confondent. */
export function looseKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distance d'édition bornée : s'arrête dès qu'elle dépasse `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length];
}

/**
 * Les graphies d'une même valeur : `Lyon`, `Lyons`, `lyon `.
 *
 * On parcourt les valeurs de la plus fréquente à la plus rare ; chacune rejoint
 * la graphie établie dont elle est à une ou deux lettres, ou devient une graphie
 * à part entière. Une faute de frappe est rare face à la bonne forme : deux
 * valeurs aussi fréquentes l'une que l'autre (`Chine`, `Chili`) restent séparées.
 * Les valeurs qui contiennent un chiffre (codes, références) ne se comparent
 * pas : `OEUF-053` et `OEUF-054` sont voisins et distincts.
 */
export function similarValues(entries: Array<[string, number]>): SimilarGroup[] {
  const candidates = entries
    // Une valeur aux accents abîmés se corrige par l'encodage, pas par une fusion.
    .filter(([raw]) => raw.trim().length >= 2 && !/\d/.test(raw) && fixMojibake(raw) === null)
    .map(([raw, count]) => ({ raw, count, key: looseKey(raw) }))
    .filter((entry) => entry.key.length >= 2);
  if (candidates.length < 2 || candidates.length > MAX_DISTINCT) return [];
  candidates.sort((left, right) => right.count - left.count || (left.raw < right.raw ? -1 : 1));

  const groups: Array<{ key: string; canonical: string; count: number; variants: SimilarGroup['variants'] }> = [];
  for (const entry of candidates) {
    const limit = entry.key.length >= 9 ? 2 : 1;
    // Même mot à la casse, aux accents ou à la ponctuation près : quelle que soit sa
    // longueur (`Feu`, `FEU`). Une lettre de différence ne se tolère qu'à partir de
    // 4 lettres : `Mali` et `Mal` sont deux mots.
    const home = groups.find(
      (group) =>
        group.key === entry.key ||
        (entry.key.length >= 4 && group.key.length >= 4 && group.count >= entry.count * 3 && editDistance(group.key, entry.key, limit) <= limit),
    );
    if (home) home.variants.push({ value: entry.raw, count: entry.count });
    else groups.push({ key: entry.key, canonical: entry.raw, count: entry.count, variants: [] });
  }
  return groups
    .filter((group) => group.variants.length > 0)
    .map(({ canonical, count, variants }) => ({ canonical, count, variants }))
    .sort((left, right) => sumCounts(right.variants) - sumCounts(left.variants));
}

function sumCounts(variants: Array<{ count: number }>): number {
  return variants.reduce((sum, variant) => sum + variant.count, 0);
}

// ── Caractères mal décodés ─────────────────────────────────────────────────

/** Ce que Windows-1252 met aux positions 0x80–0x9F, que Unicode place ailleurs. */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/**
 * `CafÃ©` → `Café`. Un fichier UTF-8 lu comme du Windows-1252 : chaque lettre
 * accentuée est devenue deux caractères. On refait le chemin inverse, et on ne
 * garde le résultat que s'il est de l'UTF-8 valide — un texte sain ne passe
 * jamais, `null` signale qu'il n'y a rien à corriger.
 */
export function fixMojibake(raw: string): string | null {
  if (!/[ÃÂâ]/.test(raw)) return null;
  const bytes: number[] = [];
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    const byte = code < 256 ? code : CP1252[code];
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  try {
    const fixed = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return fixed !== raw && !fixed.includes('�') ? fixed : null;
  } catch {
    return null;
  }
}

export interface Garbled {
  value: string;
  fixed: string;
  count: number;
}

export function garbledValues(entries: Array<[string, number]>): Garbled[] {
  const found: Garbled[] = [];
  for (const [raw, count] of entries) {
    const fixed = fixMojibake(raw);
    if (fixed !== null) found.push({ value: raw, fixed, count });
  }
  return found.sort((left, right) => right.count - left.count);
}

// ── Trous dans une suite ───────────────────────────────────────────────────

export interface Gap {
  after: string;
  before: string;
  /** Combien de valeurs attendues manquent entre les deux. */
  missing: number;
}

export interface Gaps {
  /** Le pas le plus courant : 1 pour des identifiants, 86 400 000 ms pour des jours. */
  step: number;
  /** « day », « hour »… pour une série de dates ; null sinon. */
  every: string | null;
  gaps: Gap[];
  missing: number;
}

const UNITS: Array<[number, string]> = [
  [1000, 'second'],
  [60_000, 'minute'],
  [3_600_000, 'hour'],
  [86_400_000, 'day'],
  [604_800_000, 'week'],
];

/**
 * Les trous d'une suite régulière : identifiants 1, 2, 3, 5, 6 (le 4 manque),
 * ou jours consécutifs dont un manque. Une série n'est « régulière » que si
 * 80 % des écarts sont identiques : sinon ce n'est pas une suite, et chercher
 * des trous n'aurait pas de sens.
 */
export function sequenceGaps(entries: Array<[string, number]>, parse: (raw: string) => number | null, temporal: boolean): Gaps | null {
  const points: Array<[number, string]> = [];
  let present = 0;
  for (const [raw, occurrences] of entries) {
    const value = parse(raw);
    if (value === null) continue;
    present += occurrences;
    points.push([value, raw.trim()]);
  }
  if (points.length < 20) return null;
  // Un identifiant est presque unique ; une mesure entière répétée n'est pas une suite.
  if (!temporal && (points.length < present * 0.9 || !points.every(([value]) => Number.isInteger(value)))) return null;
  points.sort((left, right) => left[0] - right[0]);

  const deltas = new Map<number, number>();
  for (let i = 1; i < points.length; i++) {
    const delta = points[i][0] - points[i - 1][0];
    deltas.set(delta, (deltas.get(delta) ?? 0) + 1);
  }
  let step = 0;
  let share = 0;
  for (const [delta, occurrences] of deltas) {
    if (delta > 0 && occurrences > share) {
      step = delta;
      share = occurrences;
    }
  }
  if (step === 0 || share < (points.length - 1) * 0.8) return null;
  if (temporal && step < 1000) return null;

  const gaps: Gap[] = [];
  let missing = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i][0] - points[i - 1][0];
    if (delta > step * 1.5) {
      const lost = Math.round(delta / step) - 1;
      gaps.push({ after: points[i - 1][1], before: points[i][1], missing: lost });
      missing += lost;
    }
  }
  if (gaps.length === 0) return null;
  const every = temporal ? (UNITS.find(([size]) => size === step)?.[1] ?? null) : null;
  return { step, every, gaps, missing };
}

// ── Moyenne par catégorie ──────────────────────────────────────────────────

export interface GroupStat {
  key: string;
  count: number;
  mean: number;
}

export interface Grouping {
  /** Les groupes les plus fournis, par moyenne décroissante. */
  groups: GroupStat[];
  /** Part de la variation de la mesure que la catégorie explique, de 0 à 1 (η²). */
  explained: number;
  /** Les groupes trop petits pour être montrés. */
  hidden: number;
}

const MAX_GROUPS = 12;

/** La mesure moyenne de chaque catégorie, et ce que la catégorie explique. */
export function groupMeans(pairs: Array<[string, number]>): Grouping | null {
  const sums = new Map<string, { count: number; sum: number }>();
  let total = 0;
  let sum = 0;
  for (const [key, value] of pairs) {
    if (!Number.isFinite(value)) continue;
    const entry = sums.get(key);
    if (entry) {
      entry.count++;
      entry.sum += value;
    } else sums.set(key, { count: 1, sum: value });
    total++;
    sum += value;
  }
  if (sums.size < 2 || total < 10) return null;
  const mean = sum / total;
  let spread = 0;
  let between = 0;
  for (const [, entry] of sums) between += entry.count * (entry.sum / entry.count - mean) ** 2;
  for (const [, value] of pairs) if (Number.isFinite(value)) spread += (value - mean) ** 2;
  const all = [...sums.entries()].map(([key, entry]) => ({ key, count: entry.count, mean: entry.sum / entry.count }));
  const shown = all.sort((left, right) => right.count - left.count).slice(0, MAX_GROUPS);
  return {
    groups: shown.sort((left, right) => right.mean - left.mean),
    explained: spread === 0 ? 0 : Math.min(1, between / spread),
    hidden: all.length - shown.length,
  };
}
