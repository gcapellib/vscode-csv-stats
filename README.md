# CSV Stats

**See what's in a CSV, clean it, and load it into pandas.** Per-column
statistics, one-click cross-filtering, cleaning steps that never touch the
original, and a `pd.read_csv` call that matches what is really in the file —
separator, decimal comma, missing-value tokens, dates.

Right-click a `.csv` file in the explorer → **Open in CSV Stats**.

![The stats band over a 423-row wine dataset, Prism duo palette: a seven-line ranking with Other on the region column, a three-line ranking with no Other on color, and histograms flush with the band's bottom edge](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-band.png)

*A band above every column: type, missing, distinct and unique values, then a histogram or the most frequent values.*

## What's new

- **Column details leads to the fix** (0.25.1). Outliers, values that break the
  column's type and inconsistent formats (`A-9999` against `A-999`) are one click
  from their rows, with the cleaning step that fixes them right beside.
- **Clean, without touching the original** (0.25.0). A broom on every column
  header (or right-click it) trims, fixes case, replaces values, changes the
  type, renames or removes the column; the **Clean** button lists the applied
  steps, holds the full catalogue — duplicate and blank rows included — and
  saves a cleaned copy next to the file, `name.clean.csv`, never over it.
  Changed cells are underlined; hover one to see what it was.
- **Duplicated rows, side by side** (0.24.4). Every occurrence, original
  included, grouped one under the other on alternating shades of the palette;
  hover a row number to see where the others are.
- **Findings in colour** (0.24.4). Each finding in *Dataset…* wears its column's
  colours, so you see at once where to clean.
- **Unique values** (0.24.3). Next to *Distinct*, the count of values that occur only
  once — often typos hidden under *Other*. Click it to see those rows.
- **Dates and times** (0.24.3). `2015-01-31`, `31/01/2015` and `12:52:01` are recognised:
  a timeline instead of a ranking, a chronological sort, a *before / after /
  between* filter, and `parse_dates` in the generated pandas code.
- **Fixes** (0.24.3). A column no longer changes type under a filter, and *Read this
  column as* now applies to the filtered rows and survives later filters.

Every version is listed in the [changelog](https://github.com/gcapellib/vscode-csv-stats/blob/main/CHANGELOG.md).

## Features

- **Statistics per column** — type (number, date, time or text), missing,
  distinct and unique values, histogram, min / max, mean / median.
- **Cross-filtering** — click a bar or a value: the table keeps those rows and
  every other band is recomputed on them. Filters show as chips; one click
  removes each.
- **Filter panel per column** — a value list with search, like Excel; *contains*
  / *starts with* for text; *greater than* / *between* for numbers and dates.
- **Cleaning steps** — trim, invisible characters, case, replace values, treat
  tokens as empty, fill down, change type, rename, remove a column, remove
  duplicate or blank rows. Each step shows what it changed and can be removed;
  the original is never modified, and every save keeps a new copy.
- **Column details** — the chart button on each band: empty cells, cells of spaces and `NULL` counted apart,
  what pandas would make of the column and what stands in the way.
- **Dataset** — the matching `pd.read_csv`, followed by every rename, drop,
  filter and sort you made, in order — plus duplicated rows and values that
  differ only by case or padding, each one click away.
- **Raw view** — the file exactly as written, each field in its column's colour.
- **29 palettes**, two of them colour-blind-safe, and random ones to draw —
  hover to preview on your own data.
- **Fast** — 100,000 rows scroll smoothly; the file itself is never modified.

![The palette picker open, with the sheet already recoloured to Frost from hovering it in the list](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-theme-preview.png)

*Hover a palette and the sheet changes at once; only a click keeps it.*

![The same file with the bands folded: twelve columns fit on screen at once, narrower than with the bands open](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-folded.png)

*Fold the bands and every column narrows to its values: twelve columns on screen.*

![The Raw view: the file exactly as written on disk, each field coloured by the column it belongs to](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-raw.png)

*Raw: the unparsed file, each field still in its column's colour.*

## Good to know

- Comma and semicolon files; in a semicolon file the comma is a decimal
  separator. UTF-8 expected.
- Up to 300 MB; beyond 500,000 rows only the first 500,000 are analysed, and the
  tab says so.
- How every part works, and why: the [guide](https://github.com/gcapellib/vscode-csv-stats/blob/main/docs/guide.md).

## Install

Extensions view → `…` → **Install from VSIX…**, or:

```bash
code --install-extension csv-stats-0.25.8.vsix
```
