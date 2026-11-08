import { test, expect, type Page } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Ce que Column details, le menu de colonne et Clean proposent pour nettoyer, sur le
 * vrai bundle. Le fichier `dirty.csv` contient chaque défaut une fois : des graphies
 * proches (`Lyons`, `LYON`), des `-999` dans une mesure qui change de niveau vers la
 * ligne 100, trois cellules vides, des accents abîmés (`CafÃ©`), des trous dans la
 * suite des identifiants (40, 41, 100) et une couleur qui explique le poids.
 */
const FILE = 'tests/fixtures/dirty.csv';
const [ID, CITY, COLOUR, WEIGHT, TEMPERATURE, NOTE] = [0, 1, 2, 3, 4, 5];

const band = (page: Page, column: number) => page.locator(`.band-cell[data-column="${column}"]`);

async function openDetails(page: Page, column: number): Promise<void> {
  await band(page, column).scrollIntoViewIfNeeded();
  await band(page, column).locator('.dots').click();
  await expect(page.locator('#picker')).toBeVisible();
}

async function openColumnMenu(page: Page, column: number): Promise<void> {
  await page.locator(`.head-cell[data-column="${column}"]`).click({ button: 'right' });
  await expect(page.locator('#menu')).toBeVisible();
}

test.describe('nettoyer depuis Column details', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page, FILE);
  });

  test('une valeur-balise se signale en tête et se traite comme vide d’un clic', async ({ page }) => {
    await openDetails(page, TEMPERATURE);
    const found = page.locator('#picker .finding-row .flag', { hasText: '-999' });
    await expect(found).toContainText('×12');
    await expect(page.locator('#picker .finding-action', { hasText: 'Treat -999 as empty' })).toBeVisible();

    await page.locator('#picker .finding-action', { hasText: 'Treat -999 as empty' }).click();
    // Plus de balise : 12 cellules de plus manquent (3 déjà vides), et le panneau rouvert ne la signale plus.
    await expect(page.locator('#picker .finding-row .flag', { hasText: '-999' })).toHaveCount(0);
    await expect(band(page, TEMPERATURE)).toContainText('Missing 15');
  });

  test('la courbe par ligne a ses numéros de ligne du fichier et des repères qui filtrent', async ({ page }) => {
    await openDetails(page, TEMPERATURE);
    const labels = page.locator('#picker svg.row-strip text');
    await expect(labels.first()).toHaveText('line 2');
    await expect(labels.nth(1)).toHaveText('line 158');
    await page.locator('#picker .legend-link', { hasText: 'empty cell' }).click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#filters')).toContainText('3 of 157 rows');
  });

  test('la moyenne par catégorie propose la couleur et un clic filtre sur elle', async ({ page }) => {
    await openDetails(page, WEIGHT);
    // Repliée par défaut : c'est un détail, pas le coup d'œil.
    await expect(page.locator('#picker .category-choice')).toHaveCount(0);
    await page.locator('#picker .section-toggle', { hasText: 'More details' }).click();
    const section = page.locator('#picker .category-choice select');
    await expect(section).toContainText('couleur');
    await expect(page.locator('#picker .pickable-row')).toHaveCount(3);
    await page.locator('#picker .pickable-row', { hasText: 'brun' }).click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('.chip-filter')).toContainText('brun');
  });

  test('Column details : les graphiques d’abord, puis les chiffres, puis ce qui est à vérifier', async ({ page }) => {
    await openDetails(page, TEMPERATURE);
    const titles = await page.locator('#picker .section-title').allTextContents();
    const at = (name: string) => titles.findIndex((title) => title.includes(name));
    expect(at('Distribution')).toBe(0);
    expect(at('Values by row order')).toBeGreaterThan(at('Distribution'));
    expect(at('Statistics')).toBeGreaterThan(at('Values by row order'));
    expect(at('Looks like missing values')).toBeGreaterThan(at('Statistics'));
    // Le reste est replié, à un clic.
    expect(titles.at(-1)).toContain('More details');
    await expect(page.locator('#picker').getByText('Completeness')).toHaveCount(0);
    await page.locator('#picker .section-toggle').click();
    await expect(page.locator('#picker').getByText('Completeness')).toBeVisible();
  });

  test('les trous d’une suite d’identifiants sont listés', async ({ page }) => {
    await openDetails(page, ID);
    await expect(page.locator('#picker')).toContainText('Gaps in the series');
    await expect(page.locator('#picker')).toContainText('3 missing');
  });

  test('les accents abîmés se corrigent d’un clic', async ({ page }) => {
    await openDetails(page, NOTE);
    await expect(page.locator('#picker')).toContainText('Garbled characters');
    await page.locator('#picker .finding-action', { hasText: 'Fix them' }).click();
    await expect(page.locator('#picker')).not.toContainText('Garbled characters');
    await expect(page.locator('.row .cell', { hasText: 'CafÃ©' })).toHaveCount(0);
  });
});

test.describe('les graphies proches', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page, FILE);
  });

  test('se fusionnent depuis le menu de la colonne', async ({ page }) => {
    await openColumnMenu(page, CITY);
    await expect(page.locator('#menu .menu-heading', { hasText: 'Similar spellings' })).toBeVisible();
    const merge = page.locator('#menu .menu-item', { hasText: '→ Lyon' });
    await expect(merge).toBeVisible();
    await merge.click();

    await expect(band(page, CITY)).not.toContainText('Lyons');
    await page.locator('#clean-button').click();
    await expect(page.locator('.clean-step').first()).toContainText('Merge 2 spellings into « Lyon » in ville');
  });

  test('le menu et Clean comptent pareil, même avec un filtre actif', async ({ page }) => {
    // Filtrer sur une couleur : les graphies hors du filtre ne doivent pas changer le compte.
    await band(page, COLOUR).locator('.value', { hasText: 'brun' }).click();
    await expect(page.locator('.chip-filter')).toContainText('brun');

    await openColumnMenu(page, CITY);
    const hint = await page.locator('#menu .menu-item', { hasText: '→ Lyon' }).locator('.cmenu-hint').innerText();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);

    await page.locator('#clean-button').click();
    const line = page.locator('#picker .finding-row', { hasText: 'ville: Lyon ←' });
    await expect(line).toBeVisible();
    // Lyons ×4 + LYON ×3 = 7 cellules, sur tout le fichier.
    expect(hint).toContain('7 cells');
    await expect(line).toContainText('×4');
    await expect(line).toContainText('×3');
  });
});

test.describe('palettes sans traits', () => {
  test('une palette ton sur ton retire les traits entre cellules, pas les autres', async ({ page }) => {
    await openHarness(page, FILE);
    const border = () => page.locator('.row .cell').first().evaluate((cell) => getComputedStyle(cell).borderRightColor);

    await page.locator('#theme-button').click();
    await page.locator('#theme-popup .theme-item', { hasText: 'Woodland' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-seamless', '');
    expect(await border()).toBe('rgba(0, 0, 0, 0)');

    await page.locator('#theme-button').click();
    await page.locator('#theme-popup .theme-item', { hasText: 'Syntax' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-seamless', '');
    expect(await border()).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('l’en-tête de chaque colonne porte la couleur de sa colonne', async ({ page }) => {
    await openHarness(page, FILE);
    const colours = await page.locator('#head .head-cell').evaluateAll((cells) => cells.map((cell) => (cell as HTMLElement).style.getPropertyValue('--col').trim()));
    expect(colours.length).toBe(6);
    expect(colours.every((colour) => /^#[0-9a-f]{6}$/i.test(colour))).toBe(true);
    expect(new Set(colours).size).toBeGreaterThan(1);
  });

});
