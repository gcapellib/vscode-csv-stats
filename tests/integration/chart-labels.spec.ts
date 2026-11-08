import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Aucun texte du graphique de distribution n'en recouvre un autre, quel que soit le fichier :
 * des quartiles resserrés, une borne d'outliers contre le maximum, de grands nombres.
 * On mesure les vraies boîtes du texte dans le vrai bundle, colonne numérique par colonne numérique.
 */
async function overlappingLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll<SVGTextElement>('#picker svg.big-hist text')].map((node) => {
      const box = node.getBBox();
      return { text: node.textContent ?? '', left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
    });
    const found: string[] = [];
    boxes.forEach((a, i) =>
      boxes.forEach((b, j) => {
        if (j <= i) return;
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 3 && b.top < a.bottom - 3) found.push(`« ${a.text} » touche « ${b.text} »`);
      }),
    );
    return found;
  });
}

// Une police étroite, puis une très large : les textes ne mesurent pas pareil selon la machine, et
// c'est la largeur réelle, pas une estimation, qui doit décider du placement.
const FONTS = [
  ['système', 'system-ui, sans-serif'],
  ['large', '"DejaVu Sans Mono", monospace'],
];
for (const [file, [fontName, font]] of ['samples/wines.csv', 'tests/fixtures/dirty.csv', 'test-data/boutique.csv'].flatMap((name) => FONTS.map((entry) => [name, entry] as const))) {
  test(`graphique de distribution : aucune étiquette ne se recouvre (${file}, police ${fontName})`, async ({ page }) => {
    test.setTimeout(120_000);
    if (file.startsWith('test-data/')) execFileSync('node', ['scripts/make-test-csv.mjs', '20000', '42']);
    await openHarness(page, file);
    await page.addStyleTag({ content: `body, #picker { font-family: ${font} !important; }` });
    const numeric = await page.locator('.band-cell').evaluateAll((cells) =>
      cells.flatMap((cell) => (/numeric/i.test(cell.textContent ?? '') ? [Number((cell as HTMLElement).dataset.column)] : [])),
    );
    expect(numeric.length).toBeGreaterThan(0);
    for (const column of numeric) {
      const cell = page.locator(`.band-cell[data-column="${column}"]`);
      await cell.scrollIntoViewIfNeeded();
      await cell.locator('.dots').click();
      await page.locator('#picker svg.big-hist').first().waitFor();
      expect(await overlappingLabels(page), `colonne ${column}`).toEqual([]);
      await page.keyboard.press('Escape');
    }
  });
}
