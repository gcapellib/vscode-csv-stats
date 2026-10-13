import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('un clic sur l’en-tête marque toute la colonne, comme un clic marque une ligne', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const head = page.locator('.head-cell').nth(2);
  await head.locator('.head-name').click();
  await expect(head).toHaveClass(/selected/);
  const rows = page.locator('.row');
  const marked = await rows.evaluateAll((all) =>
    all.every((row) => row.querySelectorAll('.cell')[2]?.classList.contains('column-selected')),
  );
  expect(marked).toBe(true);
  await expect(page.locator('#selection')).toContainText('selected');

  // Un second clic démarque ; un clic sur une cellule remplace la colonne par une ligne.
  await head.locator('.head-name').click();
  await expect(head).not.toHaveClass(/selected/);
  await head.locator('.head-name').click();
  await page.locator('.row').first().locator('.cell').first().click();
  await expect(page.locator('.head-cell.selected')).toHaveCount(0);
  await expect(page.locator('.column-selected')).toHaveCount(0);
});

test('les boutons de l’en-tête ne marquent pas la colonne', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  await page.locator('.head-cell').nth(2).locator('.head-button').last().click();
  await expect(page.locator('.head-cell.selected')).toHaveCount(0);
});
