import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Le bug corrigé en 0.15.1 : un clic sur le bouton qui ouvre un panneau ne le
 * refermait jamais, parce que le gestionnaire de clic extérieur fermait le
 * panneau sur `mousedown` — *avant* que le `click` n'atteigne le bouton, qui
 * le rouvrait dans la foulée. Un test unitaire sur FloatingManager (voir
 * src/test/floating.test.ts) vérifie la logique ; celui-ci vérifie qu'un
 * *vrai* clic de souris, dans un *vrai* navigateur, produit bien mousedown
 * puis click dans cet ordre-là — ce qu'aucun test unitaire ne peut observer.
 */
test.describe('bascule des panneaux flottants', () => {
  test('le bouton de filtre referme le panneau au second clic', async ({ page }) => {
    await openHarness(page);
    const button = page.locator('.head-cell', { hasText: 'region' }).locator('.head-button').first();

    await button.click();
    await expect(page.locator('#picker')).toBeVisible();

    await button.click();
    await expect(page.locator('#picker')).toBeHidden();
  });

  test('le bouton « ⋯ » referme le menu au second clic', async ({ page }) => {
    await openHarness(page);
    const dots = page.locator('.band-cell .dots').first();

    await dots.click();
    await expect(page.locator('#menu')).toBeVisible();

    await dots.click();
    await expect(page.locator('#menu')).toBeHidden();
  });

  test('le bouton de thème referme le sélecteur au second clic', async ({ page }) => {
    await openHarness(page);
    const button = page.locator('#theme-button');

    await button.click();
    await expect(page.locator('#theme-popup')).toBeVisible();

    await button.click();
    await expect(page.locator('#theme-popup')).toBeHidden();
  });

  test("« ⋯ » referme Column details plutôt que de le rouvrir", async ({ page }) => {
    // Le cas qui a vraiment piégé ce bug : le panneau ouvert depuis un menu,
    // refermé depuis le bouton qui a ouvert ce menu — pas depuis lui-même.
    await openHarness(page);
    const dots = page.locator('.band-cell .dots').first();

    await dots.click();
    await page.locator('.menu-item', { hasText: 'Column details' }).click();
    await expect(page.locator('#picker')).toBeVisible();

    await dots.click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#menu')).toBeVisible();
  });

  test('un clic réellement extérieur ferme le panneau ouvert', async ({ page }) => {
    await openHarness(page);
    await page.locator('#theme-button').click();
    await expect(page.locator('#theme-popup')).toBeVisible();

    await page.locator('#band').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#theme-popup')).toBeHidden();
  });

  test('un seul panneau ouvert à la fois : ouvrir le thème referme le menu', async ({ page }) => {
    await openHarness(page);
    await page.locator('.band-cell .dots').first().click();
    await expect(page.locator('#menu')).toBeVisible();

    await page.locator('#theme-button').click();
    await expect(page.locator('#theme-popup')).toBeVisible();
    await expect(page.locator('#menu')).toBeHidden();
  });
});
