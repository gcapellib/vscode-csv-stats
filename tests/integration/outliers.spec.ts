import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('les outliers de la courbe de Column details se cliquent et filtrent le tableau', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const shape = page.locator('#shape');
  await expect(shape).toHaveText('423 rows × 12 columns');

  // residual_sugar_g_l : 13 outliers.
  const column = page.locator('.band-cell').filter({ hasText: 'NUMERIC · #8' });
  // Hors écran, la colonne se ferait rejoindre par un défilement — qui referme les
  // panneaux flottants, par conception. On la met d'abord en vue, comme on le fait.
  await column.scrollIntoViewIfNeeded();
  await column.locator('.dots').click();
  // La légende de la courbe par ligne porte les outliers : une pastille cliquable.
  const row = page.locator('#picker .legend-link', { hasText: 'outliers' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('13 outliers');
  await row.click();

  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('.chip-filter')).toContainText('outliers');
  await expect(page.locator('#filters')).toContainText('13 of 423 rows');
});

test('« Remove these rows » retire les outliers du tableau nettoyé, et l’étape se retire', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const column = page.locator('.band-cell').filter({ hasText: 'NUMERIC · #8' });
  await column.scrollIntoViewIfNeeded();
  await column.locator('.dots').click();
  await page.locator('#picker .legend-link', { hasText: 'outliers' }).click();
  await expect(page.locator('#filters')).toContainText('13 of 423 rows');

  await page.locator('#filters .chip-drop', { hasText: 'Remove these 13 rows' }).click();
  await expect(page.locator('#shape')).toHaveText('410 rows × 12 columns');
  await expect(page.locator('#filters')).toBeHidden();

  await page.locator('#clean-button').click();
  await expect(page.locator('.clean-step')).toContainText('Remove 13 rows');
  await page.locator('.clean-step').first().locator('.clean-remove').click();
  await expect(page.locator('#shape')).toHaveText('423 rows × 12 columns');
});

test('le menu de colonne propose Fill up, Fill empty et Replace text', async ({ page }) => {
  await openHarness(page, 'tests/fixtures/dirty.csv');
  const head = page.locator('.head-cell[data-column="5"]');
  await head.scrollIntoViewIfNeeded();
  await head.click({ button: 'right' });
  await expect(page.locator('#menu')).toBeVisible();
  for (const label of ['Replace text…', 'Fill down', 'Fill up', 'Fill empty with…']) {
    await expect(page.locator('#menu .menu-item', { hasText: label })).toBeVisible();
  }
});

test('Replace text déplie un champ à côté du menu, Entrée l’applique, Échap l’annule', async ({ page }) => {
  await openHarness(page, 'tests/fixtures/dirty.csv');
  const head = page.locator('.head-cell[data-column="1"]');
  await head.scrollIntoViewIfNeeded();
  await head.click({ button: 'right' });
  await page.locator('#menu .menu-item', { hasText: 'Replace text…' }).click();

  const field = page.locator('#field');
  await expect(field).toBeVisible();
  await expect(page.locator('#menu')).toBeVisible();
  // À côté du menu, pas par-dessus.
  const [menu, card] = await Promise.all([page.locator('#menu').boundingBox(), field.boundingBox()]);
  expect(card!.x >= menu!.x + menu!.width - 1 || card!.x + card!.width <= menu!.x + 1).toBe(true);

  // Une expression invalide est refusée sans fermer le volet.
  await field.locator('input').nth(0).fill('/(/');
  await page.keyboard.press('Enter');
  await expect(field.locator('.field-error')).toContainText('not a valid regular expression');

  await field.locator('input').nth(0).fill('Lyon');
  await field.locator('input').nth(1).fill('Lyon-ville');
  await page.keyboard.press('Enter');
  await expect(field).toBeHidden();
  await expect(page.locator('#menu')).toBeHidden();
  await page.locator('#clean-button').click();
  await expect(page.locator('.clean-step')).toContainText('Replace text « Lyon » with « Lyon-ville »');

  await head.click({ button: 'right' });
  await page.locator('#menu .menu-item', { hasText: 'Fill empty with…' }).click();
  await expect(field).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(field).toBeHidden();
  await expect(page.locator('.clean-step')).toHaveCount(1);

  // Re-cliquer la même entrée replie le volet ; le menu, lui, reste.
  await head.click({ button: 'right' });
  await page.locator('#menu .menu-item', { hasText: 'Fill empty with…' }).click();
  await expect(field).toBeVisible();
  await page.locator('#menu .menu-item', { hasText: 'Fill empty with…' }).click();
  await expect(field).toBeHidden();
  await expect(page.locator('#menu')).toBeVisible();
  // Un second clic droit sur l'en-tête replie le menu.
  await head.click({ button: 'right' });
  await expect(page.locator('#menu')).toBeHidden();
});

test('les infobulles sont celles du plug-in, immédiates, jamais le `title` natif de VS Code', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const column = page.locator('.band-cell').filter({ hasText: 'NUMERIC · #8' });
  await column.scrollIntoViewIfNeeded();
  await column.locator('.dots').click();
  const link = page.locator('#picker .legend-link', { hasText: 'outliers' });
  await link.hover();
  await expect(page.locator('#tooltip')).toBeVisible({ timeout: 400 });
  await expect(page.locator('#tooltip')).toHaveText('Show these rows in the table');
  await expect(page.locator('#picker [title]')).toHaveCount(0);
  await page.mouse.move(5, 5);
  await expect(page.locator('#tooltip')).toBeHidden();
  // Les boutons de la barre du haut aussi : leur `title` a été repris.
  await page.locator('#dataset-button').hover();
  await expect(page.locator('#tooltip')).toContainText('Duplicates');
  await expect(page.locator('#dataset-button')).not.toHaveAttribute('title', /.+/);
});

test('Dataset : la carte de chaleur des corrélations se dessine, se parcourt et se referme', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  await page.locator('#dataset-button').click();
  await page.locator('.section-title', { hasText: 'Related columns' }).locator('.title-action').click();

  const cells = page.locator('#picker svg.heatmap .heat-cell');
  const n = Math.sqrt(await cells.count());
  expect(Number.isInteger(n) && n >= 2).toBe(true);
  await expect(page.locator('#picker .picker-title')).toHaveText('Correlations');
  // Une case hors diagonale dit ses deux colonnes et son coefficient dans l'infobulle du plug-in.
  const off = cells.nth(1);
  await off.hover();
  await expect(page.locator('#tooltip')).toContainText('↔');
  await page.mouse.move(2, 2);
  await expect(page.locator('#picker .heat-diagonal')).toHaveCount(n);

  await page.locator('#picker .picker-button', { hasText: 'Copy pandas code' }).click();
  await page.locator('#picker .picker-button', { hasText: 'Dataset' }).click();
  await expect(page.locator('#picker .section-title', { hasText: 'Related columns' })).toBeVisible();
});

test('Dataset : sans deux colonnes numériques, pas de carte de chaleur', async ({ page }) => {
  await openHarness(page, 'samples/brut.csv');
  await page.locator('#dataset-button').click();
  await expect(page.locator('#picker .section-title', { hasText: 'Findings' })).toBeVisible();
  await expect(page.locator('.title-action')).toHaveCount(0);
});

test('Dataset s’ouvre sans attendre sur un gros fichier : les constats sont préparés d’avance', async ({ page }) => {
  test.setTimeout(90_000);
  execFileSync('node', ['scripts/make-test-csv.mjs', '30000', '42']);
  await openHarness(page, 'test-data/boutique.csv');
  // Le temps que le calcul d'arrière-plan passe, colonne par colonne.
  await page.waitForTimeout(3500);
  const started = Date.now();
  await page.locator('#dataset-button').click();
  await page.locator('#picker .picker-title').waitFor();
  const opened = Date.now() - started;
  expect(opened, `ouverture en ${opened} ms`).toBeLessThan(250);
  // Un filtre invalide ce qui était préparé : l'ouverture suivante recalcule, et reste correcte.
  await page.locator('#picker .picker-button', { hasText: 'Close' }).click();
  await expect(page.locator('#picker')).toBeHidden();
});
