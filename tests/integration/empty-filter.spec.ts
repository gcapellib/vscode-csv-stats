import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Filtrer les vides, quel que soit le type de la colonne. Le cas d'usage qui
 * l'a demandé : combien d'annonces n'ont aucune information de contact — le
 * téléphone, lu comme numérique, n'offrait qu'une plage et aucun moyen de
 * retenir ses cellules vides. Ici, 12 lignes : téléphone vide sur 5, e-mail
 * vide sur 5, les deux vides sur 3.
 */
test.describe('filtrer les vides', () => {
  const file = 'tests/integration/fixtures/contacts.csv';
  const band = (page: import('@playwright/test').Page, index: number) => page.locator('.band-cell').nth(index);

  test('un clic sur « Missing » garde les lignes vides, colonne numérique comprise', async ({ page }) => {
    await openHarness(page, file);
    await band(page, 1).locator('.stat.pickable', { hasText: 'Missing' }).click();
    await expect(page.locator('.filter-summary')).toHaveText('5 of 12 rows');
  });

  test('les clics sur « Missing » se cumulent : aucun contact du tout', async ({ page }) => {
    await openHarness(page, file);
    await band(page, 1).locator('.stat.pickable', { hasText: 'Missing' }).click();
    await band(page, 2).locator('.stat.pickable', { hasText: 'Missing' }).click();
    await expect(page.locator('.filter-summary')).toHaveText('3 of 12 rows');
  });

  test('un téléphone est lu comme du texte : liste de valeurs, pas de bornes numériques', async ({ page }) => {
    await openHarness(page, file);
    await page.locator('.head-cell', { hasText: 'telephone' }).locator('.head-button').first().click();
    await expect(page.locator('.picker-tab')).toHaveText(['Values', 'Text']);
    await expect(page.locator('.picker-number')).toHaveCount(0);
  });

  test('« Only empty cells » ne garde que les vides', async ({ page }) => {
    await openHarness(page, file);
    await page.locator('.head-cell', { hasText: 'telephone' }).locator('.head-button').first().click();
    await page.locator('.picker-tab', { hasText: 'Text' }).click();
    await page.locator('.picker-empties').selectOption('only');
    await page.locator('.picker-button.primary').click();
    await expect(page.locator('.filter-summary')).toHaveText('5 of 12 rows');
  });

  test('« Keep them too » ajoute les vides à une condition', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    const button = page.locator('.head-cell', { hasText: 'quality_score' }).locator('.head-button').first();
    await button.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await button.click();
    await page.locator('.picker-op').selectOption('≥');
    await page.locator('.picker-number').first().fill('8');
    await page.locator('.picker-empties').selectOption('add');
    await page.locator('.picker-button.primary').click();
    // 76 notes ≥ 8, plus les 9 sans note.
    await expect(page.locator('.filter-summary')).toHaveText('85 of 423 rows');
  });
});

test.describe('lisibilité du bandeau', () => {
  for (const file of ['samples/wines.csv', 'tests/integration/fixtures/contacts.csv', 'tests/integration/fixtures/distinct.csv', ...(process.env.EXTRA_CSV ? [process.env.EXTRA_CSV] : [])]) {
    test(`aucune ligne « Missing » ni « Distinct » coupée — ${file.split('/').pop()}`, async ({ page }) => {
      // « Distinct … (… of filled) », en gras, se coupait en « of fi… »
      // avant d'entrer dans le calcul de la largeur.
      await openHarness(page, file);
      const cut = await page.locator('.band-cell .stat').evaluateAll((lines) =>
        lines.filter((line) => line.scrollWidth > line.clientWidth + 1).map((line) => line.textContent),
      );
      expect(cut).toEqual([]);
    });
  }

  test('« Missing 0 » est grisé et inerte, « Missing » avec des vides est cliquable', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    const lines = await page.locator('.band-cell .stat').evaluateAll((all) =>
      all
        .filter((line) => line.textContent?.startsWith('Missing'))
        .map((line) => ({ zero: line.textContent?.startsWith('Missing 0 ') ?? false, cls: line.className })),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.cls).toBe(line.zero ? 'stat none' : 'stat pickable');
  });
});
