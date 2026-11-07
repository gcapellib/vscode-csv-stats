import { compareFilter, type CompareOp, type Filter } from '../../core/filters';
import { formatTemporal, parseTyped } from '../../core/temporal';
import { formatValue } from '../../core/values';
import { closePicker } from '../actions';
import { state } from '../state';
import { setColumnFilter, valuesFilter } from '../table';
import { dateInput, emptyChoiceRow, fieldRow, footerButtons, numberInput, select, type EmptyChoice } from './filter-fields';

const OPERATORS: Array<[CompareOp, string]> = [
  ['=', '= equals'],
  ['≠', '≠ differs from'],
  ['>', '> greater than'],
  ['≥', '≥ at least'],
  ['<', '< less than'],
  ['≤', '≤ at most'],
  ['between', 'between'],
];

/** Les mêmes conditions, dites comme on parle d'une date. */
const DATE_OPERATORS: Array<[CompareOp, string]> = [
  ['=', '= on'],
  ['≠', '≠ not on'],
  ['>', '> after'],
  ['≥', '≥ on or after'],
  ['<', '< before'],
  ['≤', '≤ on or before'],
  ['between', 'between'],
];

/**
 * Une condition numérique : un opérateur, une ou deux valeurs.
 *
 * Remplace les trois champs « From / To / Exactly » : le menu dit ce qu'on
 * demande, et le second champ n'apparaît que pour « between ».
 */
export function renderNumberTab(parent: HTMLElement, columnIndex: number): HTMLElement {
  const column = state.stats[columnIndex];
  const current = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'compare' | 'range' }> =>
      (filter.kind === 'compare' || filter.kind === 'range') && filter.column === columnIndex,
  );
  // « Only empty cells » et « Hide them » sans valeur s'enregistrent comme un
  // filtre de valeurs sur la cellule vide : sans cette relecture, le panneau
  // rouvert affichait « Follow the condition » sous un filtre pourtant actif.
  const blankOnly = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'values' }> =>
      filter.kind === 'values' && filter.column === columnIndex && filter.values.length === 1 && filter.values[0] === '',
  );

  // Une classe d'histogramme (`range`) se relit comme « between ».
  let op: CompareOp = '=';
  let first = '';
  let second = '';
  let empties: EmptyChoice = '';
  // Une date se relit dans l'écriture du fichier ; un nombre, tel quel.
  const temporal = column?.temporal ?? null;
  const shown = (value: number) => (temporal ? formatTemporal(value, temporal) : String(value));
  if (current?.kind === 'compare') {
    op = current.op;
    first = shown(current.value);
    second = current.value2 === undefined ? '' : shown(current.value2);
    empties = current.blank ?? '';
  } else if (current?.kind === 'range') {
    op = 'between';
    first = shown(current.low);
    second = shown(current.high);
    empties = current.blank ? 'add' : '';
  } else if (blankOnly) {
    empties = blankOnly.exclude ? 'exclude' : 'only';
  }

  const operator = select('picker-op', temporal ? DATE_OPERATORS : OPERATORS, op);
  const input = temporal ? dateInput : numberInput;
  const low = input(column?.min == null ? '' : `min ${formatValue(column, column.min)}`, first);
  const high = input(column?.max == null ? '' : `max ${formatValue(column, column.max)}`, second);
  // Lit un champ : null s'il est vide ou illisible.
  const read = (field: HTMLInputElement): number | null => {
    const text = field.value.trim();
    if (text === '') return null;
    if (temporal) return parseTyped(text, temporal);
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  };
  const sync = () => {
    highRow.hidden = operator.value !== 'between';
    lowRow.firstElementChild!.textContent = operator.value === 'between' ? 'From' : 'Value';
  };
  const lowRow = fieldRow('Value', low);
  const highRow = fieldRow('To', high);
  operator.addEventListener('change', sync);
  const missing = column?.missing ?? 0;
  const blanks = emptyChoiceRow(missing, empties);
  parent.append(fieldRow('Where', operator), lowRow, highRow, blanks.row);
  sync();

  const apply = () => {
    const choice = blanks.read();
    if (choice === 'only') {
      closePicker();
      setColumnFilter(columnIndex, valuesFilter(columnIndex, ['']));
      return;
    }
    const a = read(low);
    const b = read(high);
    const between = operator.value === 'between';
    if (a === null || (between && b === null)) {
      // Sans valeur, seul « Hide them » a un sens : retirer les lignes vides.
      if (choice === 'exclude' && low.value.trim() === '') {
        closePicker();
        setColumnFilter(columnIndex, valuesFilter(columnIndex, [''], true));
        return;
      }
      (between && low.value.trim() !== '' ? high : low).focus();
      return;
    }
    closePicker();
    setColumnFilter(
      columnIndex,
      compareFilter(
        columnIndex,
        column?.name ?? '',
        operator.value as CompareOp,
        a,
        between ? (b ?? undefined) : undefined,
        choice === '' ? undefined : choice,
        temporal ?? undefined,
      ),
    );
  };
  for (const input of [low, high]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') apply();
    });
  }
  parent.appendChild(
    footerButtons([
      [
        'Clear',
        () => {
          closePicker();
          setColumnFilter(columnIndex, null);
        },
        false,
      ],
      ['Apply', apply, true],
    ]),
  );
  return low;
}
