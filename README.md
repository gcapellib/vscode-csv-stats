# CSV Stats — VS Code extension

A statistical overview of CSV files, right inside the editor.

Right-click a `.csv` file in the explorer → **Open in CSV Stats**.

The interface is **in English**, numbers included: comma thousands separator and
decimal point. The table itself shows the cells exactly as they are written in
the file.

![The stats band over a 7,200-row file, Rainbow palette, with a histogram tooltip](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-rainbow.png)

*Hovering a histogram bar gives that bin's range and count.*

![The same file with the Console palette, where each column carries its own ink colour](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-console.png)

*The Console palette leaves the background alone and colours the text instead.*

![The palette picker, with a preview of each palette](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-themes.png)

*Forty palettes, each previewed by five chips showing background and ink.*

## What the tab shows

Above every column, a band reports:

- the detected type — **numeric** or **text**;
- the count and share of missing values;
- the count and share of distinct values;
- a note when every value occurs exactly once — not a type, a fact about the
  spread, which warns you that the ranking just below ranks nothing;
- for a numeric column, a 20-bin histogram, then **Min on the left and Max on
  the right**; hovering a bar shows that bin's range and count, and hovering the
  rest of the band gives the column's full name and its summary;
- for a text column, the three most frequent values and their share, followed by
  an **Other** row carrying the remainder, so the percentages always add up to
  100%.

The **Insights** button in the toolbar folds the bands away when you only want
the table, and unfolds them again. Because they can be folded, the bands are not
stingy with space: a readable chart beats one that merely fits.

Below that, the data table: click a header to sort, click a cell to mark it —
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

Conditions combine with AND, and each of them shows as a chip in a bar under the
toolbar, with the count of rows kept. Clicking a chip removes that one
condition; **Clear all** removes them all. That bar is half the feature, not its
decoration: without it you filter three times, forget what is active, and read
partial figures believing them complete.

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
code --install-extension csv-stats-0.6.0.vsix
```

Or, in VS Code: **Extensions** view → `…` → **Install from VSIX…**
