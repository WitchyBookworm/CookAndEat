import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { erzeugeMonatsplan, pruefePlan, parseDatum } from '../src/planner.js';

const gerichte = JSON.parse(readFileSync(new URL('../src/data/gerichte.json', import.meta.url)));
const nachId = new Map(gerichte.map((g) => [g.id, g]));

test('November 2026 hält alle Regeln ein', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const plan = erzeugeMonatsplan({ jahr: 2026, monat: 11, gerichte, seed });
    assert.equal(plan.tage.length, 30);
    assert.deepEqual(pruefePlan(plan, gerichte), [], `Seed ${seed}`);
    assert.deepEqual(plan.warnungen, [], `Seed ${seed}`);
  }
});

test('Freitag ist Fisch, Sonntag Rest vom Samstag', () => {
  const plan = erzeugeMonatsplan({ jahr: 2026, monat: 12, gerichte, seed: 7 });
  for (const [i, tag] of plan.tage.entries()) {
    const wt = parseDatum(tag.datum).getDay();
    if (wt === 5) assert.ok(nachId.get(tag.gerichtId).kategorien.includes('Fisch'));
    if (wt === 0 && i > 0) {
      assert.equal(tag.rest, true);
      assert.equal(tag.gerichtId, plan.tage[i - 1].gerichtId);
    }
  }
});

test('Monatsbeginn am Sonntag ohne Vormonat bekommt eigenes Großmengengericht', () => {
  const plan = erzeugeMonatsplan({ jahr: 2026, monat: 11, gerichte, seed: 3 });
  assert.equal(plan.tage[0].rest, false);
  assert.ok(nachId.get(plan.tage[0].gerichtId).kategorien.includes('Großmenge'));
});

test('volle Wochen haben genau ein arabisches und ein österreichisches Gericht', () => {
  const plan = erzeugeMonatsplan({ jahr: 2026, monat: 11, gerichte, seed: 11 });
  const volleWoche = plan.tage.filter((t) => t.datum >= '2026-11-02' && t.datum <= '2026-11-08' && !t.rest);
  assert.equal(volleWoche.filter((t) => nachId.get(t.gerichtId).arabisch).length, 1);
  assert.equal(volleWoche.filter((t) => nachId.get(t.gerichtId).oesterreichisch).length, 1);
});

test('wer Fisch ablehnt, bekommt am Freitag eine Alternative', () => {
  const mitglieder = [
    { id: 'a', name: 'Anna', ablehntMerkmale: ['fisch'] },
    { id: 'b', name: 'Ben' },
  ];
  const plan = erzeugeMonatsplan({ jahr: 2026, monat: 11, gerichte, mitglieder, seed: 5 });
  const freitag = plan.tage.find((t) => t.datum === '2026-11-06');
  assert.equal(freitag.alternativen.length, 1);
  assert.equal(freitag.alternativen[0].mitgliedId, 'a');
  assert.ok(!nachId.get(freitag.alternativen[0].gerichtId).kategorien.includes('Fisch'));
});

test('abwesende Mitglieder lösen keine Alternative aus', () => {
  const mitglieder = [{ id: 'a', name: 'Anna', ablehntMerkmale: ['fisch'] }, { id: 'b', name: 'Ben' }];
  const plan = erzeugeMonatsplan({ jahr: 2026, monat: 11, gerichte, mitglieder, anwesenheit: { '2026-11-06': ['b'] }, seed: 5 });
  assert.equal(plan.tage.find((t) => t.datum === '2026-11-06').alternativen.length, 0);
});

test('gleicher Seed ergibt gleichen Plan', () => {
  const a = erzeugeMonatsplan({ jahr: 2027, monat: 1, gerichte, seed: 42 });
  const b = erzeugeMonatsplan({ jahr: 2027, monat: 1, gerichte, seed: 42 });
  assert.deepEqual(a, b);
});
