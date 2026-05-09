# SWS / SDP3 Signalerfassung Analyse-Tool

Lokale HTML-App zur strukturierten Auswertung von `.txt`-Dateien aus der SWS / SDP3 Signalerfassung.

## Inhalt

- `Scania_Signalanalyse_Final1.html` - Haupt-App fuer Upload, Analyse, Markierung und Export.
- `Scania_Signalerfassung_Homepage.html` - Erklaer-Homepage zur App.
- `assets/signalerfassung_logo_transparent.png` - Logo fuer die Oberflaeche.
- `assets/signalerfassung logo.png` - Original-Logo mit Hintergrund als Quell-/Referenzdatei.
- `assets/scania-showroom-bg.jpg` - Hintergrundbild fuer App und Homepage.
- `samples/Test_signalerfassung.txt` - lokale Beispielmessung, bewusst nicht versioniert.

## Funktionen

- Drag & Drop oder Dateiauswahl fuer Signalerfassungs-`.txt`-Dateien.
- Automatische Erkennung von Zeitraum, Samples, Abtastrate und Signalen.
- Spalten ausblenden und markieren.
- Zeilen markieren, um relevante Zeitpunkte hervorzuheben.
- Such- und Zeitfilter fuer schnelle Analyse.
- Export als Excel-Arbeitsmappe und PDF-Bericht fuer Support/Eskalationen.
- Direkte Links zu WIO, SPII, Operational Analysis und Conversion.

## Datenschutz

Signalerfassungsdateien koennen technische oder interne Messdaten enthalten. Deshalb sind `.txt`-Dateien standardmaessig per `.gitignore` vom Repository ausgeschlossen.

## Nutzung

Die App ist eine lokale HTML-Anwendung. Zum Starten einfach `Scania_Signalanalyse_Final1.html` im Browser oeffnen.

Die Homepage kann ueber `Scania_Signalerfassung_Homepage.html` geoeffnet werden.

## Hinweis

Dieses Projekt ist als internes Analyse- und Dokumentationstool gedacht.
