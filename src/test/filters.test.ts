import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  cellMatches,
  compareFilter,
  datasetTransformLines,
  filterToPandas,
  textFilter,
  type CompareOp,
  type Filter,
  type TextOp,
} from '../core/filters';
import { decideType } from '../core/types';
import { parseNumber } from '../core/types';

describe('filterToPandas', () => {
  it('ajoute les vides à une plage numérique, que NaN ne satisferait pas', () => {
    const range: Filter = { kind: 'range', column: 0, low: 100, high: 200, last: true, blank: true, label: '' };
    assert.equal(
      filterToPandas(range, 'prix'),
      'df = df[(df["prix"].between(100, 200)) | df["prix"].isna() | df["prix"].astype(str).str.strip().eq("")]',
    );
    // Sans les vides, la traduction ne change pas.
    const plain: Filter = { kind: 'range', column: 0, low: 100, high: 200, last: true, label: '' };
    assert.equal(filterToPandas(plain, 'prix'), 'df = df[df["prix"].between(100, 200)]');
  });

  it('traduit « (blank) » par isna, puisque pandas lit une cellule vide comme NaN', () => {
    // « == "" » ne retrouvait aucune ligne : le filtre généré ne reproduisait
    // pas celui du tableau.
    const blank: Filter = { kind: 'values', column: 0, values: [''], label: '' };
    assert.equal(filterToPandas(blank, 'cave'), 'df = df[df["cave"].isna() | df["cave"].astype(str).str.strip().eq("")]');
    const mixed: Filter = { kind: 'values', column: 0, values: ['Lyon', ''], label: '' };
    assert.equal(
      filterToPandas(mixed, 'ville'),
      'df = df[(df["ville"] == "Lyon") | df["ville"].isna() | df["ville"].astype(str).str.strip().eq("")]',
    );
  });

  it('traduit les conditions texte, sans regex ni « nan » parasite', () => {
    const pandas = (op: TextOp, blank?: 'add' | 'exclude') =>
      filterToPandas(textFilter(0, 'ville', op, 'Lyon', blank), 'ville');
    const series = 'df["ville"].astype("string")';
    assert.equal(pandas('contains'), `df = df[${series}.str.contains("Lyon", case=False, regex=False, na=False)]`);
    assert.equal(pandas('notContains'), `df = df[~${series}.str.contains("Lyon", case=False, regex=False, na=False)]`);
    assert.equal(pandas('startsWith'), `df = df[${series}.str.lower().str.startswith("lyon", na=False)]`);
    assert.equal(pandas('endsWith'), `df = df[${series}.str.lower().str.endswith("lyon", na=False)]`);
    assert.equal(pandas('equals'), `df = df[${series}.str.lower().eq("lyon").fillna(False)]`);
    assert.equal(pandas('notEquals'), `df = df[~${series}.str.lower().eq("lyon").fillna(False)]`);
    assert.match(pandas('contains', 'add'), /^df = df\[\(.*\) \| df\["ville"\]\.isna\(\)/);
    assert.match(pandas('notContains', 'exclude'), /\) & ~\(df\["ville"\]\.isna\(\)/);
  });

  it('traduit les comparaisons numériques', () => {
    const pandas = (op: CompareOp, a: number, b?: number) => filterToPandas(compareFilter(0, 'prix', op, a, b), 'prix');
    assert.equal(pandas('>', 100), 'df = df[df["prix"] > 100]');
    assert.equal(pandas('≥', 100), 'df = df[df["prix"] >= 100]');
    assert.equal(pandas('<', 100), 'df = df[df["prix"] < 100]');
    assert.equal(pandas('≤', 50), 'df = df[df["prix"] <= 50]');
    assert.equal(pandas('=', 7), 'df = df[df["prix"] == 7]');
    assert.equal(pandas('≠', 7), 'df = df[df["prix"] != 7]');
    // Bornes données à l'envers : le code produit les remet dans l'ordre.
    assert.equal(pandas('between', 9, 3), 'df = df[df["prix"].between(3, 9)]');
  });

  it('traduit « tout sauf » en négation', () => {
    const one: Filter = { kind: 'values', column: 0, values: ['Lyon'], exclude: true, label: '' };
    assert.equal(filterToPandas(one, 'ville'), 'df = df[df["ville"] != "Lyon"]');
    const several: Filter = { kind: 'values', column: 0, values: ['Lyon', 'Paris'], exclude: true, label: '' };
    assert.equal(filterToPandas(several, 'ville'), 'df = df[~df["ville"].isin(["Lyon","Paris"])]');
    const blank: Filter = { kind: 'values', column: 0, values: [''], exclude: true, label: '' };
    assert.equal(filterToPandas(blank, 'ville'), 'df = df[~(df["ville"].isna() | df["ville"].astype(str).str.strip().eq(""))]');
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

  it('traduit une borne unique et fermée en égalité', () => {
    const filter: Filter = { kind: 'range', column: 0, low: 7, high: 7, last: true, label: '' };
    assert.equal(filterToPandas(filter, 'quality_score'), 'df = df[df["quality_score"] == 7]');
  });

  it('ne traduit pas en égalité une classe d’histogramme dégénérée', () => {
    // Borne haute exclue : l'intervalle est vide, pas une valeur unique.
    const filter: Filter = { kind: 'range', column: 0, low: 7, high: 7, last: false, label: '' };
    assert.equal(
      filterToPandas(filter, 'quality_score'),
      'df = df[(df["quality_score"] >= 7) & (df["quality_score"] < 7)]',
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

describe('cellMatches', () => {
  const parse = (raw: string) => parseNumber(raw, false);
  const text = (op: TextOp, value: string, blank?: 'add' | 'exclude') => textFilter(0, 'c', op, value, blank) as Extract<Filter, { kind: 'text' }>;
  const compare = (op: CompareOp, a: number, b?: number, blank?: 'add' | 'exclude') =>
    compareFilter(0, 'c', op, a, b, blank) as Extract<Filter, { kind: 'compare' }>;

  it('applique les opérateurs texte sans tenir compte de la casse', () => {
    assert.ok(cellMatches('Studio à Lyon', text('startsWith', 'studio'), parse));
    assert.ok(!cellMatches('Studio à Lyon', text('startsWith', 'lyon'), parse));
    assert.ok(cellMatches('Studio à Lyon', text('endsWith', 'LYON'), parse));
    assert.ok(cellMatches('Studio à Lyon', text('notContains', 'paris'), parse));
    assert.ok(!cellMatches('Studio à Lyon', text('notContains', 'lyon'), parse));
    assert.ok(cellMatches('Lyon', text('equals', 'lyon'), parse));
    assert.ok(cellMatches('Lyon', text('notEquals', 'paris'), parse));
  });

  it('laisse les vides à la négation, comme pandas, sauf demande contraire', () => {
    assert.ok(cellMatches('', text('notContains', 'x'), parse));
    assert.ok(!cellMatches('', text('contains', 'x'), parse));
    assert.ok(!cellMatches('', text('notContains', 'x', 'exclude'), parse));
    assert.ok(cellMatches('', text('contains', 'x', 'add'), parse));
  });

  it('applique les comparaisons numériques et leurs vides', () => {
    assert.ok(cellMatches('150', compare('>', 100), parse));
    assert.ok(!cellMatches('100', compare('>', 100), parse));
    assert.ok(cellMatches('100', compare('≥', 100), parse));
    assert.ok(cellMatches('50', compare('≤', 50), parse));
    assert.ok(cellMatches('7.0', compare('=', 7), parse));
    assert.ok(cellMatches('8', compare('≠', 7), parse));
    assert.ok(cellMatches('5', compare('between', 9, 3), parse));
    assert.ok(!cellMatches('', compare('>', 0), parse));
    assert.ok(cellMatches('', compare('>', 0, undefined, 'add'), parse));
    assert.ok(!cellMatches('', compare('≠', 0, undefined, 'exclude'), parse));
  });

  it('inverse une liste de valeurs avec « tout sauf »', () => {
    const except: Filter = { kind: 'values', column: 0, values: ['Lyon', ''], exclude: true, label: '' };
    assert.ok(!cellMatches('Lyon', except as never, parse));
    assert.ok(!cellMatches('  ', except as never, parse));
    assert.ok(cellMatches('Paris', except as never, parse));
  });
});

describe('colonnes identifiants', () => {
  it('lit un téléphone ou un code postal comme du texte', () => {
    // Le nom suffit : « 62909 » à « 999625132 » ne se compare pas.
    assert.equal(decideType(['62909', '999625132'], 2, false, 'contact.telephone'), 'text');
    assert.equal(decideType(['06000', '75001'], 2, false, 'ville'), 'text');
    assert.equal(decideType(['0612345678'], 1, false, 'x'), 'text');
  });

  it('garde les vraies mesures numériques', () => {
    assert.equal(decideType(['10', '250'], 2, false, 'prix'), 'numeric');
    assert.equal(decideType(['0.5', '0'], 2, false, 'ratio'), 'numeric');
    assert.equal(decideType(['1', '2'], 2, false, 'interval'), 'numeric');
  });
});
