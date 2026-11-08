import { computeDetails } from "../core/details";
import { count } from "../core/format";
import { similarValues, summarizeGroup } from "../core/insights";
import { applySteps, type Step } from "../core/steps";
import { isMeasurable, type ColumnType } from "../core/types";
import {
  addStep,
  changeType,
  fillEmpty,
  renameColumn,
  replaceText,
  replaceValue,
  roundColumn,
  treatAsEmpty,
} from "./cleaning";
import { elements } from "./dom";
import { floating, positionFloating } from "./floating-setup";
import { icon, type IconName } from "./icons";
import { openClean } from "./panels/clean";
import { openDetails } from "./panels/column-details";
import { panelTitle } from "./panels/shared";
import { palette, state } from "./state";
import { allValueCounts } from "./table";
import { quickTip } from "./tooltip";
import { vscode } from "./vscode-api";

/**
 * Le menu du balai — ou du clic droit sur l'en-tête : du diagnostic à l'action.
 *
 * Chaque action dit ce qu'elle toucherait (« · 20 cells »), compté par un essai
 * à blanc de l'étape sur les données telles qu'elles sont : un menu qui
 * annonce « Trim spaces » sans dire s'il y a quoi que ce soit à rogner fait
 * cliquer pour rien. Une coche marque ce qui est déjà appliqué à la colonne.
 * Les variantes d'un même geste — la casse, le type — tiennent sur une ligne de
 * pastilles plutôt que sur cinq lignes de menu.
 *
 * Les entrées sans objet n'apparaissent pas : ni Trim ni casse sur des nombres.
 */
/** Colonne dont le menu est ouvert, pour que son bouton le referme. */
let menuColumn: number | null = null;

const TYPES: Array<[ColumnType, string]> = [
  ["numeric", "Number"],
  ["date", "Date"],
  ["time", "Time"],
  ["text", "Text"],
];

export function openMenu(modelIndex: number, anchor: HTMLElement): void {
  if (floating.isOpen("menu") && menuColumn === modelIndex) {
    floating.close();
    return;
  }
  menuColumn = modelIndex;
  const column = state.stats[modelIndex];
  const accent = palette(modelIndex).accent;
  const text = !isMeasurable(column.type);
  const menu = elements.menu;
  menu.textContent = "";
  menu.classList.add("clean-menu");
  menu.style.borderTopColor = accent;
  // Les titres de section prennent la couleur de la colonne, comme dans Column details.
  menu.style.setProperty("--column-accent", accent);
  menu.appendChild(
    panelTitle(
      column.name,
      `${column.type} · ${count(column.distinct)} distinct`,
      modelIndex,
    ),
  );

  const applied = (kind: Step["kind"]) =>
    state.steps.some(
      (step) =>
        step.kind === kind && "column" in step && step.column === modelIndex,
    );
  const effect = (step: Step) =>
    applySteps(state.rows, state.headers, [step], state.delimiter === ";")
      .effects[0] ?? 0;
  const cells = (amount: number) =>
    amount === 0 ? "none" : `${count(amount)} cell${amount === 1 ? "" : "s"}`;

  // `keepOpen` : l'action demande une saisie, dans un volet qui se déplie à côté du menu ;
  // le menu reste donc là, et se replie avec le volet.
  const run =
    (action: () => void, keepOpen = false) =>
    () => {
      if (!keepOpen) closeMenu();
      action();
    };
  const item = (
    label: string,
    action: () => void,
    options: {
      mark?: "check" | SVGSVGElement;
      hint?: string;
      idle?: boolean;
      keepOpen?: boolean;
      note?: string;
      tip?: string;
      glyph?: IconName;
    } = {},
  ) => {
    const button = document.createElement("button");
    button.className = "menu-item";
    if (options.idle) button.classList.add("idle");
    const mark = document.createElement("span");
    mark.className = "cmenu-mark";
    mark.style.color = accent;
    if (options.mark === "check") mark.textContent = "✓";
    else if (options.mark) mark.appendChild(options.mark);
    else if (options.glyph) mark.appendChild(icon(options.glyph));
    const name = document.createElement("span");
    name.className = "cmenu-label";
    name.textContent = label;
    // Une note en gris après le libellé : ce que l'action fait, en deux mots. Le libellé passe alors à la ligne
    // plutôt que d'être coupé par des points de suspension.
    if (options.note) {
      name.classList.add("wrap");
      name.append(
        " ",
        Object.assign(document.createElement("span"), {
          className: "cmenu-note",
          textContent: options.note,
        }),
      );
    }
    button.append(mark, name);
    if (options.tip) quickTip(button, options.tip);
    if (options.hint) {
      const hint = document.createElement("span");
      hint.className = "cmenu-hint";
      hint.textContent = options.hint;
      button.appendChild(hint);
    }
    button.addEventListener("click", run(action, options.keepOpen));
    menu.appendChild(button);
  };
  const heading = (label: string) => {
    const element = document.createElement("div");
    element.className = "menu-heading";
    element.textContent = label;
    menu.appendChild(element);
  };
  const chips = (entries: Array<[string, () => void, boolean?, boolean?]>) => {
    const row = document.createElement("div");
    row.className = "cmenu-chips";
    for (const [label, action, on, keepOpen] of entries) {
      const chip = document.createElement("button");
      chip.className = on ? "cmenu-chip on" : "cmenu-chip";
      if (on) chip.style.background = accent;
      chip.textContent = label;
      chip.addEventListener("click", run(action, keepOpen));
      row.appendChild(chip);
    }
    menu.appendChild(row);
  };

  item("Column details…", () => openDetails(modelIndex, anchor), {
    mark: icon("chart"),
  });
  item(
    "Copy column name",
    () => vscode.postMessage({ type: "copy", text: column.name }),
    { mark: icon("copy") },
  );

  if (text) {
    heading("Text");
    const trim: Step = { kind: "trim", column: modelIndex };
    const clean: Step = { kind: "clean", column: modelIndex };
    const trimmed = effect(trim);
    const invisible = effect(clean);
    item("Trim spaces", () => addStep(trim), {
      glyph: "trim",
      mark: applied("trim") ? "check" : undefined,
      hint: cells(trimmed),
      idle: trimmed === 0 && !applied("trim"),
    });
    item("Clean invisible characters", () => addStep(clean), {
      glyph: "eyeOff",
      mark: applied("clean") ? "check" : undefined,
      hint: cells(invisible),
      idle: invisible === 0 && !applied("clean"),
    });
    chips([
      [
        "lowercase",
        () => addStep({ kind: "case", column: modelIndex, mode: "lower" }),
      ],
      [
        "UPPERCASE",
        () => addStep({ kind: "case", column: modelIndex, mode: "upper" }),
      ],
      [
        "Capitalize",
        () => addStep({ kind: "case", column: modelIndex, mode: "title" }),
      ],
    ]);
  }

  // Les graphies d'une même valeur, fusionnables d'un clic : la ligne dit ce qui
  // sera fusionné et combien de cellules changent, comme les autres actions.
  if (
    text &&
    !column.temporal &&
    column.distinct >= 2 &&
    column.distinct <= 2500
  ) {
    const groups = similarValues(allValueCounts(modelIndex)).sort(
      (left, right) => cellsOf(right) - cellsOf(left),
    );
    if (groups.length > 0) {
      heading("Similar spellings");
      for (const group of groups.slice(0, 3)) {
        // Ce vers quoi on fusionne, et en deux mots ce qui diffère : les variantes se ressemblent à l'écran,
        // c'est justement ce qu'on ne voit pas (espaces, caractères invisibles). Le détail est dans l'infobulle.
        const { target, kinds, detail } = summarizeGroup(group);
        item(
          target,
          () =>
            addStep({
              kind: "merge",
              column: modelIndex,
              from: group.variants.map((variant) => variant.value),
              to: target,
            }),
          {
            glyph: "merge",
            hint: cells(cellsOf(group)),
            note: kinds.slice(0, 3).join(" · "),
            tip: detail,
          },
        );
      }
      if (groups.length > 3) {
        const rest = groups.length - 3;
        item("More…", () => openClean(anchor, modelIndex), {
          glyph: "dots",
          hint: `${rest} other group${rest === 1 ? "" : "s"}`,
        });
      }
    }
  }

  heading("Values");
  const table = {
    headers: state.headers,
    rows: state.rows,
    delimiter: state.delimiter,
    truncated: false,
  };
  const tokens = computeDetails(
    table,
    modelIndex,
    column.type,
    column.temporal,
  ).nullTokens.map((token) => token.value);
  const fill: Step = { kind: "fillDown", column: modelIndex };
  const filled = effect(fill);
  item("Replace values…", () => void replaceValue(modelIndex), {
    glyph: "exchange",
    mark: applied("replace") ? "check" : undefined,
    keepOpen: true,
  });
  item("Treat as empty…", () => void treatAsEmpty(modelIndex, tokens), {
    glyph: "ban",
    keepOpen: true,
    mark: applied("empty") ? "check" : undefined,
    hint: tokens.length > 0 ? tokens.join(", ") : undefined,
  });
  item("Replace text…", () => void replaceText(modelIndex), {
    glyph: "edit",
    mark: applied("replace") ? "check" : undefined,
    hint: "inside the cell",
    keepOpen: true,
  });
  item("Fill down", () => addStep(fill), {
    glyph: "fillDown",
    mark: applied("fillDown") ? "check" : undefined,
    hint: cells(filled),
    idle: filled === 0 && !applied("fillDown"),
  });
  const fillUp: Step = { kind: "fillUp", column: modelIndex };
  const filledUp = effect(fillUp);
  item("Fill up", () => addStep(fillUp), {
    glyph: "fillUp",
    mark: applied("fillUp") ? "check" : undefined,
    hint: cells(filledUp),
    idle: filledUp === 0 && !applied("fillUp"),
  });
  item("Fill empty with…", () => void fillEmpty(modelIndex), {
    glyph: "drop",
    mark: applied("fillValue") ? "check" : undefined,
    keepOpen: true,
  });

  // Les lignes où cette colonne est vide : le nettoyage le plus courant, et le
  // seul qui retire des lignes au lieu de changer des cellules.
  const dropEmpty: Step = { kind: "dropEmpty", column: modelIndex };
  const emptyRows = effect(dropEmpty);
  item("Remove rows where empty", () => addStep(dropEmpty), {
    glyph: "trash",
    mark: applied("dropEmpty") ? "check" : undefined,
    hint:
      emptyRows === 0
        ? "none"
        : `${count(emptyRows)} row${emptyRows === 1 ? "" : "s"}`,
    idle: emptyRows === 0 && !applied("dropEmpty"),
  });

  if (column.type === "numeric") {
    heading("Numbers");
    item("Round…", () => void roundColumn(modelIndex), {
      glyph: "ruler",
      mark: applied("round") ? "check" : undefined,
      keepOpen: true,
    });
  }

  heading("Type");
  chips(
    TYPES.map(([type, label]) => [
      label,
      () => {
        if (type !== column.type) changeType(modelIndex, type);
      },
      type === column.type,
    ]),
  );

  heading("Column");
  chips([
    ["Rename…", () => void renameColumn(modelIndex), false, true],
    ["Remove column", () => addStep({ kind: "remove", column: modelIndex })],
  ]);

  floating.open("menu", anchor);
  positionFloating(menu, anchor);
}

/** Les cellules qu'une fusion change : toutes celles des variantes. */
function cellsOf(group: { variants: Array<{ count: number }> }): number {
  return group.variants.reduce((sum, variant) => sum + variant.count, 0);
}

export function closeMenu(): void {
  floating.close();
}

/** Appelé quand le menu se ferme, quel que soit le chemin (voir floating.ts). */
export function resetMenuColumn(): void {
  menuColumn = null;
  elements.menu.classList.remove("clean-menu");
  elements.menu.style.borderTopColor = "";
  elements.menu.style.removeProperty("--column-accent");
}
