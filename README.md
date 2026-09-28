# CSV Stats — VS Code extension

A data-exploration tool for CSV files, built for people who will load the file
into pandas: per-column stats, cross-filtering, and a `pd.read_csv` call that
matches what was actually detected in the file — separator, decimal comma,
missing-value tokens, columns that need `dtype="string"`.

Right-click a `.csv` file in the explorer → **Open in CSV Stats**.

The interface is **in English**, numbers included: comma thousands separator and
decimal point. The table itself shows the cells exactly as they are written in
the file.

![The stats band over a 7,200-row file, Rainbow palette, with a row selected](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-rainbow.png)

*Per-column stats, a rainbow palette, and a row marked in the table below.*

![The Column details panel: completeness, a histogram with median and quartiles marked, and full statistics](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-column-details.png)

*`⋯` → Column details: what pandas would make of the column, and the chart that fits it — here a histogram with Q1, median and Q3 marked on it.*

![The palette picker, with a preview of each palette](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-themes.png)

*Forty palettes, each previewed by five chips showing background and ink.*

![The same file with the Console palette, where each column carries its own ink colour on a plain background](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-console.png)

*Console: a plain background, each column keeping its own ink colour — the way syntax highlighting does.*

![The same file with the Prism duo palette, where both the background and the text are coloured per column](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-prismduo.png)

*Prism duo: background and text both coloured, the text much denser than its background.*

## What the tab shows

Above every column, a band reports:

- the detected type — **numeric** or **text**;
- the count and share of missing values;
- the count and share of distinct values;
- a note when every value occurs exactly once — not a type, a fact about the
  spread, which warns you that the ranking just below ranks nothing;
- for a numeric column, a 20-bin histogram, then **Min / Max** and
  **Mean / Median** — the two figures you want at a glance, the rest one click
  away in **Column details**; hovering a bar shows that bin's range and count, and hovering the
  rest of the band gives the column's full name and its summary;
- for a text column, the three most frequent values and their share, followed by
  an **Other** row carrying the remainder, so the percentages always add up to
  100%.

The **Insights** button in the toolbar folds the bands away when you only want
the table, and unfolds them again. Because they can be folded, the bands are not
stingy with space: a readable chart beats one that merely fits.

Below that, the data table: click a header to sort — ascending, then
descending, then back to the file's own order, because without that third state
the original order is lost on the first click with no way back — click a cell to mark it —
the whole row takes a translucent veil and the cell itself darkens and gets a
frame. Ctrl-click (Cmd on macOS) marks several rows, and clicking a lone marked
row unmarks it. The veil is laid over the column colour rather than replacing
it, so the palette stays readable under the selection. The selection is held by row index rather than by position on screen, so it
survives sorting, filtering and scrolling. Only the visible rows are rendered,
which keeps the display smooth at a hundred thousand rows.

## Cross-filtering

Click a histogram bar or one of the ranked values, and two things happen: the
table keeps only the matching rows, and **every other band is recomputed on that
subset**. Columns stop being read side by side and start being read conditioned
on one another — *among trips departing from Caen, what does the cancellation
rate look like?* is one click away.

The ranking only shows three values, and the rest hides behind **Other** —
clicking it opens a value picker listing *every* distinct value with its count,
a search box, and checkboxes, the way Excel does. Several values become a single
condition, `departure ∈ {Paris, Lille}`, because it is one condition and reading
it back should be as simple as setting it. Counts in that list honour the other
active filters but not the column's own, otherwise unticking a value would make
it vanish from the list you were unticking it in.

Numeric columns get the same entry as a pair of bounds instead of a list: the
histogram bins cannot express *between 0 and 10*.

Conditions combine with AND, and each of them shows as a chip in a bar under the
toolbar, with the count of rows kept. Clicking a chip removes that one
condition; **Clear all** removes them all. That bar is half the feature, not its
decoration: without it you filter three times, forget what is active, and read
partial figures believing them complete.

## Column details, and the dataset

`⋯` → **Column details** opens what the band cannot carry without becoming
unreadable.

**Completeness, told apart.** An empty cell, a cell of spaces and a cell reading
`NULL` are three different mistakes, and the panel counts them separately. It
also names the tokens found — `NULL x68`, `- x62` — and says which ones pandas
already discards on its own. That distinction matters: only the others belong in
`na_values`.

**The chart that says something**, rather than always the same one. A measure
gets its histogram, enlarged, with the median and quartiles drawn on it — a box
plot would have redrawn three figures already written above it, and asked you to
know how to read it. A nomenclature gets its twenty most frequent values as
bars, the rest gathered under *Other*, because past twenty bars nothing is
legible. Free text gets neither — every value occurring once ranks nothing — but
the distribution of its **lengths**, which is what reveals fields truncated at
fifty characters and padding spaces.

**What pandas would make of the column**, and what stands in the way: `int64`,
`float64` or `object`, with notes such as *leading zeros are lost unless dtype is
"string"* or *would be numeric if NULL, - counted as missing*.

**Dataset…** in the toolbar answers *what is this file, and how do I load it* —
it does not paraphrase what the columns already say. It leads with the
`pd.read_csv` call matching what was detected: separator, decimal comma, the
missing-value tokens pandas does not already know, and the columns to read as
strings. If any cross-filters are active, matching `df = df[...]` lines follow,
each labelled with the condition it reproduces — without them, code copied out
of a filtered view would silently read all the rows back in, contradicting the
very panel it came from. Then a `df.info()`-style table — every column with the
count of non-nulls **as pandas would report it after that very call** and its
dtype, which otherwise means opening every column panel one after another. Then
the findings, each of them clickable: duplicated rows, values differing only by
case, values padded with spaces. Clicking one filters the table down to the
offending rows, because a diagnosis you cannot go and look at only causes
worry.

## Column menu

Three dots at the top right of each band: sort ascending or descending, a
contains-filter, rename, drop the column, and read the column as the other type.

These are all **view actions**: the file is never rewritten. Reopening the tab
restores the original state. Forcing a type keeps only the values that read that
way, without requiring that all of them do — that is the whole point of a manual
override.

**Two types, and two only.** A CSV carries none — everything in it is text — so
any typology is an inference, and an inference can be wrong. The one kept here
invents nothing: a column whose every present value reads as a number is numeric,
everything else is text. Types are decided from the **distinct values**, not from
every row: a hundred-thousand-row file often holds only a few hundred different
values, which makes the guess a hundred times cheaper.

## Palettes

A picker offers **forty palettes** in three families: coloured background with
uniform text (twenty), uniform background with text coloured per column, the way
syntax highlighting does (ten), and both at once (ten). Your choice is remembered
from one session to the next.

## How files are read

- The delimiter is detected between comma and semicolon by counting occurrences
  outside quotes over the first lines: what decides is the **consistency** of the
  count, not its size.
- In a semicolon file, the comma is treated as a decimal separator; in a comma
  file, it is not.
- A column is numeric only if **every** one of its present values reads as a
  number. Spaces, including non-breaking ones, are tolerated as thousands
  separators.
- A cell that is empty or made only of spaces counts as missing.
- A wholly blank line is not a data row: it is skipped, as is the trailing
  newline.
- A UTF-8 BOM is stripped. UTF-8 is the expected encoding.
- Beyond 500,000 rows the table is truncated, and the tab says so.

The file is read and analysed in the extension host rather than in the view, and
rows reach the view in batches: the interface stays responsive throughout
loading.

## Build

From `./vscode-csv-stats-main/`:

```bash
npm install
npm test       # parsing, statistics and palettes
npm run build  # bundles dist/extension.js and dist/webview.js
npm run package  # produces csv-stats-<version>.vsix
```

## Install

```bash
code --install-extension csv-stats-0.10.4.vsix
```

Or, in VS Code: **Extensions** view → `…` → **Install from VSIX…**
