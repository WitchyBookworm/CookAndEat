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
  assert.equal(pos(don, 'Zwiebel').menge, 8);
  assert.equal(pos(don, 'Bergkäse').menge, 1200);
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
