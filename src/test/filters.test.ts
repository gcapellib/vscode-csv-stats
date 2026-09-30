import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { datasetTransformLines, filterToPandas, type Filter } from '../core/filters';

describe('filterToPandas', () => {
  it('traduit un filtre texte en str.contains', () => {
    const filter: Filter = { kind: 'contains', column: 0, text: 'lyon', label: '' };
    assert.equal(
      filterToPandas(filter, 'departure'),
      'df = df[df["departure"].astype(str).str.contains("lyon", case=False, na=False)]',
    );
  });

  it('traduit une seule valeur en égalité', () => {
    const filter: Filter = { kind: 'values', column: 0, values: ['Lyon'], label: '' };
    assert.equal(filterToPandas(filter, 'departure'), 'df = df[df["departure"] == "Lyon"]');
  });

  it('traduit plusieurs valeurs en isin', () => {
    const filter: Filter = { kind: 'values', column: 0, values: ['Lyon', 'Paris'], label: '' };
    assert.equal(filterToPandas(filter, 'departure'), 'df = df[df["departure"].isin(["Lyon","Paris"])]');
  });

  it('traduit une plage dont la dernière classe inclut sa borne haute en between', () => {
    const filter: Filter = { kind: 'range', column: 0, low: 0, high: 10, last: true, label: '' };
    assert.equal(filterToPandas(filter, 'delay_min'), 'df = df[df["delay_min"].between(0, 10)]');
  });

  it("traduit une plage qui n'inclut pas sa borne haute en comparaison bornée", () => {
    const filter: Filter = { kind: 'range', column: 0, low: 0, high: 10, last: false, label: '' };
    assert.equal(
      filterToPandas(filter, 'delay_min'),
      'df = df[(df["delay_min"] >= 0) & (df["delay_min"] < 10)]',
    );
  });

  it('traduit le constat de doublons sans référencer aucune colonne', () => {
    const filter: Filter = { kind: 'duplicates', column: -1, rows: new Set(), label: '' };
    assert.equal(filterToPandas(filter, 'peu importe'), 'df = df[df.duplicated(keep=False)]');
  });
});

describe('datasetTransformLines', () => {
  it('ne produit rien sans transformation active', () => {
    assert.deepEqual(datasetTransformLines({ renamed: [], dropped: [], filters: [], sort: null }), []);
  });

  it('enchaîne renommage, retrait, filtres puis tri, dans cet ordre', () => {
    const filter: Filter = { kind: 'values', column: 2, values: ['Lyon'], label: 'gare_depart = Lyon' };
    const lines = datasetTransformLines({
      renamed: [{ original: 'departure', current: 'gare_depart' }],
      dropped: ['note'],
      filters: [{ filter, columnName: 'gare_depart' }],
      sort: { columnName: 'delay_min', ascending: false },
    });
    const text = lines.join('\n');

    const renameAt = text.indexOf('df.rename');
    const dropAt = text.indexOf('df.drop');
    const filterAt = text.indexOf('df[df["gare_depart"]');
    const sortAt = text.indexOf('df.sort_values');
    assert.ok(renameAt < dropAt && dropAt < filterAt && filterAt < sortAt, text);

    assert.ok(text.includes('df = df.rename(columns={"departure": "gare_depart"})'));
    assert.ok(text.includes('df = df.drop(columns=["note"])'));
    assert.ok(text.includes('# gare_depart = Lyon'));
    assert.ok(text.includes('df = df.sort_values("delay_min", ascending=False)'));
  });

  it("n'émet un bloc que pour les transformations réellement actives", () => {
    const lines = datasetTransformLines({
      renamed: [],
      dropped: [],
      filters: [],
      sort: { columnName: 'delay_min', ascending: true },
    });
    const text = lines.join('\n');
    assert.ok(!text.includes('rename'));
    assert.ok(!text.includes('drop'));
    assert.ok(!text.includes('Matching the filters'));
    assert.ok(text.includes('sort_values'));
  });
});
