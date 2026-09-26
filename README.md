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

- the detected type — **numeric**, **date**, **boolean**, **identifier**,
  **category** or **text**;
- the count and share of missing values;
- the count and share of distinct values;
- for a numeric or date column, a 20-bin histogram, then **Min on the left and
  Max on the right**; hovering a bar shows that bin's range and count, and
  hovering the rest of the band gives the column's full name and its summary;
- for a boolean column, both sides and their share;
- for an identifier, simply how many values there are — a histogram of values
  that each occur once would say nothing;
- for a category or free text, the three most frequent values and their share,
  followed by an **Other** row carrying the remainder, so the percentages always
  add up to 100%.

The **Insights** button in the toolbar folds the bands away when you only want
the table, and unfolds them again. Because they can be folded, the bands are not
stingy with space: a readable chart beats one that merely fits.

Below that, the data table: click a header to sort, and only the visible rows are
rendered, which keeps the display smooth at a hundred thousand rows.

## Column menu

Three dots at the top right of each band: sort ascending or descending, a
contains-filter, rename, drop the column, and read the column as another type.

These are all **view actions**: the file is never rewritten. Reopening the tab
restores the original state. Forcing a type keeps only the values that read that
way, without requiring that all of them do — that is the whole point of a manual
override.

Types are decided from the **distinct values**, not from every row: a
hundred-thousand-row file often holds only a few hundred different values, which
makes the guess a hundred times cheaper. A few rules are worth knowing. A column
of `0` and `1` is read as boolean rather than as a measure. Day-first and
month-first dates are told apart on the whole column — `03/04/2026` reads both
ways, it takes a `25/12/2026` to settle it — and day-first wins when nothing
settles it. And all-distinct values alone do not make an identifier: a fine
measurement is all-distinct too, so an identifier must also have a constant width
or a name that says so, and must not contain spaces — otherwise every free-text
comment would pass for a reference.

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
code --install-extension csv-stats-0.3.0.vsix
```

Or, in VS Code: **Extensions** view → `…` → **Install from VSIX…**
