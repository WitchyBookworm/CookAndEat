# Architektur

## Anforderungen

| Nr | Anforderung | Umsetzung |
|---|---|---|
| A1 | Monatsplan aus eigenen Gerichten nach festen Regeln | `planner.js` |
| A2 | Zwei Einkaufslisten pro Woche: Grundeinkäufe + Zutaten | `shopping.js` |
| A3 | Läuft auf Android | PWA (Manifest + Service Worker), in Chrome installierbar |
| A4 | Listen familienintern teilen | Firebase Auth + Firestore mit Echtzeit-Listenern |
| A5 | Anwesenheit pro Tag und Präferenzen pro Person | Familie-Ansicht; beeinflusst Auswahl und Alternativen |
| A6 | Abgelehntes Gericht → Alternative für die Person | `alternativeFuer()` |
| A8 | Einkaufsliste in Bring! übernehmen | Offizieller Bring!-Import über Deeplink, Cloud Function `bring` |
| A7 | Mengen immer für 6 Portionen (4 + 2 Mitnahme) | Zutaten im Katalog sind für 6 Portionen angegeben |

## Komponenten

```
┌───────────── Browser / Android-PWA ─────────────┐
│  app.js (UI)                                     │
│    ├── planner.js   (reine Funktionen, getestet) │
│    ├── shopping.js  (reine Funktionen, getestet) │
│    └── store.js ──┬─ LocalStore (Demo)           │
│                   └─ FirebaseStore ──────────────┼──► Firebase Auth (Google)
│  sw.js (Offline-Cache)                           │    Cloud Firestore (Echtzeit)
└──────────────────────────────────────────────────┘    Firebase Hosting
```

Die Fachlogik (Planer, Einkaufslisten) ist von Oberfläche und Datenhaltung getrennt. Sie besteht aus reinen Funktionen und ist deshalb ohne Browser testbar.

## Datenmodell (Firestore)

```
benutzer/{uid}                   { haushaltId }
haushalte/{id}                   { name, mitgliederUids[] }
haushalte/{id}/daten/{key}       { wert }
   gerichte                      [ {id, name, varianten, kategorien, vegetarisch, arabisch,
                                    oesterreichisch, suess_mit_suppe, gesperrt, zutaten[]} ]
   mitglieder                    [ {id, name, ablehnt[], ablehntMerkmale[], mag[]} ]
   grundeinkaeufe                [ {name, menge, einheit, abteilung, rhythmus} ]
   einstellungen                 { einkaufstage[] }
   anwesenheit_YYYY-MM           { "YYYY-MM-DD": [mitgliedIds] }   (fehlt ein Tag = alle da)
   plan_YYYY-MM                  { seed, tage[], warnungen[], listen[] }
   liste_YYYY-MM-DD              { von, bis, positionen[], erledigt{}, extra[] }
```

Abgehakte Positionen werden als einzelnes Feld (`erledigt.<schlüssel>`) aktualisiert. So überschreiben sich zwei Personen, die gleichzeitig abhaken, nicht gegenseitig.

## Planungsalgorithmus

1. Der Monat wird in Wochen (Mo–So) geteilt. Jeder Tag bekommt seine Kategorie, der Sonntag übernimmt den Rest vom Samstag. Fällt der Monatsbeginn auf einen Sonntag, wird an diesem Tag selbst eine Großmenge gekocht.
2. Pro Woche werden zufällig ein Tag für das arabische und ein Tag für das österreichische Gericht bestimmt. Möglich sind nur Tage, für die noch ein passendes Gericht frei ist.
3. Jeder Tag wird gewichtet zufällig aus den zulässigen Gerichten befüllt. Zulässig heißt: passende Kategorie und passende Rolle, nicht gesperrt und im Monat noch nicht verwendet. Die Gewichtung: Ein Lieblingsgericht einer anwesenden Person zählt ×3, ein abgelehntes ×0,25.
4. Bleibt ein Tag leer, wird die Woche neu ausgewürfelt (bis zu 300 Versuche). Danach wird die Regel „nur ein österreichisches Gericht“ gelockert, und der Plan meldet eine Warnung.
5. Für jede anwesende Person, die das Tagesgericht ablehnt, wird eine Alternative gewählt. Bevorzugt werden Lieblingsgerichte und Gerichte derselben Kategorie.

Ein Seed macht jeden Plan reproduzierbar. `pruefePlan()` prüft die harten Regeln, die Tests prüfen 50 Seeds und alle Monate 2027.

## Bring!-Anbindung

Bring! bietet keine offizielle Schreib-Schnittstelle für Drittanbieter-Apps. Offiziell vorgesehen ist der Rezept-Import. Dabei liest Bring! eine Webseite mit schema.org/Recipe-Markup und übernimmt deren Zutaten. Der Ablauf in CookAndEat:

1. Tippt man „In Bring! übernehmen“, legt die App die offenen Positionen in `bringExporte/{token}` ab. Der Token ist zufällig (144 Bit). Lesen dürfen laut Sicherheitsregeln nur die Admin-Rechte der Cloud Function.
2. Die Cloud Function `bring` liefert unter `/bring/{token}` eine Seite mit den Positionen als `recipeIngredient` aus. Nach 7 Tagen ist die Adresse ungültig.
3. Die App öffnet `https://api.getbring.com/rest/bringrecipes/deeplink?url=…&source=web`. Bring! öffnet sich, liest die Seite und fragt, in welche Liste die Artikel kommen.

Verworfen wurde die inoffizielle Bring!-API. Sie würde das Bring!-Passwort auf dem Server speichern, ist von Bring! nicht freigegeben und kann jederzeit ausfallen.

## Bewusste Vereinfachungen

- Varianten eines Gerichts teilen sich eine Zutatenliste (die der Grundvariante).
- Salz, Pfeffer, Öl, Zucker und Standardgewürze gelten als Vorrat.
- Einheiten werden nicht umgerechnet (z. B. g ↔ kg). Gleiche Zutaten mit unterschiedlichen Einheiten erscheinen deshalb getrennt.
