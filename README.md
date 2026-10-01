# SWS / SDP3 Signalerfassung Analyse-Tool

Browserbasierte Auswertung von `.txt`-Signalerfassungen aus SWS und SDP3. Die Messdaten werden lokal im Browser verarbeitet; die App bietet Tabelle, Kurvendiagramm (alle Signale, überlagerbar), Erfassungsmarker, eigene Marker, Zeitbereiche, Notizen mit Rückgängig/Wiederholen sowie PDF-, Excel-, Support-ZIP- und Projekt-Export.

Live: [signalerfassung.com](https://signalerfassung.com)

Landingpage, Zugangsanfrage, Analyse-App, Handbuch, Rechtstexte, Auswertungen, Exporte und Kundenmails sind durchgaengig auf Deutsch und Englisch verfuegbar. Die gewaehlte Sprache wird von der Zugangsanfrage bis zur Freigabemail beibehalten; interne Admin-Benachrichtigungen bleiben deutsch.

## Wichtige Dateien

- `index.html` - oeffentliche Landingpage
- `zugang-anfragen.html` - oeffentliches Formular fuer neue Zugangsanfragen
- `signalerfassung-analyse-tool.html` - geschuetzte Analyse-App (Import, Tabelle, Diagramm, Excel-Export)
- `handbuch.html` und `handbuch/` - geschuetztes Handbuch DE/EN mit Screenshots
- `assets/annotations.js` - Werkzeugleiste: Marker, Zeitraeume, Notizen, Erfassungsmarker, Rueckgaengig
- `assets/chart-signals.js` - Signalauswahl und Ueberlagern im Diagramm
- `assets/chart-height.js` - Hoehenregler (Y-Achse) mit Mausrad
- `assets/report-export.js` - PDF-Bericht, Diagrammbilder und zusaetzliche Excel-Blaetter
- `assets/help.js` - Kurzhilfe in der App (DE/EN)
- `impressum.html` und `datenschutz.html` - oeffentliche Rechtstexte
- `admin/index.html` - geschuetzte Benutzerverwaltung und Nutzungsstatistik
- `server/server.js` - lokaler Admin- und Statistikdienst hinter Nginx
- `server/mailer.js` - SMTP-Versand fuer Anfrage- und Zugangsmails
- `deploy/` - Nginx-, systemd-, Release- und Verifikationsdateien
- `samples/` - echte Messdateien fuer Tests (gitignored, nicht im Repository)

## Erfassungsmarker

Die Spalte `Marker` zaehlt die Druecke auf den Markerknopf waehrend der Messfahrt hoch (0, 1, 2, ...) und behaelt den letzten Wert. Ein Erfassungsmarker ist die Zeile, in der der Zaehler steigt. Erfassungsmarker sind eine eigene Ebene (`file.txtMarkersVisible`, `file.txtMarkerColor`) und veraendern nie `row.marked` der eigenen Marker. Alte Projekte, in denen "Zeitstempel markieren" alle Zeilen ab dem ersten Druck markiert hatte, werden beim Oeffnen umgestellt.

## Entwicklung und Pruefung

Kein Build-Schritt. Einmalig installieren:

```powershell
npm install
npm --prefix server ci
```

Lokale Vorschau ohne Login (Nutzungsstatistik wird lokal still beantwortet):

```powershell
npm run serve
```

Danach `http://localhost:8080/signalerfassung-analyse-tool.html` bzw. `http://localhost:8080/handbuch.html` oeffnen.

Alle Tests (Server und Browser, Playwright mit installiertem Chrome). Die Tests mit echten Messdateien brauchen `samples/Test_signalerfassung.txt` und weitere `.txt` in `samples/`:

```powershell
npm test
node tools/run-tests.cjs test-toolbox test-export-report
```

Handbuch-Screenshots neu erzeugen (benoetigt eine Messdatei in `samples/`, fuer die Berichtsseiten einmalig `npm install --no-save pdfjs-dist@3.11.174`, fuer WebP ImageMagick):

```powershell
node tools/create-handbook-screenshots.cjs
```

## Deployment

Ein Befehl prueft, packt, laedt hoch, schaltet um und verifiziert:

```powershell
node tools/release.cjs            # Tests + Paket in tmp/release/ (kein Upload)
node tools/release.cjs --deploy   # zusaetzlich Upload nach root@strato-vps, Umschalten, verify-release.sh
```

Voraussetzungen: sauberer Git-Stand (sonst `--allow-dirty` nur fuer Testpakete), Tailscale verbunden, SSH-Zugang zu `strato-vps`. Das Skript versieht alle CSS-/JS-Verweise der HTML-Seiten mit der Release-Kennung als Cache-Version, normalisiert Zeilenenden fuer den Server und nutzt `deploy/deploy-release.sh`: Releases liegen getrennt unter `/var/www/signalerfassung.com/releases/`, der `current`-Symlink wird erst nach Syntax- und Dateipruefungen umgeschaltet und bei fehlgeschlagenem Dienststart oder Healthcheck automatisch zurueckgesetzt. Andere Serverprojekte werden nicht veraendert. Nach dem Deployment in Projekt-Master `log_deployment` eintragen.

Benutzer, Nutzungsstatistik, Zugangsanfragen und die optionale Mail-Konfiguration liegen release-unabhaengig unter `/var/www/signalerfassung.com/shared/`. Fuer Gmail wird dort eine nur fuer `root` und die Webdienst-Gruppe lesbare `mail.env` mit `SMTP_USER` und einem Google-App-Passwort als `SMTP_PASS` hinterlegt.

## Datenschutz

Signalerfassungsdateien koennen interne technische Messdaten enthalten. Die Analyse und Exporterstellung erfolgen lokal im Browser. Der Server protokolliert nur die in der Datenschutzerklaerung genannten Nutzungsereignisse; Messdateien werden nicht hochgeladen. Handbuch und Screenshots liegen hinter dem Login.

## Sicherheit und Projekt-Master (30.09.2026)

- Die Admin-API glaubt `X-Remote-User` nur zusammen mit dem geheimen Header `X-Admin-Proxy`, den nginx mitschickt. Das Geheimnis erzeugt `deploy-release.sh` einmalig (`/etc/nginx/snippets/signalerfassung-admin-proxy.conf`, `shared/admin-proxy.env`) – es steht nie in Git.
- `GET /internal/kpis`: Kennzahlen für Projekt-Master (nur Zahlen, keine Namen, E-Mails oder Feedback-Inhalte). Nur lokal, Token `PM_KPI_TOKEN` in `shared/pm-kpi.env`.
- Feedbackbögen werden gezählt (`shared/feedback-stats.ndjson`: Zeit, Sprache, anonym, Anzahl Anhänge, Mailversand ok) – ohne Inhalte.
- Tests: `npm test` (inklusive `server`).
