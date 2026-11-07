/**
 * Une condition de filtrage, et sa traduction en pandas.
 *
 * Purement des données : rien ici ne connaît le DOM ni l'état de la vue. La
 * vue construit un `Filter` au clic, et lui fournit le nom de colonne déjà
 * résolu (après un éventuel renommage) au moment de le traduire — ce module
 * n'a donc jamais à savoir comment les colonnes sont nommées ou retrouvées.
 */
import { num } from './format';
import { formatTemporal, pandasTemporal, type TemporalFormat } from './temporal';

export type TextOp = 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'equals' | 'notEquals';
export type CompareOp = '=' | '≠' | '>' | '≥' | '<' | '≤' | 'between';

/**
 * Ce que devient une cellule vide face à une condition : `add` la retient quoi
 * qu'il arrive, `exclude` l'écarte quoi qu'il arrive. Absent, la condition
 * décide seule — une comparaison écarte les vides, une négation les garde,
 * comme pandas.
 */
export type BlankMode = 'add' | 'exclude';

export type Filter =
  | { kind: 'text'; column: number; op: TextOp; text: string; blank?: BlankMode; label: string }
  /** Condition numérique saisie : `value2` n'existe que pour « between ». */
  | {
      kind: 'compare';
      column: number;
      op: CompareOp;
      value: number;
      value2?: number;
      blank?: BlankMode;
      /** Présent sur une colonne de dates ou d'heures : les valeurs sont alors des millisecondes. */
      temporal?: TemporalFormat;
      label: string;
    }
  /** `exclude` : « tout sauf ces valeurs ». */
  | { kind: 'values'; column: number; values: string[]; exclude?: boolean; label: string }
  /** `blank` retient aussi les cellules vides : « entre 100 et 200, ou vide ». */
  | {
      kind: 'range';
      column: number;
      low: number;
      high: number;
      last: boolean;
      blank?: boolean;
      temporal?: TemporalFormat;
      label: string;
    }
  /**
   * Lignes dupliquées, original compris — comme « Keep duplicates » de Power
   * Query et `duplicated(keep=False)` —, désignées par leur index : seul cas où
   * un ensemble de lignes explicite est nécessaire plutôt qu'une condition sur
   * une colonne. `groups` réunit les lignes identiques, dans l'ordre de leur
   * première apparition, pour les montrer côte à côte.
   */
  | { kind: 'duplicates'; column: number; rows: Set<number>; groups: number[][]; label: string }
  /**
   * Une ligne par valeur distincte de la colonne : la première rencontrée.
   * Se juge sur l'ensemble des lignes déjà retenues, pas sur une cellule.
   */
  | { kind: 'distinct'; column: number; label: string }
  /**
   * Les lignes dont la valeur n'apparaît qu'une fois dans la colonne, vides
   * exclus. Se juge, comme `distinct`, sur les lignes déjà retenues.
   */
  | { kind: 'unique'; column: number; label: string }
  /**
   * Les valeurs hors de [low ; high] — les outliers d'une colonne mesurable,
   * au-delà de 1,5 écart interquartile. Une seule condition, « < low ou > high »,
   * que ni une plage ni une comparaison ne savent dire.
   */
  | { kind: 'outside'; column: number; low: number; high: number; temporal?: TemporalFormat; label: string };

/** Les conditions qui se jugent sur une seule cellule. */
export type CellFilter = Exclude<Filter, { kind: 'duplicates' | 'distinct' | 'unique' }>;

/** Les conditions qui portent sur l'ensemble des lignes retenues, appliquées après les autres. */
export function isSetFilter(filter: Filter): boolean {
  return filter.kind === 'distinct' || filter.kind === 'unique';
}

/** Traduit une condition de filtrage en une ligne pandas. */
export function filterToPandas(filter: Filter, columnName: string): string {
  if (filter.kind === 'duplicates') return 'df = df[df.duplicated(keep=False)]';
  if (filter.kind === 'distinct') return `df = df.drop_duplicates(subset=[${JSON.stringify(columnName)}])`;
  if (filter.kind === 'unique') {
    const column = `df[${JSON.stringify(columnName)}]`;
    return `df = df[${column}.notna() & ~${column}.duplicated(keep=False)]`;
  }
  const name = JSON.stringify(columnName);
  switch (filter.kind) {
    case 'text':
      return `df = df[${withBlank(textCondition(name, filter.op, filter.text), filter.blank, name)}]`;
    case 'compare':
      return `df = df[${withBlank(compareCondition(name, filter), filter.blank, name)}]`;
    case 'values': {
      const named = filter.values.filter((value) => value !== '');
      const hasBlank = named.length !== filter.values.length;
      if (filter.exclude) {
        if (!hasBlank) {
          return named.length === 1
            ? `df = df[df[${name}] != ${JSON.stringify(named[0])}]`
            : `df = df[~df[${name}].isin(${JSON.stringify(named)})]`;
        }
        if (named.length === 0) return `df = df[~(${blankCondition(name)})]`;
        return `df = df[~(${valuesCondition(name, named, true)})]`;
      }
      return `df = df[${valuesCondition(name, named, hasBlank)}]`;
    }
    case 'outside':
      return `df = df[(df[${name}] < ${literal(filter.low, filter.temporal)}) | (df[${name}] > ${literal(filter.high, filter.temporal)})]`;
    case 'range': {
      // Une borne unique et fermée désigne une seule valeur : « == 7 » se lit,
      // « between(7, 7) » se déchiffre. Une classe d'histogramme exclut sa
      // borne haute ; une plage saisie à la main inclut les deux.
      const low = literal(filter.low, filter.temporal);
      const high = literal(filter.high, filter.temporal);
      const condition =
        filter.last && filter.low === filter.high
          ? `df[${name}] == ${low}`
          : filter.last
            ? `df[${name}].between(${low}, ${high})`
            : `(df[${name}] >= ${low}) & (df[${name}] < ${high})`;
      // NaN ne satisfait aucune comparaison : les vides s'ajoutent à part.
      if (filter.blank) return `df = df[(${condition}) | ${blankCondition(name)}]`;
      return `df = df[${condition}]`;
    }
  }
}

/** Les valeurs retenues, « (blank) » comprise. Sans parenthèses autour d'un `|` seul. */
function valuesCondition(name: string, named: string[], hasBlank: boolean): string {
  if (!hasBlank) {
    return named.length === 1 ? `df[${name}] == ${JSON.stringify(named[0])}` : `df[${name}].isin(${JSON.stringify(named)})`;
  }
  // « (blank) » : pandas lit une cellule vide comme NaN, et « == "" » ne la
  // retrouverait pas ; une cellule d'espaces, elle, reste une chaîne.
  const blank = blankCondition(name);
  if (named.length === 0) return blank;
  const kept = named.length === 1 ? `(df[${name}] == ${JSON.stringify(named[0])})` : `df[${name}].isin(${JSON.stringify(named)})`;
  return `${kept} | ${blank}`;
}

/**
 * La condition sur le texte. Tout passe par le type « string » : « astype(str) »
 * transformerait NaN en "nan", qu'une recherche de « nan » retrouverait. Les
 * recherches sont littérales (`regex=False`) : « a.b » ne doit pas lire « . »
 * comme un joker.
 */
function textCondition(name: string, op: TextOp, text: string): string {
  const series = `df[${name}].astype("string")`;
  const lower = JSON.stringify(text.toLowerCase());
  switch (op) {
    case 'contains':
      return `${series}.str.contains(${JSON.stringify(text)}, case=False, regex=False, na=False)`;
    case 'notContains':
      return `~${textCondition(name, 'contains', text)}`;
    case 'startsWith':
      return `${series}.str.lower().str.startswith(${lower}, na=False)`;
    case 'endsWith':
      return `${series}.str.lower().str.endswith(${lower}, na=False)`;
    case 'equals':
      return `${series}.str.lower().eq(${lower}).fillna(False)`;
    case 'notEquals':
      return `~${textCondition(name, 'equals', text)}`;
  }
}

/** Une valeur en littéral pandas : un nombre tel quel, une date en `pd.Timestamp`. */
function literal(value: number, temporal: TemporalFormat | undefined): string {
  return temporal ? pandasTemporal(value, temporal) : String(value);
}

function compareCondition(name: string, filter: Extract<Filter, { kind: 'compare' }>): string {
  const column = `df[${name}]`;
  const value = literal(filter.value, filter.temporal);
  switch (filter.op) {
    case '=':
      return `${column} == ${value}`;
    case '≠':
      return `${column} != ${value}`;
    case 'between': {
      const [low, high] = bounds(filter);
      return `${column}.between(${literal(low, filter.temporal)}, ${literal(high, filter.temporal)})`;
    }
    default:
      return `${column} ${filter.op === '≥' ? '>=' : filter.op === '≤' ? '<=' : filter.op} ${value}`;
  }
}

function bounds(filter: { value: number; value2?: number }): [number, number] {
  const other = filter.value2 ?? filter.value;
  return [Math.min(filter.value, other), Math.max(filter.value, other)];
}

/** Ajoute ou retire explicitement les vides d'une condition. */
function withBlank(condition: string, mode: BlankMode | undefined, name: string): string {
  if (mode === 'add') return `(${condition}) | ${blankCondition(name)}`;
  if (mode === 'exclude') return `(${condition}) & ~(${blankCondition(name)})`;
  return condition;
}

/**
 * Les cellules vides, en pandas : NaN à la lecture d'un champ vide — « == "" »
 * ne le retrouverait pas — et chaînes d'espaces seules, qui restent du texte.
 */
function blankCondition(name: string): string {
  return `df[${name}].isna() | df[${name}].astype(str).str.strip().eq("")`;
}

const TEXT_LABELS: Record<TextOp, string> = {
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  equals: 'is',
  notEquals: 'is not',
};

const BLANK_SUFFIX: Record<BlankMode, string> = { add: ' or (blank)', exclude: ', not empty' };

export function textFilter(column: number, columnName: string, op: TextOp, text: string, blank?: BlankMode): Filter {
  return {
    kind: 'text',
    column,
    op,
    text,
    blank,
    label: `${columnName} ${TEXT_LABELS[op]} « ${text} »${blank ? BLANK_SUFFIX[blank] : ''}`,
  };
}

export function compareFilter(
  column: number,
  columnName: string,
  op: CompareOp,
  value: number,
  value2?: number,
  blank?: BlankMode,
  temporal?: TemporalFormat,
): Filter {
  const base = { value, value2: op === 'between' ? value2 : undefined };
  const [low, high] = bounds(base);
  const show = (amount: number) => (temporal ? formatTemporal(amount, temporal) : num(amount));
  const condition = op === 'between' ? `${show(low)} – ${show(high)}` : `${op} ${show(value)}`;
  return {
    kind: 'compare',
    column,
    op,
    ...base,
    blank,
    temporal,
    label: `${columnName} ${condition}${blank ? BLANK_SUFFIX[blank] : ''}`,
  };
}

/**
 * Une cellule satisfait-elle la condition ? Pas pour `duplicates`, qui se juge
 * sur l'index de la ligne. `parse` lit un nombre selon la convention du fichier.
 */
export function cellMatches(raw: string, filter: CellFilter, parse: (raw: string) => number | null): boolean {
  const blank = raw.trim() === '';
  switch (filter.kind) {
    case 'text': {
      if (filter.blank && blank) return filter.blank === 'add';
      const haystack = raw.toLowerCase();
      const needle = filter.text.toLowerCase();
      switch (filter.op) {
        case 'contains':
          return haystack.includes(needle);
        case 'notContains':
          return !haystack.includes(needle);
        case 'startsWith':
          return haystack.startsWith(needle);
        case 'endsWith':
          return haystack.endsWith(needle);
        case 'equals':
          return haystack === needle;
        case 'notEquals':
          return haystack !== needle;
      }
      return false;
    }
    case 'compare': {
      if (blank) return filter.blank ? filter.blank === 'add' : filter.op === '≠';
      const value = parse(raw);
      if (value === null) return filter.op === '≠';
      switch (filter.op) {
        case '=':
          return value === filter.value;
        case '≠':
          return value !== filter.value;
        case '>':
          return value > filter.value;
        case '≥':
          return value >= filter.value;
        case '<':
          return value < filter.value;
        case '≤':
          return value <= filter.value;
        case 'between': {
          const [low, high] = bounds(filter);
          return value >= low && value <= high;
        }
      }
      return false;
    }
    case 'values': {
      // « (blank) » retrouve toutes les cellules que les statistiques comptent
      // comme manquantes, espaces seules comprises — sinon un clic sur lui ne
      // ramènerait pas toutes les lignes annoncées.
      const listed = filter.values.includes(raw) || (blank && filter.values.includes(''));
      return filter.exclude ? !listed : listed;
    }
    case 'outside': {
      if (blank) return false;
      const value = parse(raw);
      return value !== null && (value < filter.low || value > filter.high);
    }
    case 'range': {
      if (blank) return filter.blank === true;
      const value = parse(raw);
      if (value === null) return false;
      // La dernière classe inclut sa borne haute, sinon le maximum lui-même
      // serait exclu de l'intervalle qui le contient.
      return value >= filter.low && (filter.last ? value <= filter.high : value < filter.high);
    }
  }
}

/** Une colonne renommée, dans le fichier comme dans le code généré. */
export interface RenamedColumn {
  original: string;
  current: string;
}

export interface DatasetTransformInput {
  renamed: RenamedColumn[];
  /** Noms des colonnes retirées du tableau, déjà résolus (après renommage). */
  dropped: string[];
  /** Chaque filtre actif, avec le nom de colonne déjà résolu. */
  filters: Array<{ filter: Filter; columnName: string }>;
  sort: { columnName: string; ascending: boolean } | null;
  /** Les lignes pandas des étapes de nettoyage (voir steps.ts). */
  cleaning?: string[];
  /** Le nom de la copie nettoyée, pour le `to_csv` qui suit les étapes. */
  copyName?: string;
}

/**
 * Toutes les lignes de transformation, dans l'ordre où l'application les
 * applique réellement : renommage et retrait de colonnes en premier (l'ordre
 * d'affichage n'affecte que ce qui est montré, mais un renommage change le nom
 * que les filtres et le tri utilisent déjà), puis les filtres, puis le tri —
 * le même ordre que la vue applique (filtrage avant tri).
 */
export function datasetTransformLines(input: DatasetTransformInput): string[] {
  const lines: string[] = [];

  if (input.renamed.length > 0) {
    const mapping = input.renamed
      .map(({ original, current }) => `${JSON.stringify(original)}: ${JSON.stringify(current)}`)
      .join(', ');
    lines.push('', '# Columns renamed in the table', `df = df.rename(columns={${mapping}})`);
  }

  if (input.dropped.length > 0) {
    const names = input.dropped.map((name) => JSON.stringify(name)).join(', ');
    lines.push('', '# Columns dropped from the table', `df = df.drop(columns=[${names}])`);
  }

  // Les étapes de nettoyage, puis la copie — avant les filtres et le tri, qui
  // servent à regarder et n'entrent pas dans la copie.
  if (input.cleaning && input.cleaning.length > 0) {
    lines.push('', '# Cleaning steps', ...input.cleaning);
    if (input.copyName) lines.push('', '# The cleaned copy; the original file is untouched', `df.to_csv(${JSON.stringify(input.copyName)}, index=False)`);
  }

  if (input.filters.length > 0) {
    lines.push('', '# Matching the filters applied in this session');
    // « Une ligne par valeur » et « valeurs vues une fois » s'appliquent après
    // les autres conditions, dans l'ordre où on les a posées, comme la vue.
    const ordered = [...input.filters].sort((a, b) => Number(isSetFilter(a.filter)) - Number(isSetFilter(b.filter)));
    for (const { filter, columnName } of ordered) {
      lines.push(`# ${filter.label}`, filterToPandas(filter, columnName));
    }
  }

  if (input.sort) {
    const direction = input.sort.ascending ? 'ascending' : 'descending';
    lines.push(
      '',
      `# Sorted ${direction} by ${input.sort.columnName} in the table`,
      `df = df.sort_values(${JSON.stringify(input.sort.columnName)}, ascending=${input.sort.ascending ? 'True' : 'False'})`,
    );
  }

  return lines;
}
