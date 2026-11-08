import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { applySteps, describeEffect, describeStep, stepsToPandas, toCsv, type Step } from '../core/steps';

const headers = ['ville', 'prix', 'note'];
const original = [
  [' Lyon ', '10', 'a'],
  ['lyon', 'n/a', ''],
  [' Lyon ', '10', 'a'],
  ['Brest', 'NULL', ''],
  ['', '', ''],
];

describe('étapes de nettoyage', () => {
  it("ne touche jamais l'original", () => {
    const snapshot = JSON.stringify(original);
    applySteps(original, headers, [{ kind: 'trim', column: 0 }, { kind: 'removeDuplicates' }], false);
    assert.equal(JSON.stringify(original), snapshot);
  });

  it('rejoue les étapes dans l’ordre et compte ce que chacune touche', () => {
    const steps: Step[] = [
      { kind: 'trim', column: 0 },
      { kind: 'case', column: 0, mode: 'title' },
      { kind: 'removeDuplicates' },
      { kind: 'removeBlankRows' },
    ];
    const result = applySteps(original, headers, steps, false);
    assert.deepEqual(result.effects, [2, 1, 1, 1]);
    assert.deepEqual(
      result.rows.map((row) => row[0]),
      ['Lyon', 'Lyon', 'Brest'],
    );
    // La ligne d'origine de chaque ligne gardée, pour la gouttière.
    assert.deepEqual(result.source, [0, 1, 3]);
  });

  it('vide ce qui ne se lit pas dans le type choisi, comme Power Query', () => {
    const result = applySteps(original, headers, [{ kind: 'type', column: 1, type: 'numeric' }], false);
    assert.equal(result.effects[0], 2);
    assert.equal(result.types.get(1), 'numeric');
    assert.deepEqual(
      result.rows.map((row) => row[1]),
      ['10', '', '10', '', ''],
    );
  });

  it('traite des jetons comme vides, remplace et remplit vers le bas', () => {
    const steps: Step[] = [
      { kind: 'empty', column: 1, tokens: ['NULL', 'n/a'] },
      { kind: 'replace', column: 2, from: 'a', to: 'A' },
      { kind: 'fillDown', column: 2 },
    ];
    const result = applySteps(original, headers, steps, false);
    assert.deepEqual(result.effects, [2, 2, 3]);
    assert.deepEqual(
      result.rows.map((row) => row[2]),
      ['A', 'A', 'A', 'A', 'A'],
    );
  });

  it('retire les lignes où une colonne est vide, et arrondit les nombres', () => {
    const rows = [
      ['a', '1.2345'],
      ['', '2'],
      [' ', '3.5'],
      ['d', 'x'],
    ];
    const dropped = applySteps(rows, ['k', 'v'], [{ kind: 'dropEmpty', column: 0 }], false);
    assert.equal(dropped.effects[0], 2);
    assert.deepEqual(dropped.source, [0, 3]);
    const rounded = applySteps(rows, ['k', 'v'], [{ kind: 'round', column: 1, digits: 1 }], false);
    assert.deepEqual(rounded.rows.map((row) => row[1]), ['1.2', '2', '3.5', 'x']);
    assert.equal(rounded.effects[0], 1);
    // Virgule décimale : le fichier garde sa convention.
    const comma = applySteps([['1,2345']], ['v'], [{ kind: 'round', column: 0, digits: 2 }], true);
    assert.equal(comma.rows[0][0], '1,23');
    assert.deepEqual(stepsToPandas([{ kind: 'dropEmpty', column: 0 }, { kind: 'round', column: 1, digits: 2 }], ['k', 'v'], () => false), [
      'df = df[df["k"].notna() & (df["k"].astype(str).str.strip() != "")]',
      'df["v"] = df["v"].round(2)',
    ]);
  });

  it('renomme et retire sans décaler les étapes suivantes', () => {
    const steps: Step[] = [
      { kind: 'rename', column: 0, name: 'city' },
      { kind: 'remove', column: 2 },
      { kind: 'trim', column: 0 },
    ];
    const result = applySteps(original, headers, steps, false);
    assert.deepEqual(result.names, ['city', 'prix', 'note']);
    assert.ok(result.removed.has(2));
    const nameOf = (column: number) => result.names[column];
    assert.equal(describeStep(steps[2], nameOf), 'Trim spaces in city');
    assert.equal(describeEffect(steps[2], result.effects[2]), '2 cells');
  });

  it('se traduit en pandas avec le nom courant de chaque colonne', () => {
    const steps: Step[] = [
      { kind: 'rename', column: 0, name: 'city' },
      { kind: 'trim', column: 0 },
      { kind: 'type', column: 1, type: 'date' },
      { kind: 'removeDuplicates' },
    ];
    assert.deepEqual(stepsToPandas(steps, headers, () => true), [
      'df = df.rename(columns={"ville": "city"})',
      'df["city"] = df["city"].str.strip()',
      'df["prix"] = pd.to_datetime(df["prix"], dayfirst=True, errors="coerce")',
      'df = df.drop_duplicates()',
    ]);
  });

  it('écrit une copie CSV dans l’ordre des colonnes affichées', () => {
    const csv = toCsv(['city', 'prix', 'note'], [['Lyon', '1,5', ' x']], [0, 1], ',');
    assert.equal(csv, 'city,prix\nLyon,"1,5"\n');
  });
});

describe('étapes ajoutées : remplacer dans la cellule, remplir, retirer des lignes', () => {
  const rows = [
    ['12 €', 'x', ''],
    ['7 kg', '', 'b'],
    ['', 'y', ''],
    ['3 €', '', 'c'],
  ];
  const cols = ['prix', 'k', 'n'];
  const run = (steps: Step[]) => applySteps(rows, cols, steps, false);

  it('« contient » remplace toute occurrence, pas seulement la cellule entière', () => {
    const result = run([{ kind: 'replace', column: 0, from: ' €', to: '', mode: 'contains' }]);
    assert.deepEqual(result.rows.map((row) => row[0]), ['12', '7 kg', '', '3']);
    assert.deepEqual(result.effects, [2]);
  });

  it('sans mode, le remplacement reste exact', () => {
    const result = run([{ kind: 'replace', column: 0, from: '12', to: '1', mode: undefined }]);
    assert.deepEqual(result.rows.map((row) => row[0]), ['12 €', '7 kg', '', '3 €']);
  });

  it('regex : groupes et toutes les occurrences ; un motif invalide ne change rien', () => {
    const regex = run([{ kind: 'replace', column: 0, from: '(\\d+) ?(€|kg)', to: '$1', mode: 'regex' }]);
    assert.deepEqual(regex.rows.map((row) => row[0]), ['12', '7', '', '3']);
    const broken = run([{ kind: 'replace', column: 0, from: '(', to: '', mode: 'regex' }]);
    assert.deepEqual(broken.rows.map((row) => row[0]), ['12 €', '7 kg', '', '3 €']);
  });

  it('« contient » avec un texte vide ne touche rien', () => {
    assert.deepEqual(run([{ kind: 'replace', column: 0, from: '', to: 'x', mode: 'contains' }]).effects, [0]);
  });

  it('fill up remonte la valeur suivante, fill down descend la précédente', () => {
    const up = run([{ kind: 'fillUp', column: 2 }]);
    assert.deepEqual(up.rows.map((row) => row[2]), ['b', 'b', 'c', 'c']);
    assert.deepEqual(up.effects, [2]);
    const down = run([{ kind: 'fillDown', column: 2 }]);
    assert.deepEqual(down.rows.map((row) => row[2]), ['', 'b', 'b', 'c']);
  });

  it('une valeur fixe remplit les vides, y compris ceux faits d’espaces', () => {
    const result = applySteps([['a'], [' '], ['']], ['h'], [{ kind: 'fillValue', column: 0, value: '0' }], false);
    assert.deepEqual(result.rows.map((row) => row[0]), ['a', '0', '0']);
    assert.deepEqual(result.effects, [2]);
  });

  it('retirer des lignes les désigne par le fichier d’origine, même après un autre retrait', () => {
    const steps: Step[] = [{ kind: 'dropEmpty', column: 0 }, { kind: 'dropRows', rows: [3], label: 'test' }];
    const result = run(steps);
    assert.deepEqual(result.source, [0, 1]);
    assert.deepEqual(result.effects, [1, 1]);
    assert.equal(describeEffect(steps[1], 1), '−1 row');
  });

  it('se décrit et s’exporte en pandas', () => {
    const nameOf = (column: number) => cols[column];
    assert.equal(describeStep({ kind: 'fillUp', column: 2 }, nameOf), 'Fill up n');
    assert.equal(describeStep({ kind: 'dropRows', rows: [1, 2], label: 'prix: outliers' }, nameOf), 'Remove 2 rows: prix: outliers');
    const lines = stepsToPandas(
      [
        { kind: 'replace', column: 0, from: '€', to: '', mode: 'contains' },
        { kind: 'replace', column: 0, from: '(\\d+)kg', to: '$1', mode: 'regex' },
        { kind: 'fillUp', column: 2 },
        { kind: 'fillValue', column: 1, value: '0' },
        { kind: 'dropRows', rows: [4, 9], label: 'x' },
      ],
      cols,
      () => false,
    );
    assert.deepEqual(lines, [
      'df["prix"] = df["prix"].str.replace("€", "", regex=False)',
      'df["prix"] = df["prix"].str.replace("(\\\\d+)kg", "\\\\1", regex=True)',
      'df["n"] = df["n"].bfill()',
      'df["k"] = df["k"].fillna("0")',
      'df = df.drop(index=[4, 9], errors="ignore")  # x',
    ]);
  });
});
