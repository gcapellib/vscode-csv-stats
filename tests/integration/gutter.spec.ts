import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('la gouttière montre le numéro de ligne du fichier, qui survit au tri', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const numbers = () => page.locator('.row .gutter').evaluateAll((all) => all.slice(0, 3).map((cell) => cell.textContent));
  expect(await numbers()).toEqual(['2', '3', '4']);

  await page.locator('.head-cell').nth(0).locator('.head-button').last().click();
  await page.locator('.head-cell').nth(0).locator('.head-button').last().click();
  const sorted = await numbers();
  expect(sorted).not.toEqual(['2', '3', '4']);
});
