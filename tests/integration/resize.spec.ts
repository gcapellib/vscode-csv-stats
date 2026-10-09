import { test, expect, type Page } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Redimensionnement manuel d'une colonne, au vrai glissé de souris : la
 * poignée est remplacée à chaque repeint de l'en-tête, et seul un vrai
 * enchaînement mousedown → mousemove → mouseup dit si le geste survit
 * à ce remplacement — ce qu'un événement synthétique ne montrerait pas.
 */
async function widthOf(page: Page, name: string): Promise<number> {
  const box = await page.locator('.head-cell', { hasText: name }).boundingBox();
  return Math.round(box?.width ?? 0);
}

async function drag(page: Page, name: string, dx: number): Promise<void> {
  const handle = page.locator('.head-cell', { hasText: name }).locator('.col-resizer');
  const box = await handle.boundingBox();
  if (!box) throw new Error('poignée introuvable');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Plusieurs pas : un glissé réel émet une suite de mouvements, chacun
  // pouvant déclencher un repeint qui remplace la poignée.
  await page.mouse.move(x + dx / 2, y, { steps: 5 });
  await page.mouse.move(x + dx, y, { steps: 5 });
  await page.mouse.up();
}

test.describe('largeur des colonnes à la main', () => {
  test('un glissé élargit la colonne, en-tête et cellules ensemble', async ({ page }) => {
    await openHarness(page);
    const before = await widthOf(page, 'region');
    await drag(page, 'region', 120);
    await expect.poll(() => widthOf(page, 'region')).toBe(before + 120);
    // Les cellules suivent l'en-tête : sinon le tableau se décalerait.
    const cell = page.locator('.row').first().locator('.cell').nth(await columnPosition(page, 'region'));
    await expect.poll(async () => Math.round((await cell.boundingBox())?.width ?? 0)).toBe(before + 120);
  });

  test('la largeur choisie survit au repli du bandeau', async ({ page }) => {
    await openHarness(page);
    await drag(page, 'region', 90);
    const chosen = await widthOf(page, 'region');
    await page.locator('#insights-toggle').click();
    // Le repli recalcule toutes les largeurs ; celle choisie à la main reste.
    await expect.poll(() => widthOf(page, 'region')).toBe(chosen);
  });

  test('un double-clic sur la poignée rend la largeur automatique', async ({ page }) => {
    await openHarness(page);
    const before = await widthOf(page, 'region');
    await drag(page, 'region', 150);
    await expect.poll(() => widthOf(page, 'region')).toBe(before + 150);
    await page.locator('.head-cell', { hasText: 'region' }).locator('.col-resizer').dblclick();
    await expect.poll(() => widthOf(page, 'region')).toBe(before);
  });
});

async function columnPosition(page: Page, name: string): Promise<number> {
  const names = await page.locator('.head-cell .head-name').allTextContents();
  return names.indexOf(name);
}
