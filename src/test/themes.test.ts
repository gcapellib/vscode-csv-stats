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
  it('en compte vingt, aux identifiants et libellés uniques', () => {
    assert.equal(THEMES.length, 20);
    assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 20);
    assert.equal(new Set(THEMES.map((theme) => theme.label)).size, 20);
  });

  it('range chaque palette dans une famille et une seule', () => {
    // L'aperçu et l'encre se déduisent de ces deux champs : une palette qui
    // porterait les deux serait dessinée deux fois.
    const familles = { fond: 0, encre: 0, duo: 0 };
    for (const theme of THEMES) {
      if (theme.uniformInk && theme.neutral) assert.fail(`« ${theme.label} » porte les deux familles`);
      if (theme.uniformInk) familles.fond++;
      else if (theme.neutral) familles.encre++;
      else familles.duo++;
    }
    assert.deepEqual(familles, { fond: 5, encre: 12, duo: 3 });
  });

  it('gardent leur modèle d’origine', () => {
    // Le modèle des tirages leur est réservé : les palettes livrées ne
    // doivent pas changer d'apparence à la mise à jour.
    assert.ok(THEMES.every((theme) => !theme.sample));
  });

  it('retombe sur la palette par défaut pour un identifiant inconnu', () => {
    assert.equal(themeById('palette-qui-n-existe-pas'), DEFAULT_THEME);
    assert.equal(themeById(undefined), DEFAULT_THEME);
    // Forest a été remplacée par sa version duo : qui l'avait choisie la retrouve.
    assert.equal(themeById('forest').id, 'forest-duo');
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
    const theme = themeById('ocean');
    const gradient = gradientFor(theme, false, 0.5);
    assert.ok(gradient.includes(', 0.5)'), gradient);
  });

  it('change avec le thème', () => {
    const a = gradientFor(themeById('syntax'), false);
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
    const fjord = themeById('fjord');
    assert.ok(fjord.inks, 'Fjord doit porter des encres explicites');
    const first = paletteFor(fjord, 0, true);
    assert.equal(first.text, fjord.inks!.dark[0]);
    assert.equal(first.accent, fjord.inks!.dark[0], 'histogramme et texte partagent la couleur');
  });

  it('cycle sur ses encres au-delà de la palette', () => {
    const fjord = themeById('fjord');
    const taille = fjord.inks!.light.length;
    assert.equal(paletteFor(fjord, 0, false).text, paletteFor(fjord, taille, false).text);
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

  it('ne tire que du texte coloré, sur fond uni ou voilé, avec ou sans traits', () => {
    // Plus d'aplats pastel : le fond est le fond du tableau, ou ce fond voilé de
    // la couleur de chaque colonne ; l'encre porte toujours la couleur.
    const traits = new Set<boolean>();
    let voiles = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const dark of [false, true]) {
        const theme = randomTheme('y', 'Y', seeded(seed));
        const fonds = new Set([0, 1, 2, 3].map((column) => paletteFor(theme, column, dark).cell));
        const encres = new Set([0, 1, 2, 3].map((column) => paletteFor(theme, column, dark).text));
        const voile = theme.sample?.veil;
        if (voile === undefined) assert.equal(fonds.size, 1, `fond coloré tiré (${theme.sample?.source ?? theme.blend})`);
        else {
          assert.ok(fonds.size > 1, 'voile sans fonds différents');
          assert.ok(voile >= 0.06 && voile <= 0.15, `voile hors bornes : ${voile}`);
          if (!dark) voiles++;
        }
        assert.ok(encres.size > 1, `encres identiques (${theme.sample?.source ?? theme.blend})`);
        assert.equal(theme.sample?.tint ?? false, false);
        traits.add(theme.seamless === true);
      }
    }
    assert.deepEqual([...traits].sort(), [false, true], 'des tirages avec traits, et d’autres sans');
    assert.ok(voiles >= 20, `trop peu de fonds voilés : ${voiles} sur 300`);
  });

  it('couvre tout le cercle des teintes, pas seulement le bleu, le violet et le rose', () => {
    // Le défaut vu à l'usage : près de la moitié des couleurs tirées tombaient entre
    // le cyan et le violet, les oranges, jaunes et verts presque jamais — les règles de
    // lisibilité sur fond clair rejetaient les chemins qui restaient en zone chaude.
    const secteurs = new Array(6).fill(0);
    let total = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const { sample } = randomTheme('h', 'H', seeded(seed * 13));
      if (!sample) continue;
      for (const hex of sample.dark.colours) {
        const { h } = oklch(hex);
        secteurs[Math.floor(h / 60) % 6]++;
        total++;
      }
    }
    secteurs.forEach((n, i) => assert.ok(n / total >= 0.09, `teintes ${i * 60}–${i * 60 + 59}° : ${((100 * n) / total).toFixed(1)} % seulement`));
  });

  it('varie la force du voile et la teinte du fond d’un tirage à l’autre', () => {
    const forces = new Set<number>();
    const fonds = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const { sample } = randomTheme('v', 'V', seeded(seed));
      if (sample?.veil === undefined) continue;
      forces.add(Math.round(sample.veil * 100));
      fonds.add(sample.dark.ground);
    }
    assert.ok(forces.size >= 7, `${forces.size} forces de voile seulement`);
    assert.ok(fonds.size >= 30, `${fonds.size} fonds différents seulement`);
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
        const theme = randomTheme(`r${seed}`, `R${seed}`, seeded(seed * 7 + (family === 'text' ? 1 : 0)));
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

  it('ne saute jamais quand les couleurs recommencent', () => {
    // Le premier défaut signalé : des colonnes vives suivies d'un coup de
    // colonnes sombres, au moment où la palette recommençait. Le tableau
    // parcourt désormais le dégradé en aller-retour : deux colonnes voisines,
    // sur seize, ne s'écartent jamais plus qu'un pas du chemin lui-même.
    for (let seed = 1; seed <= 200; seed++) {
      for (const family of ['background', 'text'] as const) {
        const theme = randomTheme('c', 'C', seeded(seed * 7 + (family === 'text' ? 1 : 0)));
        if (theme.spectrum) {
          // Un arc-en-ciel fait le tour du cercle à pas régulier : la dernière
          // teinte rejoint la première d'un pas ordinaire, comme Prism.
          const { hues } = theme;
          const steps = hues.map((hue, k) => (((hues[(k + 1) % hues.length] - hue) % 360) + 360) % 360);
          const pas = 360 / hues.length;
          assert.ok(
            steps.every((step) => Math.abs(step - pas) <= 1) || steps.every((step) => Math.abs(360 - step - pas) <= 1),
            `arc-en-ciel irrégulier : ${hues.join(', ')}`,
          );
          continue;
        }
        if (theme.blend) {
          // Une palette mélangée garde le style de la liste : c'est l'ordre de
          // ses teintes qui doit faire l'aller-retour, a b c d e d c b.
          const { hues } = theme;
          for (let k = 1; k < hues.length; k++) assert.equal(hues[k], hues[hues.length - k] ?? hues[0], `teintes ${hues.join(', ')}`);
          continue;
        }
        for (const dark of [false, true]) {
          const colours = (dark ? theme.sample?.dark : theme.sample?.light)?.colours ?? [];
          const pas = Math.max(...colours.slice(1).map((colour, i) => Math.abs(luminance(colour) - luminance(colours[i]))));
          for (let column = 0; column < 16; column++) {
            const left = paletteFor(theme, column, dark);
            const right = paletteFor(theme, column + 1, dark);
            const shown = family === 'background' ? [left.cell, right.cell] : [left.text, right.text];
            const saut = Math.abs(luminance(shown[0]) - luminance(shown[1]));
            assert.ok(saut <= pas + 0.5, `saut de ${saut.toFixed(0)} entre les colonnes ${column} et ${column + 1}, pour un pas de ${pas.toFixed(0)}`);
          }
        }
      }
    }
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
      const theme = randomTheme('v', 'V', seeded(seed * 7 + (family === 'text' ? 1 : 0)));
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
        // Définition indépendante de celle du code : brun s'il est sombre,
        // tan ou kaki s'il est terne, moutarde pour un jaune pas assez clair, olive s'il est soutenu sans être
        // clair, bordeaux pour un grand aplat rouge foncé.
        const fond = colour.role === 'fond';
        const orange = c >= 0.015 && h >= 30 && h < 75 && (l < (fond ? 0.72 : 0.68) || (l < 0.8 && c < 0.1) || (l < 0.86 && c < 0.05));
        const moutarde = c >= 0.015 && h >= 75 && h < 110 && l < 0.84;
        const chaud = orange || moutarde;
        const vertJaune = c >= 0.015 && h >= 110 && h <= 145 && (l < 0.6 || (c >= 0.1 && l < 0.8) || (l < 0.78 && c < 0.1));
        const bordeaux = c >= 0.015 && ((h >= 15 && h < 30 && l < (fond ? 0.7 : 0.45)) || (h < 30 && l < 0.76 && c < 0.06));
        const brun = chaud || bordeaux;
        const olive = vertJaune;
        if (brun || olive) bruns.push(`${colour.hex} (${colour.role}, ${colour.dark ? 'sombre' : 'clair'})`);
      }
    }
    assert.deepEqual(bruns.slice(0, 5), [], `${bruns.length} couleurs brunes ou olive`);
  });

  it('ne tire jamais de fond à la fois sombre et saturé', () => {
    // Le premier rejet visait des fonds sombres et saturés sur toute la
    // largeur (chroma 0,18). Les palettes de référence admettent des fonds
    // francs — framboise, cramoisi — mais clairs ou moyens ; sombres, ils
    // restent sourds, comme l'indigo nuit ou l'ardoise.
    let pire = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const colour of shown(seed)) {
        if (colour.role !== 'fond') continue;
        const { l, c } = oklch(colour.hex);
        if (l < 0.45) pire = Math.max(pire, c);
      }
    }
    assert.ok(pire <= 0.12, `chroma maximale d'un fond sombre : ${pire.toFixed(3)}`);
  });

  it('varie vraiment d’un tirage à l’autre', () => {
    // Le reproche constant : « les thèmes se ressemblent ». Les sept formes de
    // chemin — dont le ton sur ton — doivent toutes sortir, et les mélanges avec le
    // style d'une palette de la liste, et les arcs-en-ciel, aussi.
    const vues = new Map<string, number>();
    for (let seed = 1; seed <= 400; seed++) {
      const { sample, blend, spectrum } = randomTheme('d', 'D', seeded(seed * 7 + 1));
      const key = spectrum ? 'arc-en-ciel' : blend ? 'liste' : String(sample?.source);
      vues.set(key, (vues.get(key) ?? 0) + 1);
    }
    assert.equal(vues.size, 9, [...vues.keys()].sort().join(', '));
    assert.ok(Math.max(...vues.values()) <= 400 * 0.5, `forme la plus fréquente : ${Math.max(...vues.values())} sur 400`);
  });

  it('garde le bandeau lisible : histogramme, pourcentages et texte', () => {
    // L'accent se lit sur le bandeau, pas sur la cellule : un contrôle qui ne
    // regardait que le texte sur le fond laissait passer des pourcentages
    // jaune pâle sur fond jaune pâle — 74 % des mélanges à fond coloré.
    let pire = Infinity;
    for (let seed = 1; seed <= 200; seed++) {
      for (const family of ['background', 'text'] as const) {
        const theme = randomTheme('a', 'A', seeded(seed * 7 + (family === 'text' ? 1 : 0)));
        for (const dark of [false, true]) {
          for (let column = 0; column < 8; column++) {
            const colours = paletteFor(theme, column, dark);
            pire = Math.min(
              pire,
              Math.abs(luminance(colours.accent) - luminance(colours.band)),
              Math.abs(luminance(colours.text) - luminance(colours.band)),
            );
          }
        }
      }
    }
    assert.ok(pire >= 60, `contraste minimal sur le bandeau : ${pire.toFixed(0)}`);
  });

  it('distingue le texte de deux colonnes voisines', () => {
    // Le critère jugé le plus important à l'usage. Sur les fonds colorés, le
    // texte prenait la teinte de sa colonne en foncé : 49 % des paires
    // voisines avaient un texte identique. Distance perçue OKLab, calculée ici
    // indépendamment du code, sur seize colonnes et dans les deux thèmes.
    const lab = (hex: string) => {
      const { l, c, h } = oklch(hex);
      return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
    };
    for (let seed = 1; seed <= 200; seed++) {
      for (const family of ['background', 'text'] as const) {
        const theme = randomTheme('t', 'T', seeded(seed * 7 + (family === 'text' ? 1 : 0)));
        for (const dark of [false, true]) {
          for (let column = 0; column < 16; column++) {
            const [p, q] = [paletteFor(theme, column, dark).text, paletteFor(theme, column + 1, dark).text].map(lab);
            const ecart = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
            assert.ok(ecart >= 0.05, `${theme.blend ?? theme.sample?.source} (${family}, ${dark ? 'sombre' : 'clair'}) colonnes ${column}/${column + 1} : écart ${ecart.toFixed(3)}`);
          }
        }
      }
    }
  });

  it('trace un dégradé, pas une juxtaposition', () => {
    // Le principe des palettes de référence : d'une couleur à la suivante,
    // la clarté ou la teinte avance un peu, jamais d'un bond. Mesuré en
    // distance perçue (ΔE OKLab), où une teinte ne pèse qu'à proportion de sa
    // saturation — au centre presque blanc d'une rampe divergente, changer de
    // teinte ne se voit pas : aucun pas ne dépasse la moitié du chemin total.
    const lab = (hex: string) => {
      const { l, c, h } = oklch(hex);
      return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
    };
    for (let seed = 1; seed <= 200; seed++) {
      const { sample } = randomTheme('g', 'G', seeded(seed));
      const points = (sample?.light.colours ?? []).map(lab);
      const pas = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1], p[2] - points[i][2]));
      const total = pas.reduce((sum, step) => sum + step, 0);
      assert.ok(Math.max(...pas) <= total / 2 + 1e-9, `${sample?.source} : un pas de ${Math.max(...pas).toFixed(2)} sur ${total.toFixed(2)}`);
    }
  });
});

describe('palette en cours de tirage', () => {
  it('se résout comme les autres, sinon le tirage n’aurait aucun effet visible', () => {
    // Le défaut réel : le brouillon vivait dans la vue, pas dans ce point de
    // résolution. themeById ne le trouvait donc pas et retombait sur la palette
    // par défaut — quatre tirages de suite donnaient exactement la même couleur.
    const draft = randomTheme('custom-draft', 'Brouillon');
    setDraftTheme(draft);
    assert.equal(themeById('custom-draft').id, 'custom-draft');
    assert.equal(draftTheme()?.id, 'custom-draft');
    setDraftTheme(null);
    assert.equal(themeById('custom-draft'), DEFAULT_THEME);
  });
});

describe('palettes personnelles', () => {
  it('s’ajoutent aux palettes livrées sans les remplacer', () => {
    const mine = randomTheme('custom-1', 'Custom 1');
    setCustomThemes([mine]);
    assert.equal(allThemes().length, THEMES.length + 1);
    assert.equal(customThemes().length, 1);
    assert.equal(themeById('custom-1').id, 'custom-1');
    // Les livrées restent joignables.
    assert.equal(themeById('ocean').id, 'ocean');
    setCustomThemes([]);
    // Une palette supprimée retombe sur la palette par défaut, sans casser.
    assert.equal(themeById('custom-1'), DEFAULT_THEME);
  });
});

/** Clarté, chroma et teinte OKLCH d'un « #rrggbb », calculées ici indépendamment du code testé. */
function lchOf(hex: string): { l: number; c: number; h: number } {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((at) => lin(parseInt(hex.slice(at, at + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

describe('palettes ton sur ton', () => {
  it('reviennent en arrière au-delà de la dernière couleur, sans saut', () => {
    const theme = themeById('blue-violet');
    const texts = Array.from({ length: 9 }, (_, column) => paletteFor(theme, column, true).text);
    // 5 couleurs : 0 1 2 3 4 3 2 1 0 — deux colonnes voisines ne sont jamais jumelles.
    assert.deepEqual(texts.slice(0, 5).reverse().slice(1), texts.slice(5));
    for (let i = 1; i < texts.length; i++) assert.notEqual(texts[i], texts[i - 1]);
  });

  it('se passent de traits de séparation, les autres non', () => {
    for (const id of ['blue-violet', 'dusk', 'woodland', 'deep-sea']) assert.equal(themeById(id).seamless, true, id);
    for (const id of ['fjord', 'bordeaux-gold', 'syntax', 'ocean']) assert.notEqual(themeById(id).seamless, true, id);
  });

  it('ne montrent ni brun ni olive sur fond clair', () => {
    // Même définition, indépendante du code, que pour les tirages : un or ou un orange
    // assombri est un brun, un vert-jaune assombri un olive.
    for (const id of ['blue-violet', 'dusk', 'woodland', 'deep-sea', 'fjord', 'bordeaux-gold']) {
      for (let column = 0; column < 5; column++) {
        const { text } = paletteFor(themeById(id), column, false);
        const { l, c, h } = lchOf(text);
        const orange = c >= 0.015 && h >= 30 && h < 75 && (l < 0.68 || (l < 0.8 && c < 0.1) || (l < 0.86 && c < 0.05));
        const moutarde = c >= 0.015 && h >= 75 && h < 110 && l < 0.84;
        const vertJaune = c >= 0.015 && h >= 110 && h <= 145 && (l < 0.6 || (c >= 0.1 && l < 0.8) || (l < 0.78 && c < 0.1));
        const bordeaux = c >= 0.015 && ((h >= 15 && h < 30 && l < 0.45) || (h < 30 && l < 0.76 && c < 0.06));
        assert.ok(!(orange || moutarde || vertJaune || bordeaux), `${id}, colonne ${column} : ${text} (l ${l.toFixed(2)}, c ${c.toFixed(2)}, h ${h.toFixed(0)})`);
      }
    }
  });

  it('gardent une encre lisible sur fond clair', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => {
        const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const id of ['blue-violet', 'dusk', 'woodland', 'deep-sea', 'fjord', 'bordeaux-gold']) {
      const theme = themeById(id);
      for (let column = 0; column < 5; column++) {
        const palette = paletteFor(theme, column, false);
        const ratio = (luminance(palette.cell) + 0.05) / (luminance(palette.text) + 0.05);
        assert.ok(ratio >= 3.5, `${id}, colonne ${column} : contraste ${ratio.toFixed(2)}`);
      }
    }
  });
});

describe('couleur sobre du thème', () => {
  it('donne une couleur plus sobre que tous les accents de la palette', async () => {
    const { neutralAccent, paletteFor, themeById } = await import('../core/themes');
    const theme = themeById('syntax');
    const spread = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    const accent = neutralAccent(theme, true);
    assert.match(accent, /^#[0-9a-f]{6}$/i);
    for (const [index] of theme.hues.entries()) assert.ok(spread(accent) < spread(paletteFor(theme, index, true).accent));
  });
});
