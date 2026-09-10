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

## Toleranz bei gezeichneten Wandanschlüssen

Beim Aufbau werden Wandflächen innerhalb einer Etage normalisiert. Eine Gruppe
nahe beieinanderliegender Kanten darf höchstens 6 cm überspannen; die stärkste
vorhandene Wandkante dient als Bezug. Dünne solide Wände werden nicht entfernt.
Öffnungsenden können bis zu 10 cm an vorhandene Kanten anschließen. Die Tiefe
einer Öffnung wird an einen benachbarten Wandstreifen angepasst (maximal 18 cm
Abweichung je Tiefenkante). Fenster und Türen schneiden die gefüllten Konturen
aus; Brüstungen, Stürze und Glasscheiben werden danach passend ergänzt.

Ein Durchgangseintrag, der zu mindestens 80 Prozent auf einem massiven Wandende
liegt und keine gegenüberliegende Laibung besitzt, wird als widersprüchliche
Annotation ausgelassen. Dabei bleibt die vorhandene Wand erhalten; es wird kein
neuer Ausgang erzeugt. Dies ist keine Rekonstruktion fehlender Architektur.

Die bereinigten Volumen bestimmen Darstellung und Kollision. Bei deckenden
Quadern desselben Materials werden verdeckte und doppelte Oberflächen nicht
gerendert, um Flackern durch überlappende Flächen zu vermeiden. Transparente
Scheiben bleiben für die Sortierung getrennt. Die Originaldatei, Etagenversätze,
Treppen, Stützen, Dachschrägen und Möbelmaße werden nicht umgeschrieben. Die
Minimap zeigt weiterhin die ursprünglichen Planlinien als Orientierung.

Kurze unvollständige T-Anschlüsse können bis zu 15 cm zur gegenüberliegenden
Wandfläche geschlossen werden. Die empfangende Wand muss die gesamte Stärke
des Wandendes abdecken. Deklarierte Öffnungen und Abstände zwischen parallelen
Wänden werden dabei nicht geschlossen.

## Einrichtung beim Laden

Eine wiederholbar anwendbare Einrichtungsregel erkennt angrenzende Räume mit
den Namen Esszimmer und Küche und leitet Positionen aus dem privaten Modell ab.
Sie setzt den Esstisch auf 1,60 × 0,90 m, ergänzt vier nach innen gerichtete
Stühle und ein um 180 Grad an die Wand geöffnetes weißes Türblatt mit schwarzen
Griffen am verbindenden Durchgang. Die westliche Esszimmeröffnung erhält links
(vom Raum aus gesehen) eine 90 cm breite, geschlossene verglaste Balkontür und
rechts ein Fenster mit Brüstung. Die Kombination bekommt dunkle Rahmen.
Die nördliche äußere Küchenöffnung wird als Fenster mit 1 m Brüstung ausgeführt.
Die Küche erhält eine wandbündige L-Zeile, zwei 2,20 m hohe Schränke und eine
1,80 × 0,95 m große, an der Trennwand befestigte Halbinsel. Bestehende
Küchenmöbel werden ersetzt; erneutes Laden erzeugt keine Duplikate.
Eine kleine ausgesparte Schachtverbindung am Ende der Esszimmertrennwand wird
zwischen vorhandener Querwand und Rückwand ergänzt (höchstens 50 cm breit und
80 cm tief). Deklarierte Öffnungen bleiben auch dabei geschützt.

Bei diesem Modell werden bisherige Höhen von 2,30 m auf 2,35 m angehoben.
Hohe Anschlüsse der Dachschrägen folgen der Decke, niedrige Kniestöcke und
Treppenhöhen bleiben erhalten. Die obere Bodenplatte wird auf den verfügbaren
Zwischenraum begrenzt, damit sie nicht in die lichte Raumhöhe hineinragt.
Diese Ergänzungen geschehen nach dem Import im Speicher; die private Blob-Datei
muss nicht neu hochgeladen werden und enthält weiterhin den ursprünglichen Stand.

Optionale Modelldaten: Möbel unterstützen `chair` und die Blickrichtung
`facing` (`north`, `south`, `east`, `west`). Ein Durchgang kann mit
`leaf: {hinge: 'start' | 'end', side: -1 | 1, angle?: 90 | 180}` ein statisch geöffnetes Türblatt
erhalten. Die Scharnierposition bezieht sich auf die Längsachse der Öffnung,
die Seite auf die positive oder negative Querachse. Darstellung und Kollision
nutzen dasselbe Türblatt; der Durchgang bleibt frei. Diese Angaben bleiben
beim lokalen Speichern und erneuten Import erhalten.
Ohne `angle` bleibt der bisherige 90-Grad-Winkel erhalten. Bei 180 Grad liegt
das Blatt neben der Öffnung an der Wand. `balcony: {side: 'start' | 'end', width: number}`
teilt eine Fensteröffnung in eine bodentiefe Glastür und ein Brüstungsfenster.
Die Seite bezieht sich auf die Längsachse der Öffnung; Maße der Gesamtöffnung
bleiben erhalten. Die geschlossene Glastür besitzt eine Kollisionsfläche.


## Fenster und Wohnzimmer

Alle Fenster erhalten umlaufende anthrazitfarbene Rahmen; breite Fenster zusätzlich einen Mittelpfosten. Fensterbänke bleiben hell und das Glas bleibt geschlossen und kollidierbar.

Das Wohnzimmer wird beim Laden anhand der Raum- und Sofageometrie ergänzt: dunkle Polster, ein heller Teppich unter der Couch, ein Sessel neben dem Fenster und ein 65-Zoll-TV (16:9, etwa 1,439 × 0,809 m) an der gegenüberliegenden Wand. Der Teppich liegt oberhalb des Bodenbelags und erzeugt kein Hindernis. Das private Quellmodell und Fotos bleiben außerhalb des Repositorys.
