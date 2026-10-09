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

  test('le double-clic élargit, puis resserre autour du titre', async ({ page }) => {
    await openHarness(page);
    const name = 'grape_variety';
    const handle = () => page.locator('.head-cell', { hasText: name }).locator('.col-resizer');
    const auto = await widthOf(page, name);

    // Rétrécie à la main, la colonne coupe son contenu : le double-clic
    // l'élargit jusqu'à tout montrer.
    await drag(page, name, -100);
    await expect.poll(() => widthOf(page, name)).toBe(auto - 100);
    await handle().dblclick();
    await expect.poll(() => widthOf(page, name)).toBeGreaterThanOrEqual(auto);
    const wide = await widthOf(page, name);

    // Le second la resserre au plus juste autour du titre…
    await handle().dblclick();
    await expect.poll(() => widthOf(page, name)).toBeLessThan(wide);
    // … sans le couper, et sans chasser ses deux boutons de la colonne.
    const cell = page.locator('.head-cell', { hasText: name });
    const title = cell.locator('.head-name');
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = await cell.boundingBox();
    for (const button of await cell.locator('.head-button').all()) {
      const inner = await button.boundingBox();
      expect(inner && box && inner.x + inner.width <= box.x + box.width).toBe(true);
    }

    // Et un nouveau double-clic l'élargit à nouveau.
    await handle().dblclick();
    await expect.poll(() => widthOf(page, name)).toBe(wide);
  });
});

async function columnPosition(page: Page, name: string): Promise<number> {
  const names = await page.locator('.head-cell .head-name').allTextContents();
  return names.indexOf(name);
}
