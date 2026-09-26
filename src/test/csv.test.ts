import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decode, detectDelimiter, parse } from '../core/csv';

describe('CsvLoader', () => {
  it('lit un CSV simple à virgule', () => {
    const table = parse('ville,habitants\nLyon,520000\nNantes,320000\n');
    assert.equal(table.delimiter, ',');
    assert.deepEqual(table.headers, ['ville', 'habitants']);
    assert.equal(table.rows.length, 2);
    assert.equal(table.rows[0][0], 'Lyon');
    assert.equal(table.rows[1][1], '320000');
    assert.equal(table.truncated, false);
  });

  it('garde une virgule contenue dans un champ entre guillemets', () => {
    const table = parse('ville,adresse\nLyon,"12, rue de la Paix"\n');
    assert.equal(table.headers.length, 2);
    assert.equal(table.rows[0][1], '12, rue de la Paix');
  });

  it('gère les guillemets échappés et un saut de ligne dans un champ', () => {
    const table = parse('cle,note\na,"il a dit ""oui"""\nb,"deux\nlignes"\n');
    assert.equal(table.rows.length, 2);
    assert.equal(table.rows[0][1], 'il a dit "oui"');
    assert.equal(table.rows[1][1], 'deux\nlignes');
  });

  it('détecte le point-virgule', () => {
    const table = parse('ville;surface\nLyon;47,9\nNantes;65,2\n');
    assert.equal(table.delimiter, ';');
    assert.deepEqual(table.headers, ['ville', 'surface']);
    assert.equal(table.rows[0][1], '47,9');
  });

  it('ne laisse pas la virgule décimale prendre le pas sur le point-virgule', () => {
    // Chaque ligne porte plus de virgules que de points-virgules, mais seul le
    // point-virgule découpe un nombre constant de colonnes.
    assert.equal(detectDelimiter('a;b;c\n1,5;2,5;3,5\n4,5;5,5;6,5\n'), ';');
  });

  it('complète les lignes plus courtes que l’en-tête', () => {
    const table = parse('a,b,c\n1,2\n');
    assert.equal(table.headers.length, 3);
    assert.equal(table.rows[0][2], '');
  });

  it('retire le BOM UTF-8', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('ville,habitants\nLyon,520000\n')]);
    const table = parse(decode(bytes));
    assert.equal(table.headers[0], 'ville');
  });

  it('nomme les en-têtes vides', () => {
    const table = parse('ville,\nLyon,1\n');
    assert.deepEqual(table.headers, ['ville', 'column 2']);
  });

  it('ignore les lignes entièrement blanches', () => {
    // Ni la ligne blanche intercalée, ni le saut de ligne final ne doivent créer
    // de ligne fantôme.
    const table = parse('a,b\n1,2\n\n3,4\n\n');
    assert.equal(table.rows.length, 2);
    assert.equal(table.rows[1][0], '3');
  });

  it('gère les fins de ligne Windows', () => {
    const table = parse('a,b\r\n1,2\r\n3,4\r\n');
    assert.equal(table.rows.length, 2);
    assert.deepEqual(table.rows[0], ['1', '2']);
  });

  it('signale la troncature au-delà de la limite', () => {
    const text = 'n\n' + Array.from({ length: 10 }, (_, index) => `${index}\n`).join('');
    const table = parse(text, ',', 4);
    assert.equal(table.rows.length, 4);
    assert.equal(table.truncated, true);
  });

  it('rend une table vide pour un fichier vide', () => {
    const table = parse('');
    assert.equal(table.headers.length, 0);
    assert.equal(table.rows.length, 0);
  });
});
