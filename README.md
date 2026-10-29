# CookAndEat

Progressive Web App (PWA) für den monatlichen Familien-Speiseplan und zwei Einkaufslisten pro Woche. Läuft auf Android (über Chrome installierbar), am Laptop und auf anderen Smartphones. Mit Firebase teilt die Familie Plan und Listen in Echtzeit.

## Funktionen

- **Monatsplan nach festen Regeln**: Mo Veggie, Di Reis, Mi Kartoffel, Do Nudeln, Fr Fisch, Sa Großmenge, So Rest vom Samstag. Einmal pro Woche ein arabisches und ein klassisch österreichisches Gericht. Jedes Gericht (inkl. Varianten) höchstens einmal im Monat, gesperrte Gerichte nie.
- **Familie**: Mitglieder mit Präferenzen („isst nicht“, Lieblingsgerichte, abgelehnte Merkmale wie Fisch) und ein Anwesenheitskalender pro Tag.
- **Alternativen**: Lehnt eine anwesende Person das Tagesgericht ab, bleibt es im Plan, und die App schlägt für diese Person eine Alternative vor.
- **Einkaufslisten**: An den Einkaufstagen (Standard Mo + Do) gibt es eine Liste mit allen Zutaten bis zum nächsten Einkauf und den Grundeinkäufen. Die Mengen sind zusammengerechnet und nach Abteilung sortiert. Gerechnet wird mit 6 Portionen pro Gericht (4 Personen + 2 zum Mitnehmen), Großmengengerichte zählen doppelt, Alternativen als Einzelportion.
- **Gemeinsam abhaken**: Abgehakte Artikel sind sofort bei allen Familienmitgliedern abgehakt.
- Plan als CSV exportieren (öffnet sich in Excel).

## Starten (Demo-Modus, ohne Firebase)

```bash
npm start          # startet einen lokalen Server auf http://localhost:8080
npm test           # Unit-Tests für Planer und Einkaufslisten
```

Ohne Firebase-Konfiguration speichert die App nur im Browser.

## Firebase einrichten (zum Teilen in der Familie)

1. Auf <https://console.firebase.google.com> ein Projekt anlegen (der kostenlose Spark-Tarif reicht).
2. **Authentication** → Anbieter **Google** aktivieren.
3. **Firestore Database** anlegen (Region `europe-west3`, Produktionsmodus).
4. Projekteinstellungen → **Web-App hinzufügen** und die Konfiguration in `src/firebase-config.js` eintragen.
5. Firebase-CLI installieren und veröffentlichen:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # Projekt auswählen
   firebase deploy             # Sicherheitsregeln + Hosting
   ```
6. Die angezeigte Adresse (`https://<projekt>.web.app`) in Chrome auf dem Android-Handy öffnen → Menü → **Zum Startbildschirm hinzufügen**.
7. Die erste Person legt einen Haushalt an. Die anderen melden sich an und treten mit dem Einladungscode bei (zu finden unter „Mehr“).

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `src/planner.js` | Regelbasierter Monatsplan-Generator, Regelprüfung, Alternativen |
| `src/shopping.js` | Einkaufslisten: Zeitraum, Mengenaggregation, Sortierung |
| `src/store.js` | Datenhaltung: `LocalStore` (Browser) und `FirebaseStore` (Firestore, Echtzeit) |
| `src/app.js` | Oberfläche (Vanilla JS, ohne Build-Schritt) |
| `src/data/gerichte.json` | Startkatalog: 76 Gerichte mit Kategorien, Merkmalen und Zutaten für 6 Portionen |
| `firestore.rules` | Zugriff nur für Mitglieder des eigenen Haushalts |
| `docs/architektur.md` | Architektur und Designentscheidungen |
| `tests/` | Unit-Tests (`node --test`) |
