# CSV Stats — the guide

Everything the [README](../README.md) leaves out: what each part of the tab
shows, and why it works the way it does.

Contents: [the band](#what-the-tab-shows) · [cross-filtering](#cross-filtering) · [column details and the dataset](#column-details-and-the-dataset) · [column menu and types](#column-menu) · [column width](#column-width) · [palettes](#palettes) · [how files are read](#how-files-are-read) · [build](#build)

## The Raw view

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

## What the tab shows

Above every column, a band reports:

- the detected type — **numeric**, **date**, **time** or **text**;
- the count and share of missing values;
- the count and share of distinct values;
- the count of **unique** values — those that occur exactly once, what Power
  Query calls *unique*. In a nomenclature these are often typos the ranking
  hides under **Other**; click the line to keep only those rows. When it equals
  the distinct count, no value repeats and the ranking below ranks nothing;
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

**Placeholder values.** A value that stands in for a missing one — `-999`, `9999`,
`1900-01-01` — is flagged at the top of the panel, with *Treat as empty* beside it. A
number counts as one if it falls outside the rest of the column (beyond 1.5 × IQR) and
repeats, three times at least, or twice for the usual suspects. The statistics are shown
again without it. Past about a quarter of the rows the placeholder drags the quartiles
with it and is no longer caught.

**The column in row order.** A curve of the values from the first row displayed to the
last, outliers as yellow dots, empty cells as red marks on the axis, and a dashed line
where the level changes — a sensor that shifts, a batch that differs. The axis gives the
line numbers of the file, those of the table's margin; the outliers and empty cells in the
legend are buttons that filter the table on them.

**By category.** For a measure, the average per category — the weight of an egg by
colour — with the share of the variation the category explains. The column that explains
most is proposed, a menu offers the others, and a click on a bar filters the table.

**Gaps in a series.** An identifier or a date series with a regular step lists where
values are missing and how many. **Repeated values** in an almost-unique column offer
*Keep the first of each*, which removes the rows that repeat it. **Garbled characters**
(`CafÃ©`, UTF-8 read as Windows-1252) are fixed in one click.

**Similar spellings** — `Lyon`, `Lyons`, `lyon ` — are merged from the column's menu, or
all at once from *Clean*, into the most frequent spelling. Words of four letters or more
may differ by one letter; a short word only by case or accents.

**Advice for pandas**, never applied for you: `Int64` for integers with empty cells, a
narrower integer or `float32`, `category` — only when it matters. *Dataset…* adds the
**related columns**, the pairs of numeric columns that move together.

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

## Column menu and cleaning

Each band has a **chart** button at its top right: it opens *Column details*.
Each column header has a **sparkle icon**, next to filter and sort — right-clicking the
header opens the same menu. The sparkle icon is for acting on the column: text (trim,
invisible characters, case), values (replace, treat as empty, fill down), type,
rename, remove. The **Clean** button in the toolbar holds the full catalogue,
including what concerns no single column (duplicate and blank rows), and the
list of applied steps.

**One rule:** what changes the data is a *step*; what changes only how you look
at it — filters, sort, widths, palette — is not. The original file is kept in
memory exactly as read and never written; the steps replay on it after every
change, like Power Query's *Applied steps*. Removing a step replays the list
without it. Each step says what it touched (*20 cells*, *−3 rows*), a column with
steps lights its sparkle icon in its accent colour, and every changed cell is
underlined — hover it to read the value it had in the file.

**Save cleaned copy…** writes the cleaned table (all rows, not just the filtered
ones: a filter is for looking) next to the original as `name.clean.csv`, then
`name.clean-2.csv`, and so on — never over the original, never over an earlier
copy. The pandas code in *Dataset…* replays the same steps and ends with the
matching `to_csv`.

Changing the type is a step too, and behaves like Power Query's: a value that
does not read in the new type becomes empty, and the step says how many.

**Only the types that change what you see.** A CSV carries none — everything in
it is text — so any typology is an inference, and an inference can be wrong. The
one kept here invents nothing: a column whose every present value reads as a
number is **numeric**; as a date or a time, it is **date** or **time**;
everything else is **text**. Types are decided from the **distinct values**, not from
every row: a hundred-thousand-row file often holds only a few hundred different
values, which makes the guess a hundred times cheaper.

A date column earns its type because it changes the display: a timeline instead
of a ranking, **Min / Max** written as dates, a chronological sort —
`02/01/2016` after `03/01/2015`, not before — a *before / after / between*
filter, and `parse_dates` in the generated `pd.read_csv`. Dates are recognised
only where nothing is left to chance:

- `2015-01-31` or `2015/01/31`, with or without a time — the year first is never
  ambiguous;
- `31/01/2015`, `31.01.2015` or `31-01-2015` — only when at least one value
  settles it, a day above 12. A column of `01/02/2015`-style values alone could be
  the first of February or the second of January, so it stays text; the menu
  reads it as a date if you know which;
- `12:52` or `12:52:01` alone — a **time**, read by pandas as a duration since
  midnight, since `parse_dates` would stamp it with today's date.

The American `01/31/2015` is not recognised: reading it would mean betting on
every ambiguous date in the file.

## Column width

Drag the right edge of a column header to make it wider or narrower, up to
1,600 pixels — well past what the automatic width allows, so a long text can be
read in full. **Double-click** the edge to widen the column until nothing in it
is cut, and double-click again to shrink it back.

With the insights band open, a column never goes narrower than its default
width, the one that shows its histogram and its bounds properly: it can be
widened, not squeezed. With the band folded there is no histogram to protect,
so a column can be narrowed freely and the double-click shrinks it to its title,
read in full with its two buttons beside it. A column narrowed that way returns
to its default width when the band is opened again; a widened one keeps its
width. Like every other view action, widths last until the tab is closed.

## Palettes

**Hovering a palette applies it to the sheet straight away**; only a click
chooses it. Five chips cannot say what a palette does to your own columns, and
judging them one commit at a time meant reopening the picker once per palette.
Until you click, nothing is decided: the toolbar button and the tick still name
your current palette, and leaving the picker any way at all — a click elsewhere,
Escape, the button again — puts it back.

A picker offers **twenty palettes**: coloured background with uniform text,
uniform background with text coloured per column the way syntax highlighting does,
and both at once. Your choice is remembered from one session to the next.

**Random palette**, at the foot of the list, draws a new one on every click:
coloured text, on a plain background or on one veiled with each column's colour (a light tint, about one draw in five), with or without grid lines between cells and columns (about half each).
It applies at once without closing the picker, so you can keep drawing until one
suits; **Keep** then adds it to your own list, which survives restarts. Drawn
palettes and kept ones both carry a cross; the ones shipped with the extension do
not, and cannot be removed.

A draw traces a **gradient**: a path through colour space where lightness and hue
move together, step by step — cream, mint, sea green; indigo, lavender, pink. Seven
shapes of path: dark to light, light to medium, a pastel walk, two ramps meeting in a
light centre, a vivid walk, a rise in saturation, and **tone on tone**, one family of
colour gliding over 100 to 170° and a little darker at each step. As it lightens a
colour drifts warm, as it darkens it drifts cool — what illustrators call hue
shifting. A path with a jump in it is drawn again.

About a third of the draws are full rainbows in the manner of Prism — six to eight
hues at even steps around the wheel, from a random start. Many of the others take the
style of a palette from the list — its ground and its ink — and the hues of a random
gradient. Brown never appears, nor its relatives: ochre, tan, terracotta, khaki,
mustard, olive and burgundy; a colour that would turn brown is lightened. Two hundred
draws are put through the same thresholds as the shipped palettes.

When the columns outnumber the colours, the table walks the gradient back
(a b c d e d c b a…) instead of jumping from its last colour to its first.

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
