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

test('le bandeau affiche l’index de chaque colonne dans le fichier, depuis 0', async ({ page }) => {
  // Compté comme pandas : c'est lui que demandent df.iloc[:, n] ou usecols.
  await openHarness(page);
  const types = await page.locator('.band-cell .type').allTextContents();
  expect(types.length).toBeGreaterThan(3);
  types.forEach((text, index) => expect(text).toContain(`#${index}`));
});
