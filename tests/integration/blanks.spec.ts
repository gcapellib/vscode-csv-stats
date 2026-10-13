import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Les vides, du bandeau au code pandas. Le cas qui a alerté, sur un fichier
 * réel : une colonne « cave » vide à 93 %, le reste valant « True », dont le
 * bandeau annonçait « True 100 % » — juste rapporté aux valeurs renseignées,
 * trompeur sur le fichier. Ici, 12 cellules vides, 2 d'espaces seules et 6
 * « True » sur 20 lignes.
 */
test.describe('valeurs vides', () => {
  test('le bandeau classe « (blank) » à son rang, parts rapportées au total', async ({ page }) => {
    await openHarness(page, 'tests/integration/fixtures/blanks.csv');
    const band = page.locator('.band-cell').nth(1);
    await expect(band.locator('.value').nth(0)).toContainText('(blank)');
    await expect(band.locator('.value').nth(0)).toContainText('70.0%');
    await expect(band.locator('.value').nth(1)).toContainText('True');
    await expect(band.locator('.value').nth(1)).toContainText('30.0%');
  });

  test('un clic sur « (blank) » ramène toutes les lignes vides, espaces seules comprises', async ({ page }) => {
    await openHarness(page, 'tests/integration/fixtures/blanks.csv');
    await page.locator('.band-cell').nth(1).locator('.value.pickable', { hasText: '(blank)' }).click();
    await expect(page.locator('.filter-summary')).toHaveText('14 of 20 rows');
  });

  test('le code pandas retrouve les vides par isna, pas par == ""', async ({ page }) => {
    // pandas lit une cellule vide comme NaN : « == "" » ne retrouvait rien.
    await openHarness(page, 'tests/integration/fixtures/blanks.csv');
    await page.locator('.band-cell').nth(1).locator('.value.pickable', { hasText: '(blank)' }).click();
    await page.locator('#dataset-button').click();
    const code = await page.locator('.snippet').textContent();
    expect(code).toContain('df = df[df["cave"].isna() | df["cave"].astype(str).str.strip().eq("")]');
  });
});
