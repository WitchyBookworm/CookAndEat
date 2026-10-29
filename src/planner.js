// Monatsplan-Generator: setzt Maras Regeln als harte Bedingungen um und
// nutzt die Präferenzen der anwesenden Familienmitglieder als Gewichtung.

// Wochentag (Date.getDay) -> Tageskategorie
export const TAGES_KATEGORIE = {
  1: 'Veggie',
  2: 'Reis',
  3: 'Kartoffel',
  4: 'Nudeln',
  5: 'Fisch',
  6: 'Großmenge',
  0: 'Rest',
};

const MAX_VERSUCHE = 300;

// Deterministischer Zufall, damit ein Plan mit gleichem Seed reproduzierbar ist
export function zufall(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isoDatum(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${t}`;
}

// "2026-11-02" als lokales Datum (new Date("...") wäre UTC)
export function parseDatum(iso) {
  const [j, m, t] = iso.split('-').map(Number);
  return new Date(j, m - 1, t);
}

function tageDesMonats(jahr, monat) {
  const tage = [];
  for (let d = new Date(jahr, monat - 1, 1); d.getMonth() === monat - 1; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    tage.push(d);
  }
  return tage;
}

// Wochen beginnen am Montag; Rand-Wochen sind kürzer
function inWochen(tage) {
  const wochen = [];
  let aktuell = [];
  for (const d of tage) {
    if (d.getDay() === 1 && aktuell.length) {
      wochen.push(aktuell);
      aktuell = [];
    }
    aktuell.push(d);
  }
  if (aktuell.length) wochen.push(aktuell);
  return wochen;
}

export function anwesende(datum, mitglieder, anwesenheit) {
  const ids = anwesenheit?.[datum];
  return ids ? mitglieder.filter((m) => ids.includes(m.id)) : mitglieder;
}

// Lehnt das Mitglied das Gericht ab (direkt oder über ein Merkmal wie "fisch")?
export function lehntAb(mitglied, gericht) {
  if (mitglied.ablehnt?.includes(gericht.id)) return true;
  return (mitglied.ablehntMerkmale ?? []).some((merkmal) => {
    if (merkmal === 'fisch') return gericht.kategorien.includes('Fisch');
    return gericht[merkmal] === true;
  });
}

function gewicht(gericht, personen) {
  let g = 1;
  for (const p of personen) {
    if (p.mag?.includes(gericht.id)) g *= 3;
    if (lehntAb(p, gericht)) g *= 0.25;
  }
  return g;
}

function gewichteteWahl(liste, gewichte, rnd) {
  const summe = gewichte.reduce((a, b) => a + b, 0);
  let r = rnd() * summe;
  for (let i = 0; i < liste.length; i++) {
    r -= gewichte[i];
    if (r <= 0) return liste[i];
  }
  return liste[liste.length - 1];
}

function mischen(liste, rnd) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Kochtage einer Woche: Sonntag ist Rest vom Samstag. Fehlt der Samstag
// (Monatsbeginn am Sonntag), wird am Sonntag selbst groß gekocht.
function slotsDerWoche(woche, vorSamstagGericht) {
  const hatSamstag = woche.some((d) => d.getDay() === 6);
  return woche
    .filter((d) => d.getDay() !== 0 || (!hatSamstag && !vorSamstagGericht))
    .map((d) => ({ datum: isoDatum(d), kategorie: d.getDay() === 0 ? 'Großmenge' : TAGES_KATEGORIE[d.getDay()] }));
}

function passt(gericht, slot, rolle, benutzt) {
  if (gericht.gesperrt || benutzt.has(gericht.id)) return false;
  if (!gericht.kategorien.includes(slot.kategorie)) return false;
  if (rolle === 'arabisch') return gericht.arabisch;
  if (rolle === 'oesterreichisch') return gericht.oesterreichisch && !gericht.arabisch;
  return !gericht.arabisch && !gericht.oesterreichisch;
}

function versucheWoche(slots, gerichte, benutzt, personenAm, rnd, streng) {
  const rollen = new Map();
  const frei = (rolle, s) => gerichte.some((g) => passt(g, s, rolle, benutzt));

  const arabKandidaten = mischen(slots.filter((s) => frei('arabisch', s)), rnd);
  if (arabKandidaten.length) rollen.set(arabKandidaten[0].datum, 'arabisch');
  const oeKandidaten = mischen(slots.filter((s) => !rollen.has(s.datum) && frei('oesterreichisch', s)), rnd);
  if (oeKandidaten.length) rollen.set(oeKandidaten[0].datum, 'oesterreichisch');

  const lokal = new Set(benutzt);
  const ergebnis = [];
  for (const slot of slots) {
    const rolle = rollen.get(slot.datum) ?? 'normal';
    let pool = gerichte.filter((g) => passt(g, slot, rolle, lokal));
    // Ohne strenge Regel darf ein normaler Tag auch österreichisch sein
    if (!pool.length && !streng && rolle === 'normal') {
      pool = gerichte.filter((g) => passt(g, slot, 'oesterreichisch', lokal));
    }
    if (!pool.length) return null;
    const personen = personenAm(slot.datum);
    const gericht = gewichteteWahl(pool, pool.map((g) => gewicht(g, personen)), rnd);
    lokal.add(gericht.id);
    ergebnis.push({ ...slot, gericht, rolle });
  }
  return { ergebnis, lokal, arabisch: arabKandidaten.length > 0, oesterreichisch: oeKandidaten.length > 0 };
}

// Alternative für ein Mitglied, das das Tagesgericht ablehnt: ein Gericht der
// gleichen Kategorie, das es nicht ablehnt; Lieblingsgerichte bevorzugt.
export function alternativeFuer(mitglied, tagesGericht, kategorie, gerichte, rnd = Math.random) {
  const kandidaten = gerichte.filter(
    (g) => !g.gesperrt && g.id !== tagesGericht.id && !lehntAb(mitglied, g) && !g.kategorien.includes('Großmenge'),
  );
  if (!kandidaten.length) return null;
  const gewichte = kandidaten.map(
    (g) => (mitglied.mag?.includes(g.id) ? 5 : 1) * (g.kategorien.includes(kategorie) ? 3 : 1),
  );
  return gewichteteWahl(kandidaten, gewichte, rnd);
}

function varianteWaehlen(gericht, rnd) {
  return gericht.varianten?.length ? gericht.varianten[Math.floor(rnd() * gericht.varianten.length)] : null;
}

/**
 * Erzeugt den Speiseplan eines Monats.
 * @param {object} p
 * @param {number} p.jahr
 * @param {number} p.monat 1–12
 * @param {Array} p.gerichte Katalog (siehe src/data/gerichte.json)
 * @param {Array} [p.mitglieder] {id, name, ablehnt, ablehntMerkmale, mag}
 * @param {object} [p.anwesenheit] {"2026-11-02": [mitgliedIds]}; fehlt ein Tag, sind alle da
 * @param {number} [p.vorSamstagGericht] Gericht-ID vom letzten Samstag des Vormonats
 * @param {number} [p.seed]
 */
export function erzeugeMonatsplan({ jahr, monat, gerichte, mitglieder = [], anwesenheit = {}, vorSamstagGericht = null, seed = Date.now() }) {
  const rnd = zufall(seed);
  const personenAm = (datum) => anwesende(datum, mitglieder, anwesenheit);
  const benutzt = new Set();
  const warnungen = [];
  const tage = [];
  const nachId = new Map(gerichte.map((g) => [g.id, g]));

  for (const woche of inWochen(tageDesMonats(jahr, monat))) {
    const slots = slotsDerWoche(woche, vorSamstagGericht);
    let treffer = null;
    for (let i = 0; i < MAX_VERSUCHE && !treffer; i++) treffer = versucheWoche(slots, gerichte, benutzt, personenAm, rnd, true);
    for (let i = 0; i < MAX_VERSUCHE && !treffer; i++) treffer = versucheWoche(slots, gerichte, benutzt, personenAm, rnd, false);
    const wochenLabel = `Woche ab ${isoDatum(woche[0])}`;
    if (!treffer) {
      warnungen.push(`${wochenLabel}: zu wenige passende Gerichte, Woche bleibt leer.`);
      continue;
    }
    if (!treffer.arabisch && slots.length >= 5) warnungen.push(`${wochenLabel}: kein arabisches Gericht mehr verfügbar.`);
    if (!treffer.oesterreichisch && slots.length >= 5) warnungen.push(`${wochenLabel}: kein österreichisches Gericht mehr verfügbar.`);
    treffer.lokal.forEach((id) => benutzt.add(id));

    const proDatum = new Map(treffer.ergebnis.map((e) => [e.datum, e]));
    let samstag = null;
    for (const d of woche) {
      const datum = isoDatum(d);
      const e = proDatum.get(datum);
      if (e) {
        const eintrag = { datum, kategorie: e.kategorie, gerichtId: e.gericht.id, variante: varianteWaehlen(e.gericht, rnd), rest: false, grossmenge: e.kategorie === 'Großmenge' };
        if (d.getDay() === 6) samstag = eintrag;
        tage.push(eintrag);
      } else {
        // Sonntag = Rest vom Samstag (oder vom letzten Samstag des Vormonats)
        const id = samstag?.gerichtId ?? vorSamstagGericht;
        tage.push({ datum, kategorie: 'Rest', gerichtId: id, variante: samstag?.variante ?? null, rest: true, grossmenge: false });
      }
    }
  }

  for (const tag of tage) {
    const gericht = nachId.get(tag.gerichtId);
    tag.alternativen = gericht
      ? personenAm(tag.datum)
          .filter((p) => lehntAb(p, gericht))
          .map((p) => ({ mitgliedId: p.id, gerichtId: alternativeFuer(p, gericht, tag.kategorie, gerichte, rnd)?.id ?? null }))
      : [];
  }

  return { jahr, monat, seed, tage, warnungen };
}

/** Prüft einen Plan gegen die Regeln; liefert eine Liste von Verstößen. */
export function pruefePlan(plan, gerichte) {
  const nachId = new Map(gerichte.map((g) => [g.id, g]));
  const fehler = [];
  const gesehen = new Map();
  const wochen = new Map();
  for (const tag of plan.tage) {
    const g = nachId.get(tag.gerichtId);
    if (!g) continue;
    if (g.gesperrt) fehler.push(`${tag.datum}: gesperrtes Gericht ${g.name}`);
    if (!tag.rest) {
      if (gesehen.has(g.id)) fehler.push(`${tag.datum}: ${g.name} schon am ${gesehen.get(g.id)}`);
      gesehen.set(g.id, tag.datum);
      if (!g.kategorien.includes(tag.kategorie)) fehler.push(`${tag.datum}: ${g.name} passt nicht zu ${tag.kategorie}`);
    }
    const d = parseDatum(tag.datum);
    const montag = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const key = isoDatum(montag);
    const w = wochen.get(key) ?? { arabisch: 0, oesterreichisch: 0 };
    if (!tag.rest && g.arabisch) w.arabisch++;
    if (!tag.rest && g.oesterreichisch) w.oesterreichisch++;
    wochen.set(key, w);
  }
  for (const [key, w] of wochen) {
    if (w.arabisch > 1) fehler.push(`Woche ${key}: ${w.arabisch} arabische Gerichte`);
    if (w.oesterreichisch > 1) fehler.push(`Woche ${key}: ${w.oesterreichisch} österreichische Gerichte`);
  }
  return fehler;
}
