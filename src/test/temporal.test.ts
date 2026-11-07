import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parse } from '../core/csv';
import { computeDataset, computeDetails, readCsvSnippet } from '../core/details';
import { compareFilter, filterToPandas } from '../core/filters';
import { computeAll } from '../core/stats';
import { detectTemporal, formatTemporal, pandasTemporal, parseTemporal, parseTyped, temporalFormatFor } from '../core/temporal';

const DAY = 86_400_000;

describe('lecture des dates', () => {
  it('lit ISO, jour/mois/an et les heures, en millisecondes UTC', () => {
    assert.equal(parseTemporal('2015-01-31', 'ymd'), Date.UTC(2015, 0, 31));
    assert.equal(parseTemporal('2015/01/31 12:30', 'ymd'), Date.UTC(2015, 0, 31, 12, 30));
    assert.equal(parseTemporal('2015-01-31T12:30:15.250', 'ymd'), Date.UTC(2015, 0, 31, 12, 30, 15, 250));
    assert.equal(parseTemporal('31/01/2015', 'dmy'), Date.UTC(2015, 0, 31));
    assert.equal(parseTemporal('31.01.2015', 'dmy'), Date.UTC(2015, 0, 31));
    assert.equal(parseTemporal('12:52:01', 'time'), ((12 * 60 + 52) * 60 + 1) * 1000);
  });

  it('refuse les dates et heures impossibles', () => {
    assert.equal(parseTemporal('2015-02-30', 'ymd'), null);
    assert.equal(parseTemporal('31/13/2015', 'dmy'), null);
    assert.equal(parseTemporal('25:00', 'time'), null);
    // Séparateurs mélangés : ce n'est plus une écriture de date.
    assert.equal(parseTemporal('31/01-2015', 'dmy'), null);
  });
});

describe('détection', () => {
  it("reconnaît l'ISO et les heures sans condition", () => {
    assert.deepEqual(detectTemporal(['2015-01-01', '2015-03-04']), { order: 'ymd', withTime: false });
    assert.deepEqual(detectTemporal(['2015-01-01 10:00']), { order: 'ymd', withTime: true });
    assert.deepEqual(detectTemporal(['11:38:36', '12:52']), { order: 'time', withTime: true });
  });

  it("ne retient jour/mois/an que si une valeur tranche", () => {
    assert.deepEqual(detectTemporal(['01/02/2015', '25/02/2015']), { order: 'dmy', withTime: false });
    // 01/02/2015 seul : 1er février ou 2 janvier ? On ne parie pas.
    assert.equal(detectTemporal(['01/02/2015', '03/04/2015']), null);
    // L'écriture américaine n'est pas lue : 01/31 n'a pas de mois 31.
    assert.equal(detectTemporal(['01/31/2015', '02/15/2015']), null);
  });

  it("garde la colonne en date sous un filtre qui ne laisse que des jours ≤ 12", () => {
    assert.deepEqual(temporalFormatFor(['01/02/2015', '03/04/2015'], 'date'), { order: 'dmy', withTime: false });
  });

  it('fait passer une colonne de dates avant la règle des zéros de tête', () => {
    const [orders] = computeAll(parse('date\n01/01/2015\n15/01/2015\n03/02/2015\n'));
    assert.equal(orders.type, 'date');
    assert.deepEqual(orders.temporal, { order: 'dmy', withTime: false });
    assert.equal(orders.min, Date.UTC(2015, 0, 1));
    assert.equal(orders.max, Date.UTC(2015, 1, 3));
    assert.equal(orders.median, Date.UTC(2015, 0, 15));
    assert.equal(orders.top.length, 0);
  });

  it('reconnaît une colonne d\'heures', () => {
    // Deux colonnes : une ligne vide d'un fichier à une colonne est ignorée à la lecture.
    const [time] = computeAll(parse('time,qty\n11:38:36,1\n12:52:01,2\n,3\n'));
    assert.equal(time.type, 'time');
    assert.equal(time.missing, 1);
    assert.equal(time.min, ((11 * 60 + 38) * 60 + 36) * 1000);
  });

  it('laisse en texte une colonne dont une valeur ne se lit pas', () => {
    const [mixed] = computeAll(parse('date\n2015-01-01\nbientôt\n'));
    assert.equal(mixed.type, 'text');
    assert.equal(mixed.temporal, null);
  });
});

describe('affichage', () => {
  it('réécrit dans la convention du fichier', () => {
    const ms = Date.UTC(2015, 0, 31, 12, 30);
    assert.equal(formatTemporal(ms, { order: 'dmy', withTime: false }), '31/01/2015');
    assert.equal(formatTemporal(ms, { order: 'ymd', withTime: true }), '2015-01-31 12:30');
    assert.equal(formatTemporal(((12 * 60 + 52) * 60 + 1) * 1000, { order: 'time', withTime: true }), '12:52:01');
  });

  it("lit une date tapée dans l'écriture de la colonne, ou en ISO", () => {
    const dmy = { order: 'dmy' as const, withTime: false };
    assert.equal(parseTyped('15/03/2015', dmy), Date.UTC(2015, 2, 15));
    assert.equal(parseTyped('2015-03-15', dmy), Date.UTC(2015, 2, 15));
    assert.equal(parseTyped('demain', dmy), null);
  });
});

describe('pandas', () => {
  it('écrit les bornes en pd.Timestamp et pd.Timedelta', () => {
    const dmy = { order: 'dmy' as const, withTime: false };
    assert.equal(pandasTemporal(Date.UTC(2015, 0, 31), dmy), 'pd.Timestamp("2015-01-31")');
    assert.equal(pandasTemporal(Date.UTC(2015, 0, 31, 8, 24), dmy), 'pd.Timestamp("2015-01-31 08:24:00")');
    assert.equal(pandasTemporal(DAY / 2, { order: 'time', withTime: true }), 'pd.Timedelta("12:00:00")');
    const after = compareFilter(0, 'date', '>', Date.UTC(2015, 0, 31), undefined, undefined, dmy);
    assert.equal(after.label, 'date > 31/01/2015');
    assert.equal(filterToPandas(after, 'date'), 'df = df[df["date"] > pd.Timestamp("2015-01-31")]');
  });

  it('ajoute parse_dates, dayfirst et la conversion des heures au read_csv', () => {
    const table = parse('date,time,qty\n25/01/2015,12:52,1\n03/02/2015,11:38:36,2\n');
    const stats = computeAll(table);
    const details = stats.map((column, index) => computeDetails(table, index, column.type, column.temporal));
    assert.equal(details[0].pandasType, 'datetime64[ns]');
    assert.equal(details[1].pandasType, 'timedelta64[ns]');
    const snippet = readCsvSnippet('orders.csv', table, computeDataset(table, details));
    assert.ok(snippet.includes('parse_dates=["date"],'));
    assert.ok(snippet.includes('dayfirst=True,'));
    assert.ok(snippet.includes('df["time"] = pd.to_timedelta(df["time"].str.replace(r"^(\\d{1,2}:\\d{2})$", r"\\1:00", regex=True))'));
  });
});
