# Technischer Code-Review: Signalerfassung

Stand: 15. September 2026. Geprueft wurde der aktuelle lokale Stand nach Release `20260915-230929`.

## Wichtigste Ergebnisse

Zwei Befunde sollten zuerst korrigiert werden: Die App kann ueber praeparierte Signalmetadaten fremden JavaScript-Code ausfuehren, und die Kurvendarstellung kann kurze Messwertspitzen vollstaendig verschlucken. Daneben sind Fehler beim Tabellenende, bei Zeitberechnungen, bei gleichzeitigen Benutzerverwaltungsvorgaengen und beim Export reproduzierbar.

Die vier vorhandenen Funktionstests bestehen. Beide bereitgestellten Originalformate werden erkannt. Die Probleme zeigen sich ueberwiegend bei Sonderfaellen, groesseren Datenmengen und waehrend paralleler Bedienung.

Es wurden ausschliesslich Review-Skripte, Messergebnisse und dieser Bericht angelegt. Produktivcode, Oberflaeche, Zugangsdaten und Serverkonfiguration wurden im Review nicht veraendert. Es wurde nichts deployt.

Prioritaeten: P1 = zuerst beheben; P2 = anschliessend gezielt korrigieren; P3 = Wartung.

## Bestaetigte Befunde

### 1. P1: Fremder Code ueber Signalmetadaten ausfuehrbar

Fundstellen: `signalerfassung-analyse-tool.html:836`, `:1361`, `:1980`.

`esc()` ersetzt lediglich `&`, `<` und `>`. Die Funktion wird aber auch innerhalb von HTML-Attributen mit doppelten Anfuehrungszeichen eingesetzt, insbesondere beim `title` einer technischen Signal-ID. Ein Anfuehrungszeichen aus einer importierten Datei beendet das Attribut und kann einen Ereignishandler einschleusen.

Reproduktion: Eine synthetische SDP3-Datei mit einer praeparierten technischen Signal-ID wurde lokal importiert. Der Browser erzeugte ein zusaetzliches `onpointerenter`-Attribut. Beim Ausloesen des Ereignisses setzte der harmlose Testhandler eine Testvariable. Es wurden keine Daten versendet und keine Live-Anfragen damit ausgefuehrt.

Auswirkung: Beim Oeffnen und Bedienen einer entsprechend praeparierten TXT- oder Projektdatei kann Code im Ursprung der App laufen. Dieser koennte auf die im Browser geladenen Messdaten zugreifen und Anfragen mit den Rechten des angemeldeten Nutzers stellen. Der Login verhindert diesen Importpfad nicht.

Korrektur: Importierte Texte mit `textContent` und Attribute mit `setAttribute` setzen. Falls HTML-Strings bleiben, zwischen Text- und Attributkontext unterscheiden und beide Anfuehrungszeichen korrekt behandeln. Alle Aufrufer von `esc()` gemeinsam pruefen.

### 2. P1: Kurze Signalspitzen verschwinden beim Zeichnen

Fundstelle: `signalerfassung-analyse-tool.html:1197`.

Die App begrenzt die Kurve auf ungefaehr 1.800 Punkte, indem sie nur jeden n-ten Messpunkt zeichnet. Die dazwischenliegenden Minima und Maxima bleiben unberuecksichtigt.

Reproduktion: 3.601 Werte, davon genau ein Wert mit 100 und alle anderen mit 0. Der 100er-Wert liegt zwischen den ausgewaehlten Stuetzstellen. Die gezeichnete Kurve besteht aus 1.201 Punkten mit einer vertikalen Auslenkung von exakt 0. Der Wertebereich links beruecksichtigt zwar weiterhin die 100, die eigentliche Spitze ist aber unsichtbar.

Auswirkung: Kurze Einbrueche oder Spitzen koennen uebersehen werden. Derselbe Zeichenpfad wird fuer das Diagrammbild im Support-ZIP genutzt.

Korrektur: Pro Bildabschnitt mindestens die Extremwerte erhalten, z. B. zeitlich geordnete Min-/Max-Punkte pro Pixelbereich. Zusaetzlich Originalwerte fuer Tooltip und Markierungen beibehalten.

### 3. P2: Letzte Tabellenzeilen sind nicht vollstaendig erreichbar

Fundstellen: `signalerfassung-analyse-tool.html:951`, `:965`, `:1023`; `assets/annotations.js:94`.

Die Virtualisierung rechnet fest mit 28 Pixeln pro Messzeile. Tatsaechlich waren die Zeilen im Test 31 Pixel hoch. Ausserdem berechnet die manuelle Begrenzung des Scrollwegs die Tabellenkopfhoehe nicht mit.

Reproduktion: Original-SDP3 mit 6.474 Messzeilen, Browserfenster 1.500 x 950. Nach dem Scrollen bis ganz unten lag die Unterkante der letzten Messzeile noch rund 203 Pixel unterhalb des sichtbaren Tabellenbereichs. `scrollTop` wurde auf 180.509 begrenzt, obwohl der Browser 180.712 erlaubte. Die Kopfzeile war rund 65 Pixel hoch.

Auswirkung: Die letzten Messwerte lassen sich nicht vollstaendig betrachten. Auch Spruenge zu Markierungen verwenden dieselbe unzutreffende Zeilenhoehe.

Korrektur: Eine gemeinsame, tatsaechlich eingehaltene oder gemessene Zeilenhoehe verwenden. Tabellenkopf und sichtbare Flaeche korrekt beruecksichtigen; alle Sprungfunktionen auf dieselbe Berechnung umstellen.

### 4. P2: Zeitachse verwendet Zeilennummern statt verstrichener Zeit

Fundstellen: `signalerfassung-analyse-tool.html:1169`, `:1201`, `:1237`; `assets/annotations.js:97`.

Die horizontale Position wird aus dem Index im Array berechnet. Die Datei enthaelt Zeitstempel und `TimeOffset`, aber beide werden fuer diese Positionierung nicht verwendet.

Reproduktion: Messpunkte bei 0, 1, 9 und 10 Sekunden erscheinen bei 0 %, 33 %, 67 % und 100 % der Breite. Zeitlich korrekt waeren 0 %, 10 %, 90 % und 100 %.

Auswirkung: Bei unregelmaessiger Abtastung oder Pausen stimmen die sichtbaren Abstaende und Steigungen nicht mit den Zeitabstaenden ueberein. Tooltip und Auswahl sind zeilenbezogen konsistent, das Diagramm ist aber keine massstaebliche Zeitdarstellung.

Korrektur: Eine monotone Zeitkoordinate aus dem relativen Zeitversatz bilden und sie fuer Zeichnung, Zoom, Verschieben, Tooltip und Bereichsauswahl gemeinsam verwenden.

### 5. P2: Messungen ueber Mitternacht werden leer gefiltert

Fundstellen: `signalerfassung-analyse-tool.html:763`, `:877`, `:930`.

Zeitvergleiche benutzen Sekunden seit Tagesbeginn. Der Standardfilter setzt den ersten Zeitstempel als Untergrenze und den letzten als Obergrenze. Nach einem Tageswechsel ist die Obergrenze kleiner als die Untergrenze.

Reproduktion: Drei Messpunkte bei 23:59:59, 00:00:00 und 00:00:01 werden eingelesen. Die Standardansicht zeigt 0 von 3 Zeilen und eine Dauer von 00:00:00. Die Rohzeilen sind intern noch vorhanden.

Korrektur: Relativen Zeitversatz bzw. Tageswechsel auswerten und einen durchgehenden Messzeitraum bilden. Dieselbe Zeitbasis auch fuer Dauer, Abtastrate und Export verwenden.

### 6. P2: Fehlende Messwerte werden kommentarlos ueberbrueckt

Fundstellen: `signalerfassung-analyse-tool.html:1181`, `:1203`.

Leere oder nichtnumerische Werte werden aus der Punktliste entfernt. Danach verbindet die App die verbleibenden Werte mit durchgehenden Linien.

Reproduktion: Bei `[0, 0, leer, 0, 0]` entsteht ein durchgehender Linienzug mit nur einem Startpunkt. Die fehlende Stelle bleibt optisch unerkennbar.

Auswirkung: Die Darstellung suggeriert Werte zwischen den vorhandenen Messungen. Ob eine leere Zelle im jeweiligen Quellformat einen fehlenden Messwert oder einen nicht aktualisierten Wert bedeutet, muss fachlich festgelegt werden; aktuell wird diese Unterscheidung nicht kenntlich gemacht.

Korrektur: Leere Stellen sichtbar behandeln. Je nach Quellsemantik Luecken zeichnen oder ein bewusstes Halten des letzten Werts kennzeichnen. Keine stillschweigende Interpretation.

### 7. P2: Gleichzeitige Kontenaenderungen koennen sich ueberschreiben

Fundstelle: `server/server.js:130`.

`upsertUser()` liest zuerst die gesamte Passwortdatei und wartet anschliessend asynchron auf die Passwortberechnung. Eine zweite Anfrage kann waehrenddessen denselben Ausgangsstand lesen. Beide schreiben spaeter ihre eigene vollstaendige Dateiversion zurueck.

Reproduktion: Isolierter Test des unveraenderten Funktionscodes mit einer simulierten Passwortdatei und kontrolliert abgeschlossenen Hash-Berechnungen. Zwei Benutzeranlagen melden Erfolg. Im Endstand existieren der urspruengliche Administrator und nur der zweite neue Benutzer.

Auswirkung: Eine erfolgreiche Anlage oder Passwortaenderung kann verlorengehen. Auch das Loeschen eines anderen Nutzers kann durch eine gleichzeitig laufende Aenderung rueckgaengig werden. Das atomare Umbenennen der Datei schuetzt nicht vor diesem logischen Wettlauf.

Korrektur: Alle Schreibvorgaenge serialisieren. Nach der Hash-Berechnung im geschuetzten Schreibabschnitt den aktuellen Stand lesen, Existenzbedingungen erneut pruefen und schreiben. Loeschen muss denselben Schutz nutzen.

### 8. P2: Sieben Tage alte Skripte koennen mit neuer HTML-Datei laufen

Fundstellen: `deploy/signalerfassung.com.nginx:68`, `signalerfassung-analyse-tool.html:1983`.

CSS und JavaScript haben unveraenderliche Dateinamen, werden aber mit `max-age=604800` ausgeliefert. Die HTML-Datei referenziert die Skripte ohne Versionskennung.

Nachweis: Der oeffentliche Header von `/assets/annotations.js` lieferte am Review-Abend HTTP 200 und zweimal Cache-Control mit sieben Tagen Gueltigkeit. Ein Browser darf die bereits gespeicherte Datei daher fuer diesen Zeitraum weiterverwenden.

Auswirkung: Stammnutzer koennen nach einem Deployment neue HTML-Dateien mit alten Funktionen oder Styles erhalten. Neue Aufrufe wie `Annotations.isDragging()` koennen dann auf eine noch nicht vorhandene Funktion treffen. Ein erfolgreicher Pruefsummenvergleich auf dem Server erkennt diesen Browserzustand nicht.

Korrektur: Dateien bei Aenderungen versionieren oder mit Inhalts-Hashes benennen. Alternativ die eigenen veraenderlichen Skripte vor Verwendung revalidieren lassen. HTML und zugehoerige Assets als gemeinsamen Release behandeln.

### 9. P2: Support-ZIP kann unterschiedliche Arbeitsstaende enthalten

Fundstellen: `signalerfassung-analyse-tool.html:1949`, `:1962`, `:1968`; `assets/export-save.js:15`.

Der Export liest die Originaldateien zu Beginn, wartet auf Excel und Diagrammbild und erzeugt die Projektdatei erst danach aus dem dann aktuellen globalen Zustand `S`. Nur die Exportbuttons sind gesperrt; Neu, Projekt oeffnen, Dateischliessen und andere Bearbeitungen bleiben moeglich.

Reproduktion: Waehrend einer kontrolliert pausierten Excel-Erstellung wurde `resetTool()` ausgefuehrt. Das fertige ZIP enthielt eine Originaldatei, aber die eingebettete Projektdatei enthielt 0 Dateien. Die Pause ersetzte nur die aufwendige Excel-Berechnung; der echte ZIP- und Projektcode blieb aktiv.

Auswirkung: Das als wiederherstellbar beschriebene Supportpaket kann einen leeren oder inhaltlich abweichenden Projektstand enthalten. Das Excel-, PDF- und Diagrammergebnis kann ebenfalls bei zwischenzeitlicher Bearbeitung auseinanderlaufen.

Korrektur: Vor dem ersten asynchronen Schritt einen konsistenten Export-Snapshot erstellen und ausschliesslich daraus alle Bestandteile erzeugen.

### 10. P2: Dezimalpunkt wird in Excel als Text exportiert

Fundstellen: `signalerfassung-analyse-tool.html:1438`, `:1658`.

`numericValue()` akzeptiert einen Dezimalpunkt, `excelValue()` erkennt dagegen nur ganze Zahlen oder Dezimalzahlen mit Komma als Zahlen.

Reproduktion: Ein gueltiger Messwert `27.6` wurde in einer Testdatei geladen und als XLSX exportiert. Nach erneutem Einlesen des erzeugten XLSX war die Messwertzelle vom Typ `string`, nicht `number`.

Auswirkung: Die Kurve stellt einen numerischen Wert dar, Excel behandelt denselben Wert als Text. Berechnungen und numerische Sortierung koennen dadurch unvollstaendig oder falsch sein. Die bestehenden Originalbeispiele verwenden an den relevanten Stellen Kommazahlen bzw. ganze Zahlen, weshalb der Fehler dort nicht auffaellt.

Korrektur: Eine gemeinsame, formatbewusste Zahlenkonvertierung fuer Diagramm und Excel verwenden. Textsignale weiterhin unveraendert erhalten.

### 11. P2: Kurze Filterbereiche lassen numerische Signale verschwinden

Fundstelle: `signalerfassung-analyse-tool.html:1116`.

`isChartSignal()` verlangt mindestens drei numerische Treffer in den gerade gefilterten Zeilen und betrachtet maximal 80 Stichproben. Bei einem oder zwei Messpunkten kann deshalb kein Signal als numerisch erkannt werden.

Reproduktion: Zwei gueltige numerische Messzeilen ergeben 0 ausgewaehlte Diagrammsignale.

Auswirkung: Ein enger Zeitfilter kann ein vorhandenes numerisches Signal scheinbar entfernen. Sehr spaet beginnende oder selten aktualisierte Signale koennen auch bei groesseren Dateien durch das Stichprobenraster fallen.

Korrektur: Den Signaltyp beim Import bzw. anhand der gesamten Datei bestimmen. Im gewaehlten Ausschnitt einzelne Punkte und kurze Linien separat darstellen.

### 12. P2: Zweite Datei mit gleichem Namen wird still verworfen

Fundstelle: `signalerfassung-analyse-tool.html:747`.

Die Duplikaterkennung vergleicht ausschliesslich `filename` und kehrt bei Uebereinstimmung ohne Rueckmeldung zurueck.

Reproduktion: Zwei Dateien mit identischem Namen und unterschiedlichen ersten Messwerten wurden nacheinander an `parse()` uebergeben. Es blieb bei einer geladenen Datei mit dem alten Messwert.

Auswirkung: Eine aktualisierte Messung oder eine zweite Messung aus einem anderen Ordner wird nicht geladen. Nutzer koennen versehentlich weiter mit den alten Daten arbeiten.

Korrektur: Dateinamen nicht als Identitaet behandeln. Unterschiedlichen Inhalt erkennen und getrennt laden oder einen klaren Ersetzen-Dialog anbieten.

### 13. P2: Grosser Diagramm-Neuaufbau blockiert die Bedienung

Fundstellen: `signalerfassung-analyse-tool.html:1182`, `:1254`; `assets/annotations.js:153`.

Jeder Neuaufbau liest alle Werte des sichtbaren Bereichs erneut, konvertiert die Zeichenketten, erzeugt Punktobjekte und berechnet Minima und Maxima. Erst danach reduziert die Funktion die Anzahl gezeichneter Punkte. `requestAnimationFrame` begrenzt die Aufrufzahl, verkleinert aber nicht die Arbeit pro Aufruf.

Messung: Eine synthetische Messreihe mit 100.000 Zeilen und acht Signalen benoetigte pro Aufruf von `drawChartCanvas()` etwa 336 bis 434 ms auf diesem Rechner. Gemessen wurde derselbe Zeichenkern im Exportmodus bei 1.600 Pixeln Breite; dies ist keine gemessene Bildrate des normalen UI und keine allgemeine Hardwaregarantie.

Auswirkung: Bei grossen Messungen koennen Zoom, Verschieben und Export die Bedienung fuer merkliche Zeit blockieren. Der interaktive Pfad fuehrt dieselbe erneute Konvertierung aus, wobei ein enger Zoom weniger Zeilen verarbeitet.

Korrektur: Zahlen und Zeitkoordinaten beim Import vorberechnen, Extrema erhaltende Darstellungsdaten wiederverwenden und grosse Berechnungen bei Bedarf aus dem UI-Thread auslagern. Eine Optimierung muss Befund 2 mit beheben und darf Spitzen nicht weiter unterdruecken.

### 14. P2: PDF kuerzt markierte Messzeilen trotz Vollstaendigkeitszusage

Fundstellen: `signalerfassung-analyse-tool.html:1847`, `:1874`.

Der PDF-Text verspricht alle markierten Messzeilen. Der Messdatenauszug nutzt jedoch `markedRows.slice(0,500)`. Bei mehr als 500 Markierungen wird zwar die Zahl 500 im Auszug genannt, aber nicht ausdruecklich erklaert, dass weitere markierte Messwerte fehlen. Die neue Notizenliste kann zusaetzliche Zeitstempel enthalten, ersetzt jedoch nicht deren Messwerte.

Nachweis: Direkter Codepfad; kein gesonderter grosser PDF-Test erforderlich, da Zusage und harte Begrenzung unmittelbar nebeneinander nachlesbar sind.

Korrektur: Entweder alle markierten Messzeilen exportieren oder die Begrenzung deutlich und konsistent als '500 von N markierten Messzeilen' kennzeichnen. Das bestehende PDF-Layout kann dabei erhalten bleiben.

## Weitere Beobachtungen

- **Verlust ungespeicherter Arbeit:** `resetTool()`, `closeFile()` und das Laden eines Projekts ersetzen bzw. entfernen Daten ohne Pruefung auf ungespeicherte Notizen oder Markierungen (`signalerfassung-analyse-tool.html:1311`, `:1338`, `:1395`). Das ist im normalen Bedienpfad sichtbar und sollte vor allem fuer versehentliche Klicks abgesichert werden. Es gibt weder einen Dirty-State noch lokale Wiederherstellung. Welche Aktionen eine Rueckfrage bekommen, ist eine Produktentscheidung.
- **Projekt speichern bei Schreibfehlern:** `saveProject()` faellt bei einem Fehler nach dem Speicherdialog automatisch auf einen Browserdownload zurueck (`:1295`). `saveExport()` behandelt denselben Fall klarer und meldet den Fehler. Beide Speicherwege sollten konsistent werden; insbesondere darf ein fehlgeschlagenes Schreiben am gewaehlten Ziel nicht wie ein dort erfolgreicher Vorgang wirken.
- **P3, Deployment-Wartung:** `deploy/deploy-release.sh:4` hat einen fest eingetragenen alten Release-Zeitstempel. `deploy/verify-release.sh:35` erwartet weiterhin HTTP 401 fuer die inzwischen oeffentliche Landingpage. Beim letzten Deployment wurde ein separates temporaeres Skript verwendet. Fuer zukuenftige Deployments sollte es genau einen gepflegten, parametrisierten Ablauf mit passenden Pruefungen geben.
- **P3, Dokumentation und Versionsverwaltung:** Die README verweist auf geloeschte alte Dateinamen. Der aktuelle produktive Dateisatz erscheint im Git-Status weitgehend als unversioniert. Es existieren mehrere alte HTML-Kopien und Exportordner. Ein gepflegter Build-/Release-Einstieg und ein nachvollziehbarer Commit des aktuellen Stands erleichtern kuenftige Reviews und Ruecksetzungen. Diese Dateien wurden im Review nicht bereinigt.
- **Bibliotheken:** Lokal liegen jsPDF 2.5.1, AutoTable 3.8.2, JSZip 3.10.1 sowie ein ExcelJS-Bundle mit Datumskennung 19-10-2023. Ein Lockfile bzw. ein gemeinsames Versionsinventar fuer diese Browserbibliotheken fehlt. Die offizielle [jsPDF-Sicherheitsseite](https://github.com/parallax/jsPDF/security) nennt neuere Sicherheitskorrekturen. Die konkret gepruefte [HTML-Injektion in speziellen Ausgabemethoden](https://github.com/parallax/jsPDF/security/advisories/GHSA-wfv2-pwc8-crg5) betrifft Methoden, die diese App nicht aufruft. Die [Dateizugriffs-Luecke](https://github.com/parallax/jsPDF/security/advisories/GHSA-f8cm-6447-x5h2) betrifft Node-Builds, waehrend die App den Browser-Build verwendet. Daraus wurde kein zusaetzlicher bestaetigter Angriffspfad fuer diese App abgeleitet. Ein kontrolliertes Bibliotheksupdate bleibt sinnvoll, muss aber die gewuenschte Exportdarstellung gegenpruefen.

## Pruefumfang und Grenzen

Gelesen wurden die produktive Analyse-HTML, ihre eigenen JS-/CSS-Module, Landingpage, Impressum/Datenschutz als technische Seiten, Admin-Oberflaeche, Node-Server sowie Deployment-, Nginx- und Servicekonfiguration. Alte HTML-/Netlify-Kopien wurden als Altbestaende eingeordnet. Die minifizierten Fremdbibliotheken wurden ueber Versionskennungen, Nutzungspfade, Funktionspruefungen und ausgewaehlte offizielle Sicherheitshinweise betrachtet, nicht Zeile fuer Zeile neu auditiert. Dies war keine rechtliche Pruefung der Datenschutzerklaerung.

Bestandene vorhandene Tests:

- `tools/test-pan-export.cjs`: Diagrammverschieben, Grenzen, Trennung von Bereichsauswahl, Speicherdialog-Aufruf, PDF-/XLSX-/ZIP-Erstellung, Abbruch und Schreibfehler, SVG-Laden.
- `tools/test-annotations.cjs`: Marker, farbige Bereiche, Notizen, Projekt-Roundtrip, alte Projektdateien, Notizexport, Bereichsauswahl in Tabelle und Diagramm.
- `tools/test-chart-height.cjs`: Hoehenskalierung, Scrollen, Tooltip, mobiler Funktionspfad.
- `tools/test-workspace-layout.cjs`: Fokusmodus, Panels, Seitenleiste, mobiler Funktionspfad.

Alle vier Tests meldeten PASS und keine JavaScript-Seitenfehler. Das prueft die dort abgedeckten Ablaeufe, nicht Fehlerfreiheit aller Eingabedaten.

Originaldateien:

- SDP3: 6.474 Messzeilen, 18 Messsignale plus Marker, alle Zeilen im Standardfilter sichtbar.
- SWS: 77 Messzeilen, genau 5 Messsignale plus Marker, alle Zeilen im Standardfilter sichtbar. Richtungszeichen in den Signalnamen werden entfernt; fehlende ECU-/ID-Metadaten werden gekennzeichnet.

Weitere Nachweise:

- Inline-JavaScript der fuenf produktiven HTML-Seiten syntaktisch geprueft.
- `tmp/review-codebase.cjs`: lokale, reproduzierbare Sonderfallpruefungen; Backend-Wettlauf mit simulierter Datei statt echten Zugangsdaten.
- `tmp/review-results-2026-09-15.json`: letzte strukturierte Messergebnisse.
- Ein oeffentlicher HTTP-HEAD-Aufruf bestaetigte die Cache-Header. Keine Live-Konten angelegt, geloescht oder geaendert; keine Angriffsversuche gegen den Server.

## Sinnvolle Reihenfolge fuer Korrekturen

1. Importierte Texte sicher einsetzen und die reproduzierte Code-Injektion schliessen.
2. Tabellenhoehen korrigieren; Diagrammspitzen erhalten; durchgehende Zeitbasis und Behandlung leerer Werte klaeren.
3. Browser-Caches an Releases binden und grosse Diagrammberechnungen optimieren.
4. Support-Export auf einen Snapshot stellen, Benutzerdatei-Aenderungen serialisieren und Zahlen-/PDF-Sonderfaelle korrigieren.
5. Dateiverwechslungen und versehentlichen Verlust ungespeicherter Arbeit vermeiden; Deployment und Dokumentation konsolidieren.

Diese Korrekturen benoetigen keine grundlegende Neugestaltung der Oberflaeche.
