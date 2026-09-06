# Modell-Schnittstelle

Diese öffentliche Version enthält ausschließlich synthetische Testräume.
Keine Maße, Wandkonturen, Möbelpositionen oder Raumaufteilungen darin stammen
aus den privaten Hausgrundrissen.

Das separat vorbereitete Hausmodell ist noch nicht für die Veröffentlichung in
diesem öffentlichen Repository freigegeben. Es ist kein Bestandteil dieses
Commits oder des daraus erzeugten Builds.

`src/data/house.ts` definiert die Modell-Schnittstelle:

- Eine Einheit entspricht einem Meter, y zeigt nach oben.
- `footprint`: orthogonales Polygon der Bodenfläche in x/z.
- `walls`: orthogonale gefüllte Wandkonturen in x/z.
- `height`: lichte Raumhöhe.
- `openings`: Fenster, geschlossene Außentüren und freie Durchgänge.
- `furniture`: vereinfachte Objektkörper mit Position und Höhe.
- `rooms`: Bezeichnung und Bodenfläche für Orientierung und Grundriss.
- `spawn`: sichere Startposition und Blickrichtung.

Der identische `buildModel`-Output versorgt Rendering und physische Kollisionen.
Die Physik läuft mit 120 Hz. Ein Kapsel-Controller gleitet an Wänden, springt,
duckt sich und verhindert das Aufstehen ohne ausreichende Kopffreiheit.
