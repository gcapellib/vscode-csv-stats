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

/** Replie ou déplie le bandeau, et attend la fin de l'animation des largeurs. */
async function toggleBand(page: Page): Promise<void> {
  await page.locator('#insights-toggle').click();
  let last = '';
  await expect
    .poll(async () => {
      const now = (await page.locator('.head-cell').evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect().width))).join(',');
      const stable = now === last;
      last = now;
      return stable;
    }, { intervals: [120] })
    .toBe(true);
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
    await toggleBand(page);
    // Le repli recalcule toutes les largeurs ; celle choisie à la main reste.
    await expect.poll(() => widthOf(page, 'region')).toBe(chosen);
  });

  test('bandeau ouvert, le glissé ne descend pas sous la largeur par défaut', async ({ page }) => {
    // Plus étroite, la colonne écraserait son histogramme et ses bornes.
    await openHarness(page);
    const auto = await widthOf(page, 'region');
    await drag(page, 'region', -120);
    await expect.poll(() => widthOf(page, 'region')).toBe(auto);
  });

  test('bandeau ouvert, le double-clic élargit pour tout montrer, puis revient au défaut', async ({ page }) => {
    // Une colonne de texte long, que la largeur par défaut coupe à 460.
    await openHarness(page, 'tests/integration/fixtures/long-text.csv');
    const handle = page.locator('.head-cell', { hasText: 'ingredients' }).locator('.col-resizer');
    const auto = await widthOf(page, 'ingredients');
    await handle.dblclick();
    await expect.poll(() => widthOf(page, 'ingredients')).toBeGreaterThan(auto);
    await handle.dblclick();
    await expect.poll(() => widthOf(page, 'ingredients')).toBe(auto);
  });

  test('bandeau replié, le double-clic resserre autour du titre', async ({ page }) => {
    // Une colonne dont les valeurs sont plus larges que le titre : sinon sa
    // largeur automatique est déjà celle du titre, et il n'y a rien à
    // resserrer — le cas de grape_variety, essayé d'abord.
    await openHarness(page);
    await toggleBand(page);
    const name = 'producer';
    const handle = page.locator('.head-cell', { hasText: name }).locator('.col-resizer');
    const folded = await widthOf(page, name);
    await handle.dblclick();
    await expect.poll(() => widthOf(page, name)).toBeLessThan(folded);
    // Le titre se lit en entier, et les deux boutons restent dans la colonne.
    const cell = page.locator('.head-cell', { hasText: name });
    expect(await cell.locator('.head-name').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = await cell.boundingBox();
    for (const button of await cell.locator('.head-button').all()) {
      const inner = await button.boundingBox();
      expect(inner && box && inner.x + inner.width <= box.x + box.width).toBe(true);
    }
    // Un nouveau double-clic l'élargit pour tout montrer.
    await handle.dblclick();
    await expect.poll(() => widthOf(page, name)).toBe(folded);
  });

  test('une colonne resserrée bandeau replié retrouve sa largeur par défaut quand il se rouvre', async ({ page }) => {
    await openHarness(page);
    const auto = await widthOf(page, 'region');
    await toggleBand(page);
    await drag(page, 'region', -60);
    await expect.poll(() => widthOf(page, 'region')).toBeLessThan(auto);
    await toggleBand(page);
    await expect.poll(() => widthOf(page, 'region')).toBe(auto);
  });
});

async function columnPosition(page: Page, name: string): Promise<number> {
  const names = await page.locator('.head-cell .head-name').allTextContents();
  return names.indexOf(name);
}
