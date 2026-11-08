import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  await openHarness(page, 'samples/wines.csv', 'dusk');
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

/**
 * Le GIF des palettes tirées : « Random palette » cliqué à la chaîne, une image par tirage.
 * Le tirage est semé pour qu'on puisse le refaire à l'identique ; changer `SEED` en donne
 * une autre série. Il faut `ffmpeg` pour assembler les images.
 */
const FRAMES = 54;
/** Images par seconde : plus bas, le défilé se laisse suivre. */
const FPS = 3;
const SEED = 7;
test('random palettes gif', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript((seed) => {
    let value = seed;
    Math.random = () => {
      value = (value * 1103515245 + 12345) % 2147483648;
      return value / 2147483648;
    };
  }, SEED);
  await openHarness(page, 'samples/wines.csv', 'dusk');
  await page.locator('#theme-button').click();
  const folder = process.env.FRAMES_DIR ?? mkdtempSync(join(tmpdir(), 'csv-stats-frames-'));
  mkdirSync(folder, { recursive: true });
  for (let frame = 0; frame < FRAMES; frame++) {
    await page.locator('.theme-random button, .theme-random').first().click();
    await page.mouse.move(1180, 580);
    await page.waitForTimeout(90);
    await page.screenshot({ path: join(folder, `f${String(frame).padStart(3, '0')}.png`) });
  }
  await context.close();
  // Une palette de 160 couleurs calculée sur l'ensemble des images, tramage léger : des
  // aplats nets, sans que le fichier dépasse quelques Mo.
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(folder, 'f%03d.png'),
    '-vf', 'split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    '-loop', '0', 'media/random-palettes.gif',
  ]);
});
