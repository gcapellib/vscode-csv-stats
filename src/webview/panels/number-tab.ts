import { compareFilter, type CompareOp, type Filter } from '../../core/filters';
import { num } from '../../core/format';
import { closePicker } from '../actions';
import { state } from '../state';
import { setColumnFilter, valuesFilter } from '../table';
import { emptyChoiceRow, fieldRow, footerButtons, numberInput, select, type EmptyChoice } from './filter-fields';

const OPERATORS: Array<[CompareOp, string]> = [
  ['=', '= equals'],
  ['≠', '≠ differs from'],
  ['>', '> greater than'],
  ['≥', '≥ at least'],
  ['<', '< less than'],
  ['≤', '≤ at most'],
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

  // Une classe d'histogramme (`range`) se relit comme « between ».
  let op: CompareOp = '=';
  let first = '';
  let second = '';
  let empties: EmptyChoice = '';
  if (current?.kind === 'compare') {
    op = current.op;
    first = String(current.value);
    second = current.value2 === undefined ? '' : String(current.value2);
    empties = current.blank ?? '';
  } else if (current?.kind === 'range') {
    op = 'between';
    first = String(current.low);
    second = String(current.high);
    empties = current.blank ? 'add' : '';
  }

  const operator = select('picker-op', OPERATORS, op);
  const low = numberInput(column?.min == null ? '' : `min ${num(column.min)}`, first);
  const high = numberInput(column?.max == null ? '' : `max ${num(column.max)}`, second);
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
    const a = Number(low.value);
    const b = Number(high.value);
    const between = operator.value === 'between';
    if (low.value.trim() === '' || !Number.isFinite(a) || (between && (high.value.trim() === '' || !Number.isFinite(b)))) {
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
      compareFilter(columnIndex, column?.name ?? '', operator.value as CompareOp, a, between ? b : undefined, choice === '' ? undefined : choice),
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
