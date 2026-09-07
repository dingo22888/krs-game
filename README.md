# KRS Game / KrausMansion

Browser-Spiel mit Ego-Steuerung, Gravitation und Kollisionen. Dieser öffentliche
Stand enthält einen **neutralen Testraum** und kann ein privates Hausmodell
lokal aus einer JSON-Datei laden. Private Grundrisse werden nicht veröffentlicht.

## Eigenes Haus laden

1. Für die Vercel-Variante einmalig einen **privaten Blob-Store** anlegen und
   `krausmansion-model.json` dort hochladen (siehe `docs/VERCEL-PRIVATE-SETUP.md`).
2. `GAME_PASSWORD`, `GAME_AUTH_SECRET` und `HOUSE_MODEL_URL` als Vercel-
   Umgebungsvariablen setzen. Das Passwort niemals in `VITE_*`-Variablen oder
   in den Quellcode schreiben.
3. Beim Öffnen erscheint die private Zugangssperre. Nach der Anmeldung lädt das
   Spiel das Modell automatisch; die manuelle Datei-Auswahl ist dann verborgen.
4. Danach erscheinen KG, EG, OG und DG mit ihren eigenen Räumen und Grundrissen.
5. Ein Modell im Format Version 2 verbindet die Geschosse über begehbare Treppen.
   Die Etagenanzeige und Minikarte wechseln am nächsten Geschoss automatisch.
   Die Auswahl im Menü bleibt als schneller Sprung zum Startpunkt verfügbar.

Nach einer Modellaktualisierung wird nur die private Blob-Datei ersetzt. Das
Modell bleibt außerhalb von GitHub. Ein alter lokal gespeicherter Modellstand
wird in der Produktionsversion nicht verwendet.

Die Passwortsperre schützt den Spielstart, die Authentifizierungsroute und den
privaten Modellabruf. Das statische Vite-Bundle kann auf Vercel Hobby weiterhin
als öffentliche Ressource angefordert werden; wer eine vollständig unsichtbare
Website inklusive HTML/JavaScript braucht, sollte zusätzlich Vercel Password
Protection auf Pro oder eine vorgeschaltete Access-Lösung verwenden.

Die Datei wird mit der Browser-Datei-API gelesen, ohne Upload oder Modellabruf
von einem Server. Optional speichert **Auf diesem Gerät merken** das Modell im
lokalen Browserspeicher, sodass es nach einem Neuladen wieder verfügbar ist.
Das Deaktivieren dieser Option entfernt die gespeicherte Kopie. Ohne geladenes
Modell gibt es bewusst keine irreführende Auswahl identischer Etagen.

## Vercel

| Einstellung | Wert |
| --- | --- |
| Framework / Application Preset | **Vite** |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | `24.x` |
| Umgebungsvariablen | `GAME_PASSWORD`, `GAME_AUTH_SECRET`, `HOUSE_MODEL_URL` (Production) |

`vercel.json` enthält die Build-Einstellungen. Der Vercel-Blob-Store wird separat
mit dem Projekt verbunden; die drei Variablen sind für den privaten Modellabruf
erforderlich. Das Deployment wird vom Eigentümer eingerichtet.

## Lokal

```sh
npm ci
npm run dev
```

Die angezeigte URL im Desktop-Browser öffnen. „Testraum betreten“ aktiviert die
Maussteuerung. Benötigt WebGL 2, Maus und Tastatur.

| Eingabe | Funktion |
| --- | --- |
| WASD | Bewegen |
| Maus | Umsehen |
| Leertaste | Springen |
| Strg / Ctrl halten | Ducken mit kleinerem Kollisionskörper |
| Shift halten | Schnelles Gehen |
| Esc | Pause und Maus freigeben |

Im Menü lassen sich nach dem Modellimport Etage, Startpunkt und
Mausempfindlichkeit wählen. Optionale zusätzliche Startpunkte kommen aus der
Modell-Datei.

## Stack

- Vite + TypeScript für Entwicklung und statischen Build.
- Three.js für 3D-Szene, Beleuchtung, Schatten und Ego-Kamera.
- Rapier für Kapsel-Controller, Gravitation und Kollisionen.
- HTML/CSS für deutsches Menü und Live-Grundriss.

Eine Einheit entspricht einem Meter. Fester Physik-Takt mit 120 Hz und
interpoliertes Rendering. Ducken und Aufstehen ändern Kamera und Kollisionskörper
in beiden Richtungen weich, während die Füße am Boden bleiben.
Diagonale Eingaben werden normalisiert. Der Spieler
kann nicht ohne Kopffreiheit aufstehen. Kleine Stufen werden unterstützt.
Pause, Tabwechsel und Fokusverlust löschen gedrückte Tasten.

## Prüfen

```sh
npm test
npm run build
npm run preview
```

28 Tests prüfen den Modellimport und führen Rapier aus: Bewegung, Sprint,
weiches Ducken, Kopffreiheit,
Springen/Landung/Deckenkontakt, dünne Wände, Objekte, Türdurchgänge, Stufen,
Bildraten sowie Startpunkte und Raum-Erreichbarkeit.

Die interne Browservorschau war durch eine Zugriffssperre nicht erreichbar.
Ein interaktiver Browser-Spieltest steht daher noch aus: Nach dem Deployment
Pointer Lock, Mausbewegung, alle Tasten, Pause/Tabwechsel und Raumdurchgänge
in Chrome und Firefox ausprobieren. Touch-Steuerung ist nicht implementiert.

## Code

- `src/data/house.ts`: Modell-Schnittstelle und neutrale Testräume.
- `src/data/import-model.ts`: begrenzter und validierter lokaler JSON-Import.
- `src/game/model.ts`: gemeinsame Geometrie für Darstellung und Kollisionen.
- `src/game/player.ts`: vom DOM unabhängige Bewegungsphysik.
- `src/game/scene.ts`: Three.js und Rapier-Welt.
- `src/main.ts`: Eingabe, Kamera, Menü und Grundriss.

Siehe [Modell-Schnittstelle](docs/MODEL.md).

## Referenzen

- [Vite auf Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Rapier Character Controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- [Three.js](https://threejs.org/docs/)
