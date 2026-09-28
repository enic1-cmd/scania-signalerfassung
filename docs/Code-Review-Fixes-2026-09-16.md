# Code-Review-Korrekturen vom 16. September 2026

Ausgangspunkt war `docs/Code-Review-2026-09-15.md`. Die bestaetigten Fehler wurden im lokalen Projektstand korrigiert. Es wurde in diesem Arbeitsschritt kein Produktions-Deployment ausgefuehrt.

## Korrigiert

- Importierte Signaltexte werden in HTML-Texten und Attributen sicher maskiert.
- Das Kurvendiagramm verwendet die reale Messzeit, erhaelt kurze Min-/Max-Spitzen und trennt Kurven an fehlenden Messwerten.
- Ein oder zwei numerische Messpunkte werden als Diagrammsignal erkannt.
- Numerische Spalten werden beim Import vorverarbeitet; wiederholtes Zeichnen vermeidet erneute Textkonvertierungen.
- Zeitangaben ueber Mitternacht, Dauer und Zeitfilter werden korrekt behandelt.
- Tabellenvirtualisierung, Sprungfunktion und Notiznavigation verwenden eine gemeinsame reale Zeilenhoehe.
- Gleichnamige Dateien mit anderem Inhalt bleiben erhalten und erhalten unterscheidbare Tabnamen; identische Dubletten melden einen Fehler.
- Excel interpretiert deutsche Dezimalkommas und Dezimalpunkte als Zahlen.
- PDF-Berichte benennen die Obergrenze von 500 markierten Messzeilen transparent.
- Support-ZIP, PDF, Excel, Diagramm und Projektdatei verwenden einen gemeinsamen unveraenderlichen Export-Snapshot.
- Parallele Benutzeranlage, Passwortaenderung und Loeschung werden serverseitig serialisiert.
- Zu grosse Request-Bodies werden nicht weiter im Speicher gesammelt; Passwoerter mit Zeilenumbruechen werden abgelehnt.
- Ungespeicherte Markierungen, Notizen, Filter und Signaleinstellungen werden vor Navigation, Projektwechsel, Datei-Schliessen und Neustart geschuetzt.
- Eigene CSS-/JavaScript-Dateien tragen eine neue Cache-Version.
- Release- und Verifikationsskripte verwenden einen expliziten Release-Zeitstempel, sicheren Rollback und die korrekten Public-/Login-Statuscodes.

## Verifiziert

- `tools/test-pan-export.cjs`: PASS
- `tools/test-annotations.cjs`: PASS
- `tools/test-chart-height.cjs`: PASS
- `tools/test-workspace-layout.cjs`: PASS
- `tmp/review-codebase.cjs`: beide Originalformate und alle reproduzierten Randfaelle PASS
- `node --check server/server.js`: PASS

Die SDP3-Testdatei wird weiterhin mit 6.474 Messzeilen und 19 Signalen inklusive Marker erkannt. Die SWS-Testdatei wird weiterhin mit 77 Messzeilen und 6 Signalen inklusive Marker erkannt.
