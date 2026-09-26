import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parse } from '../core/csv';
import { computeAll } from '../core/stats';
import { detectDateOrder, parseDate } from '../core/types';

function typeOf(text: string, column = 0) {
  return computeAll(parse(text))[column];
}

describe('détection de type', () => {
  it('reconnaît un booléen, quelle que soit la casse ou la langue', () => {
    assert.equal(typeOf('cancelled\nYes\nNo\nNo\nYes\n').type, 'boolean');
    assert.equal(typeOf('actif\ntrue\nfalse\ntrue\n').type, 'boolean');
    assert.equal(typeOf('actif\noui\nnon\noui\n').type, 'boolean');
  });

  it('préfère booléen à numérique pour une colonne de 0 et 1', () => {
    // Sans cette priorité, une colonne d'indicateurs passerait pour une mesure
    // et se verrait affubler d'un histogramme de deux barres.
    assert.equal(typeOf('flag\n0\n1\n1\n0\n').type, 'boolean');
  });

  it('reconnaît les dates ISO et en tire une plage', () => {
    const stats = typeOf('date\n2026-01-15\n2026-06-30\n2026-12-01\n');
    assert.equal(stats.type, 'date');
    assert.equal(stats.min, Date.UTC(2026, 0, 15));
    assert.equal(stats.max, Date.UTC(2026, 11, 1));
    assert.equal(stats.histogram.length, 20);
  });

  it('reconnaît les dates à barres obliques, jour en tête', () => {
    const stats = typeOf('date\n15/01/2026\n30/06/2026\n01/12/2026\n');
    assert.equal(stats.type, 'date');
    assert.equal(stats.min, Date.UTC(2026, 0, 15));
  });

  it('tranche l’ordre jour-mois sur la colonne, pas sur la valeur', () => {
    // 03/04 est lisible des deux façons ; c'est 25/12 qui tranche.
    assert.equal(detectDateOrder(['03/04/2026', '25/12/2026']), 'dmy');
    assert.equal(detectDateOrder(['03/04/2026', '12/25/2026']), 'mdy');
    // Faute d'indice, on retient l'ordre majoritaire hors des États-Unis.
    assert.equal(detectDateOrder(['03/04/2026', '05/06/2026']), 'dmy');
    // Les deux composantes dépassent 12 : ce ne sont pas des dates.
    assert.equal(detectDateOrder(['25/04/2026', '03/25/2026']), null);
  });

  it('rejette une date impossible plutôt que de la décaler', () => {
    // Date.UTC ferait du 31 février un 3 mars, sans rien signaler.
    assert.equal(parseDate('2026-02-31', 'iso'), null);
    assert.equal(parseDate('2026-13-01', 'iso'), null);
    assert.equal(parseDate('2026-02-28', 'iso'), Date.UTC(2026, 1, 28));
  });

  it('reconnaît un identifiant entier entièrement distinct', () => {
    const text = 'trip_id\n' + Array.from({ length: 30 }, (_, index) => `${10001 + index}\n`).join('');
    const stats = typeOf(text);
    assert.equal(stats.type, 'id');
    // Ni histogramme ni palmarès : les deux mentiraient sur un identifiant.
    assert.equal(stats.histogram.length, 0);
    assert.equal(stats.top.length, 0);
  });

  it('ne prend pas une mesure entière pour un identifiant', () => {
    // Quarante entiers tous distincts — mais de largeur variable et sous un nom
    // de mesure : c'est un retard, pas une numérotation.
    const text = 'delay\n' + Array.from({ length: 40 }, (_, index) => `${index * 3}\n`).join('');
    assert.equal(typeOf(text).type, 'numeric');
  });

  it('reconnaît un identifiant à son nom, même de largeur variable', () => {
    const text = 'order_id\n' + Array.from({ length: 40 }, (_, index) => `${index * 3}\n`).join('');
    assert.equal(typeOf(text).type, 'id');
  });

  it('ne prend pas une mesure décimale pour un identifiant', () => {
    const text = 'surface\n' + Array.from({ length: 30 }, (_, index) => `${10 + index / 7}\n`).join('');
    assert.equal(typeOf(text).type, 'numeric');
  });

  it('ne crie pas à l’identifiant sur une poignée de lignes', () => {
    assert.equal(typeOf('ville\nLyon\nNantes\nBrest\n').type, 'categorical');
  });

  it('ne prend pas un commentaire libre pour une référence', () => {
    // Trois cents commentaires tous distincts : distincts ne veut pas dire
    // identifiants. Ce qui les sépare, c'est l'espace interne.
    const text = 'note\n' + Array.from({ length: 300 }, (_, i) => `commentaire libre numero ${i}\n`).join('');
    assert.equal(typeOf(text).type, 'text');
  });

  it('reconnaît une référence régulière et sans espace', () => {
    const text = 'reference\n' + Array.from({ length: 300 }, (_, i) => `A-${String(i).padStart(5, '0')}\n`).join('');
    assert.equal(typeOf(text).type, 'id');
  });

  it('sépare une nomenclature d’un texte libre', () => {
    const few = 'ville\n' + Array.from({ length: 200 }, (_, i) => ['Lyon', 'Nantes', 'Brest'][i % 3] + '\n').join('');
    assert.equal(typeOf(few).type, 'categorical');
    const many = 'note\n' + Array.from({ length: 200 }, (_, i) => `commentaire libre numero ${i % 60}\n`).join('');
    assert.equal(typeOf(many).type, 'text');
  });

  it('classe la colonne date d’un fichier réaliste', () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      `${1000 + i};2026-0${(i % 9) + 1}-1${i % 9};Lyon;${i % 2 ? 'Yes' : 'No'};${i * 3}\n`,
    ).join('');
    const stats = computeAll(parse('trip_id;date;ville;cancelled;delay\n' + rows));
    assert.deepEqual(
      stats.map((column) => column.type),
      ['id', 'date', 'categorical', 'boolean', 'numeric'],
    );
  });
});
