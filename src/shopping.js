import { isoDatum, parseDatum } from './planner.js';

// Einkaufslisten: pro Einkaufstag die Zutaten aller Gerichte bis zum nächsten
// Einkauf plus die Grundeinkäufe, nach Abteilung sortiert und zusammengerechnet.

export const PORTIONEN = 6; // 4 Personen + 2 Mitnahme-Portionen

export const ABTEILUNGEN = [
  'Obst & Gemüse',
  'Brot & Gebäck',
  'Kühlregal',
  'Fleisch & Fisch',
  'Tiefkühl',
  'Trockenwaren',
  'Konserven & Saucen',
  'Gewürze',
  'Getränke',
  'Drogerie',
  'Sonstiges',
];

function abteilungsIndex(a) {
  const i = ABTEILUNGEN.indexOf(a);
  return i === -1 ? ABTEILUNGEN.length : i;
}

function runden(menge) {
  return Math.round(menge * 100) / 100;
}

/**
 * @param {object} p
 * @param {object} p.plan Ergebnis von erzeugeMonatsplan
 * @param {Array} p.gerichte Katalog mit zutaten [{name, menge, einheit, abteilung}] für 6 Portionen
 * @param {Array} [p.grundeinkaeufe] [{name, menge, einheit, abteilung, rhythmus: 'jeder Einkauf' | 'wöchentlich'}]
 * @param {number[]} [p.einkaufstage] Wochentage (Date.getDay), Standard Montag + Donnerstag
 */
export function erzeugeEinkaufslisten({ plan, gerichte, grundeinkaeufe = [], einkaufstage = [1, 4] }) {
  const nachId = new Map(gerichte.map((g) => [g.id, g]));
  const tage = plan.tage;
  if (!tage.length) return [];

  // Listentage: jeder Einkaufstag im Monat, dazu der Monatserste
  const startIndizes = tage
    .map((t, i) => ({ i, tag: parseDatum(t.datum).getDay() }))
    .filter(({ i, tag }) => i === 0 || einkaufstage.includes(tag))
    .map(({ i }) => i);

  const wochentlichSchonIn = new Set();
  return startIndizes.map((start, n) => {
    const ende = n + 1 < startIndizes.length ? startIndizes[n + 1] : tage.length;
    const abschnitt = tage.slice(start, ende);
    const positionen = new Map();

    const hinzu = (z, faktor, quelle) => {
      const key = `${z.name.toLowerCase()}|${z.einheit}`;
      const p = positionen.get(key) ?? { name: z.name, menge: 0, einheit: z.einheit, abteilung: z.abteilung ?? 'Sonstiges', quellen: [], erledigt: false };
      p.menge += (z.menge ?? 0) * faktor;
      if (quelle && !p.quellen.includes(quelle)) p.quellen.push(quelle);
      positionen.set(key, p);
    };

    for (const tag of abschnitt) {
      if (tag.rest) continue;
      const g = nachId.get(tag.gerichtId);
      if (!g) continue;
      // Großmenge reicht für Samstag und Sonntag
      const faktor = tag.grossmenge ? 2 : 1;
      for (const z of g.zutaten ?? []) hinzu(z, faktor, g.name);
      for (const alt of tag.alternativen ?? []) {
        const a = nachId.get(alt.gerichtId);
        if (!a) continue;
        for (const z of a.zutaten ?? []) hinzu(z, 1 / PORTIONEN, `${a.name} (Alternative)`);
      }
    }

    const montag = (iso) => {
      const x = parseDatum(iso);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return isoDatum(x);
    };
    const woche = montag(tage[start].datum);
    for (const g of grundeinkaeufe) {
      if (g.rhythmus === 'wöchentlich') {
        const key = `${woche}|${g.name}`;
        if (wochentlichSchonIn.has(key)) continue;
        wochentlichSchonIn.add(key);
      }
      hinzu(g, 1, 'Grundeinkauf');
    }

    const liste = [...positionen.values()]
      .map((p) => ({ ...p, menge: runden(p.menge) }))
      .sort((a, b) => abteilungsIndex(a.abteilung) - abteilungsIndex(b.abteilung) || a.name.localeCompare(b.name, 'de'));

    return {
      id: tage[start].datum,
      datum: tage[start].datum,
      von: tage[start].datum,
      bis: tage[ende - 1].datum,
      positionen: liste,
    };
  });
}
