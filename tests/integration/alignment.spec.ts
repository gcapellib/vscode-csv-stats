import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('toutes les valeurs sont alignées à droite, texte comme nombres', async ({ page }) => {
  // Seuls les nombres l'étaient : une ligne alternait d'une colonne à
  // l'autre entre la gauche et la droite.
  await openHarness(page);
  const alignments = await page.locator('.row').first().locator('.cell').evaluateAll((cells) =>
    cells.map((cell) => getComputedStyle(cell).textAlign),
  );
  expect(alignments.length).toBeGreaterThan(5);
  expect(new Set(alignments)).toEqual(new Set(['right']));
});
