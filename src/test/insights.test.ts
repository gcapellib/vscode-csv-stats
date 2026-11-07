import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parse } from '../core/csv';
import { computeDataset, computeDetails } from '../core/details';
import { fixMojibake, groupMeans, numericPlaceholders, levelShift, pandasHints, pearson, sequenceGaps, similarValues, summaryWithout, topCorrelations } from '../core/insights';
import { computeAll } from '../core/stats';
import { applySteps, describeStep, stepsToPandas } from '../core/steps';

function detailsOf(text: string, column = 0) {
  const table = parse(text);
  const stats = computeAll(table);
  return { table, details: computeDetails(table, column, stats[column].type, stats[column].temporal) };
}

/** Un générateur déterministe, pour des séries qui ne changent pas d'un lancement à l'autre. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

describe('valeurs-balises', () => {
  it('repère -999 qui revient parmi des mesures', () => {
    const random = noise(7);
    const lines = ['t'];
    for (let i = 0; i < 100; i++) lines.push(String(40 + Math.round(random() * 200) / 10));
    for (let i = 0; i < 14; i++) lines.push('-999');
    const { details } = detailsOf(lines.join('\n') + '\n');
    assert.equal(details.placeholders.length, 1);
    assert.equal(details.placeholders[0].value, '-999');
    assert.equal(details.placeholders[0].count, 14);
    assert.ok(details.withoutPlaceholders && details.withoutPlaceholders.min > 30, 'les chiffres sans la balise');
  });

  it('le signale aussi dans les constats du fichier', () => {
    const lines = ['t', ...Array.from({ length: 60 }, (_, i) => String(20 + (i % 9))), '-999', '-999', '-999'];
    const { table, details } = detailsOf(lines.join('\n') + '\n');
    const dataset = computeDataset(table, [details]);
    assert.ok(dataset.findings.some((entry) => entry.fix === 'empty' && entry.values.includes('-999')));
  });

  it('repère une balise qui domine, plus du quart des lignes', () => {
    // Avec 25 valeurs sur 30 à -999, les quartiles sont ceux de la balise : plus rien
    // n'en sort. On la juge sur ce qui reste une fois les balises connues écartées.
    const entries: Array<[string, number]> = [['-999', 25], ['40.1', 1], ['41.5', 1], ['39.2', 1], ['42.0', 1], ['40.8', 1]];
    const found = numericPlaceholders(entries, (raw) => Number(raw));
    assert.deepEqual(found.map((entry) => [entry.value, entry.count]), [['-999', 25]]);
  });

  it('ne prend pas pour balise une valeur connue qui se fond dans la colonne', () => {
    const entries: Array<[string, number]> = [['99', 3], ...Array.from({ length: 20 }, (_, i): [string, number] => [String(60 + i * 2), 2])];
    assert.deepEqual(numericPlaceholders(entries, (raw) => Number(raw)), []);
  });

  it('garde les écritures avec espaces, que le filtre doit retrouver', () => {
    const entries: Array<[string, number]> = [['-999', 5], [' -999', 2], ...Array.from({ length: 40 }, (_, i): [string, number] => [String(20 + (i % 11)), 3])];
    const [found] = numericPlaceholders(entries, (raw) => Number(raw.trim()));
    assert.ok(found.raws.includes(' -999') && found.raws.includes('-999'), JSON.stringify(found));
    assert.ok(found.tokens.every((token) => token === token.trim()));
  });

  it('ne soupçonne pas 999 quand la colonne monte plus haut', () => {
    const lines = ['v'];
    for (let i = 0; i < 60; i++) lines.push(String(i * 25));
    lines.push('999', '999');
    assert.equal(detailsOf(lines.join('\n') + '\n').details.placeholders.length, 0);
  });

  it('ne soupçonne pas un extrême isolé', () => {
    const lines = ['v', ...Array.from({ length: 50 }, (_, i) => String(10 + (i % 7))), '250'];
    assert.equal(detailsOf(lines.join('\n') + '\n').details.placeholders.length, 0);
  });

  it('repère une date de remplissage', () => {
    const lines = ['d', ...Array.from({ length: 20 }, (_, i) => `2024-03-${String((i % 28) + 1).padStart(2, '0')}`), '1900-01-01', '1900-01-01'];
    assert.equal(detailsOf(lines.join('\n') + '\n').details.placeholders[0]?.value, '1900-01-01');
  });

  it('recalcule sans les valeurs exclues', () => {
    const summary = summaryWithout([['1', 1], ['3', 1], ['-999', 5]], (raw) => Number(raw), new Set(['-999']));
    assert.deepEqual([summary?.min, summary?.max, summary?.mean, summary?.median], [1, 3, 2, 2]);
  });
});

describe('série dans l’ordre des lignes', () => {
  it('trouve le changement de niveau', () => {
    const random = noise(3);
    const values = [...Array.from({ length: 150 }, () => 10 + random()), ...Array.from({ length: 150 }, () => 14 + random())];
    const cut = levelShift(values);
    assert.ok(cut !== null && Math.abs(cut - 150) <= 10, `coupure vers 150, trouvée ${cut}`);
  });

  it('ne voit pas de saut dans une rampe régulière', () => {
    assert.equal(levelShift(Array.from({ length: 300 }, (_, i) => i)), null);
  });

  it('ne coupe pas un bruit régulier', () => {
    const random = noise(11);
    assert.equal(levelShift(Array.from({ length: 300 }, () => 10 + random() * 4)), null);
  });
});

describe('corrélations', () => {
  it('mesure Pearson et ignore les séries trop courtes', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    assert.ok(Math.abs((pearson(xs, xs.map((x) => 2 * x + 1)) ?? 0) - 1) < 1e-9);
    assert.equal(pearson([1, 2, 3], [1, 2, 3]), null);
  });

  it('classe les paires liées, sans les valeurs exclues', () => {
    const rows: string[][] = [];
    for (let i = 0; i < 40; i++) rows.push([String(i), String(i * 3 + 1), String((i * 7) % 5)]);
    rows.push(['5', '-999', '0']);
    const parseNumber = (raw: string) => (raw === '' ? null : Number(raw));
    const columns = [0, 1, 2].map((index) => ({ index, name: `c${index}`, excluded: new Set(index === 1 ? ['-999'] : []), parse: parseNumber }));
    const found = topCorrelations(rows, columns);
    assert.equal(found[0].left, 0);
    assert.equal(found[0].right, 1);
    assert.ok(found[0].r > 0.99, 'la balise ne doit pas casser la corrélation');
  });
});

describe('conseils pandas', () => {
  it('lit des flottants quand un entier a une cellule vide', () => {
    const { details } = detailsOf('n,x\n1,a\n,b\n3,c\n');
    assert.equal(details.pandasType, 'float64');
    assert.ok(details.hints.some((hint) => hint.includes('Int64')));
  });

  it('ne conseille rien sur un petit fichier', () => {
    assert.deepEqual(detailsOf('n\n1\n2\n3\n').details.hints, []);
  });

  it('propose un entier plus étroit quand la mémoire le justifie', () => {
    const hints = pandasHints({ kind: 'numeric', rows: 1_000_000, present: 1_000_000, gaps: 0, distinct: 90, integersOnly: true, min: 0, max: 90, digits: 2 });
    assert.ok(hints[0].startsWith('int8'));
  });

  it('propose category pour peu de valeurs sur beaucoup de lignes', () => {
    const hints = pandasHints({ kind: 'text', rows: 5000, present: 5000, gaps: 0, distinct: 6, integersOnly: false, min: 0, max: 0, digits: 0 });
    assert.ok(hints[0].includes('category'));
  });
});

describe('doublons sur des colonnes', () => {
  it('garde la première ligne de chaque clé', () => {
    const table = parse('id,v\n1,a\n2,b\n1,c\n3,d\n2,e\n');
    const step = { kind: 'removeDuplicates' as const, columns: [0] };
    const cleaned = applySteps(table.rows, table.headers, [step], false);
    assert.deepEqual(cleaned.rows.map((row) => row[1]), ['a', 'b', 'd']);
    assert.equal(cleaned.effects[0], 2);
    assert.equal(describeStep(step, (column) => table.headers[column]), 'Remove rows repeating id');
    assert.deepEqual(stepsToPandas([step], table.headers, () => false), ['df = df.drop_duplicates(subset=["id"])']);
  });

  it('repère une colonne presque unique dont quelques valeurs se répètent', () => {
    const lines = ['id,v', ...Array.from({ length: 40 }, (_, i) => `${i},x`), '3,y', '4,z'];
    const { details } = detailsOf(lines.join('\n') + '\n');
    assert.deepEqual(details.repeats?.values.sort(), ['3', '4']);
    assert.equal(details.repeats?.rows, 4);
  });
});

describe('graphies proches', () => {
  it('rattache une faute de frappe rare à la forme établie', () => {
    const groups = similarValues([['Lyon', 120], ['Lyons', 3], ['lyon ', 2], ['Nantes', 80], ['Paris', 90]]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].canonical, 'Lyon');
    assert.deepEqual(groups[0].variants.map((variant) => variant.value).sort(), ['Lyons', 'lyon ']);
  });

  it('laisse séparées deux valeurs aussi fréquentes l’une que l’autre', () => {
    assert.deepEqual(similarValues([['Chine', 40], ['Chili', 30], ['Paris', 10]]), []);
  });

  it('ne compare pas les codes : OEUF-053 et OEUF-054 sont distincts', () => {
    assert.deepEqual(similarValues([['OEUF-053', 100], ['OEUF-054', 2], ['Autre', 5]]), []);
  });

  it('laisse les accents abîmés à la correction d’encodage', () => {
    assert.deepEqual(similarValues([['À revoir', 100], ['Ã€ revoir', 14], ['Autre', 5]]), []);
  });

  it('regroupe un mot court écrit de plusieurs façons', () => {
    const groups = similarValues([['Feu', 201], ['FEU', 1], ['feu', 1], ['Glace', 201]]);
    assert.equal(groups[0]?.canonical, 'Feu');
    assert.deepEqual(groups[0]?.variants.map((variant) => variant.value).sort(), ['FEU', 'feu']);
  });

  it('ne rapproche pas deux mots courts qui diffèrent d’une lettre', () => {
    assert.deepEqual(similarValues([['Mali', 100], ['Mal', 2], ['Chine', 50]]), []);
  });

  it('confond les accents et la casse', () => {
    const groups = similarValues([['Étoile', 50], ['etoile', 4], ['Soleil', 30]]);
    assert.equal(groups[0]?.canonical, 'Étoile');
  });
});

describe('caractères mal décodés', () => {
  it('refait le chemin inverse', () => {
    assert.equal(fixMojibake('CafÃ©'), 'Café');
    assert.equal(fixMojibake('Dâ€™accord'), 'D’accord');
  });

  it('ne touche pas un texte sain', () => {
    assert.equal(fixMojibake('Café'), null);
    assert.equal(fixMojibake('Ça va'), null);
    assert.equal(fixMojibake('Ã seul'), null);
  });

  it('s’applique en étape, sans toucher aux cellules saines', () => {
    const table = parse('v,x\nCafÃ©,1\nThé,2\n');
    const cleaned = applySteps(table.rows, table.headers, [{ kind: 'fixEncoding', column: 0 }], false);
    assert.deepEqual(cleaned.rows.map((row) => row[0]), ['Café', 'Thé']);
    assert.equal(cleaned.effects[0], 1);
  });
});

describe('code pandas des étapes de texte', () => {
  it('corrige les caractères avec .loc, pas par affectation en chaîne', () => {
    const lines = stepsToPandas([{ kind: 'fixEncoding', column: 0 }], ['note'], () => false);
    assert.ok(lines.some((line) => line.startsWith('df.loc[_garbled, "note"] = ')), lines.join('\n'));
    assert.ok(!lines.some((line) => /\]\[_garbled\] =/.test(line)), 'affectation en chaîne');
  });
});

describe('fusion de graphies', () => {
  it('remplace plusieurs écritures par une seule', () => {
    const table = parse('ville,n\nLyon,1\nLyons,2\nlyon ,3\nNantes,4\n');
    const step = { kind: 'merge' as const, column: 0, from: ['Lyons', 'lyon '], to: 'Lyon' };
    const cleaned = applySteps(table.rows, table.headers, [step], false);
    assert.deepEqual(cleaned.rows.map((row) => row[0]), ['Lyon', 'Lyon', 'Lyon', 'Nantes']);
    assert.equal(cleaned.effects[0], 2);
    assert.equal(stepsToPandas([step], table.headers, () => false)[0], 'df["ville"] = df["ville"].replace(["Lyons","lyon "], "Lyon")');
  });
});

describe('trous dans une suite', () => {
  const numbers = (values: number[]): Array<[string, number]> => values.map((value) => [String(value), 1]);
  const identity = (raw: string) => Number(raw);

  it('trouve les identifiants manquants', () => {
    const ids = Array.from({ length: 40 }, (_, i) => i + 1).filter((id) => id !== 4 && id !== 17 && id !== 18);
    const found = sequenceGaps(numbers(ids), identity, false);
    assert.equal(found?.missing, 3);
    assert.deepEqual(found?.gaps.map((gap) => [gap.after, gap.before, gap.missing]), [['3', '5', 1], ['16', '19', 2]]);
  });

  it('ne cherche pas de trous dans une mesure', () => {
    const measures: Array<[string, number]> = Array.from({ length: 30 }, (_, i) => [String(10 + (i % 5)), 8]);
    assert.equal(sequenceGaps(measures, identity, false), null);
  });

  it('nomme le rythme d’une série de dates', () => {
    const day = 86_400_000;
    const days = Array.from({ length: 30 }, (_, i) => i).filter((i) => i !== 10);
    const entries: Array<[string, number]> = days.map((i) => [`d${i}`, 1]);
    const found = sequenceGaps(entries, (raw) => Number(raw.slice(1)) * day, true);
    assert.equal(found?.every, 'day');
    assert.equal(found?.missing, 1);
  });
});

describe('moyenne par catégorie', () => {
  it('mesure ce que la catégorie explique', () => {
    const pairs: Array<[string, number]> = [];
    for (let i = 0; i < 20; i++) pairs.push(['petit', 10 + (i % 3)], ['gros', 20 + (i % 3)]);
    const grouping = groupMeans(pairs);
    assert.equal(grouping?.groups[0].key, 'gros');
    assert.ok((grouping?.explained ?? 0) > 0.9);
  });

  it('ignore une valeur non finie au lieu de tout contaminer', () => {
    const pairs: Array<[string, number]> = [];
    for (let i = 0; i < 20; i++) pairs.push(['a', 10 + (i % 3)], ['b', 20 + (i % 3)]);
    pairs.push(['a', Number.NaN]);
    const grouping = groupMeans(pairs);
    assert.ok(grouping && Number.isFinite(grouping.explained) && grouping.groups.every((group) => Number.isFinite(group.mean)));
  });

  it('dit que la catégorie n’explique rien quand les groupes se ressemblent', () => {
    const pairs: Array<[string, number]> = [];
    for (let i = 0; i < 40; i++) pairs.push([i % 2 === 0 ? 'a' : 'b', 10 + (i % 7)]);
    assert.ok((groupMeans(pairs)?.explained ?? 1) < 0.05);
  });
});
