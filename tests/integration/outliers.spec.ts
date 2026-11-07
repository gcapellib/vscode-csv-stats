import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('les outliers de Column details se cliquent et filtrent le tableau', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const shape = page.locator('#shape');
  await expect(shape).toHaveText('423 rows × 12 columns');

  // residual_sugar_g_l : 13 outliers.
  const column = page.locator('.band-cell').filter({ hasText: 'NUMERIC · #8' });
  // Hors écran, la colonne se ferait rejoindre par un défilement — qui referme les
  // panneaux flottants, par conception. On la met d'abord en vue, comme on le fait.
  await column.scrollIntoViewIfNeeded();
  await column.locator('.dots').click();
  const row = page.locator('#picker .finding-row .flag', { hasText: 'values below' });
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('.chip-filter')).toContainText('outliers');
  await expect(page.locator('#filters')).toContainText('13 of 423 rows');
});
