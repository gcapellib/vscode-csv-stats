import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { count, num, percent } from '../core/format';
import { DEFAULT_THEME, gradientFor, paletteFor, THEMES, themeById, withAlpha } from '../core/themes';

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
  it('en compte quarante-cinq, aux identifiants et libellés uniques', () => {
    assert.equal(THEMES.length, 45);
    assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 45);
    assert.equal(new Set(THEMES.map((theme) => theme.label)).size, 45);
  });

  it('range chaque palette dans une famille et une seule', () => {
    // Le sélecteur groupe par ces deux champs : une palette qui porterait les
    // deux, ou aucun des deux par erreur, apparaîtrait deux fois ou pas du tout.
    const familles = { fond: 0, encre: 0, duo: 0 };
    for (const theme of THEMES) {
      if (theme.uniformInk && theme.neutral) assert.fail(`« ${theme.label} » porte les deux familles`);
      if (theme.uniformInk) familles.fond++;
      else if (theme.neutral) familles.encre++;
      else familles.duo++;
    }
    assert.deepEqual(familles, { fond: 20, encre: 15, duo: 10 });
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

describe('withAlpha', () => {
  it('convertit un hex en rgba avec l’alpha demandé', () => {
    assert.equal(withAlpha('#458dd6', 0.3), 'rgba(69, 141, 214, 0.3)');
  });
});

describe('gradientFor', () => {
  it('pose un arrêt par teinte, dans l’ordre de la palette', () => {
    const theme = themeById('syntax');
    const gradient = gradientFor(theme, false);
    assert.ok(gradient.startsWith('linear-gradient(90deg, '));
    // Autant d'arrêts que de teintes : un dégradé qui en perdrait en route se
    // remarquerait à l'écran par des bandes de couleur manquantes.
    const stops = gradient.match(/rgba\([^)]+\)/g) ?? [];
    assert.equal(stops.length, theme.hues.length);
  });

  it('respecte l’opacité donnée', () => {
    const theme = themeById('rainbow');
    const gradient = gradientFor(theme, false, 0.5);
    assert.ok(gradient.includes(', 0.5)'), gradient);
  });

  it('change avec le thème', () => {
    const a = gradientFor(themeById('sunset'), false);
    const b = gradientFor(themeById('ocean'), false);
    assert.notEqual(a, b);
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
