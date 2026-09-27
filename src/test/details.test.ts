import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parse } from '../core/csv';
import { computeDataset, computeDetails, readCsvSnippet } from '../core/details';
import { computeAll } from '../core/stats';

function detailsOf(text: string, column = 0) {
  const table = parse(text);
  const stats = computeAll(table);
  return { table, stats, details: computeDetails(table, column, stats[column].type) };
}

describe('analyse approfondie', () => {
  it('sépare une cellule vide d’une cellule d’espaces', () => {
    // Ce ne sont pas la même erreur : l'une est une absence, l'autre une saisie.
    // Deux colonnes sont indispensables : sur un fichier mono-colonne, une ligne
    // vide est ignorée par le parseur et ne produit aucune cellule.
    const { details } = detailsOf('ville,pays\nLyon,FR\n,FR\n   ,FR\nNantes,FR\n');
    assert.equal(details.empty, 1);
    assert.equal(details.whitespaceOnly, 1);
  });

  it('repère les absences déguisées et dit lesquelles pandas connaît déjà', () => {
    const { details } = detailsOf('prix\n10\nNULL\n-\n30\n');
    const tokens = Object.fromEntries(details.nullTokens.map((token) => [token.value, token.known]));
    assert.equal(tokens['NULL'], true, 'pandas écarte NULL par défaut');
    assert.equal(tokens['-'], false, 'pandas ignore le tiret : il faut le lui donner');
    assert.equal(details.effectiveMissing, 2);
  });

  it('annonce le type que pandas donnerait, et ce qui le bloque', () => {
    const { details } = detailsOf('prix\n10\nNULL\n30\n');
    assert.equal(details.pandasType, 'object');
    assert.ok(
      details.blockers.some((note) => note.includes('would be numeric')),
      details.blockers.join(' | '),
    );
  });

  it('avertit des zéros de tête, que pandas mangerait', () => {
    const { details } = detailsOf('code\n007\n042\n100\n');
    assert.equal(details.leadingZeros, true);
    assert.ok(details.blockers.some((note) => note.includes('leading zeros')));
  });

  it('compte les valeurs qui ne diffèrent que par la casse ou un espace', () => {
    const { details } = detailsOf('ville\nParis\nparis\nPARIS\nLyon\n');
    assert.equal(details.caseVariants, 3);
    const padded = detailsOf('ville\nParis \nLyon\n').details;
    assert.equal(padded.spacePadded, 1);
  });

  it('compte les valeurs vues une seule fois', () => {
    // Lyon revient trois fois, Nantes une : une seule valeur est unique.
    assert.equal(detailsOf('ville\nLyon\nLyon\nLyon\nNantes\n').details.singletons, 1);
    // Une nomenclature régulière n'en a aucune, et c'est l'information utile :
    // « présentes moins distinctes » aurait annoncé 7 190 doublons sur une
    // colonne parfaitement saine.
    const regular = 'g\n' + Array.from({ length: 60 }, (_, i) => `${['A', 'B', 'C'][i % 3]}\n`).join('');
    assert.equal(detailsOf(regular).details.singletons, 0);
  });

  it('mesure les longueurs de texte', () => {
    const { details } = detailsOf('note\nab\nabcd\nabcdef\n');
    assert.equal(details.minLength, 2);
    assert.equal(details.maxLength, 6);
    assert.equal(details.meanLength, 4);
  });

  it('compte les lignes entièrement dupliquées', () => {
    const text = 'a,b\n1,2\n1,2\n3,4\n1,2\n';
    const table = parse(text);
    const details = table.headers.map((_, index) => computeDetails(table, index, computeAll(table)[index].type));
    assert.equal(computeDataset(table, details).duplicateRows, 2);
  });

  it('produit un read_csv qui reprend ce qui a été détecté', () => {
    const table = parse('ville;prix\nLyon;47,5\nNantes;-\n');
    const stats = computeAll(table);
    const details = table.headers.map((_, index) => computeDetails(table, index, stats[index].type));
    const snippet = readCsvSnippet('trajets.csv', table, computeDataset(table, details));
    assert.ok(snippet.includes('sep=";"'), snippet);
    assert.ok(snippet.includes('decimal=","'), snippet);
    assert.ok(snippet.includes('na_values=["-"]'), snippet);
    // NULL n'a pas à y figurer : pandas l'écarte déjà.
    assert.ok(!snippet.includes('"NULL"'), snippet);
  });
});
