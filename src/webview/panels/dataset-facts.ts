import { computeDataset, computeDetails, type ColumnDetails, type DatasetDetails } from '../../core/details';
import { topCorrelations, type Correlation, type NumericColumn } from '../../core/insights';
import { state } from '../state';
import { currentTable, parserOf } from '../table';

/**
 * Ce que le panneau Dataset sait du fichier tel qu'on le voit : le détail de chaque colonne, les
 * constats, les paires liées. Sur 50 000 lignes et 17 colonnes, c'est une demi-seconde de calcul :
 * refait à chaque ouverture, le panneau se faisait attendre à chaque clic.
 *
 * Le résultat dépend de trois choses seulement — les lignes, la vue (filtres) et les statistiques
 * (types) —, que la vue remplace par de nouveaux tableaux à chaque changement. Tant que ce sont les
 * mêmes, on garde le calcul ; sinon il se refait. Et plutôt que d'attendre le clic, on le prépare
 * pendant que la souris est ailleurs : une colonne à la fois, en laissant respirer l'interface.
 */
export interface DatasetFacts {
  table: ReturnType<typeof currentTable>;
  details: ColumnDetails[];
  dataset: DatasetDetails;
  numeric: NumericColumn[];
  related: Correlation[];
}

interface Cache {
  view: number[];
  rows: string[][];
  stats: unknown;
  size: number;
  table: ReturnType<typeof currentTable>;
  details: Array<ColumnDetails | undefined>;
  facts?: DatasetFacts;
}

/** Au-delà, une tranche de calcul se ferait sentir (plus d'une seconde) : on ne prépare rien d'avance. */
const WARM_MAX_ROWS = 200_000;

let cache: Cache | null = null;
let timer: number | undefined;

function fresh(): Cache {
  if (cache && cache.view === state.view && cache.rows === state.rows && cache.stats === state.stats && cache.size === state.rows.length) return cache;
  cache = {
    view: state.view,
    rows: state.rows,
    stats: state.stats,
    size: state.rows.length,
    table: currentTable(),
    details: state.headers.map(() => undefined),
  };
  return cache;
}

function detailOf(current: Cache, index: number): ColumnDetails {
  return (current.details[index] ??= computeDetails(current.table, index, state.stats[index]?.type ?? 'text', state.stats[index]?.temporal ?? null));
}

function finish(current: Cache): DatasetFacts {
  if (current.facts) return current.facts;
  const details = state.headers.map((_, index) => detailOf(current, index));
  const dataset = computeDataset(current.table, details);
  // Les colonnes numériques qui varient ensemble.
  const numeric: NumericColumn[] = state.order
    .filter((index) => state.stats[index]?.type === 'numeric' && !state.stats[index]?.temporal)
    .map((index) => ({
      index,
      name: state.headers[index],
      parse: parserOf(index),
      // Une valeur-balise est une valeur du fichier, comme pour pandas ; c'est à l'utilisateur de la traiter.
      excluded: new Set<string>(),
    }));
  current.facts = { table: current.table, details, dataset, numeric, related: topCorrelations(current.table.rows, numeric) };
  return current.facts;
}

/** Le détail d'une colonne, tel que le panneau Dataset l'a déjà calculé : Column details s'ouvre alors sans attendre. */
export function columnDetails(index: number): ColumnDetails {
  return detailOf(fresh(), index);
}

/** Les constats du panneau, calculés s'ils ne le sont pas déjà. */
export function datasetFacts(): DatasetFacts {
  return finish(fresh());
}

/**
 * Prépare les constats en arrière-plan, une colonne par tranche. À rappeler après tout ce qui
 * change les lignes, la vue ou les types : elle attend que l'interface se calme avant de s'y mettre.
 */
export function warmDatasetFacts(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (!state.ready || state.headers.length === 0 || state.rows.length > WARM_MAX_ROWS) return;
    const current = fresh();
    let next = 0;
    const slice = () => {
      // Un changement en route : le calcul est périmé, un nouveau passage le refera.
      if (cache !== current || current.view !== state.view || current.stats !== state.stats) return;
      if (next < state.headers.length) {
        detailOf(current, next++);
        window.setTimeout(slice, 0);
      } else {
        finish(current);
      }
    };
    slice();
  }, 400);
}
