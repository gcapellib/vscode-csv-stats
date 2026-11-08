import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test.describe('nettoyage par étapes', () => {
  test('le balai ajoute une étape, le panneau Clean la montre et la retire', async ({ page }) => {
    await openHarness(page, 'samples/brut.csv');
    const shape = page.locator('#shape');
    await expect(shape).toHaveText('243 rows × 5 columns');

    // ville : Trim depuis le balai de sa colonne.
    await page.locator('.head-button.clean').nth(1).click();
    await page.locator('.menu-item', { hasText: 'Trim spaces' }).click();
    await expect(page.locator('.head-button.clean').nth(1)).toHaveAttribute('aria-label', /1 step applied/);
    await expect(page.locator('.cell.changed').first()).toHaveAttribute('data-tip', /^Was « /);

    // Les doublons, depuis le catalogue du panneau Clean.
    await page.locator('#clean-button').click();
    await page.locator('#picker .picker-button', { hasText: 'Remove duplicate rows' }).click();
    await expect(page.locator('.clean-step')).toHaveCount(2);
    await expect(page.locator('.clean-step').nth(1)).toContainText('−3 rows');
    await expect(shape).toHaveText('240 rows × 5 columns');

    // Retirer le Trim rejoue la liste sans lui : plus aucune cellule soulignée.
    await page.locator('.clean-step').first().locator('.clean-remove').click();
    await expect(page.locator('.clean-step')).toHaveCount(1);
    await expect(page.locator('.cell.changed')).toHaveCount(0);
    await expect(page.locator('.head-button.clean').nth(1)).toHaveAttribute('aria-label', 'Clean this column');

    // Le code pandas rejoue l'étape, puis écrit la copie.
    await page.locator('#dataset-button').click();
    await expect(page.locator('.snippet')).toContainText('df = df.drop_duplicates()');
    await expect(page.locator('.snippet')).toContainText('.clean.csv", index=False)');
  });
});
