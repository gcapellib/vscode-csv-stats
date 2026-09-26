import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parse } from '../core/csv';
import { computeAll } from '../core/stats';

function column(text: string) {
  return computeAll(parse(text))[0];
}

function series(values: number[]) {
  return column('v\n' + values.map((value) => `${value}\n`).join(''));
}

describe('statistiques descriptives', () => {
  it('donne moyenne et médiane sur une série impaire', () => {
    const stats = series([1, 2, 3, 4, 5]);
    assert.equal(stats.mean, 3);
    assert.equal(stats.median, 3);
    assert.equal(stats.q1, 2);
    assert.equal(stats.q3, 4);
  });

  it('interpole la médiane d’une série paire', () => {
    // Entre 2 et 3 : la médiane n'est aucune des valeurs observées.
    assert.equal(series([1, 2, 3, 4]).median, 2.5);
  });

  it('compte les répétitions sans les déplier', () => {
    // 1 répété trois fois : la médiane doit tomber sur 1, pas sur 2.
    const stats = column('v\n1\n1\n1\n2\n5\n');
    assert.equal(stats.median, 1);
    assert.equal(stats.mean, 2);
  });

  it('calcule un écart-type d’échantillon', () => {
    // Série 2,4,4,4,5,5,7,9 : écart-type d'échantillon = 2,138…
    const stats = series([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.equal(stats.mean, 5);
    assert.ok(Math.abs((stats.deviation ?? 0) - 2.13809) < 1e-4, String(stats.deviation));
  });

  it('ne prétend à aucune dispersion sur une valeur unique', () => {
    const stats = series([7]);
    assert.equal(stats.deviation, 0);
    assert.equal(stats.median, 7);
  });

  it('repère les valeurs aberrantes au-delà de 1,5 écart interquartile', () => {
    const stats = series([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 200]);
    assert.equal(stats.outliers, 1);
    assert.ok((stats.median ?? 0) < 20, 'la médiane ne doit pas suivre l’aberration');
  });

  it('laisse une colonne texte sans statistiques', () => {
    const stats = column('ville\nLyon\nNantes\n');
    assert.equal(stats.mean, null);
    assert.equal(stats.median, null);
    assert.equal(stats.deviation, null);
  });
});
