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

test('le bandeau affiche l’index de chaque colonne, renuméroté quand une colonne est retirée', async ({ page }) => {
  // Compté depuis 0 comme pandas ; une colonne retirée renumérote les
  // suivantes, comme df.drop.
  await openHarness(page);
  const indices = async () =>
    (await page.locator('.band-cell .type').allTextContents()).map((text) => Number(/#(\d+)/.exec(text)?.[1]));
  const before = await indices();
  expect(before).toEqual(before.map((_, index) => index));

  await page.locator('.band-cell').nth(1).locator('.dots').click();
  await page.locator('.menu-item', { hasText: 'Drop column' }).click();
  const after = await indices();
  expect(after.length).toBe(before.length - 1);
  expect(after).toEqual(after.map((_, index) => index));
});
