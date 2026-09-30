import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Le chemin complet — analyse → clic → recalcul → panneau Dataset → code
 * pandas — qu'aucun test unitaire ne peut couvrir d'un bloc, puisqu'il
 * traverse le calcul pur (core/) et le rendu DOM ensemble. Les valeurs
 * attendues ont été vérifiées à la main dans ce même harness pendant la
 * session qui a construit ces fonctionnalités.
 */
test.describe('filtrage croisé et Dataset', () => {
  test('cliquer une valeur du bandeau filtre le tableau et recalcule les autres colonnes', async ({ page }) => {
    await openHarness(page);

    const regionBand = page.locator('.band-cell').nth(2);
    await regionBand.locator('.value.pickable', { hasText: 'Bordeaux' }).click();

    await expect(page.locator('.filter-summary')).toHaveText('83 of 423 rows');
    await expect(page.locator('.chip-filter', { hasText: 'region = Bordeaux' })).toBeVisible();

    // La colonne region elle-même, recalculée sur le sous-ensemble, ne montre
    // plus qu'une seule valeur.
    await expect(regionBand.locator('.value').first()).toContainText('Bordeaux');
    await expect(regionBand.locator('.value').first()).toContainText('100.0%');
  });

  test('Clear all restaure les 423 lignes et masque la barre', async ({ page }) => {
    await openHarness(page);
    await page.locator('.band-cell').nth(2).locator('.value.pickable', { hasText: 'Bordeaux' }).click();
    await page.locator('.chip-clear').click();

    await expect(page.locator('#filters')).toBeHidden();
    await expect(page.locator('.filter-summary')).toHaveCount(0);
  });

  test('le panneau Dataset reproduit le filtre actif dans le code pandas', async ({ page }) => {
    await openHarness(page);
    await page.locator('.band-cell').nth(2).locator('.value.pickable', { hasText: 'Bordeaux' }).click();
    await page.locator('#dataset-button').click();

    const code = await page.locator('.snippet').textContent();
    expect(code).toContain('df = df[df["region"] == "Bordeaux"]');
    expect(code).toContain('# region = Bordeaux');
  });

  test('Dataset est une bascule, comme Raw et Insights', async ({ page }) => {
    await openHarness(page);
    const button = page.locator('#dataset-button');

    await button.click();
    await expect(page.locator('#picker')).toBeVisible();
    await expect(button).toHaveClass(/active/);

    await button.click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(button).not.toHaveClass(/active/);
  });
});
