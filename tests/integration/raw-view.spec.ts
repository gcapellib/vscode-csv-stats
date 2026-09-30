import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test.describe('vue brute', () => {
  test('ne demande le texte que la première fois, jamais à l’ouverture du fichier', async ({ page }) => {
    await openHarness(page);
    const sent = await page.evaluate(() => (window as any).__sent as Array<{ type: string }>);
    expect(sent.some((m) => m.type === 'requestRaw')).toBe(false);

    await page.locator('#raw-toggle').click();
    await page.locator('#raw-toggle').click(); // ferme
    await page.locator('#raw-toggle').click(); // rouvre
    const after = await page.evaluate(() => (window as any).__sent as Array<{ type: string }>);
    expect(after.filter((m) => m.type === 'requestRaw')).toHaveLength(1);
  });

  test('bascule vers le tableau et inversement sans perdre les lignes', async ({ page }) => {
    await openHarness(page);
    await page.locator('#raw-toggle').click();
    // Le vrai host répondrait avec le texte ; ici on simule sa réponse.
    await page.evaluate(() => {
      window.postMessage({ type: 'raw', text: 'a,b\n1,2\n3,4\n' }, '*');
    });
    await expect(page.locator('.raw-line').first()).toBeVisible();

    await page.locator('#raw-toggle').click();
    await expect(page.locator('#scroller')).toBeVisible();
    await expect(page.locator('.row').first()).toBeVisible();
  });

  test('colore chaque champ de la couleur de sa colonne', async ({ page }) => {
    await openHarness(page);
    await page.locator('#raw-toggle').click();
    await page.evaluate(() => {
      window.postMessage({ type: 'raw', text: 'ville,pays\nLyon,FR\n' }, '*');
    });
    // `evaluateAll` n'attend rien, contrairement à `expect(locator)` : sous
    // charge (toute la suite en parallèle), la ligne peut ne pas encore être
    // peinte quand on la lit. On attend d'abord qu'elle existe pour de vrai.
    const spans = page.locator('.raw-line').nth(1).locator('.raw-text span');
    await expect(spans).toHaveCount(3); // Lyon, la virgule, FR
    const colours = await spans.evaluateAll((elements) =>
      elements.filter((element) => element.className !== 'raw-sep').map((element) => getComputedStyle(element).color),
    );
    expect(colours.length).toBe(2);
    expect(colours[0]).not.toBe(colours[1]);
  });
});
