import { test, expect } from '@playwright/test';
import { openHarness } from './harness';

test('Dusk et Woodland colorent le nom des colonnes dans l’en-tête, un thème ordinaire non', async ({ page }) => {
  for (const [theme, coloured] of [['dusk', true], ['woodland', true], ['syntax', false]] as const) {
    await openHarness(page, 'tests/fixtures/dirty.csv', theme);
    const names = await page.locator('.head-cell').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).color));
    expect(names.length).toBeGreaterThan(3);
    if (coloured) expect(new Set(names).size, theme).toBeGreaterThanOrEqual(5);
    else expect(new Set(names).size, theme).toBe(1);
  }
});
