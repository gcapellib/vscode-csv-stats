import { computeDataset, computeDetails, readCsvSnippet } from '../../core/details';
import { count } from '../../core/format';
import { closePicker, setOpenPanel } from '../actions';
import { elements, textSpan } from '../dom';
import { floating, positionFloating } from '../floating-setup';
import { state } from '../state';
import { currentTable, setColumnFilter, valuesFilter } from '../table';
import { openDetails } from './column-details';
import { footer, panelTitle, sectionTitle } from './shared';
import { datasetTransformLines as coreDatasetTransformLines } from '../../core/filters';

/**
 * Panneau du fichier entier.
 *
 * Il ne paraphrase pas ce que les colonnes disent déjà : il répond à « que vaut
 * ce fichier, et comment je le charge ». D'où l'appel `pd.read_csv` en tête,
 * puis la vue d'ensemble des colonnes qu'il faudrait sinon ouvrir une à une.
 */
/**
 * Traduit une condition de filtrage en une ligne pandas.
 *
 * Le panneau affiche des chiffres calculés sur le sous-ensemble filtré ; sans
 * cette traduction, le code copié depuis « Dataset… » relirait les 7 200 lignes
 * du fichier au lieu des 12 que le panneau vient d'analyser — une incohérence
 * entre ce que l'outil montre et ce qu'il exporte.
 */
/**
 * Rassemble l'état courant pour core/filters.ts, qui ne connaît que des
 * données — noms déjà résolus, jamais un index à retrouver dans state.
 */
export function datasetTransformLines(): string[] {
  const nameOf = (index: number): string => state.stats[index]?.name ?? `column ${index + 1}`;

  const renamed = state.headers
    .map((original, index) => ({ original, current: nameOf(index) }))
    .filter(({ original, current }) => current !== original);

  const dropped = state.headers
    .map((_, index) => index)
    .filter((index) => !state.order.includes(index))
    .map(nameOf);

  const filters = state.filters.map((filter) => ({ filter, columnName: nameOf(filter.column) }));

  const sort = state.sort ? { columnName: nameOf(state.sort.index), ascending: state.sort.ascending } : null;

  return coreDatasetTransformLines({ renamed, dropped, filters, sort });
}

export function openDataset(anchor: HTMLElement): void {
  const table = currentTable();
  const details = state.headers.map((_, index) =>
    computeDetails(table, index, state.stats[index]?.type ?? 'text'),
  );
  const dataset = computeDataset(table, details);

  elements.picker.textContent = '';
  elements.picker.classList.add('wide');
  const filtered = state.filters.length > 0;
  elements.picker.appendChild(
    panelTitle(
      state.fileName || 'Dataset',
      filtered
        ? `reflects the ${count(table.rows.length)} rows kept by the active filters`
        : 'what this file is, and how to load it',
    ),
  );

  elements.picker.appendChild(sectionTitle('Read it with pandas'));
  // Le code reproduit tout ce qui change la forme du dataframe affiche a
  // l'ecran, pas seulement les filtres : un renommage ou un retrait de
  // colonne non reproduits, et le code genererait un DataFrame different de
  // celui que le panneau vient d'analyser — ou pire, une KeyError si un
  // filtre porte sur le nom renomme d'une colonne que le code n'a jamais
  // renommee.
  const lines = [readCsvSnippet(state.fileName || 'data.csv', table, dataset), ...datasetTransformLines()];
  const snippet = lines.join('\n');
  const code = document.createElement('pre');
  code.className = 'snippet';
  code.textContent = snippet;
  elements.picker.appendChild(code);
  const copy = document.createElement('button');
  copy.className = 'picker-button';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(snippet);
    copy.textContent = 'Copied';
    window.setTimeout(() => (copy.textContent = 'Copy'), 1200);
  });
  elements.picker.appendChild(copy);

  elements.picker.appendChild(sectionTitle('Columns'));
  const info = document.createElement('div');
  info.className = 'info-table';
  info.append(head('Column'), head('Non-null'), head('Dtype'));
  // Une colonne retiree du tableau (Drop column) n'a plus sa place ici : le
  // code genere ci-dessous la supprime aussi, le panneau doit dire pareil.
  for (const index of state.order) {
    const name = state.headers[index];
    const stats = state.stats[index];
    const column = details[index];
    // Non-nuls tels que pandas les compterait après l'appel ci-dessus, jetons
    // d'absence compris : sans quoi les deux moitiés du panneau se
    // contrediraient.
    const nonNull = (stats?.total ?? 0) - column.effectiveMissing;
    const row = document.createElement('button');
    row.className = 'info-name';
    row.textContent = stats?.name ?? name;
    row.title = 'Open this column';
    row.addEventListener('click', () => {
      closePicker();
      openDetails(index, anchor);
    });
    info.append(
      row,
      Object.assign(textSpan(count(nonNull)), { className: 'info-cell' }),
      Object.assign(textSpan(column.pandasType), { className: 'info-cell dim' }),
    );
  }
  elements.picker.appendChild(info);

  elements.picker.appendChild(sectionTitle('Findings'));
  const list = document.createElement('div');
  list.className = 'findings';

  if (dataset.duplicateRows > 0) {
    list.appendChild(
      finding(`${count(dataset.duplicateRows)} rows are exact duplicates of another`, () => {
        closePicker();
        setColumnFilter(-1, {
          kind: 'duplicates',
          column: -1,
          rows: new Set(dataset.duplicateRowIndices.map((index) => state.view[index] ?? index)),
          label: `${count(dataset.duplicateRows)} duplicate rows`,
        });
      }),
    );
  }
  for (const entry of dataset.findings) {
    list.appendChild(
      finding(entry.text, () => {
        closePicker();
        setColumnFilter(entry.column, valuesFilter(entry.column, entry.values));
      }),
    );
  }
  if (list.childElementCount === 0) list.appendChild(Object.assign(textSpan('Nothing to report.'), { className: 'picker-note' }));
  elements.picker.appendChild(list);

  elements.picker.appendChild(footer([['Close', closePicker, true]]));
  floating.open('picker', anchor);
  positionFloating(elements.picker, anchor);
  setOpenPanel('dataset');
  elements.datasetButton.classList.add('active');
}

export function head(text: string): HTMLElement {
  return Object.assign(textSpan(text), { className: 'info-head' });
}

/** Un constat qu'on peut aller vérifier : le clic filtre le tableau dessus. */
export function finding(text: string, onPick: () => void): HTMLElement {
  const item = document.createElement('button');
  item.className = 'flag pickable';
  item.title = 'Show these rows in the table';
  item.textContent = text;
  item.addEventListener('click', onPick);
  return item;
}
