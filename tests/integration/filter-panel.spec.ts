import { test, expect, type Page } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Le panneau de filtre unique : même endroit, trois onglets selon la colonne.
 * Les chiffres attendus se lisent dans samples/wines.csv (423 lignes) et dans
 * distinct.csv (1 200 codes tous distincts).
 */
/**
 * Le bouton de filtre d'une colonne. Playwright fait défiler le tableau jusqu'à
 * une colonne lointaine *pendant* le clic, et ce défilement referme le panneau
 * qu'il vient d'ouvrir : on amène donc d'abord le bouton à l'écran.
 */
const openFilter = async (page: Page, column: string) => {
  const button = page.locator('.head-cell', { hasText: column }).locator('.head-button').first();
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await button.click();
};
const summary = (page: Page) => page.locator('.filter-summary');
const apply = (page: Page) => page.locator('.picker-button.primary').click();

test.describe('panneau de filtre', () => {
  test('numérique : un opérateur et une valeur, plus de From / To / Exactly', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await openFilter(page, 'price_eur');
    await expect(page.locator('.picker-tab')).toHaveCount(0);
    await page.locator('.picker-op').selectOption('>');
    await page.locator('.picker-number').first().fill('100');
    await apply(page);
    await expect(summary(page)).toHaveText('2 of 423 rows');
    await expect(page.locator('.chip-filter', { hasText: 'price_eur > 100' })).toBeVisible();
  });

  test('« between » montre une seconde valeur, les autres opérateurs non', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await openFilter(page, 'price_eur');
    await expect(page.locator('.picker-number').nth(1)).toBeHidden();
    await page.locator('.picker-op').selectOption('between');
    await expect(page.locator('.picker-number').nth(1)).toBeVisible();
  });

  test('texte : « commence par » et « se termine par »', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await openFilter(page, 'producer');
    await page.locator('.picker-tab', { hasText: 'Text' }).click();
    await page.locator('.picker-op').selectOption('startsWith');
    await page.locator('.picker-text').fill('domaine');
    await apply(page);
    await expect(summary(page)).toHaveText('64 of 423 rows');

    await openFilter(page, 'producer');
    await page.locator('.picker-op').selectOption('endsWith');
    await page.locator('.picker-text').fill('Rossi');
    await apply(page);
    await expect(summary(page)).toHaveText('28 of 423 rows');
  });

  test('texte : « ne contient pas » est le complément de « contient »', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await openFilter(page, 'producer');
    await page.locator('.picker-tab', { hasText: 'Text' }).click();
    await page.locator('.picker-op').selectOption('notContains');
    await page.locator('.picker-text').fill('rossi');
    await apply(page);
    await expect(summary(page)).toHaveText('395 of 423 rows');
  });

  test('liste : « tout sauf » exclut les valeurs cochées', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await openFilter(page, 'region');
    await page.locator('.picker-row', { hasText: 'Bordeaux' }).locator('input').check();
    await page.locator('.picker-except').check();
    await apply(page);
    await expect(summary(page)).toHaveText('340 of 423 rows');
    await expect(page.locator('.chip-filter', { hasText: 'region ≠ Bordeaux' })).toBeVisible();
  });

  test('beaucoup de valeurs distinctes : le panneau s’ouvre sur « Text », et « Select all » les couvre toutes', async ({ page }) => {
    await openHarness(page, 'tests/integration/fixtures/distinct.csv');
    await openFilter(page, 'code');
    await expect(page.locator('.picker-tab.on')).toHaveText('Text');
    await page.locator('.picker-tab', { hasText: 'Values' }).click();
    await page.locator('.picker-search').fill('C0');
    // 999 codes correspondent, 400 sont dessinés : tout est coché quand même.
    await expect(page.locator('.picker-row')).toHaveCount(401);
    await page.locator('.picker-all input').check();
    await apply(page);
    await expect(summary(page)).toHaveText('999 of 1,200 rows');
  });

  test('« Hide them » sans valeur retire les lignes vides', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await openFilter(page, 'quality_score');
    await page.locator('.picker-empties').selectOption('exclude');
    await apply(page);
    await expect(summary(page)).toHaveText('414 of 423 rows');
  });

  test('un clic sur « Distinct » garde une ligne par valeur, un second clic annule', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    const region = page.locator('.band-cell').nth(2);
    await region.locator('.stat.pickable', { hasText: 'Distinct' }).click();
    // 10 régions distinctes : 10 lignes.
    await expect(summary(page)).toHaveText('10 of 423 rows');
    await page.locator('.band-cell').nth(2).locator('.stat.pickable', { hasText: 'Distinct' }).click();
    await expect(page.locator('#filters')).toBeHidden();
  });

  test('« Distinct » se cumule avec les autres filtres, appliqué en dernier', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await page.locator('.band-cell').nth(2).locator('.value.pickable', { hasText: 'Bordeaux' }).click();
    await expect(summary(page)).toHaveText('83 of 423 rows');
    // Parmi les 83 lignes Bordeaux, les producteurs distincts.
    await page.locator('.band-cell').nth(1).locator('.stat.pickable', { hasText: 'Distinct' }).click();
    await expect(summary(page)).not.toHaveText('83 of 423 rows');
    await page.locator('#dataset-button').click();
    await expect(page.locator('.snippet')).toContainText('df = df.drop_duplicates(subset=["producer"])');
  });

  test('le menu « ⋯ » ne répète ni le tri ni le filtre des boutons de l’en-tête', async ({ page }) => {
    await openHarness(page, 'samples/wines.csv');
    await page.locator('.band-cell .dots').nth(2).click();
    await expect(page.locator('#menu')).toContainText('Column details…');
    await expect(page.locator('#menu')).not.toContainText('Filter');
    await expect(page.locator('#menu')).not.toContainText('Sort');
  });
});
