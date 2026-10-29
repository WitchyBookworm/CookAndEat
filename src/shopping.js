import { parseDatum } from './planner.js';

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

export const RHYTHMEN = ['jeder Einkauf', 'wöchentlich', '14-tägig', 'monatlich', '2-monatlich'];

// ISO-Kalenderwoche, damit 14-tägige Artikel über Monatsgrenzen im Takt bleiben
export function kalenderwoche(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - tag);
  const jahresbeginn = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - jahresbeginn) / 86400000 + 1) / 7);
}

// g/kg und ml/l zusammenführen, damit z. B. Mehl nur einmal auf der Liste steht
const BASIS = { kg: ['g', 1000], g: ['g', 1], l: ['ml', 1000], ml: ['ml', 1] };

function normiert(menge, einheit) {
  const [e, f] = BASIS[einheit] ?? [einheit, 1];
  return [menge * f, e];
}

function lesbar(menge, einheit) {
  if (einheit === 'g' && menge >= 1000) return [menge / 1000, 'kg'];
  if (einheit === 'ml' && menge >= 1000) return [menge / 1000, 'l'];
  return [menge, einheit];
}

function runden(menge) {
  return Math.round(menge * 100) / 100;
}

/**
 * @param {object} p
 * @param {object} p.plan Ergebnis von erzeugeMonatsplan
 * @param {Array} p.gerichte Katalog mit zutaten [{name, menge, einheit, abteilung}] für 6 Portionen
 * @param {Array} [p.grundeinkaeufe] [{name, menge, einheit, abteilung, rhythmus}], rhythmus aus RHYTHMEN
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

  // Grundeinkäufe kommen nur auf Listen echter Einkaufstage; die Rhythmen
  // greifen jeweils beim ersten Einkauf der Woche bzw. des Monats.
  const echteEinkaeufe = startIndizes.filter((i) => einkaufstage.includes(parseDatum(tage[i].datum).getDay()));
  const ersterDerWoche = new Set();
  const gesehen = new Set();
  for (const i of echteEinkaeufe) {
    const kw = kalenderwoche(parseDatum(tage[i].datum));
    if (!gesehen.has(kw)) ersterDerWoche.add(i);
    gesehen.add(kw);
  }
  const ersterDesMonats = echteEinkaeufe[0];
  const monat = parseDatum(tage[0].datum).getMonth() + 1;

  const faellig = (rhythmus, start) => {
    if (!echteEinkaeufe.includes(start)) return false;
    const kw = kalenderwoche(parseDatum(tage[start].datum));
    switch (rhythmus) {
      case 'wöchentlich': return ersterDerWoche.has(start);
      case '14-tägig': return ersterDerWoche.has(start) && kw % 2 === 1;
      case 'monatlich': return start === ersterDesMonats;
      case '2-monatlich': return start === ersterDesMonats && monat % 2 === 1;
      default: return true;
    }
  };

  return startIndizes.map((start, n) => {
    const ende = n + 1 < startIndizes.length ? startIndizes[n + 1] : tage.length;
    const abschnitt = tage.slice(start, ende);
    const positionen = new Map();

    const hinzu = (z, faktor, quelle) => {
      const [menge, einheit] = normiert(z.menge ?? 0, z.einheit);
      const key = `${z.name.toLowerCase()}|${einheit}`;
      const p = positionen.get(key) ?? { name: z.name, menge: 0, einheit, abteilung: z.abteilung ?? 'Sonstiges', quellen: [], erledigt: false };
      p.menge += menge * faktor;
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

    for (const g of grundeinkaeufe) {
      if (faellig(g.rhythmus, start)) hinzu(g, 1, `Grundeinkauf (${g.rhythmus})`);
    }

    const liste = [...positionen.values()]
      .map((p) => {
        const [menge, einheit] = lesbar(p.menge, p.einheit);
        return { ...p, menge: runden(menge), einheit };
      })
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
