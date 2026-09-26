import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { count, num, percent } from '../core/format';
import { DEFAULT_THEME, paletteFor, THEMES, themeById } from '../core/themes';

function channels(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function luminance(hex: string): number {
  const [red, green, blue] = channels(hex);
  return (299 * red + 587 * green + 114 * blue) / 1000;
}

/** Écart maximal sur une composante : capte aussi un changement de teinte. */
function difference(first: string, second: string): number {
  const left = channels(first);
  const right = channels(second);
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])));
}

describe('palettes', () => {
  it('en compte quarante, aux identifiants et libellés uniques', () => {
    assert.equal(THEMES.length, 40);
    assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 40);
    assert.equal(new Set(THEMES.map((theme) => theme.label)).size, 40);
  });

  it('retombe sur la palette par défaut pour un identifiant inconnu', () => {
    assert.equal(themeById('palette-qui-n-existe-pas'), DEFAULT_THEME);
    assert.equal(themeById(undefined), DEFAULT_THEME);
    assert.equal(themeById(THEMES[3].id), THEMES[3]);
  });

  it('distingue perceptiblement deux colonnes voisines', () => {
    // Exiger des couleurs différentes ne suffit pas : deux blancs séparés d'une
    // unité sont « différents » et pourtant indiscernables. Et la distinction
    // peut venir du fond comme du texte — les palettes à fond uni ne colorent
    // que l'encre.
    for (const theme of THEMES) {
      for (const dark of [false, true]) {
        for (let column = 0; column < 5; column++) {
          const left = paletteFor(theme, column, dark);
          const right = paletteFor(theme, column + 1, dark);
          const gap = Math.max(difference(left.cell, right.cell), difference(left.text, right.text));
          assert.ok(gap >= 10, `« ${theme.label} » (${dark ? 'sombre' : 'clair'}) colonnes ${column}/${column + 1} : écart ${gap}`);
        }
      }
    }
  });

  it('ne confond jamais le texte et son fond', () => {
    for (const theme of THEMES) {
      for (const dark of [false, true]) {
        for (let column = 0; column < 6; column++) {
          const colours = paletteFor(theme, column, dark);
          const distance = Math.abs(luminance(colours.text) - luminance(colours.cell));
          assert.ok(distance > 60, `« ${theme.label} » (${dark ? 'sombre' : 'clair'}) colonne ${column} : écart ${distance}`);
        }
      }
    }
  });

  it('répète les teintes au-delà de la palette', () => {
    // Un fichier peut avoir plus de colonnes que la palette n'a de teintes : le
    // cycle doit être franc, pas une couleur par défaut silencieuse.
    const theme = themeById('ocean');
    assert.equal(paletteFor(theme, 0, false).cell, paletteFor(theme, 6, false).cell);
  });
});

describe('formats', () => {
  it('sépare les milliers par une virgule', () => {
    assert.equal(count(1233), '1,233');
    assert.equal(count(0), '0');
  });

  it('écrit les pourcentages à une décimale, sans espace', () => {
    assert.equal(percent(0.1), '10.0%');
    assert.equal(percent(1), '100.0%');
  });

  it('utilise le point décimal', () => {
    assert.equal(num(120.6), '120.6');
    assert.equal(num(845000), '845,000');
    assert.equal(num(-3.25), '-3.25');
  });
});
