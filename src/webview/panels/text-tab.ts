import { textFilter, type Filter, type TextOp } from '../../core/filters';
import { closePicker } from '../actions';
import { state } from '../state';
import { setColumnFilter, valuesFilter } from '../table';
import { emptyChoiceRow, fieldRow, footerButtons, select } from './filter-fields';

const OPERATORS: Array<[TextOp, string]> = [
  ['contains', 'contains'],
  ['notContains', 'does not contain'],
  ['startsWith', 'starts with'],
  ['endsWith', 'ends with'],
  ['equals', 'is'],
  ['notEquals', 'is not'],
];

/** Une condition sur le texte, insensible à la casse. */
export function renderTextTab(parent: HTMLElement, columnIndex: number): HTMLElement {
  const column = state.stats[columnIndex];
  const current = state.filters.find(
    (filter): filter is Extract<Filter, { kind: 'text' }> => filter.kind === 'text' && filter.column === columnIndex,
  );

  const operator = select('picker-op', OPERATORS, current?.op ?? 'contains');
  const input = document.createElement('input');
  input.className = 'picker-text';
  input.type = 'text';
  input.placeholder = 'text…';
  input.value = current?.text ?? '';
  const blanks = emptyChoiceRow(column?.missing ?? 0, current?.blank ?? '');
  parent.append(fieldRow('Where', operator), fieldRow('Text', input), blanks.row);

  const apply = () => {
    const choice = blanks.read();
    if (choice === 'only') {
      closePicker();
      setColumnFilter(columnIndex, valuesFilter(columnIndex, ['']));
      return;
    }
    if (input.value === '') {
      if (choice === 'exclude') {
        closePicker();
        setColumnFilter(columnIndex, valuesFilter(columnIndex, [''], true));
        return;
      }
      input.focus();
      return;
    }
    closePicker();
    setColumnFilter(
      columnIndex,
      textFilter(columnIndex, column?.name ?? '', operator.value as TextOp, input.value, choice === '' ? undefined : choice),
    );
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') apply();
  });
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
  return input;
}
