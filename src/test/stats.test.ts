import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parse } from '../core/csv';
import { compute, computeAll, foldRanking, HISTOGRAM_BINS, parseNumber, TOP_VALUES, BAND_ROWS } from '../core/stats';

function statsOf(text: string) {
  return computeAll(parse(text));
}

describe('StatsComputer', () => {
  it('détecte une colonne numérique avec min, max et histogramme', () => {
    const stats = statsOf('prix\n10\n20\n30\n')[0];
    assert.equal(stats.type, 'numeric');
    assert.equal(stats.min, 10);
    assert.equal(stats.max, 30);
    assert.equal(stats.histogram.length, HISTOGRAM_BINS);
    assert.equal(sum(stats.histogram), 3);
    assert.equal(stats.top.length, 0);
  });

  it('force le type en texte, même si tout est numérique', () => {
    const forced = compute(parse('prix\n10\n20\n30\n'), 0, 'text');
    assert.equal(forced.type, 'text');
    assert.equal(forced.min, null);
    assert.equal(forced.top.length, 3);
  });

  it('force le type en numérique sur les seules valeurs lisibles', () => {
    // Un forçage manuel ne peut pas exiger que tout soit numérique : c'est
    // précisément parce que la colonne ne l'est pas tout à fait qu'on force.
    const forced = compute(parse('prix\n10\nn d\n30\n'), 0, 'numeric');
    assert.equal(forced.type, 'numeric');
    assert.equal(forced.min, 10);
    assert.equal(forced.max, 30);
    assert.equal(sum(forced.histogram), 2);
    assert.equal(forced.distinct, 3);
  });

  it('classe par fréquence décroissante', () => {
    const stats = statsOf('ville\nLyon\nLyon\nLyon\nNantes\nNantes\nBrest\nCaen\n')[0];
    assert.equal(stats.type, 'text');
    assert.deepEqual(
      stats.top.map((entry) => entry.value),
      ['Lyon', 'Nantes', 'Brest', 'Caen'],
    );
    assert.deepEqual(
      stats.top.map((entry) => entry.count),
      [3, 2, 1, 1],
    );
    assert.equal(stats.min, null);
  });

  it('en envoie autant que le bandeau a de lignes, pas une de plus', () => {
    // Le bandeau réserve sept lignes : au-delà, les valeurs envoyées ne
    // seraient jamais affichées et ne feraient qu'alourdir chaque message.
    const villes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const stats = statsOf(`ville\n${villes.join('\n')}\n`)[0];
    assert.equal(TOP_VALUES, 7);
    assert.equal(stats.top.length, 7);
    assert.equal(stats.distinct, 10);
  });

  it('regroupe le reste sous Other pour totaliser 100 %', () => {
    const villes = ['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const stats = statsOf(`ville\n${villes.join('\n')}\n`)[0];
    assert.equal(stats.present, 9);
    // Sept valeurs retenues (A×2, B, C, D, E, F, G) ; restent H et… rien d'autre.
    assert.equal(stats.otherCount, 1);
    const total = stats.top.reduce((acc, entry) => acc + entry.share, 0) + stats.otherShare;
    assert.ok(Math.abs(total - 1) < 1e-9, `total des parts : ${total}`);
  });

  it('laisse Other à zéro quand il n’y a rien à regrouper', () => {
    const stats = statsOf('ville\nLyon\nNantes\nBrest\n')[0];
    assert.equal(stats.otherCount, 0);
    assert.equal(stats.otherShare, 0);
  });

  it('compte les valeurs manquantes et les exclut des distinctes', () => {
    const stats = statsOf('ville,pays\nLyon,FR\n,FR\nLyon,FR\n   ,FR\nNantes,FR\n')[0];
    assert.equal(stats.total, 5);
    assert.equal(stats.missing, 2);
    assert.equal(stats.present, 3);
    assert.equal(stats.distinct, 2);
  });

  it('garde numérique une colonne trouée', () => {
    const stats = statsOf('prix,pays\n10,FR\n,FR\n30,FR\n')[0];
    assert.equal(stats.type, 'numeric');
    assert.equal(stats.missing, 1);
    assert.equal(sum(stats.histogram), 2);
  });

  it('bascule en texte dès une seule valeur non numérique', () => {
    assert.equal(statsOf('prix\n10\n20\nn d\n')[0].type, 'text');
  });

  it('traite une colonne entièrement vide comme du texte sans top', () => {
    const stats = statsOf('a,b\n1,\n2,\n')[1];
    assert.equal(stats.type, 'text');
    assert.equal(stats.missing, 2);
    assert.equal(stats.distinct, 0);
    assert.equal(stats.top.length, 0);
    assert.equal(stats.distinctShare, 0);
  });

  it('reconnaît la virgule décimale dans un fichier à point-virgule', () => {
    const stats = statsOf('ville;surface\nLyon;47,9\nNantes;65,2\n')[1];
    assert.equal(stats.type, 'numeric');
    assert.equal(stats.min, 47.9);
    assert.equal(stats.max, 65.2);
  });

  it('ignore la virgule décimale dans un fichier à virgule', () => {
    assert.equal(parseNumber('47,9', false), null);
    assert.equal(parseNumber('47,9', true), 47.9);
  });

  it('tolère les espaces de milliers, y compris insécables', () => {
    assert.equal(parseNumber('1 234 567', false), 1234567);
    assert.equal(parseNumber('1 234 567', false), 1234567);
    assert.equal(parseNumber('1 234 567', false), 1234567);
  });

  it('rejette les formes trompeuses', () => {
    for (const candidate of ['1f', '0x1A', 'NaN', 'Infinity', '1.2.3', '12-', '']) {
      assert.equal(parseNumber(candidate, false), null, `« ${candidate} » ne doit pas être un nombre`);
    }
    assert.equal(parseNumber('-1.5e3', false), -1500);
  });

  it('concentre une colonne constante dans la première classe', () => {
    const stats = statsOf('prix\n5\n5\n5\n')[0];
    assert.equal(stats.histogram[0], 3);
    assert.equal(sum(stats.histogram), 3);
  });

  it('signale une colonne dont chaque valeur est unique', () => {
    // Ce n'est pas un type : c'est un constat de répartition, qui prévient que
    // le palmarès affiché juste en dessous ne hiérarchise rien.
    const unique = 'ref\n' + Array.from({ length: 30 }, (_, i) => `A-${i}\n`).join('');
    assert.equal(statsOf(unique)[0].allDistinct, true);
    assert.equal(statsOf('ville\nLyon\nLyon\nNantes\n')[0].allDistinct, false);
    // Sur trois lignes, « toutes distinctes » ne veut rien dire.
    assert.equal(statsOf('ville\nLyon\nNantes\nBrest\n')[0].allDistinct, false);
  });

  it('remplit chaque classe du min au max', () => {
    // Le doublon est indispensable : sans lui, vingt entiers tous distincts
    // seraient un identifiant, l'histogramme serait vide, et l'assertion
    // passerait à vide — « toutes les classes valent 1 » est vrai d'un tableau
    // sans classe.
    const values = [...Array.from({ length: HISTOGRAM_BINS }, (_, index) => index), 0];
    const stats = statsOf('prix\n' + values.map((value) => `${value}\n`).join(''))[0];
    assert.equal(stats.type, 'numeric');
    assert.equal(stats.histogram.length, HISTOGRAM_BINS);
    assert.equal(stats.histogram[0], 2);
    assert.ok(
      stats.histogram.slice(1).every((value) => value === 1),
      stats.histogram.join(','),
    );
  });
});

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe('foldRanking', () => {
  const share = (value: string, count: number) => ({ value, count, share: 0 });

  it("affiche tout et n'ajoute pas Other quand ça rentre sans reste", () => {
    const top = ['A', 'B', 'C'].map((v) => share(v, 1));
    const result = foldRanking(top, 0, 3);
    assert.equal(result.shown.length, 3);
    assert.equal(result.otherCount, 0);
    assert.equal(result.otherShare, 0);
  });

  it('réserve la dernière place à Other dès qu’il reste quelque chose', () => {
    // Comme le fournit vraiment computeAll : top déjà tronqué à sept entrées
    // (A..G), otherCount portant ce qui reste au-delà (H, I, J => 3).
    const top = 'ABCDEFG'.split('').map((v) => share(v, 1));
    const result = foldRanking(top, 3, 10);
    assert.equal(BAND_ROWS, 7);
    assert.equal(result.shown.length, 6);
    assert.deepEqual(
      result.shown.map((s) => s.value),
      ['A', 'B', 'C', 'D', 'E', 'F'],
    );
    // G plie dans Other, pas seulement H/I/J qui y étaient déjà.
    assert.equal(result.otherCount, 4);
    assert.equal(result.otherShare, 0.4);
  });

  it("plie l'excédent même si l'appelant fournit un top plus long que le budget", () => {
    // La fonction doit garantir la limite elle-même : dix valeurs dans top et
    // un otherCount à zéro ne doivent pas produire plus de sept lignes.
    const top = 'ABCDEFGHIJ'.split('').map((v) => share(v, 1));
    const result = foldRanking(top, 0, 10);
    assert.equal(result.shown.length, 6);
    assert.equal(result.otherCount, 4);
  });

  it('affiche les sept valeurs sans Other quand il y en a exactement sept', () => {
    const top = 'ABCDEFG'.split('').map((v) => share(v, 1));
    const result = foldRanking(top, 0, 7);
    assert.equal(result.shown.length, 7);
    assert.equal(result.otherCount, 0);
  });

  it('respecte un budget de lignes différent, si on le lui donne', () => {
    const top = 'ABC'.split('').map((v) => share(v, 1));
    const result = foldRanking(top, 2, 5, 3);
    assert.equal(result.shown.length, 2);
    assert.equal(result.otherCount, 3);
  });
});
