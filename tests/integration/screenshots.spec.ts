import { readFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/**
 * Les images de la page de l'extension (README, Marketplace), prises sur le vrai bundle.
 * Elles ne se prennent pas avec les tests : `npm run screenshots`.
 */
test.skip(!process.env.SHOTS, 'run with SHOTS=1 (npm run screenshots)');
test.use({ viewport: { width: 1276, height: 718 }, deviceScaleFactor: 2 });

const shot = async (page: Page, name: string) => {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `media/screenshot-${name}.png` });
};

test('band', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv', 'prism-duo');
  await shot(page, 'band');
});

test('theme preview', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv', 'dusk');
  await page.locator('#theme-button').click();
  await page.locator('.theme-item', { hasText: 'Frost' }).first().hover();
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'media/screenshot-theme-preview.png' });
});

test('folded', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv', 'woodland');
  await page.locator('#insights-toggle').click();
  await shot(page, 'folded');
});

test('raw', async ({ page }) => {
  await openHarness(page, 'samples/wines.csv', 'woodland');
  await page.locator('#raw-toggle').click();
  // L'hôte envoie le texte brut ; le banc d'essai n'en a pas, on le lui prête.
  await page.evaluate((text) => window.postMessage({ type: 'raw', text }, '*'), readFileSync('samples/wines.csv', 'utf8'));
  await page.waitForSelector('#raw-body .raw-line, #raw-body div, #raw-body span');
  await shot(page, 'raw');
});

test('clean', async ({ page }) => {
  // Une fenêtre assez haute pour que le menu tienne en entier, puis un recadrage serré :
  // dans le README l'image est réduite, et un menu perdu dans le tableau devient illisible.
  await page.setViewportSize({ width: 1276, height: 1000 });
  await openHarness(page, 'samples/wines.csv', 'prism-duo');
  // En thème clair : un menu clair sur des fonds pastel se détache du tableau, là où un menu
  // sombre se confondait avec des fonds sombres.
  await page.evaluate(() => {
    document.body.className = 'vscode-light';
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries({
      'editor-background': '#ffffff', foreground: '#3b3b3b', descriptionForeground: '#717171', 'panel-border': '#d4d4d4',
      'editorGroupHeader-tabsBackground': '#f3f3f3', 'list-hoverBackground': '#e8e8e8', 'editorWidget-background': '#ffffff',
      'input-background': '#ffffff', 'input-foreground': '#3b3b3b', 'input-border': '#c8c8c8', 'button-foreground': '#ffffff',
      'dropdown-background': '#ffffff', 'dropdown-foreground': '#3b3b3b', 'dropdown-border': '#c8c8c8',
    })) root.setProperty(`--vscode-${name}`, value);
  });
  await page.waitForTimeout(200);
  const head = page.locator('.head-cell[data-column="2"]');
  await head.click({ button: 'right' });
  await page.locator('#menu .menu-item', { hasText: 'Replace text…' }).click();
  await page.locator('#field input').nth(0).fill('Napa');
  await page.locator('#field input').nth(1).fill('Napa Valley');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(350);
  const boxes = await Promise.all([head, page.locator('#menu'), page.locator('#field')].map((target) => target.boundingBox()));
  const [left, top, right, bottom] = [
    Math.min(...boxes.map((box) => box!.x)),
    Math.min(...boxes.map((box) => box!.y)),
    Math.max(...boxes.map((box) => box!.x + box!.width)),
    Math.max(...boxes.map((box) => box!.y + box!.height)),
  ];
  const pad = 24;
  await page.screenshot({
    path: 'media/screenshot-clean.png',
    clip: { x: Math.max(0, left - pad), y: Math.max(0, top - pad), width: right - left + 2 * pad, height: bottom - top + 2 * pad },
  });
});
