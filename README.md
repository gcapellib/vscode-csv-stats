# CSV Stats — VS Code extension

A data-exploration tool for CSV files, built for people who will load the file
into pandas: per-column stats, cross-filtering, and a `pd.read_csv` call that
matches what was actually detected in the file — separator, decimal comma,
missing-value tokens, columns that need `dtype="string"`.

Right-click a `.csv` file in the explorer → **Open in CSV Stats**. A **Raw**
button in the toolbar switches to the file exactly as written on disk —
unparsed, for the odd file where a detected delimiter or a quoting quirk is
worth checking against the bytes themselves. Each field carries the colour its
column wears in the table, and the delimiters fade back: the raw file is read
with the same landmarks as the analysed view, rather than as one undifferentiated
wall of text. Quoted fields are honoured, so a value containing the delimiter
stays one field instead of shifting every colour after it by one. The text is
only requested the first time you click it, then cached, and only the visible
lines are ever built into the page: a hundred thousand lines sit in the same few
dozen DOM nodes as the table below, with no size cap standing in the way.

Numbers are shown with a comma thousands separator and a decimal point. The
table itself shows the cells exactly as they are written in the file.

![The stats band over a 423-row wine dataset, Prism duo palette: a seven-line ranking with Other on the region column, a three-line ranking with no Other on color, and histograms flush with the band's bottom edge](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-band.png)

*Prism duo, on a wine-tasting file: `region` fills its seven-line ranking and falls back to **Other**; `color`, with only three values, never needs to.*

![The palette picker open, with the sheet already recoloured to Frost from hovering it in the list](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-theme-preview.png)

*Hovering a palette applies it to the sheet at once, so you judge it against your own data — not a five-chip preview. Only a click commits it.*

![The same file with the bands folded: twelve columns fit on screen at once, narrower than with the bands open](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-folded.png)

*Folding the bands also narrows every column to what its own values need — all twelve columns on screen instead of a handful.*

![The Raw view: the file exactly as written on disk, each field coloured by the column it belongs to](https://raw.githubusercontent.com/gcapellib/vscode-csv-stats/main/media/screenshot-raw.png)

*Raw, Jungle palette: the unparsed file, each field still carrying its column's colour — the same landmarks as the analysed view.*

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
- for a text column, the most frequent values and their share — **seven lines**,
  filled to the space the band actually has — followed by an **Other** row
  carrying the remainder, so the percentages always add up to 100%. When the
  column holds seven distinct values or fewer they are all listed and **Other**
  disappears, a row reading 0.0% having nothing to say.

The histogram takes whatever height the band has left, rather than a fixed 84
pixels — on a typical file that is a third taller, and the bars are read from a
common baseline across columns since the numeric blocks all sit flush with the
bottom.

The **Insights** button in the toolbar folds the bands away when you only want
the table, and unfolds them again. Folding also **narrows every column**: a
column is wide enough to hold `Min 10,001   Max 10,300`, which is far more than
its own values need — with the band gone, that requirement goes with it. A column never narrows past its own
title, buttons included — a column read as `dep…` is no longer identified. On a
six-column sample the sheet still drops from 1302 to 826 pixels and every
column fits on screen instead of four. Both movements — the band and the columns — run over
the same 90 ms, so neither is seen waiting for the other.

Because they can be folded, the bands are not stingy with space: a readable
chart beats one that merely fits.

Every column header carries two permanent buttons: **sort** and **filter**.
Both actions existed before, but one was a click on the title that nothing
announced and the other slept inside the `⋯` menu — a feature you cannot see is
a feature you do not have.

Below that, the data table: the header's sort button cycles ascending, then
descending, then back to the file's own order, because without that third state
the original order is lost on the first click with no way back. The title
itself does nothing — reordering a table is too large a consequence for a click
that announces nothing. Click a cell to mark it —
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

The ranking shows seven lines, and what does not fit hides behind **Other** —
a plain line, not a button: the column's own **filter** button opens a value
picker listing *every* distinct value with its count, a search box, and
checkboxes, the way Excel does. Several values become a single
condition, `departure ∈ {Paris, Lille}`, because it is one condition and reading
it back should be as simple as setting it. Counts in that list honour the other
active filters but not the column's own, otherwise unticking a value would make
it vanish from the list you were unticking it in.

Numeric columns get the same entry as a pair of bounds instead of a list: the
histogram bins cannot express *between 0 and 10*. A third field takes a single
value, because asking for *exactly 7* by typing it into both bounds is a puzzle,
not an interface — and the generated pandas then reads `== 7` rather than
`between(7, 7)`.

Conditions combine with AND, and each of them shows as a chip in a bar under the
toolbar, with the count of rows kept. Clicking a chip removes that one
condition; **Clear all** removes them all. That bar is half the feature, not its
decoration: without it you filter three times, forget what is active, and read
partial figures believing them complete. The bar itself carries a faint
gradient woven from the active palette's own hues, so it reads as part of the
same sheet as the band above rather than a plain grey strip bolted onto it.

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

**Dataset…** in the toolbar — a toggle, like **Insights** and **Raw** — answers *what is this file, and how do I load it* —
it does not paraphrase what the columns already say. It leads with the
`pd.read_csv` call matching what was detected: separator, decimal comma, the
missing-value tokens pandas does not already know, and the columns to read as
strings. Every change made through the table follows, in the order it was
actually applied — `df.rename(...)` for renamed columns, `df.drop(...)` for
dropped ones, `df = df[...]` for each active filter, `df.sort_values(...)` for the current sort — because code that only replayed some of them would either
contradict the panel it came from (rows or columns it no longer shows) or fail
outright (a filter naming a column that was never renamed in the code). Then a
`df.info()`-style table — every column still on screen, with the count of
non-nulls **as pandas would report it after that very code** and its dtype,
which otherwise means opening every column panel one after another. Then the
findings, each of them clickable: duplicated rows, values differing only by
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

**Hovering a palette applies it to the sheet straight away**; only a click
chooses it. Five chips cannot say what a palette does to your own columns, and
judging them one commit at a time meant reopening the picker once per palette.
Until you click, nothing is decided: the toolbar button and the tick still name
your current palette, and leaving the picker any way at all — a click elsewhere,
Escape, the button again — puts it back.

A picker offers **twenty-nine palettes** in three families: coloured background
with uniform text, uniform background with text coloured per column the way
syntax highlighting does, and both at once. Your choice is remembered from one
session to the next.

Two of them — **Okabe-Ito** and **Tol Bright** — come from palettes designed so
that categories stay distinguishable, including for a colour-blind reader. That is exactly the problem a table with one colour per
column has. Their colours are given one by one rather than derived from a hue:
Okabe-Ito tells its sky blue from its blue by lightness, not by hue, and a
hue-derived model would collapse the two. The published values are calibrated
for marks in a chart rather than for text — its yellow on white reads at a
contrast of 39 against a threshold of 60 — so they are darkened in light mode
and lightened in dark mode by just what it takes, the hues left untouched.

**Random palette**, at the foot of the list, draws a new one on every click,
alternating coloured background and coloured text. It applies at once without
closing the picker, so you can keep drawing until one suits; **Keep** then adds
it to your own list, which survives restarts. Drawn palettes and kept ones both
carry a cross; the ones shipped with the extension do not, and cannot be
removed.

The draw follows what colour research measures of harmony, rather than spreading
hues over the whole wheel. Pairs read as harmonious when their hues are close,
their colours desaturated and their lightness similar, and cool hues fare better
([Schloss & Palmer, 2011](https://palmerlab.berkeley.edu/pdf/Schloss&Palmer(2011).pdf));
two colours differing only in lightness agree, and the lighter the better
([Ou & Luo, 2006](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.20208));
dark yellow and dark orange — olive and brown — are the least liked colours of
all ([Palmer & Schloss, 2010](https://www.pnas.org/doi/10.1073/pnas.0906172107)).
So a draw mostly stays within one family of hues, two thirds of the time a cool
one; every column shares one chroma and one perceived lightness, computed in
OKLCH; neighbouring columns differ by a slight alternation of lightness; and in
dark mode orange, yellow and yellow-green backgrounds are desaturated before
they turn to mud. Two hundred draws are put through the same thresholds as the
shipped palettes — neighbouring columns distinguishable, text never confused
with its ground.

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
npm run lint              # style and correctness rules
npm test                  # parsing, statistics, palettes, filters — no DOM
npm run test:integration  # the real bundle, in a real browser (Playwright)
npm run build              # bundles dist/extension.js and dist/webview.js
npm run package            # produces csv-stats-<version>.vsix
```

`npm test` runs against `core/` — pure logic, no browser. `npm run test:integration`
runs the actual `dist/webview.js` inside headless Chromium, driving it with real
mouse clicks rather than synthetic events: it is the only layer that can catch a
bug in event ordering (mousedown before click) or in a measurement taken while an
element is `hidden` — both have happened in this project, and neither is visible
to a unit test. A GitHub Actions workflow (`.github/workflows/ci.yml`) runs all
of the above on every push and pull request.

## Install

```bash
code --install-extension csv-stats-0.21.0.vsix
```

Or, in VS Code: **Extensions** view → `…` → **Install from VSIX…**
