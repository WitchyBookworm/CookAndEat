import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erzeugeEinkaufslisten } from '../src/shopping.js';

const gerichte = [
  { id: 1, name: 'Gulasch', kategorien: ['Großmenge'], zutaten: [{ name: 'Rindfleisch', menge: 1.2, einheit: 'kg', abteilung: 'Fleisch & Fisch' }, { name: 'Zwiebel', menge: 4, einheit: 'Stk', abteilung: 'Obst & Gemüse' }] },
  { id: 2, name: 'Risotto', kategorien: ['Reis'], zutaten: [{ name: 'Zwiebel', menge: 2, einheit: 'Stk', abteilung: 'Obst & Gemüse' }] },
  { id: 3, name: 'Käsespätzle', kategorien: ['Nudeln'], zutaten: [{ name: 'Bergkäse', menge: 600, einheit: 'g', abteilung: 'Kühlregal' }] },
];

const plan = {
  tage: [
    { datum: '2026-11-02', kategorie: 'Veggie', gerichtId: 3, rest: false, grossmenge: false, alternativen: [] },
    { datum: '2026-11-03', kategorie: 'Reis', gerichtId: 2, rest: false, grossmenge: false, alternativen: [{ mitgliedId: 'a', gerichtId: 3 }] },
    { datum: '2026-11-04', kategorie: 'Kartoffel', gerichtId: 2, rest: false, grossmenge: false, alternativen: [] },
    { datum: '2026-11-05', kategorie: 'Nudeln', gerichtId: 3, rest: false, grossmenge: false, alternativen: [] },
    { datum: '2026-11-06', kategorie: 'Fisch', gerichtId: 3, rest: false, grossmenge: false, alternativen: [] },
    { datum: '2026-11-07', kategorie: 'Großmenge', gerichtId: 1, rest: false, grossmenge: true, alternativen: [] },
    { datum: '2026-11-08', kategorie: 'Rest', gerichtId: 1, rest: true, grossmenge: false, alternativen: [] },
  ],
};

const grundeinkaeufe = [
  { name: 'Milch', menge: 3, einheit: 'l', abteilung: 'Kühlregal', rhythmus: 'jeder Einkauf' },
  { name: 'Klopapier', menge: 1, einheit: 'Pkg', abteilung: 'Drogerie', rhythmus: 'wöchentlich' },
];

test('zwei Listen pro Woche: Montag bis Mittwoch und Donnerstag bis Sonntag', () => {
  const listen = erzeugeEinkaufslisten({ plan, gerichte, grundeinkaeufe });
  assert.deepEqual(listen.map((l) => [l.von, l.bis]), [['2026-11-02', '2026-11-04'], ['2026-11-05', '2026-11-08']]);
});

test('Mengen werden zusammengerechnet, Großmenge doppelt, Alternative als Einzelportion', () => {
  const [mo, don] = erzeugeEinkaufslisten({ plan, gerichte, grundeinkaeufe });
  const pos = (l, n) => l.positionen.find((p) => p.name === n);
  assert.equal(pos(mo, 'Zwiebel').menge, 4);
  assert.equal(pos(mo, 'Bergkäse').menge, 700); // 600 + 1/6 von 600 für die Alternative
  assert.equal(pos(don, 'Rindfleisch').menge, 2.4);
  assert.equal(pos(don, 'Bergkäse').einheit, 'kg');
  assert.equal(pos(don, 'Zwiebel').menge, 8);
  assert.equal(pos(don, 'Bergkäse').menge, 1.2);
});

test('Grundeinkäufe: "jeder Einkauf" auf beiden Listen, "wöchentlich" nur auf der ersten', () => {
  const [mo, don] = erzeugeEinkaufslisten({ plan, gerichte, grundeinkaeufe });
  assert.ok(mo.positionen.some((p) => p.name === 'Milch'));
  assert.ok(don.positionen.some((p) => p.name === 'Milch'));
  assert.ok(mo.positionen.some((p) => p.name === 'Klopapier'));
  assert.ok(!don.positionen.some((p) => p.name === 'Klopapier'));
});

test('Liste ist nach Abteilung sortiert', () => {
  const [mo] = erzeugeEinkaufslisten({ plan, gerichte, grundeinkaeufe });
  assert.deepEqual(mo.positionen.map((p) => p.abteilung), ['Obst & Gemüse', 'Kühlregal', 'Kühlregal', 'Drogerie']);
});

test('Rhythmen: 14-tägig nur in ungeraden KW, monatlich nur beim ersten Einkauf', async () => {
  const { erzeugeMonatsplan } = await import('../src/planner.js');
  const { readFileSync } = await import('node:fs');
  const katalog = JSON.parse(readFileSync(new URL('../src/data/gerichte.json', import.meta.url)));
  const grund = JSON.parse(readFileSync(new URL('../src/data/grundeinkaeufe.json', import.meta.url)));
  const nov = erzeugeMonatsplan({ jahr: 2026, monat: 11, gerichte: katalog, seed: 1 });
  const listen = erzeugeEinkaufslisten({ plan: nov, gerichte: katalog, grundeinkaeufe: grund });
  const hat = (l, n) => l.positionen.some((p) => p.name === n && p.quellen.some((q) => q.startsWith('Grundeinkauf')));
  // 1.11. ist Sonntag, kein Einkaufstag: keine Grundeinkäufe
  assert.equal(listen[0].von, '2026-11-01');
  assert.ok(!hat(listen[0], 'Milch'));
  const mo = listen.filter((l) => new Date(l.von + 'T12:00').getDay() === 1);
  const don = listen.filter((l) => new Date(l.von + 'T12:00').getDay() === 4);
  assert.ok(mo.every((l) => hat(l, 'Milch')) && don.every((l) => hat(l, 'Milch')));
  assert.ok(mo.every((l) => hat(l, 'Joghurt')) && !don.some((l) => hat(l, 'Joghurt')));
  // KW 45 (2.11.) ungerade, KW 46 (9.11.) gerade
  assert.ok(hat(mo[0], 'Küchenrolle') && !hat(mo[1], 'Küchenrolle') && hat(mo[2], 'Küchenrolle'));
  assert.equal(listen.filter((l) => hat(l, 'Butter')).length, 1);
  assert.ok(hat(mo[0], 'Butter'));
  // 2-monatlich in ungeraden Monaten (Nov ja, Dez nein)
  assert.equal(listen.filter((l) => hat(l, 'Olivenöl')).length, 1);
  const dez = erzeugeEinkaufslisten({ plan: erzeugeMonatsplan({ jahr: 2026, monat: 12, gerichte: katalog, seed: 1 }), gerichte: katalog, grundeinkaeufe: grund });
  assert.ok(!dez.some((l) => hat(l, 'Olivenöl')));
});

test('g und kg werden zusammengerechnet', () => {
  const g = [{ id: 1, name: 'A', kategorien: ['Veggie'], zutaten: [{ name: 'Mehl', menge: 500, einheit: 'g', abteilung: 'Trockenwaren' }] }];
  const p = { tage: [{ datum: '2026-11-02', kategorie: 'Veggie', gerichtId: 1, rest: false, grossmenge: false, alternativen: [] }] };
  const [l] = erzeugeEinkaufslisten({ plan: p, gerichte: g, grundeinkaeufe: [{ name: 'Mehl', menge: 1, einheit: 'kg', abteilung: 'Trockenwaren', rhythmus: 'jeder Einkauf' }] });
  assert.deepEqual(l.positionen.map((x) => [x.name, x.menge, x.einheit]), [['Mehl', 1.5, 'kg']]);
});
