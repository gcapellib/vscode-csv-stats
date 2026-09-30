/**
 * Une condition de filtrage, et sa traduction en pandas.
 *
 * Purement des données : rien ici ne connaît le DOM ni l'état de la vue. La
 * vue construit un `Filter` au clic, et lui fournit le nom de colonne déjà
 * résolu (après un éventuel renommage) au moment de le traduire — ce module
 * n'a donc jamais à savoir comment les colonnes sont nommées ou retrouvées.
 */
export type Filter =
  | { kind: 'contains'; column: number; text: string; label: string }
  | { kind: 'values'; column: number; values: string[]; label: string }
  | { kind: 'range'; column: number; low: number; high: number; last: boolean; label: string }
  /** Lignes dupliquées, désignées par leur index — seul cas où un ensemble de
   * lignes explicite est nécessaire plutôt qu'une condition sur une colonne. */
  | { kind: 'duplicates'; column: number; rows: Set<number>; label: string };

/** Traduit une condition de filtrage en une ligne pandas. */
export function filterToPandas(filter: Filter, columnName: string): string {
  if (filter.kind === 'duplicates') return 'df = df[df.duplicated(keep=False)]';
  const name = JSON.stringify(columnName);
  switch (filter.kind) {
    case 'contains':
      return `df = df[df[${name}].astype(str).str.contains(${JSON.stringify(filter.text)}, case=False, na=False)]`;
    case 'values':
      return filter.values.length === 1
        ? `df = df[df[${name}] == ${JSON.stringify(filter.values[0])}]`
        : `df = df[df[${name}].isin(${JSON.stringify(filter.values)})]`;
    case 'range':
      // Une classe d'histogramme exclut sa borne haute ; une plage saisie à la
      // main (Filter by range…) inclut les deux, d'où les deux formes.
      return filter.last
        ? `df = df[df[${name}].between(${filter.low}, ${filter.high})]`
        : `df = df[(df[${name}] >= ${filter.low}) & (df[${name}] < ${filter.high})]`;
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

  if (input.filters.length > 0) {
    lines.push('', '# Matching the filters applied in this session');
    for (const { filter, columnName } of input.filters) {
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
