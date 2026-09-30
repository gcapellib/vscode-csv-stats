import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/integration',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    // Un clic Playwright, contrairement à `element.click()` en JavaScript,
    // déclenche un vrai mousedown puis un vrai click, dans cet ordre — c'est
    // précisément l'ordre dont dépendait le bug corrigé en 0.15.1, et qu'un
    // clic synthétique ne peut pas révéler.
    headless: true,
  },
});
