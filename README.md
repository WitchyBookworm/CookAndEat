# CookAndEat

Progressive Web App (PWA) für den monatlichen Familien-Speiseplan und zwei Einkaufslisten pro Woche. Läuft auf Android (über Chrome installierbar), am Laptop und auf anderen Smartphones. Mit Firebase teilt die Familie Plan und Listen in Echtzeit.

## Funktionen

- **Monatsplan nach festen Regeln**: Mo Veggie, Di Reis, Mi Kartoffel, Do Nudeln, Fr Fisch, Sa Großmenge, So Rest vom Samstag. Einmal pro Woche ein arabisches und ein klassisch österreichisches Gericht. Jedes Gericht (inkl. Varianten) höchstens einmal im Monat, gesperrte Gerichte nie.
- **Familie**: Mitglieder mit Präferenzen („isst nicht“, Lieblingsgerichte, abgelehnte Merkmale wie Fisch) und ein Anwesenheitskalender pro Tag.
- **Alternativen**: Lehnt eine anwesende Person das Tagesgericht ab, bleibt es im Plan, und die App schlägt für diese Person eine Alternative vor.
- **Einkaufslisten**: An den Einkaufstagen (Standard Mo + Do) gibt es eine Liste mit allen Zutaten bis zum nächsten Einkauf und den Grundeinkäufen. Die Mengen sind zusammengerechnet und nach Abteilung sortiert. Gerechnet wird mit 6 Portionen pro Gericht (4 Personen + 2 zum Mitnehmen), Großmengengerichte zählen doppelt, Alternativen als Einzelportion.
- **Gemeinsam abhaken**: Abgehakte Artikel sind sofort bei allen Familienmitgliedern abgehakt.
- **Bring!-Import**: Knopf „In Bring! übernehmen“ übergibt die offenen Positionen über den offiziellen Bring!-Import (Deeplink + Rezeptseite nach schema.org). Bring! fragt anschließend, in welche Liste übernommen wird.
- Plan als CSV exportieren (öffnet sich in Excel).

## Starten (Demo-Modus, ohne Firebase)

```bash
npm start          # startet einen lokalen Server auf http://localhost:8080
npm test           # Unit-Tests für Planer und Einkaufslisten
```

Ohne Firebase-Konfiguration speichert die App nur im Browser.

## Firebase einrichten (zum Teilen in der Familie)

Der kostenlose **Spark-Tarif** reicht für alles außer dem Bring!-Import.

1. Auf <https://console.firebase.google.com> ein Projekt anlegen.
2. **Authentication** → Anbieter **Google** aktivieren.
3. **Firestore Database** anlegen (Standort `europe-west3`, Produktionsmodus).
4. Projekteinstellungen → **Web-App hinzufügen**, die Konfiguration in `src/firebase-config.js` und die Projekt-ID in `.firebaserc` eintragen.
5. Veröffentlichen (Hosting und Sicherheitsregeln aus `firestore.rules`), entweder automatisch per GitHub Actions (siehe unten) oder lokal:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only hosting,firestore:rules
   ```
6. Die Adresse `https://<projekt-id>.web.app` in Chrome auf dem Android-Handy öffnen → Menü → **Zum Startbildschirm hinzufügen**.
7. Die erste Person legt einen Haushalt an. Die anderen melden sich an und treten mit dem Einladungscode bei (zu finden unter „Mehr“).

### Automatisch veröffentlichen (GitHub Actions)

`.github/workflows/deploy.yml` veröffentlicht bei jedem Push auf `main` Hosting und Sicherheitsregeln. Einmalig nötig:

- In der Firebase-Konsole: Projekteinstellungen → Dienstkonten → „Neuen privaten Schlüssel generieren“ (JSON-Datei).
- In der Google-Cloud-Konsole (IAM) diesem Dienstkonto die Rollen *Firebase Hosting Admin*, *Firebase Rules Admin* und *Service Usage Consumer* geben.
- Im GitHub-Repository unter Settings → Secrets and variables → Actions das Secret `FIREBASE_SERVICE_ACCOUNT` (Inhalt der JSON-Datei) und die Variable `FIREBASE_PROJECT_ID` anlegen.

Solange die Variable `FIREBASE_PROJECT_ID` fehlt, wird der Schritt übersprungen.

### Bring!-Import (Blaze-Tarif)

Der Bring!-Import braucht eine Cloud Function und damit den Blaze-Tarif. Bei Familiennutzung bleibt er im kostenlosen Kontingent, ein Budget-Alarm von 1 € ist trotzdem empfehlenswert. Nach dem Wechsel:

```bash
(cd functions && npm install)
npx firebase-tools deploy --config firebase.blaze.json
```

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `src/planner.js` | Regelbasierter Monatsplan-Generator, Regelprüfung, Alternativen |
| `src/shopping.js` | Einkaufslisten: Zeitraum, Mengenaggregation, Sortierung |
| `src/store.js` | Datenhaltung: `LocalStore` (Browser) und `FirebaseStore` (Firestore, Echtzeit) |
| `src/app.js` | Oberfläche (Vanilla JS, ohne Build-Schritt) |
| `src/data/gerichte.json` | Startkatalog: 76 Gerichte mit Kategorien, Merkmalen und Zutaten für 6 Portionen |
| `functions/`, `firebase.blaze.json` | Cloud Function `bring` für den Bring!-Import (nur Blaze-Tarif) |
| `firestore.rules` | Zugriff nur für Mitglieder des eigenen Haushalts |
| `docs/architektur.md` | Architektur und Designentscheidungen |
| `tests/` | Unit-Tests (`node --test`) |
