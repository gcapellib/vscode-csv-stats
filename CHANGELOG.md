# Changelog

The Marketplace listing was last updated at 0.2.4. Everything below shipped to
GitHub in between and is now reaching the Marketplace in one deposit — this
file exists so that jump has an explanation.

## 0.15.x

- Clicking a column title no longer sorts. Only its arrow button does —
  reordering a table is too large a consequence for a click that announces
  nothing.

- Every dropdown closes on a second click of the button that opened it. The
  panel did not: the outside-click handler closed it *before* the click reached
  the button, which reopened it at once.
- **Other** is a plain line again. The header's filter button opens the full
  value list, so a clickable **Other** only doubled that gesture.

- **Group by removed.** Counting rows per value is what the value picker
  already does, and what the band already shows: the panel moved information
  around without producing any. A real group by aggregates the *other* columns
  — mean delay per company — and that is a different feature.

## 0.14.x

- **Two permanent buttons in every column header**, sort and filter — both
  actions existed, but one was an unannounced click on the title and the other
  slept in the `⋯` menu.
- The band's ranking fills **seven lines** instead of three, and the histogram
  takes the height left over instead of a fixed 84 pixels.
- **Filtering no longer shifts the table sideways.** Column widths took the
  `Min … Max …` text into account, and those figures changed with the filter.
- `Dataset` became a toggle, and `Insights` folds in a short slide.

## 0.13.x

- **Live palette preview**: hovering a palette in the picker recolours the sheet
  at once — table, bands, filter bar and raw view — while only a click commits
  it. Leaving the picker any way at all restores the chosen palette.

## 0.12.x

- **Five palettes** after the editor colour schemes most people already read
  code in — Mocha, Midnight, Frost, Solar, Ember — bringing the picker to
  forty-five. Their hues are ordered so neighbouring columns fall as far apart
  as possible.
- The picker now derives each palette's family from the palette itself rather
  than from its position in the list, where a hardcoded cut would have filed a
  new palette under the wrong heading in silence.
- The raw view no longer renders a short page when it is painted before the
  layout settles.

## 0.11.x

- **Raw view**: a toolbar button shows the file exactly as written on disk,
  each field carrying the colour its column wears in the table and the
  delimiters faded back. Quoted fields are honoured, so a value containing the
  delimiter does not shift every colour after it. The text is fetched only on
  the first click and rendered by windowing — a hundred thousand lines in a few
  dozen DOM nodes, no line cap.
- The **Dataset** snippet now replays everything done through the table —
  renames, dropped columns, filters, sort — in the order it was applied.
  Previously it only ever reproduced reading the file, contradicting the very
  figures shown beside it.
- Toolbar and filter bar carry a gradient woven from the active palette, and
  the row count leads the toolbar with the palette picker beside it.

## 0.10.x

- **Column details panel redesigned** (`⋯` → Column details), oriented toward
  people who will load the file into pandas: which tokens count as missing and
  which pandas already discards, the chart that fits the column (a histogram
  with Q1/median/Q3 marked for a measure, ranked values for a nomenclature,
  length distribution for free text), and what pandas would make of the column
  (`int64`, `float64`, `object`) with what stands in the way.
- **Dataset panel** in the toolbar: the matching `pd.read_csv` call first,
  a `df.info()`-style table for every column, and clickable findings —
  duplicate rows, values differing only by case, values padded with spaces —
  that filter the table down to the offending rows.
- `Values seen once` replaces a misleading `Duplicated rows` count that had
  flagged a perfectly regular column as 96% duplicated.
- Marketplace description, keywords and screenshots updated to match.

## 0.9.x

- Descriptive statistics: mean, median, quartiles, standard deviation, an
  outlier count.
- Sorting gained a third state — ascending, descending, back to the file's own
  order — instead of losing the original order on the first click.
- `Clear all` became visible without dominating the toolbar.

## 0.7 – 0.8

- **Cross-filtering**: click a histogram bar or a ranked value to filter the
  table, with every other band recomputed on the kept subset.
- **Value picker**, opened from `Other`: every distinct value with its count,
  a search box, checkboxes — reaching values a top-3 ranking could never show.
- An active-filters bar with removable chips and a running row count.

## 0.4 – 0.6

- Back to two column types, `numeric` and `text` — a CSV carries none, and the
  richer typology tried in 0.3 mostly repeated what was already on screen.
- Row selection, with a two-level mark: a translucent veil on the row and a
  framed, darker active cell.
- The stats band can be folded from the toolbar, and stopped rationing space
  once it could be: wider columns, taller histograms, a real grid between rows
  and columns.

## 0.3.0

- Column-type detection (superseded in 0.4 by the two-type model above).
- The `Hide column insights` toggle moved out of the band it hid — inside it,
  hiding the band removed the only button able to bring it back.
- 40 colour palettes, in three families: tinted background, tinted text on a
  plain background, or both at once.

## 0.2.4 and earlier

See the [GitHub releases](https://github.com/gcapellib/vscode-csv-stats/releases)
for the initial feature set: the stats band itself, the column menu, and the
first 20-palette picker.
