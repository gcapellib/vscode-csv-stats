import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parse } from '../core/csv';
import { computeAll } from '../core/stats';

/**
 * Charge de référence : 100 000 lignes, le volume cible.
 *
 * Le test ne pose pas de seuil de temps — une machine de build n'est pas un
 * chronomètre fiable — mais il affiche les durées mesurées, faute de quoi une
 * régression de performance passerait inaperçue.
 */
describe('charge', () => {
  it('parse et analyse cent mille lignes', () => {
    const lines: string[] = ['id;ville;surface;commentaire'];
    for (let row = 0; row < 100_000; row++) {
      const ville = ['Lyon', 'Nantes', 'Brest', 'Caen'][row % 4];
      const surface = row % 50 === 0 ? '' : `${20 + (row % 180)},${row % 10}`;
      lines.push(`${row};${ville};${surface};"note ${row}, suite"`);
    }
    const text = lines.join('\n') + '\n';

    const beforeParse = performance.now();
    const table = parse(text);
    const parseMs = Math.round(performance.now() - beforeParse);

    assert.equal(table.delimiter, ';');
    assert.equal(table.rows.length, 100_000);
    assert.equal(table.headers.length, 4);
    assert.equal(table.rows[0][3], 'note 0, suite');

    const beforeStats = performance.now();
    const stats = computeAll(table);
    const statsMs = Math.round(performance.now() - beforeStats);

    assert.equal(stats[0].type, 'numeric');
    assert.equal(stats[0].allDistinct, true);
    assert.equal(stats[1].type, 'text');
    assert.equal(stats[2].type, 'numeric');
    assert.equal(stats[2].missing, 2_000);

    console.log(`100 000 lignes : parsing ${parseMs} ms, statistiques ${statsMs} ms`);
  });
});
