import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBringSeite, bringLink, zutatText, abgelaufen } from '../functions/bring.js';

test('Seite enthält jede Position als recipeIngredient (Microdata und JSON-LD)', () => {
  const html = renderBringSeite({ titel: 'Einkauf Do 5.11.', positionen: [{ name: 'Champignons', menge: 500, einheit: 'g' }, { name: 'Milch', menge: 5, einheit: 'l' }] });
  assert.match(html, /itemtype="http:\/\/schema.org\/Recipe"/);
  assert.equal((html.match(/itemprop="recipeIngredient ingredients"/g) ?? []).length, 2);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*)<\/script>/)[1]);
  assert.deepEqual(ld.recipeIngredient, ['500 g Champignons', '5 l Milch']);
});

test('Sonderzeichen werden escaped', () => {
  const html = renderBringSeite({ titel: 'x', positionen: [{ name: '<script>alert(1)</script>', menge: 1, einheit: 'Stk' }] });
  assert.ok(!html.includes('<script>alert'));
});

test('Dezimalzahlen mit Komma', () => {
  assert.equal(zutatText({ name: 'Grieß', menge: 0.5, einheit: 'kg' }), '0,5 kg Grieß');
});

test('Deeplink enthält URL-kodierte Seitenadresse und source=web', () => {
  const l = new URL(bringLink('https://x.web.app/bring/abc'));
  assert.equal(l.origin + l.pathname, 'https://api.getbring.com/rest/bringrecipes/deeplink');
  assert.equal(l.searchParams.get('url'), 'https://x.web.app/bring/abc');
  assert.equal(l.searchParams.get('source'), 'web');
});

test('Export läuft nach 7 Tagen ab', () => {
  assert.equal(abgelaufen(0, 6 * 86400000), false);
  assert.equal(abgelaufen(0, 8 * 86400000), true);
});
