import { elements } from './dom';
import { floating } from './floating-setup';

/**
 * Une saisie, dans un volet qui se déplie à côté du menu où l'on vient de cliquer —
 * pas dans la boîte de VS Code, tout en haut de la fenêtre, loin du regard.
 *
 * Le volet s'ouvre du côté du menu où il y a de la place, à la hauteur de l'entrée
 * cliquée. Entrée valide, Échap annule, et un clic ailleurs annule aussi : fermer le
 * menu ou le panneau qui l'a ouvert referme le volet (voir `cancelField`).
 */

export interface FieldSpec {
  label: string;
  value?: string;
}

interface Options {
  confirm?: string;
  /** Un message si la saisie est refusée : le volet reste ouvert et le dit. */
  validate?: (values: string[]) => string | null;
}

let pending: ((values: string[] | null) => void) | null = null;
/** Le titre du volet ouvert : re-cliquer la même entrée le replie, comme tout ce qui s'ouvre d'un clic. */
let openTitle: string | null = null;

/** Annule la saisie en cours, s'il y en a une, et replie le volet. */
export function cancelField(): void {
  const resolve = pending;
  pending = null;
  openTitle = null;
  elements.field.hidden = true;
  elements.field.textContent = '';
  resolve?.(null);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** À côté du menu (ou du panneau) ouvert, à la hauteur de l'entrée cliquée. */
function place(card: HTMLElement, from: HTMLElement | null, clicked: Element | null): void {
  card.style.visibility = 'hidden';
  card.hidden = false;
  const size = card.getBoundingClientRect();
  if (!from) {
    // Rien d'ouvert : en haut et au centre, plutôt que perdu dans un coin.
    card.dataset.side = 'down';
    card.style.left = `${Math.max(4, (window.innerWidth - size.width) / 2)}px`;
    card.style.top = '72px';
    card.style.visibility = 'visible';
    return;
  }
  const box = from.getBoundingClientRect();
  const roomRight = window.innerWidth - box.right - 8;
  const roomLeft = box.left - 8;
  const side = size.width <= roomRight || (size.width > roomLeft && roomRight >= roomLeft) ? 'right' : 'left';
  const left = side === 'right' ? box.right + 3 : box.left - size.width - 3;
  const wanted = (clicked?.getBoundingClientRect().top ?? box.top) - 8;
  card.dataset.side = side;
  card.style.left = `${Math.max(4, Math.min(left, window.innerWidth - size.width - 4))}px`;
  card.style.top = `${Math.max(4, Math.min(wanted, window.innerHeight - size.height - 8))}px`;
  card.style.visibility = 'visible';
}

/** Plusieurs champs dans un même volet ; `null` si l'on annule. */
export function askFields(title: string, fields: FieldSpec[], options: Options = {}): Promise<string[] | null> {
  if (openTitle === title) {
    cancelField();
    return Promise.resolve(null);
  }
  cancelField();
  openTitle = title;
  const card = elements.field;
  card.textContent = '';
  const owner = [elements.menu, elements.picker].find((panel) => !panel.hidden) ?? null;
  const clicked = owner?.contains(document.activeElement) ? document.activeElement : null;
  card.style.borderTopColor = owner === elements.menu ? elements.menu.style.borderTopColor : '';
  card.style.setProperty('--column-accent', owner === elements.menu ? elements.menu.style.getPropertyValue('--column-accent') : '');

  card.appendChild(element('div', 'field-title', title));
  const inputs = fields.map((spec) => {
    const label = element('label', 'field-label', spec.label);
    const input = element('input', 'field-input');
    input.type = 'text';
    input.value = spec.value ?? '';
    input.spellcheck = false;
    label.appendChild(input);
    card.appendChild(label);
    return input;
  });
  const error = element('div', 'field-error');
  error.hidden = true;
  const ok = element('button', 'field-ok', options.confirm ?? 'OK');
  const cancel = element('button', 'field-cancel', 'Cancel');
  const row = element('div', 'field-actions');
  row.append(ok, cancel);
  card.append(error, row);

  return new Promise((resolve) => {
    pending = resolve;
    const submit = () => {
      const values = inputs.map((input) => input.value);
      const refusal = options.validate?.(values) ?? null;
      if (refusal !== null) {
        error.textContent = refusal;
        error.hidden = false;
        return;
      }
      pending = null;
      openTitle = null;
      card.hidden = true;
      card.textContent = '';
      resolve(values);
      // Le menu a fait son office : il se replie avec le volet.
      floating.close();
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', () => {
      cancelField();
      floating.close();
    });
    card.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        cancelField();
        floating.close();
      }
    };
    place(card, owner, clicked);
    inputs[0]?.focus();
    inputs[0]?.select();
  });
}

/** Un seul champ : la valeur saisie, ou `null` si l'on annule. */
export async function ask(title: string, prompt: string, value: string, options: Options = {}): Promise<string | null> {
  const values = await askFields(title, [{ label: prompt, value }], options);
  return values === null ? null : values[0];
}
