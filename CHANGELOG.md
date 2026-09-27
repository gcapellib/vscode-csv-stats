# Changelog

The Marketplace listing was last updated at 0.2.4. Everything below shipped to
GitHub in between and is now reaching the Marketplace in one deposit — this
file exists so that jump has an explanation.

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
