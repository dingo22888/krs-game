# Modell-Schnittstelle

Diese öffentliche Version enthält ausschließlich synthetische Testräume.
Keine Maße, Wandkonturen, Möbelpositionen oder Raumaufteilungen darin stammen
aus den privaten Hausgrundrissen.

Das separat vorbereitete Hausmodell ist noch nicht für die Veröffentlichung in
diesem öffentlichen Repository freigegeben. Es ist kein Bestandteil dieses
Commits oder des daraus erzeugten Builds. Über **Hausmodell laden** kann es
aus einer lokalen JSON-Datei benutzt werden, ohne die Geometrie hochzuladen.

Die Datei verwendet das Format `{ "format": "krs-house", "version": 1,
"floors": { "kg": ..., "eg": ..., "og": ..., "dg": ... } }`.
Alle vier Etagen müssen vorhanden sein und unterschiedliche Wandkonturen haben.
Der Import prüft Typen, Größenlimits, endliche Koordinaten, orthogonale Konturen
und Startpunkte. Fehler ersetzen kein bereits geladenes Modell.

`src/data/house.ts` definiert die Modell-Schnittstelle:

- Eine Einheit entspricht einem Meter, y zeigt nach oben.
- `footprint`: orthogonales Polygon der Bodenfläche in x/z.
- `walls`: orthogonale gefüllte Wandkonturen in x/z.
- `height`: lichte Raumhöhe.
- `openings`: Fenster, geschlossene Außentüren und freie Durchgänge.
- `furniture`: vereinfachte Objektkörper mit Position und Höhe.
- `rooms`: Bezeichnung und Bodenfläche für Orientierung und Grundriss.
- `spawn`: sichere Startposition und Blickrichtung.
- `alternateSpawn` (optional): weiterer Startpunkt mit `label`, `x`, `z`, `yaw`.

Der identische `buildModel`-Output versorgt Rendering und physische Kollisionen.
Die Physik läuft mit 120 Hz. Ein Kapsel-Controller gleitet an Wänden, springt,
duckt sich und verhindert das Aufstehen ohne ausreichende Kopffreiheit.
