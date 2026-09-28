# SWS / SDP3 Signalerfassung Analyse-Tool

Browserbasierte Auswertung von `.txt`-Signalerfassungen aus SWS und SDP3. Die Messdaten werden lokal im Browser verarbeitet; die App bietet Tabelle, Kurvendiagramm, Marker, Zeitbereiche, Notizen sowie PDF-, Excel-, Support-ZIP- und Projekt-Export.

Live: [signalerfassung.com](https://signalerfassung.com)

Landingpage, Zugangsanfrage, Analyse-App, Rechtstexte, Auswertungen, Exporte und Kundenmails sind durchgaengig auf Deutsch und Englisch verfuegbar. Die gewaehlte Sprache wird von der Zugangsanfrage bis zur Freigabemail beibehalten; interne Admin-Benachrichtigungen bleiben deutsch.

## Wichtige Dateien

- `index.html` - oeffentliche Landingpage
- `zugang-anfragen.html` - oeffentliches Formular fuer neue Zugangsanfragen
- `signalerfassung-analyse-tool.html` - geschuetzte Analyse-App
- `impressum.html` und `datenschutz.html` - oeffentliche Rechtstexte
- `admin/index.html` - geschuetzte Benutzerverwaltung und Nutzungsstatistik
- `assets/` - Oberflaechenmodule, Bilder und lokal eingebundene Bibliotheken
- `server/server.js` - lokaler Admin- und Statistikdienst hinter Nginx
- `server/mailer.js` - SMTP-Versand fuer Anfrage- und Zugangsmails
- `samples/Test_signalerfassung.txt` - SDP3-Testmessung
- `deploy/` - Nginx-, systemd-, Release- und Verifikationsdateien

## Entwicklung und Pruefung

Die App benoetigt fuer die Messdatenanalyse keinen Build-Schritt. Die automatisierten Browserpruefungen verwenden Playwright aus der Codex-Laufzeit:

```powershell
$env:NODE_PATH='C:\Users\david.breuer\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tools/test-pan-export.cjs
node tools/test-annotations.cjs
node tools/test-chart-height.cjs
node tools/test-workspace-layout.cjs
node tools/test-help.cjs
node tools/test-admin-hub.cjs
node tools/test-access-request.cjs
```

Die App kann lokal direkt ueber `signalerfassung-analyse-tool.html` geoeffnet werden. Fuer realistische Pfad-, Login- und API-Tests sollte sie ueber einen lokalen Webserver oder die Produktionskonfiguration aufgerufen werden.

## Deployment

Releases werden als getrennte Verzeichnisse unter `/var/www/signalerfassung.com/releases/` abgelegt. Andere Serverprojekte duerfen nicht veraendert werden. Das Release-Skript benoetigt den Zeitstempel des bereits hochgeladenen Archivs:

```bash
bash deploy/deploy-release.sh YYYYMMDD-HHMMSS
bash deploy/verify-release.sh
```

`deploy-release.sh` schaltet den `current`-Symlink erst nach Syntax- und Dateipruefungen um. Bei einem fehlgeschlagenen Dienststart oder Healthcheck wird der vorherige Releasepfad wiederhergestellt.

Benutzer, Nutzungsstatistik, Zugangsanfragen und die optionale Mail-Konfiguration liegen release-unabhaengig unter `/var/www/signalerfassung.com/shared/`. Fuer Gmail wird dort eine nur fuer `root` und die Webdienst-Gruppe lesbare `mail.env` mit `SMTP_USER` und einem Google-App-Passwort als `SMTP_PASS` hinterlegt.

## Datenschutz

Signalerfassungsdateien koennen interne technische Messdaten enthalten. Die Analyse und Exporterstellung erfolgen lokal im Browser. Der Server protokolliert nur die in der Datenschutzerklaerung genannten Nutzungsereignisse; Messdateien werden nicht hochgeladen.
