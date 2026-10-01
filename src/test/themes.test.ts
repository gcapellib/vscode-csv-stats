import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { count, num, percent } from '../core/format';
import {
  DEFAULT_THEME,
  allThemes,
  customThemes,
  draftTheme,
  gradientFor,
  paletteFor,
  randomTheme,
  setCustomThemes,
  setDraftTheme,
  THEMES,
  themeById,
  withAlpha,
} from '../core/themes';

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
  it('en compte vingt-neuf, aux identifiants et libellés uniques', () => {
    assert.equal(THEMES.length, 29);
    assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 29);
    assert.equal(new Set(THEMES.map((theme) => theme.label)).size, 29);
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
    assert.deepEqual(familles, { fond: 10, encre: 14, duo: 5 });
  });

  it('gardent leur modèle d’origine', () => {
    // Le modèle des tirages leur est réservé : les palettes livrées ne
    // doivent pas changer d'apparence à la mise à jour.
    assert.ok(THEMES.every((theme) => !theme.sample));
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

describe('palettes à encres données', () => {
  it('utilise ses couleurs exactes, sans les dériver d’une teinte', () => {
    // Tout l'intérêt d'Okabe-Ito : son bleu ciel et son bleu ont la même
    // teinte et ne se distinguent que par la clarté. Un modèle qui dériverait
    // la couleur de la teinte seule les confondrait, et perdrait précisément
    // ce qui rend la palette lisible par un œil daltonien.
    const okabe = themeById('okabe');
    assert.ok(okabe.inks, 'Okabe-Ito doit porter des encres explicites');
    const first = paletteFor(okabe, 0, false);
    assert.equal(first.text, okabe.inks!.light[0]);
    assert.equal(first.accent, okabe.inks!.light[0], 'histogramme et texte partagent la couleur');

    const ciel = paletteFor(okabe, 1, false).text;
    const bleu = paletteFor(okabe, 4, false).text;
    assert.notEqual(ciel, bleu, 'deux couleurs de même teinte doivent rester distinctes');
  });

  it('cycle sur ses encres au-delà de la palette', () => {
    const okabe = themeById('okabe');
    const taille = okabe.inks!.light.length;
    assert.equal(paletteFor(okabe, 0, false).text, paletteFor(okabe, taille, false).text);
  });
});

describe('palettes tirées au sort', () => {
  /** Un générateur reproductible : un test qui échoue doit pouvoir se rejouer. */
  function seeded(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 1103515245 + 12345) % 2147483648;
      return value / 2147483648;
    };
  }

  function channels(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function luminance(hex: string): number {
    const [red, green, blue] = channels(hex);
    return (299 * red + 587 * green + 114 * blue) / 1000;
  }
  function difference(first: string, second: string): number {
    const left = channels(first);
    const right = channels(second);
    return Math.max(...left.map((value, index) => Math.abs(value - right[index])));
  }

  it('alterne vraiment fond coloré et texte coloré', () => {
    // Le bouton alterne les deux familles : il faut que ça se voie. Un tirage
    // « fond » colore ses cellules colonne par colonne ; un tirage « texte »
    // garde un fond uni et colore son encre.
    for (let seed = 1; seed <= 50; seed++) {
      for (const dark of [false, true]) {
        const fond = randomTheme('background', 'x', 'X', seeded(seed));
        const cellules = new Set([0, 1, 2, 3].map((column) => paletteFor(fond, column, dark).cell));
        assert.ok(cellules.size > 1, `fond coloré sans fonds différents (${fond.sample?.source})`);
        const texte = randomTheme('text', 'y', 'Y', seeded(seed));
        const unis = new Set([0, 1, 2, 3].map((column) => paletteFor(texte, column, dark).cell));
        const encres = new Set([0, 1, 2, 3].map((column) => paletteFor(texte, column, dark).text));
        assert.equal(unis.size, 1, `texte coloré sans fond uni (${texte.sample?.source})`);
        assert.ok(encres.size > 1, `texte coloré sans encres différentes (${texte.sample?.source})`);
      }
    }
  });

  it('tient les mêmes seuils de lisibilité que les palettes livrées', () => {
    // Deux cents tirages, soumis exactement aux deux règles qui protègent les
    // palettes d'origine : des colonnes voisines distinguables, et un texte
    // jamais confondu avec son fond. Le hasard porte sur la couleur, pas sur
    // la lisibilité — c'est ce que ce test vérifie. Seize colonnes, pour
    // franchir le moment où les teintes recommencent : c'est là que le défaut
    // de la rampe en dents de scie se cachait, hors de portée d'un test qui
    // s'arrêtait à la septième.
    let pireEcart = Infinity;
    let pireContraste = Infinity;
    for (let seed = 1; seed <= 100; seed++) {
      for (const family of ['background', 'text'] as const) {
        const theme = randomTheme(family, `r${seed}`, `R${seed}`, seeded(seed * 7 + (family === 'text' ? 1 : 0)));
        for (const dark of [false, true]) {
          for (let column = 0; column < 16; column++) {
            const left = paletteFor(theme, column, dark);
            const right = paletteFor(theme, column + 1, dark);
            const gap = Math.max(difference(left.cell, right.cell), difference(left.text, right.text));
            pireEcart = Math.min(pireEcart, gap);
            pireContraste = Math.min(pireContraste, Math.abs(luminance(left.text) - luminance(left.cell)));
          }
        }
      }
    }
    assert.ok(pireEcart >= 10, `écart minimal entre colonnes voisines : ${pireEcart}`);
    assert.ok(pireContraste > 60, `contraste minimal texte/fond : ${pireContraste}`);
  });

  it('ne fait jamais sauter la clarté d’une colonne à la suivante', () => {
    // Le défaut signalé : des colonnes vives suivies d'un coup de colonnes
    // sombres. Deux causes, mesurées : la rampe retombait de toute son
    // amplitude au recommencement des teintes (100 points de luminance), et
    // une case jaune paraissait bien plus claire qu'une case bleue au même
    // réglage (57). Après correction, le pire saut mesuré est de 21.
    let pireSaut = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const theme = randomTheme('background', 'c', 'C', seeded(seed * 7));
      for (const dark of [false, true]) {
        for (let column = 0; column < 16; column++) {
          const saut = Math.abs(
            luminance(paletteFor(theme, column, dark).cell) - luminance(paletteFor(theme, column + 1, dark).cell),
          );
          pireSaut = Math.max(pireSaut, saut);
        }
      }
    }
    assert.ok(pireSaut <= 25, `pire saut de clarté entre colonnes voisines : ${pireSaut.toFixed(0)}`);
  });

  /** Clarté et chroma OKLab, calculées ici indépendamment du code testé. */
  function oklch(hex: string): { l: number; c: number; h: number } {
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = channels(hex).map((v) => lin(v / 255));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
  }

  /** Toutes les couleurs qu'un tirage montre à l'écran, dans les deux thèmes. */
  function shown(seed: number): Array<{ hex: string; dark: boolean; role: string }> {
    const out: Array<{ hex: string; dark: boolean; role: string }> = [];
    for (const family of ['background', 'text'] as const) {
      const theme = randomTheme(family, 'v', 'V', seeded(seed * 7 + (family === 'text' ? 1 : 0)));
      for (const dark of [false, true]) {
        for (let column = 0; column < 8; column++) {
          const p = paletteFor(theme, column, dark);
          out.push({ hex: p.cell, dark, role: 'fond' }, { hex: p.accent, dark, role: 'accent' }, { hex: p.text, dark, role: 'texte' });
        }
      }
    }
    return out;
  }

  it('ne montre jamais de brun ni d’olive', () => {
    // Le reproche répété à l'essai : « tous les tons marrons, obscurs, ne sont
    // pas agréables ». Brun et olive, c'est un orange, un jaune ou un
    // vert-jaune à la fois foncé et coloré — le minimum de préférence chez
    // Palmer & Schloss (2010). Fonds, accents et textes, dans les deux thèmes.
    const bruns: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      for (const colour of shown(seed)) {
        const { l, c, h } = oklch(colour.hex);
        // Un grand aplat se lit brun dès une faible chroma, et le rouge foncé
        // y vire au bordeaux ; une encre olive se voit même assez claire.
        const fond = colour.role === 'fond';
        const brun = fond ? h >= 15 && h <= 145 && c >= 0.015 && l < 0.6 : h >= 40 && h <= 145 && c >= 0.03 && l < 0.6;
        const olive = !fond && h >= 95 && h <= 135 && c >= 0.1 && l < 0.72;
        if (brun || olive) bruns.push(`${colour.hex} (${colour.role}, ${colour.dark ? 'sombre' : 'clair'})`);
      }
    }
    assert.deepEqual(bruns.slice(0, 5), [], `${bruns.length} couleurs brunes ou olive`);
  });

  it('ne tire jamais de fond criard', () => {
    // Les fonds trop saturés ont été le premier reproche : le style le plus vif
    // d'avant montait à une chroma de 0,18. Un fond reste pastel.
    let pire = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const colour of shown(seed)) if (colour.role === 'fond') pire = Math.max(pire, oklch(colour.hex).c);
    }
    assert.ok(pire <= 0.08, `chroma maximale d'un fond : ${pire.toFixed(3)}`);
  });

  it('varie vraiment d’un tirage à l’autre', () => {
    // Le reproche constant : « les thèmes se ressemblent ». Les quatre
    // sources retenues au nuancier doivent toutes sortir, dans les deux
    // familles, et aucune ne doit écraser les autres.
    const vues = new Map<string, number>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const family of ['background', 'text'] as const) {
        const { sample } = randomTheme(family, 'd', 'D', seeded(seed * 7 + (family === 'text' ? 1 : 0)));
        const key = `${sample?.source}/${sample?.tint ? 'fond' : 'texte'}`;
        vues.set(key, (vues.get(key) ?? 0) + 1);
      }
    }
    assert.equal(vues.size, 8, [...vues.keys()].sort().join(', '));
    assert.ok(Math.max(...vues.values()) <= (400 / 8) * 2, `combinaison la plus fréquente : ${Math.max(...vues.values())} sur 400`);
  });

  it('reprend les couleurs officielles des thèmes, sans les retoucher', () => {
    // L'harmonie vient du travail de leurs auteurs : une couleur recalculée
    // ne serait plus la leur. Mocha et Latte, selon catppuccin/palette.
    const mocha = ['#F5E0DC', '#F2CDCD', '#F5C2E7', '#CBA6F7', '#F38BA8', '#EBA0AC', '#FAB387', '#F9E2AF', '#A6E3A1', '#94E2D5', '#89DCEB', '#74C7EC', '#89B4FA', '#B4BEFE'];
    const latte = ['#DC8A78', '#DD7878', '#EA76CB', '#8839EF', '#D20F39', '#E64553', '#FE640B', '#DF8E1D', '#40A02B', '#179299', '#04A5E5', '#209FB5', '#1E66F5', '#7287FD'];
    let vus = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { sample } = randomTheme('text', 'c', 'C', seeded(seed));
      if (sample?.source !== 'Catppuccin') continue;
      vus++;
      assert.equal(sample.dark.ground, '#1E1E2E');
      assert.equal(sample.light.ground, '#EFF1F5');
      sample.dark.colours.forEach((colour, i) => {
        const role = mocha.indexOf(colour);
        assert.ok(role >= 0, `${colour} n'est pas une couleur Mocha`);
        // Même rôle dans les deux thèmes : le rose sombre reste le rose clair.
        assert.equal(sample.light.colours[i], latte[role]);
      });
    }
    assert.ok(vus > 20, `tirages Catppuccin observés : ${vus}`);
  });
});

describe('palette en cours de tirage', () => {
  it('se résout comme les autres, sinon le tirage n’aurait aucun effet visible', () => {
    // Le défaut réel : le brouillon vivait dans la vue, pas dans ce point de
    // résolution. themeById ne le trouvait donc pas et retombait sur la palette
    // par défaut — quatre tirages de suite donnaient exactement la même couleur.
    const draft = randomTheme('background', 'custom-draft', 'Brouillon');
    setDraftTheme(draft);
    assert.equal(themeById('custom-draft').id, 'custom-draft');
    assert.equal(draftTheme()?.id, 'custom-draft');
    setDraftTheme(null);
    assert.equal(themeById('custom-draft'), DEFAULT_THEME);
  });
});

describe('palettes personnelles', () => {
  it('s’ajoutent aux palettes livrées sans les remplacer', () => {
    const mine = randomTheme('background', 'custom-1', 'Custom 1');
    setCustomThemes([mine]);
    assert.equal(allThemes().length, THEMES.length + 1);
    assert.equal(customThemes().length, 1);
    assert.equal(themeById('custom-1').id, 'custom-1');
    // Les livrées restent joignables.
    assert.equal(themeById('rainbow').id, 'rainbow');
    setCustomThemes([]);
    // Une palette supprimée retombe sur la palette par défaut, sans casser.
    assert.equal(themeById('custom-1'), DEFAULT_THEME);
  });
});
