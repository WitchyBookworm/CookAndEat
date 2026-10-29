import { erzeugeMonatsplan, pruefePlan, alternativeFuer, lehntAb, anwesende, parseDatum, isoDatum } from './planner.js';
import { erzeugeEinkaufslisten, ABTEILUNGEN, RHYTHMEN } from './shopping.js';
import { erzeugeStore } from './store.js';

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const RHYTHMUS_LABEL = { 'jeder Einkauf': 'Bei jedem Einkauf (2× pro Woche)', 'wöchentlich': 'Einmal pro Woche', '14-tägig': 'Alle 2 Wochen', 'monatlich': 'Einmal im Monat', '2-monatlich': 'Alle 2 Monate' };
const MERKMALE = { fisch: 'Fisch', arabisch: 'arabisch', oesterreichisch: 'österreichisch', suess_mit_suppe: 'süß + Suppe', vegetarisch: 'vegetarisch' };

const store = erzeugeStore();
const zustand = {
  tab: 'plan',
  monat: naechsterMonat(),
  gerichte: [],
  mitglieder: [],
  anwesenheit: {},
  grundeinkaeufe: [],
  einstellungen: { einkaufstage: [1, 4] },
  plan: null,
  listen: [],
  listeId: null,
  liste: null,
};
let stopListe = null;
let stopPlan = null;

// ---------- Hilfsfunktionen ----------

function naechsterMonat() {
  const d = new Date();
  return d.getDate() > 20 ? { jahr: d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear(), monat: ((d.getMonth() + 1) % 12) + 1 } : { jahr: d.getFullYear(), monat: d.getMonth() + 1 };
}

const monatsKey = ({ jahr, monat }) => `${jahr}-${String(monat).padStart(2, '0')}`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const $ = (sel) => document.querySelector(sel);
const gericht = (id) => zustand.gerichte.find((g) => g.id === id);
const mitglied = (id) => zustand.mitglieder.find((m) => m.id === id);

function datumLang(iso) {
  const d = parseDatum(iso);
  return `${WOCHENTAGE[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

function badges(g) {
  if (!g) return '';
  const b = [];
  if (g.vegetarisch) b.push('<span class="badge veg">veg</span>');
  if (g.arabisch) b.push('<span class="badge arab">arabisch</span>');
  if (g.oesterreichisch) b.push('<span class="badge at">AT</span>');
  if (g.suess_mit_suppe) b.push('<span class="badge suess">süß + Suppe</span>');
  return b.join(' ');
}

// "600 g Bergkäse | Kühlregal"
export function parseZutatZeile(zeile) {
  const m = zeile.trim().match(/^([\d.,/]+)\s*(\S+)\s+(.+?)(?:\s*\|\s*(.+))?$/);
  if (!m) return zeile.trim() ? { name: zeile.trim(), menge: 1, einheit: 'Stk', abteilung: 'Sonstiges' } : null;
  const menge = m[1].includes('/') ? m[1].split('/').reduce((a, b) => Number(a) / Number(b)) : Number(m[1].replace(',', '.'));
  return { menge, einheit: m[2], name: m[3].trim(), abteilung: m[4]?.trim() || 'Sonstiges' };
}

const zutatZeile = (z) => `${String(z.menge).replace('.', ',')} ${z.einheit} ${z.name} | ${z.abteilung}`;

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2500);
}

// ---------- Laden & Speichern ----------

async function ladeStammdaten() {
  let gerichte = await store.get('gerichte');
  if (!gerichte) {
    gerichte = await (await fetch('src/data/gerichte.json')).json();
    await store.set('gerichte', gerichte);
  }
  zustand.gerichte = gerichte;
  zustand.mitglieder = (await store.get('mitglieder')) ?? [];
  let grund = await store.get('grundeinkaeufe');
  if (!grund) {
    grund = await (await fetch('src/data/grundeinkaeufe.json')).json();
    await store.set('grundeinkaeufe', grund);
  }
  zustand.grundeinkaeufe = grund;
  zustand.einstellungen = { einkaufstage: [1, 4], ...((await store.get('einstellungen')) ?? {}) };
  store.watch('gerichte', (v) => v && ((zustand.gerichte = v), render()));
  store.watch('mitglieder', (v) => ((zustand.mitglieder = v ?? []), render()));
  store.watch('grundeinkaeufe', (v) => ((zustand.grundeinkaeufe = v ?? []), render()));
}

function beobachteMonat() {
  stopPlan?.();
  const key = monatsKey(zustand.monat);
  const stopA = store.watch(`anwesenheit_${key}`, (v) => ((zustand.anwesenheit = v ?? {}), render()));
  const stopP = store.watch(`plan_${key}`, (v) => {
    zustand.plan = v;
    zustand.listen = v?.listen ?? [];
    if (!zustand.listen.some((l) => l.id === zustand.listeId)) waehleListe(heutigeListe());
    render();
  });
  stopPlan = () => (stopA(), stopP());
}

function heutigeListe() {
  const heute = isoDatum(new Date());
  return (zustand.listen.find((l) => l.von <= heute && heute <= l.bis) ?? zustand.listen[0])?.id ?? null;
}

function waehleListe(id) {
  stopListe?.();
  zustand.listeId = id;
  zustand.liste = null;
  if (!id) return;
  stopListe = store.watch(`liste_${id}`, (v) => ((zustand.liste = v), render()));
}

// Plan speichern und daraus die Einkaufslisten neu berechnen; abgehakte
// Positionen und eigene Ergänzungen bleiben erhalten.
async function speicherePlan(plan) {
  const listen = erzeugeEinkaufslisten({ plan, gerichte: zustand.gerichte, grundeinkaeufe: zustand.grundeinkaeufe, einkaufstage: zustand.einstellungen.einkaufstage });
  for (const l of listen) {
    const alt = await store.get(`liste_${l.id}`);
    await store.set(`liste_${l.id}`, { ...l, erledigt: alt?.erledigt ?? {}, extra: alt?.extra ?? [] });
  }
  await store.set(`plan_${monatsKey(zustand.monat)}`, { ...plan, listen: listen.map(({ id, von, bis }) => ({ id, von, bis })) });
}

// ---------- Ansichten ----------

function ansichtPlan() {
  const { plan, monat } = zustand;
  const kopf = `
    <div class="leiste">
      <button data-aktion="monat" data-delta="-1" aria-label="Vormonat">‹</button>
      <h2>${MONATE[monat.monat - 1]} ${monat.jahr}</h2>
      <button data-aktion="monat" data-delta="1" aria-label="Nächster Monat">›</button>
    </div>
    <div class="aktionen">
      <button class="primaer" data-aktion="plan-erzeugen">${plan ? 'Neu erzeugen' : 'Plan erzeugen'}</button>
      ${plan ? '<button data-aktion="plan-csv">Als CSV exportieren</button>' : ''}
    </div>`;
  if (!plan) return `${kopf}<p class="leer">Für diesen Monat gibt es noch keinen Plan. Trag zuerst unter „Familie" ein, wer an welchen Tagen da ist, dann erzeuge den Plan.</p>`;

  const warnungen = [...plan.warnungen, ...pruefePlan(plan, zustand.gerichte)];
  const zeilen = plan.tage.map((t, i) => {
    const g = gericht(t.gerichtId);
    const montag = parseDatum(t.datum).getDay() === 1 && i > 0;
    const alts = (t.alternativen ?? [])
      .map((a) => `<div class="alt">Für ${esc(mitglied(a.mitgliedId)?.name ?? '?')}: ${esc(gericht(a.gerichtId)?.name ?? 'keine Alternative gefunden')}
        <button class="klein" data-aktion="alt-tauschen" data-index="${i}" data-mitglied="${esc(a.mitgliedId)}">tauschen</button></div>`)
      .join('');
    const optionen = zustand.gerichte
      .filter((x) => !x.gesperrt && (t.rest || x.kategorien.includes(t.kategorie)))
      .map((x) => `<option value="${x.id}" ${x.id === t.gerichtId ? 'selected' : ''}>${esc(x.name)}</option>`)
      .join('');
    return `${montag ? '<tr class="trenner"><td colspan="3"></td></tr>' : ''}
      <tr class="${t.rest ? 'rest' : ''}">
        <td class="datum">${datumLang(t.datum)}<br><small>${esc(t.kategorie)}</small></td>
        <td>
          ${t.rest ? '<small>Rest vom Vortag</small><br>' : ''}
          <strong>${esc(g?.name ?? '–')}</strong>${t.variante ? ` <small>(${esc(t.variante)})</small>` : ''} ${badges(g)}
          ${alts}
        </td>
        <td class="werkzeug">${t.rest ? '' : `
          <button class="klein" data-aktion="tag-tauschen" data-index="${i}" title="Anderes passendes Gericht">↻</button>
          <select data-aktion="tag-waehlen" data-index="${i}" aria-label="Gericht wählen">${optionen}</select>`}
        </td>
      </tr>`;
  });
  return `${kopf}
    ${warnungen.length ? `<div class="warnung">${warnungen.map(esc).join('<br>')}</div>` : ''}
    <table class="plan">${zeilen.join('')}</table>`;
}

function ansichtEinkauf() {
  const { listen, liste } = zustand;
  if (!listen.length) return '<p class="leer">Noch keine Einkaufslisten. Erzeuge zuerst unter „Plan" einen Monatsplan.</p>';
  const auswahl = listen
    .map((l) => `<option value="${l.id}" ${l.id === zustand.listeId ? 'selected' : ''}>${datumLang(l.von)} – ${datumLang(l.bis)}</option>`)
    .join('');
  if (!liste) return `<select data-aktion="liste-waehlen">${auswahl}</select><p class="leer">Lade …</p>`;

  const positionen = [...liste.positionen, ...(liste.extra ?? []).map((p) => ({ ...p, extra: true }))];
  const offen = positionen.filter((p) => !liste.erledigt?.[schluessel(p)]).length;
  const gruppen = new Map();
  for (const p of positionen) {
    const a = p.abteilung ?? 'Sonstiges';
    if (!gruppen.has(a)) gruppen.set(a, []);
    gruppen.get(a).push(p);
  }
  const reihenfolge = [...gruppen.keys()].sort((a, b) => ABTEILUNGEN.indexOf(a) - ABTEILUNGEN.indexOf(b));
  return `
    <div class="leiste"><select data-aktion="liste-waehlen">${auswahl}</select><span>${offen} offen</span></div>
    <form class="zeile" data-aktion="extra-hinzu">
      <input name="text" placeholder="Etwas ergänzen, z. B. 2 Stk Zitronen | Obst & Gemüse" required>
      <button class="primaer">+</button>
    </form>
    ${reihenfolge
      .map((a) => `<h3>${esc(a)}</h3><ul class="einkauf">${gruppen
        .get(a)
        .map((p) => {
          const k = schluessel(p);
          const ok = liste.erledigt?.[k];
          return `<li class="${ok ? 'erledigt' : ''}"><label>
            <input type="checkbox" data-aktion="abhaken" data-key="${esc(k)}" ${ok ? 'checked' : ''}>
            <span class="menge">${esc(String(p.menge).replace('.', ','))} ${esc(p.einheit)}</span> ${esc(p.name)}
            <small>${esc((p.quellen ?? []).join(', '))}</small></label></li>`;
        })
        .join('')}</ul>`)
      .join('')}`;
}

// Firestore-Feldpfade vertragen keine Punkte o. Ä.
const schluessel = (p) => `${p.name}_${p.einheit}`.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_');

function ansichtFamilie() {
  const { mitglieder, monat, anwesenheit } = zustand;
  const karten = mitglieder
    .map((m) => {
      const merk = Object.entries(MERKMALE)
        .map(([k, l]) => `<label class="chip"><input type="checkbox" data-aktion="merkmal" data-mitglied="${m.id}" data-merkmal="${k}" ${m.ablehntMerkmale?.includes(k) ? 'checked' : ''}> ${l}</label>`)
        .join('');
      const liste = (ids) => (ids ?? []).map((id) => esc(gericht(id)?.name)).join(', ') || '–';
      return `<div class="karte">
        <div class="leiste"><h3>${esc(m.name)}</h3><button class="klein" data-aktion="mitglied-loeschen" data-mitglied="${m.id}">entfernen</button></div>
        <p><strong>Isst nicht (Merkmal):</strong></p><div class="chips">${merk}</div>
        <p><strong>Isst nicht:</strong> ${liste(m.ablehnt)}</p>
        <p><strong>Lieblingsgerichte:</strong> ${liste(m.mag)}</p>
        <div class="zeile">
          <select data-mitglied="${m.id}" class="gericht-wahl">${zustand.gerichte.filter((g) => !g.gesperrt).map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>
          <button class="klein" data-aktion="praeferenz" data-art="mag" data-mitglied="${m.id}">♥ mag</button>
          <button class="klein" data-aktion="praeferenz" data-art="ablehnt" data-mitglied="${m.id}">✕ isst nicht</button>
        </div>
      </div>`;
    })
    .join('');

  const tage = [];
  for (let d = new Date(monat.jahr, monat.monat - 1, 1); d.getMonth() === monat.monat - 1; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) tage.push(isoDatum(d));
  const raster = mitglieder.length
    ? `<div class="scroll"><table class="anwesenheit"><tr><th></th>${mitglieder.map((m) => `<th>${esc(m.name)}</th>`).join('')}</tr>
      ${tage
        .map((t) => {
          const da = anwesende(t, mitglieder, anwesenheit).map((m) => m.id);
          return `<tr><td>${datumLang(t)}</td>${mitglieder
            .map((m) => `<td><input type="checkbox" aria-label="${esc(m.name)} am ${t}" data-aktion="anwesend" data-datum="${t}" data-mitglied="${m.id}" ${da.includes(m.id) ? 'checked' : ''}></td>`)
            .join('')}</tr>`;
        })
        .join('')}</table></div>`
    : '';

  return `
    <h2>Familienmitglieder</h2>
    <form class="zeile" data-aktion="mitglied-hinzu"><input name="name" placeholder="Name" required><button class="primaer">Hinzufügen</button></form>
    ${karten}
    ${mitglieder.length ? `<h2>Wer ist im ${MONATE[monat.monat - 1]} zuhause?</h2><p><small>Standard: alle. Häkchen entfernen, wenn jemand nicht mitisst.</small></p>${raster}` : ''}`;
}

function ansichtGerichte() {
  return `
    <h2>Gerichte (${zustand.gerichte.length})</h2>
    <input type="search" id="gericht-suche" placeholder="Suchen …">
    <ul class="gerichte">
      ${zustand.gerichte
        .map((g) => `<li data-name="${esc(g.name.toLowerCase())}"><details>
          <summary><strong>${esc(g.name)}</strong> ${badges(g)} <small>${esc(g.kategorien.join(' / '))}${g.gesperrt ? ' · gesperrt' : ''}</small></summary>
          ${g.varianten?.length ? `<p>Varianten: ${esc(g.varianten.join(', '))}</p>` : ''}
          <label>Zutaten für 6 Portionen (eine pro Zeile: „Menge Einheit Name | Abteilung")
            <textarea rows="6" data-gericht="${g.id}">${esc((g.zutaten ?? []).map(zutatZeile).join('\n'))}</textarea></label>
          <button class="klein" data-aktion="zutaten-speichern" data-gericht="${g.id}">Speichern</button>
        </details></li>`)
        .join('')}
    </ul>`;
}

function ansichtEinstellungen() {
  const tage = [1, 2, 3, 4, 5, 6, 0]
    .map((t) => `<label class="chip"><input type="checkbox" data-aktion="einkaufstag" data-tag="${t}" ${zustand.einstellungen.einkaufstage.includes(t) ? 'checked' : ''}> ${WOCHENTAGE[t]}</label>`)
    .join('');
  const zeile = (rhythmus) =>
    zustand.grundeinkaeufe
      .filter((g) => g.rhythmus === rhythmus)
      .map(zutatZeile)
      .join('\n');
  return `
    <h2>Einkaufstage</h2><div class="chips">${tage}</div>
    <h2>Grundeinkäufe</h2>
    <p><small>Eine Zeile pro Artikel: „Menge Einheit Name | Abteilung"</small></p>
    ${RHYTHMEN.map((r, i) => `<label>${RHYTHMUS_LABEL[r]}<textarea rows="5" id="grund-${i}">${esc(zeile(r))}</textarea></label>`).join('')}
    <button class="primaer" data-aktion="grund-speichern">Grundeinkäufe speichern</button>
    <h2>Haushalt</h2>
    ${store.modus === 'firebase'
      ? `<p>Einladungscode für die Familie: <code>${esc(store.haushaltId)}</code></p><button data-aktion="abmelden">Abmelden</button>`
      : '<p class="warnung">Demo-Modus: Daten liegen nur in diesem Browser. Zum Teilen in der Familie Firebase einrichten (siehe README).</p>'}`;
}

function ansichtAnmeldung(status) {
  if (!status.angemeldet) return '<div class="karte"><h2>Willkommen bei CookAndEat</h2><button class="primaer" data-aktion="anmelden">Mit Google anmelden</button></div>';
  return `<div class="karte"><h2>Haushalt einrichten</h2>
    <form class="zeile" data-aktion="haushalt-anlegen"><input name="name" placeholder="Name, z. B. Familie Huber" required><button class="primaer">Neu anlegen</button></form>
    <p>oder</p>
    <form class="zeile" data-aktion="haushalt-beitreten"><input name="code" placeholder="Einladungscode" required><button>Beitreten</button></form></div>`;
}

const ANSICHTEN = { plan: ansichtPlan, einkauf: ansichtEinkauf, familie: ansichtFamilie, gerichte: ansichtGerichte, einstellungen: ansichtEinstellungen };

function render() {
  const main = $('main');
  const fokus = document.activeElement?.id;
  const suche = $('#gericht-suche')?.value;
  main.innerHTML = ANSICHTEN[zustand.tab]();
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === zustand.tab ? 'page' : 'false'));
  if (suche) {
    $('#gericht-suche').value = suche;
    filterGerichte(suche);
  }
  if (fokus) document.getElementById(fokus)?.focus();
}

function filterGerichte(text) {
  const q = text.toLowerCase();
  document.querySelectorAll('.gerichte li').forEach((li) => (li.hidden = !li.dataset.name.includes(q)));
}

// ---------- Aktionen ----------

function tauscheGericht(plan, index, neueId) {
  const tag = plan.tage[index];
  const g = gericht(neueId);
  tag.gerichtId = neueId;
  tag.variante = g.varianten?.[0] ?? null;
  const rnd = Math.random;
  tag.alternativen = anwesende(tag.datum, zustand.mitglieder, zustand.anwesenheit)
    .filter((p) => lehntAb(p, g))
    .map((p) => ({ mitgliedId: p.id, gerichtId: alternativeFuer(p, g, tag.kategorie, zustand.gerichte, rnd)?.id ?? null }));
  // Sonntag übernimmt das Samstagsgericht
  const folge = plan.tage[index + 1];
  if (folge?.rest) {
    folge.gerichtId = neueId;
    folge.variante = tag.variante;
  }
}

const AKTIONEN = {
  async monat(el) {
    const d = new Date(zustand.monat.jahr, zustand.monat.monat - 1 + Number(el.dataset.delta), 1);
    zustand.monat = { jahr: d.getFullYear(), monat: d.getMonth() + 1 };
    beobachteMonat();
    render();
  },
  async 'plan-erzeugen'() {
    if (zustand.plan && !confirm('Der bestehende Plan wird ersetzt. Fortfahren?')) return;
    const { jahr, monat } = zustand.monat;
    const vor = await store.get(`plan_${monatsKey({ jahr: monat === 1 ? jahr - 1 : jahr, monat: monat === 1 ? 12 : monat - 1 })}`);
    const letzterSamstag = vor?.tage.filter((t) => parseDatum(t.datum).getDay() === 6).at(-1);
    const plan = erzeugeMonatsplan({ jahr, monat, gerichte: zustand.gerichte, mitglieder: zustand.mitglieder, anwesenheit: zustand.anwesenheit, vorSamstagGericht: letzterSamstag?.gerichtId ?? null });
    await speicherePlan(plan);
    toast('Plan erzeugt');
  },
  async 'tag-tauschen'(el) {
    const plan = structuredClone(zustand.plan);
    const tag = plan.tage[Number(el.dataset.index)];
    const alt = gericht(tag.gerichtId);
    const benutzt = new Set(plan.tage.map((t) => t.gerichtId));
    const kandidaten = zustand.gerichte.filter(
      (g) => !g.gesperrt && !benutzt.has(g.id) && g.kategorien.includes(tag.kategorie) && g.arabisch === alt.arabisch && g.oesterreichisch === alt.oesterreichisch,
    );
    if (!kandidaten.length) return toast('Kein weiteres passendes Gericht frei');
    tauscheGericht(plan, Number(el.dataset.index), kandidaten[Math.floor(Math.random() * kandidaten.length)].id);
    await speicherePlan(plan);
  },
  async 'tag-waehlen'(el) {
    const plan = structuredClone(zustand.plan);
    tauscheGericht(plan, Number(el.dataset.index), Number(el.value));
    await speicherePlan(plan);
  },
  async 'alt-tauschen'(el) {
    const plan = structuredClone(zustand.plan);
    const tag = plan.tage[Number(el.dataset.index)];
    const a = tag.alternativen.find((x) => x.mitgliedId === el.dataset.mitglied);
    const neu = alternativeFuer(mitglied(a.mitgliedId), gericht(tag.gerichtId), tag.kategorie, zustand.gerichte.filter((g) => g.id !== a.gerichtId));
    a.gerichtId = neu?.id ?? a.gerichtId;
    await speicherePlan(plan);
  },
  'plan-csv'() {
    const zeilen = [['Datum', 'Kategorie', 'Gericht', 'Variante', 'Alternativen']];
    for (const t of zustand.plan.tage) {
      const alts = (t.alternativen ?? []).map((a) => `${mitglied(a.mitgliedId)?.name}: ${gericht(a.gerichtId)?.name}`).join('; ');
      zeilen.push([t.datum, t.kategorie, gericht(t.gerichtId)?.name ?? '', t.variante ?? '', alts]);
    }
    const csv = '﻿' + zeilen.map((z) => z.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `Speiseplan_${monatsKey(zustand.monat)}.csv`;
    a.click();
  },
  'liste-waehlen'(el) {
    waehleListe(el.value);
    render();
  },
  async abhaken(el) {
    await store.patch(`liste_${zustand.listeId}`, `erledigt.${el.dataset.key}`, el.checked);
  },
  async 'extra-hinzu'(form) {
    const z = parseZutatZeile(form.text.value);
    if (!z) return;
    await store.set(`liste_${zustand.listeId}`, { ...zustand.liste, extra: [...(zustand.liste.extra ?? []), { ...z, quellen: ['ergänzt'] }] });
  },
  async 'mitglied-hinzu'(form) {
    const m = { id: crypto.randomUUID().slice(0, 8), name: form.name.value.trim(), ablehnt: [], ablehntMerkmale: [], mag: [] };
    await store.set('mitglieder', [...zustand.mitglieder, m]);
  },
  async 'mitglied-loeschen'(el) {
    const m = mitglied(el.dataset.mitglied);
    if (!confirm(`${m.name} entfernen?`)) return;
    await store.set('mitglieder', zustand.mitglieder.filter((x) => x.id !== m.id));
  },
  async merkmal(el) {
    const liste = zustand.mitglieder.map((m) => {
      if (m.id !== el.dataset.mitglied) return m;
      const s = new Set(m.ablehntMerkmale ?? []);
      el.checked ? s.add(el.dataset.merkmal) : s.delete(el.dataset.merkmal);
      return { ...m, ablehntMerkmale: [...s] };
    });
    await store.set('mitglieder', liste);
  },
  async praeferenz(el) {
    const id = Number(document.querySelector(`.gericht-wahl[data-mitglied="${el.dataset.mitglied}"]`).value);
    const art = el.dataset.art;
    const gegen = art === 'mag' ? 'ablehnt' : 'mag';
    const liste = zustand.mitglieder.map((m) => {
      if (m.id !== el.dataset.mitglied) return m;
      const aktiv = (m[art] ?? []).includes(id);
      return { ...m, [art]: aktiv ? m[art].filter((x) => x !== id) : [...(m[art] ?? []), id], [gegen]: (m[gegen] ?? []).filter((x) => x !== id) };
    });
    await store.set('mitglieder', liste);
  },
  async anwesend(el) {
    const { datum } = el.dataset;
    const da = new Set(anwesende(datum, zustand.mitglieder, zustand.anwesenheit).map((m) => m.id));
    el.checked ? da.add(el.dataset.mitglied) : da.delete(el.dataset.mitglied);
    await store.set(`anwesenheit_${monatsKey(zustand.monat)}`, { ...zustand.anwesenheit, [datum]: [...da] });
  },
  async 'zutaten-speichern'(el) {
    const id = Number(el.dataset.gericht);
    const text = document.querySelector(`textarea[data-gericht="${id}"]`).value;
    const zutaten = text.split('\n').map(parseZutatZeile).filter(Boolean);
    await store.set('gerichte', zustand.gerichte.map((g) => (g.id === id ? { ...g, zutaten } : g)));
    toast('Zutaten gespeichert');
  },
  async einkaufstag(el) {
    const s = new Set(zustand.einstellungen.einkaufstage);
    el.checked ? s.add(Number(el.dataset.tag)) : s.delete(Number(el.dataset.tag));
    zustand.einstellungen = { ...zustand.einstellungen, einkaufstage: [...s] };
    await store.set('einstellungen', zustand.einstellungen);
    if (zustand.plan) await speicherePlan(zustand.plan);
  },
  async 'grund-speichern'() {
    const lies = (i, rhythmus) => $(`#grund-${i}`).value.split('\n').map(parseZutatZeile).filter(Boolean).map((z) => ({ ...z, rhythmus }));
    await store.set('grundeinkaeufe', RHYTHMEN.flatMap((r, i) => lies(i, r)));
    if (zustand.plan) await speicherePlan(zustand.plan);
    toast('Grundeinkäufe gespeichert');
  },
  async anmelden() {
    await store.anmelden();
    location.reload();
  },
  async abmelden() {
    await store.abmelden();
    location.reload();
  },
  async 'haushalt-anlegen'(form) {
    await store.haushaltAnlegen(form.name.value.trim());
    location.reload();
  },
  async 'haushalt-beitreten'(form) {
    await store.haushaltBeitreten(form.code.value);
    location.reload();
  },
};

function verdrahte() {
  document.querySelector('nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    zustand.tab = b.dataset.tab;
    render();
  });
  const main = $('main');
  const ausfuehren = async (name, el) => {
    try {
      await AKTIONEN[name]?.(el);
    } catch (err) {
      console.error(err);
      toast(`Fehler: ${err.message}`);
    }
  };
  main.addEventListener('click', (e) => {
    const el = e.target.closest('button[data-aktion]');
    if (el) ausfuehren(el.dataset.aktion, el);
  });
  main.addEventListener('change', (e) => {
    const el = e.target.closest('input[data-aktion], select[data-aktion]');
    if (el && (el.type === 'checkbox' || el.tagName === 'SELECT')) ausfuehren(el.dataset.aktion, el);
  });
  main.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-aktion]');
    if (!form) return;
    e.preventDefault();
    ausfuehren(form.dataset.aktion, form);
  });
  main.addEventListener('input', (e) => {
    if (e.target.id === 'gericht-suche') filterGerichte(e.target.value);
  });
}

async function start() {
  verdrahte();
  const status = await store.init();
  if (!status.angemeldet || !status.haushaltId) {
    $('nav').hidden = true;
    $('main').innerHTML = ansichtAnmeldung(status);
    return;
  }
  await ladeStammdaten();
  beobachteMonat();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
