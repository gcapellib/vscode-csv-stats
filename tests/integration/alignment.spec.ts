import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('toutes les valeurs sont alignées à droite, texte comme nombres', async ({ page }) => {
  // Seuls les nombres l'étaient : une ligne alternait d'une colonne à
  // l'autre entre la gauche et la droite.
  await openHarness(page);
  const alignments = await page.locator('.row').first().locator('.cell').evaluateAll((cells) =>
    cells.map((cell) => getComputedStyle(cell).textAlign),
  );
  expect(alignments.length).toBeGreaterThan(5);
  expect(new Set(alignments)).toEqual(new Set(['right']));
});

test('le bandeau affiche l’index de chaque colonne, renuméroté quand une colonne est retirée', async ({ page }) => {
  // Compté depuis 0 comme pandas ; une colonne retirée renumérote les
  // suivantes, comme df.drop.
  await openHarness(page);
  const indices = async () =>
    (await page.locator('.band-cell .type').allTextContents()).map((text) => Number(/#(\d+)/.exec(text)?.[1]));
  const before = await indices();
  expect(before).toEqual(before.map((_, index) => index));

  await page.locator('.head-button.clean').nth(1).click();
  await page.locator('#menu button', { hasText: 'Remove column' }).click();
  const after = await indices();
  expect(after.length).toBe(before.length - 1);
  expect(after).toEqual(after.map((_, index) => index));
});

test('les barres du haut couvrent exactement les colonnes, du bord de la première à celui de la dernière', async ({ page }) => {
  // Un fichier à peu de colonnes, dans une fenêtre plus large qu'elles : la barre
  // doit finir avec la dernière colonne, et non courir jusqu'au bord de la fenêtre.
  await page.setViewportSize({ width: 1700, height: 700 });
  await openHarness(page, 'samples/ventes.csv');
  const edges = await page.evaluate(() => {
    const box = (element: Element) => element.getBoundingClientRect();
    const bands = [...document.querySelectorAll('#band .band-cell')].map(box).filter((rect) => rect.right > 0);
    return {
      toolbar: [Math.round(box(document.getElementById('toolbar')!).left), Math.round(box(document.getElementById('toolbar')!).right)],
      first: Math.round(bands[0].left),
      last: Math.round(bands[bands.length - 1].right),
    };
  });
  expect(edges.toolbar[0]).toBe(edges.first);
  expect(edges.toolbar[1]).toBe(edges.last);
});
