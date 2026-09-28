# Vergleich der Signalerfassungs-Exporte aus SDP3 und SWS

## Kurzfassung

Die unterschiedliche Anzahl der ausgewählten Signale ist nicht Bestandteil der Bewertung. In der vorliegenden SDP3-Aufzeichnung wurden 18 Messsignale ausgewählt; in der SWS-Aufzeichnung sind es fünf Messsignale. Beide Dateien enthalten zusätzlich die technische Spalte `Marker`.

Die Messwerte der SWS-Datei sind grundsätzlich auswertbar. Gegenüber SDP3 fehlen jedoch wichtige Metadaten, die für eine eindeutige technische Zuordnung und eine Support-Eskalation hilfreich sind. Der angepasste Analyse-Export übernimmt daher die vorhandenen SWS-Bezeichnungen und Einheiten unverändert und kennzeichnet nicht gelieferte Angaben ausdrücklich, statt sie zu erraten.

## Technischer Vergleich

### SDP3

Der SDP3-Export enthält vier Kopfzeilen:

1. Technische Signal-IDs, zum Beispiel `BMS-PCMIsInBackupWh1` oder `TMS-RpmPropShaft`.
2. Datentypen beziehungsweise Einheiten.
3. Ausführliche, lesbare Signalbeschreibungen.
4. Eine zusätzliche standardisierte Einheitenzeile.

Aus der technischen Signal-ID kann außerdem die Steuergeräte- beziehungsweise Systemzuordnung wie `BMS` oder `TMS` eindeutig übernommen werden. Damit lassen sich Messwert, Beschreibung, Einheit, technische ID und zuständiges System sauber miteinander verknüpfen.

### SWS

Der vorliegende SWS-Export enthält nur zwei Kopfzeilen:

1. Eine lesbare Signalbezeichnung.
2. Die zugehörige Einheit beziehungsweise den Datentyp.

Nicht enthalten sind eine separate Steuergerätebezeichnung, eine stabile technische Signal-ID und eine zusätzliche ausführliche Beschreibungsebene. Mehrere englische Bezeichnungen enthalten außerdem unsichtbare Unicode-Richtungszeichen, die bei ungefilterter Weiterverarbeitung in Tabellen oder Suchfunktionen störend sein können.

Zeitstempel, Zeitversatz, Marker, Signalbezeichnungen, Einheiten und Messwerte sind vorhanden. Die Datei kann deshalb numerisch ausgewertet werden. Die fehlenden Metadaten erschweren jedoch die eindeutige technische Zuordnung, den Vergleich zwischen Sprach- oder Softwareversionen und die Weitergabe an den zuständigen Supportbereich.

## Auswirkung des bisherigen Imports

Der bisherige Import erwartete immer die vier Kopfzeilen des SDP3-Formats. Bei einer SWS-Datei wurden deshalb die ersten beiden Messzeilen fälschlich als Beschreibung und Einheitenzeile behandelt. Dadurch gingen zwei Samples verloren und einzelne Messwerte erschienen irrtümlich als Signalbezeichnungen.

In der geprüften SWS-Datei waren tatsächlich 77 Datenzeilen vorhanden. Der bisherige Export enthielt nur 75. Nach der Formatkorrektur werden alle 77 Datenzeilen übernommen.

## Umsetzung im Analyse-Tool

- SDP3 wird weiterhin über den bestehenden Vierzeilen-Kopf verarbeitet; dessen Exportdarstellung bleibt unverändert.
- SWS wird anhand seines Zweizeilen-Kopfs erkannt und ab der ersten tatsächlichen Messzeile eingelesen.
- Die fünf ausgewählten SWS-Messsignale werden mit ihrer originalen Bezeichnung und Einheit exportiert.
- Unsichtbare Unicode-Richtungszeichen werden aus den Signalnamen entfernt.
- Fehlende Steuergeräte und technische Signal-IDs werden als `Nicht in SWS-Datei enthalten` ausgewiesen.
- Excel und PDF erhalten bei SWS einen klaren Hinweis auf das Quellformat und die reduzierte Metadatenlage.
- Fehlende Informationen werden nicht aus Signalnamen abgeleitet oder erfunden.

## Formulierungsvorschlag für Scania

**Betreff: Fehlende Signalmetadaten im SWS-Export der Signalerfassung**

Bei der Auswertung von Signalerfassungen aus SDP3 und SWS ist uns ein struktureller Unterschied im TXT-Export aufgefallen. Die unterschiedliche Anzahl ausgewählter Signale ist dabei nicht Gegenstand der Rückmeldung.

SDP3 exportiert pro Signal eine technische Signal-ID, eine lesbare Beschreibung sowie Einheiteninformationen. Über Präfixe wie BMS oder TMS ist außerdem eine eindeutige System- beziehungsweise Steuergerätezuordnung möglich.

Der vorliegende SWS-Export enthält dagegen nur die lesbare Signalbezeichnung und die Einheit. Eine separate Steuergerätebezeichnung, eine stabile technische Signal-ID und eine zusätzliche Beschreibungsebene fehlen. Dadurch bleiben die Messwerte zwar grundsätzlich auswertbar, die eindeutige technische Zuordnung und die Weitergabe im Rahmen einer Support-Eskalation werden jedoch erschwert. Einzelne Signalnamen enthalten zudem unsichtbare Unicode-Richtungszeichen.

Für eine gleichwertige und supportfähige Weiterverarbeitung wäre es hilfreich, wenn der SWS-Export je Signal mindestens folgende Felder bereitstellen würde:

- technische Signal-ID
- Steuergerät beziehungsweise Quellsystem
- lesbare und lokalisierte Signalbeschreibung
- standardisierte Einheit beziehungsweise Datentyp
- Exportformat- oder Schemaversion

Eine strukturierte Bereitstellung dieser Metadaten würde die eindeutige Zuordnung, Vergleichbarkeit und technische Analyse der SWS-Signalerfassungen deutlich verbessern.
