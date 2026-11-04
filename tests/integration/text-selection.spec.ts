import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('on peut sélectionner le texte d’une cellule à la souris et le copier', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const cell = page.locator('.row').first().locator('.cell').nth(1);
  const text = ((await cell.textContent()) ?? '').trim();
  expect(text.length).toBeGreaterThan(2);

  const box = (await cell.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, y, { steps: 5 });
  await page.mouse.up();

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selected.length).toBeGreaterThan(0);
  expect(text).toContain(selected.trim());

  // Le harness est une page about:blank, sans API de presse-papiers : on
  // vérifie que Ctrl+C déclenche un vrai `copy`, non annulé, sur ce texte.
  await page.evaluate(() => {
    document.addEventListener('copy', (event) => {
      (window as unknown as { __copied: unknown }).__copied = {
        text: window.getSelection()?.toString(),
        prevented: event.defaultPrevented,
      };
    });
  });
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(() => (window as unknown as { __copied: unknown }).__copied)).toEqual({
    text: selected,
    prevented: false,
  });
});

test('un double-clic sélectionne un mot sans démarquer la ligne', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const cell = page.locator('.row').first().locator('.cell').nth(1);
  await cell.dblclick();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selected.trim().length).toBeGreaterThan(0);
  await expect(page.locator('.row.selected')).toHaveCount(1);
});

test('un simple clic marque toujours la ligne', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  await page.locator('.row').nth(2).locator('.cell').first().click();
  await expect(page.locator('.row.selected')).toHaveCount(1);
});

test('un défilement qui ne change pas les lignes peintes garde la sélection', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const cell = page.locator('.row').first().locator('.cell').nth(1);
  await cell.dblclick();
  const before = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(before.trim().length).toBeGreaterThan(0);
  await page.evaluate(() => {
    const scroller = document.getElementById('scroller')!;
    scroller.scrollTop += 3;
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe(before);
});

test('glisser sur « Distinct » du bandeau sélectionne le texte sans filtrer', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const line = page.locator('.band-cell .stat.pickable', { hasText: 'Distinct' }).nth(1);
  const box = (await line.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, y, { steps: 6 });
  await page.mouse.up();

  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain('Distinct');
  await expect(page.locator('#filters .chip-filter')).toHaveCount(0);

  // Un clic ailleurs défait la sélection ; un clic simple filtre de nouveau.
  await page.locator('#toolbar').click({ position: { x: 5, y: 5 } });
  await line.click();
  await expect(page.locator('#filters .chip-filter')).toHaveCount(1);
});

test('clic droit → Copy envoie la valeur de la cellule à l’hôte', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const cell = page.locator('.row').first().locator('.cell').nth(1);
  const text = ((await cell.textContent()) ?? '').trim();
  await cell.click({ button: 'right' });
  await page.locator('#menu .menu-item', { hasText: 'Copy' }).click();
  const sent = await page.evaluate(() => (window as unknown as { __sent: Array<{ type: string; text?: string }> }).__sent);
  expect(sent.filter((message) => message.type === 'copy')).toEqual([{ type: 'copy', text }]);
  await expect(page.locator('.row.selected')).toHaveCount(0);
});

test('clic droit dans une sélection faite à la main copie cette sélection', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const cell = page.locator('.row').first().locator('.cell').nth(1);
  await cell.dblclick();
  const word = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  const spot = await page.evaluate(() => {
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.locator('#menu .menu-item', { hasText: 'Copy' }).click();
  const sent = await page.evaluate(() => (window as unknown as { __sent: Array<{ type: string; text?: string }> }).__sent);
  expect(sent.filter((message) => message.type === 'copy')).toEqual([{ type: 'copy', text: word }]);
});

type Sent = Array<{ type: string; text?: string }>;
const copied = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ((window as unknown as { __sent?: Sent }).__sent ?? []).filter((m) => m.type === 'copy'));
const rowText = (page: import('@playwright/test').Page, position: number) =>
  page.locator('.row').nth(position).locator('.cell').allTextContents().then((all) => all.join('\t'));

test('un clic sur le numéro de ligne marque la ligne, Ctrl+C la copie séparée par des tabulations', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  await page.locator('.row').nth(1).locator('.gutter').click();
  await expect(page.locator('.row.selected')).toHaveCount(1);
  await page.keyboard.press('Control+c');
  expect(await copied(page)).toEqual([{ type: 'copy', text: await rowText(page, 1) }]);
  expect((await copied(page))[0].text).toContain('\t');
});

test('glisser sur plusieurs numéros marque l’intervalle, copié ligne par ligne', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const first = (await page.locator('.row').nth(0).locator('.gutter').boundingBox())!;
  const third = (await page.locator('.row').nth(2).locator('.gutter').boundingBox())!;
  await page.mouse.move(first.x + 4, first.y + 4);
  await page.mouse.down();
  await page.mouse.move(third.x + 4, third.y + 4, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.row.selected')).toHaveCount(3);
  await page.locator('.row').nth(1).locator('.gutter').click({ button: 'right' });
  await expect(page.locator('#menu .menu-item')).toHaveText('Copy 3 rows');
  await page.locator('#menu .menu-item').click();
  const expected = [0, 1, 2].map((i) => rowText(page, i));
  expect((await copied(page))[0].text).toBe((await Promise.all(expected)).join('\n'));
});

test('un clic sur le seul numéro marqué le démarque', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  const gutter = page.locator('.row').nth(3).locator('.gutter');
  await gutter.click();
  await expect(page.locator('.row.selected')).toHaveCount(1);
  await page.locator('.row').nth(3).locator('.gutter').click();
  await expect(page.locator('.row.selected')).toHaveCount(0);
});

test('l’événement copy d’une ligne marquée porte toutes ses colonnes, séparées par des tabulations', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv');
  await page.evaluate(() => {
    document.addEventListener('copy', (event) => {
      (window as unknown as { __clip: string }).__clip = event.clipboardData?.getData('text/plain') ?? '';
    });
  });
  await page.locator('.row').nth(1).locator('.gutter').click();
  // `copy` du navigateur, tel que le déclenche le « Copier » de l'éditeur.
  await page.evaluate(() => document.execCommand('copy'));
  const clip = await page.evaluate(() => (window as unknown as { __clip: string }).__clip);
  const cells = await page.locator('.row').nth(1).locator('.cell').allTextContents();
  expect(cells.length).toBeGreaterThan(5);
  expect(clip.split('\t')).toEqual(cells);
  expect((await copied(page))[0].text).toBe(clip);
});
