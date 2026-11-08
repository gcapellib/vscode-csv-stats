/**
 * Fabrique de gros fichiers CSV d'essai, pleins de défauts : de quoi essayer chaque fonction
 * du plug-in sur des milliers de lignes. Le tirage est semé : le même numéro redonne les
 * mêmes fichiers.
 *
 *   node scripts/make-test-csv.mjs [lignes] [graine]      → test-data/ (ignoré par git)
 *
 * Écrit trois fichiers :
 *   boutique.csv               virgule, UTF-8, tous les défauts à la fois
 *   boutique-excel.csv         point-virgule, virgule décimale, Windows-1252 (€, accents)
 *   boutique-tabulations.csv   tabulations, UTF-8
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROWS = Number(process.argv[2] ?? 50000);
const SEED = Number(process.argv[3] ?? 42);
const folder = resolve(fileURLToPath(import.meta.url), '../../test-data');
mkdirSync(folder, { recursive: true });

// Un générateur reproductible (mulberry32).
let state = SEED >>> 0;
function random() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (low, high) => low + random() * (high - low);
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const chance = (share) => random() < share;
const pad = (value, size = 2) => String(value).padStart(size, '0');

const FIRST = ['Léa', 'Hugo', 'Emma', 'Louis', 'Chloé', 'Jules', 'Inès', 'Noah', 'Manon', 'Adam', 'Zoé', 'Lucas', 'Camille', 'Nina', 'Théo'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefèvre', 'Michel'];
// Chaque ville a ses graphies fautives : casse, espaces, pluriel, accents abîmés.
const CITIES = [
  ['Lyon', ['lyon', 'LYON', 'Lyon ', ' Lyon', 'Lyons']],
  ['Marseille', ['marseille', 'MARSEILLE', 'Marseile']],
  ['Paris', ['paris', 'PARIS', 'Paris ']],
  ['Nîmes', ['nimes', 'NIMES', 'Nîmes ']],
  ['Montréal', ['Montreal', 'MONTRÉAL']],
  ['Genève', ['Geneve', 'GENÈVE']],
  ['Bordeaux', ['bordeaux', 'BORDEAUX']],
  ['Lille', ['lille', 'LILLE', 'Lile']],
  ['Nantes', ['nantes', 'NANTES']],
  ['Strasbourg', ['strasbourg']],
];
const CATEGORIES = [
  ['Électronique', 1.0],
  ['Maison', 0.55],
  ['Jouets', 0.3],
  ['Sport', 0.7],
  ['Livres', 0.18],
  ['Jardin', 0.65],
];
const STORES = ['Nord', 'Sud', 'Est', 'Ouest', 'Centre'];
const PLACEHOLDERS = ['N/A', 'n/a', 'NULL', '-', '?'];

// Ce qu'un fichier lu à la mauvaise page de codes donnerait : « é » devient « Ã© ».
const garble = (text) => Buffer.from(text, 'utf8').toString('latin1');
const INVISIBLE = ['​', ' ', '﻿'];

const start = Date.UTC(2023, 0, 1);
const days = 800;

const header = [
  'order_id', 'order_date', 'order_time', 'customer', 'city', 'category', 'store', 'quantity', 'unit_price', 'discount_pct',
  'total', 'weight', 'amount_label', 'rating', 'delivery_days', 'customer_age', 'notes',
];

const rows = [];
let id = 100000;
let lastStore = '';
for (let n = 0; n < ROWS; n++) {
  id += chance(0.002) ? 1 + Math.floor(random() * 40) : 1; // des trous dans la suite des identifiants
  const dayOffset = Math.floor((n / ROWS) * days + between(0, 1));
  const date = new Date(start + dayOffset * 86400000);
  const isoDate = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const hour = Math.min(23, Math.max(0, Math.round(13 + normal() * 4)));
  const time = `${pad(hour)}:${pad(Math.floor(random() * 60))}:${pad(Math.floor(random() * 60))}`;
  const customer = `${pick(FIRST)} ${pick(LAST)}`;

  const [cityName, variants] = pick(CITIES);
  let city = cityName;
  if (chance(0.06)) city = pick(variants);
  else if (chance(0.01) && /[éèîÉÈ]/.test(cityName)) city = garble(cityName);

  const [categoryName, level] = pick(CATEGORIES);
  let category = categoryName;
  if (chance(0.04)) category = chance(0.5) ? category.toUpperCase() : category.toLowerCase();
  else if (chance(0.01)) category = garble(category);

  // « Fill down » : le magasin n'est écrit qu'au changement.
  const store = pick(STORES);
  const storeCell = n === 0 || store !== lastStore ? store : '';
  if (n === 0 || store !== lastStore) lastStore = store;
  const storeFilled = chance(0.9) ? storeCell : store;

  const quantity = 1 + Math.floor(Math.abs(normal()) * 2.5);
  const price = Math.max(1.5, level * 40 * Math.exp(normal() * 0.5) + 3);
  const discount = Math.min(40, Math.max(0, Math.round(10 + normal() * 8 - level * 3)));
  const total = quantity * price * (1 - discount / 100);
  const weight = Math.max(0.05, level * 1.8 + 0.4 * quantity + normal() * 0.6);
  const rating = Math.min(5, Math.max(1, Math.round(4.1 - discount / 25 + normal() * 0.8)));
  const delivery = Math.max(1, Math.round(6 - rating * 0.9 + 1.2 * Math.abs(normal())));
  const age = Math.min(90, Math.max(16, Math.round(38 + normal() * 14)));

  let noteBase = pick(['', '', '', 'Cadeau', 'Fragile', 'Livraison express', 'Retour client', 'Promo été', 'À rappeler']);
  if (noteBase && chance(0.08)) noteBase = ` ${noteBase} `;
  if (noteBase && chance(0.04)) noteBase = noteBase + pick(INVISIBLE);
  if (noteBase && chance(0.02)) noteBase = garble(noteBase);

  const row = {
    order_id: String(id),
    order_date: chance(0.001) ? '1900-01-01' : isoDate,
    order_time: time,
    customer: chance(0.03) ? customer.toUpperCase() : customer,
    city,
    category,
    store: storeFilled,
    quantity: chance(0.012) ? '' : String(quantity),
    unit_price: chance(0.02) ? '-999' : price.toFixed(2),
    discount_pct: String(discount),
    total: chance(0.015) ? pick(PLACEHOLDERS) : total.toFixed(2),
    weight: `${weight.toFixed(2)} kg`,
    amount_label: `${total.toFixed(2)} €`,
    rating: chance(0.03) ? '' : String(rating),
    delivery_days: String(delivery),
    customer_age: chance(0.003) ? String(120 + Math.floor(random() * 80)) : chance(0.01) ? '-999' : String(age),
    notes: noteBase,
  };
  // Quelques valeurs aberrantes de plus : un prix démesuré, une quantité folle.
  if (chance(0.002)) row.unit_price = (price * 40).toFixed(2);
  if (chance(0.002)) row.quantity = String(300 + Math.floor(random() * 900));
  rows.push(header.map((name) => row[name]));
  if (chance(0.003)) rows.push(rows[rows.length - 1]); // doublon exact
  if (chance(0.0015)) rows.push(header.map(() => '')); // ligne entièrement blanche
}

function field(value, delimiter) {
  return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function write(name, text, encoding = 'utf8') {
  const bytes = encoding === 'utf8' ? Buffer.from(text, 'utf8') : toWindows1252(text);
  writeFileSync(resolve(folder, name), bytes);
  console.log(`${name}: ${rows.length} lignes, ${(bytes.length / 1048576).toFixed(1)} Mo`);
}
function toCsv(delimiter, transform = (value) => value) {
  return [header, ...rows].map((row) => row.map((value) => field(transform(value), delimiter)).join(delimiter)).join('\n') + '\n';
}

// Windows-1252 : ISO-8859-1 sauf les 0x80–0x9F, dont « € » en 0x80.
function toWindows1252(text) {
  const high = new Map([['€', 0x80], ['‚', 0x82], ['„', 0x84], ['…', 0x85], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['–', 0x96], ['—', 0x97]]);
  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    bytes.push(high.has(char) ? high.get(char) : code < 256 ? code : 0x3f);
  }
  return Buffer.from(bytes);
}

write('boutique.csv', toCsv(','));
// Excel en français : point-virgule, virgule décimale, Windows-1252. L'étiquette garde son « € ».
const decimalComma = (value) => (/^-?\d+\.\d+$/.test(value) ? value.replace('.', ',') : value.replace(/^(-?\d+)\.(\d+)( kg| €)$/, '$1,$2$3'));
write('boutique-excel.csv', toCsv(';', decimalComma), 'windows-1252');
write('boutique-tabulations.csv', toCsv('\t'));
