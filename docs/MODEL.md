# Modell-Schnittstelle

Diese öffentliche Version enthält ausschließlich synthetische Testräume.
Keine Maße, Wandkonturen, Möbelpositionen oder Raumaufteilungen darin stammen
aus den privaten Hausgrundrissen.

Das separat vorbereitete Hausmodell ist noch nicht für die Veröffentlichung in
diesem öffentlichen Repository freigegeben. Es ist kein Bestandteil dieses
Commits oder des daraus erzeugten Builds. In Production wird es nach der
Passwort-Anmeldung automatisch aus dem privaten Blob-Store geladen. Über
**Erweiterte Einstellungen → Anderes JSON laden** kann optional ein lokales
Ersatzmodell benutzt werden, ohne die Geometrie hochzuladen.

Die Datei verwendet das Format `{ "format": "krs-house", "version": 2,
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


Version 1 bleibt für ältere Hausdateien mit einzeln geladenen Geschossen nutzbar.
Version 2 setzt `elevation` bei allen vier Geschossen voraus. Private Maße bleiben
auch für Treppen und Dachflächen ausschließlich in der lokal importierten Datei.

- `elevation`: Höhe des fertigen Fußbodens in der gemeinsamen Welt.
- `offset`: Verschiebung `[x,z]` gegenüber dem lokalen Grundriss.
- `floorHoles`, `ceilingHoles`: rechteckige Aussparungen in Boden bzw. Decke.
  Auch die sichtbaren Raumböden werden ausgeschnitten.
- `stairs`: Verbindungen zum nächsthöheren Geschoss (`to`), mit konvexen
  Stufenpolygonen und lokaler Oberkante `top` pro Stufe.
- `walkHeights`: optionale Kollisionshöhen an den Eckpunkten einer Stufe.
  Kontinuierliche Flächen vermeiden Hängenbleiben an schmalen Keilstufen;
  die sichtbaren Trittflächen bleiben waagerecht. Auch die Unterseiten sind solide.
- `maxSlope`: optionale Unterstützung für enge Spindeltreppen, räumlich auf
  diesen Treppenlauf begrenzt. Senkrechte Wände bleiben Hindernisse.
- `roofs`: rechteckige Dachbereiche mit `axis`, `startHeight`, `endHeight`.
  Die lichte Höhe verläuft linear über x oder z. Sichtbare Schrägen und
  Kollisionsflächen werden aus denselben Eckpunkten aufgebaut.
- `supports`: Stützen mit `rect`, `bottom`, `top`, etwa für eine Treppenspindel.

Boden und Deckenschicht ergeben bei entsprechendem Geschossabstand einen
zusammenhängenden Aufbau ohne deckungsgleiche sichtbare Flächen. Die Höhe der
Etagenanzeige bezieht sich auf die Füße; während eines Sprungs erfolgt kein
Etagenwechsel. Maße und Näherungen werden vom privaten Modell vorgegeben.
