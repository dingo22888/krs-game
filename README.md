# KRS Game / KrausMansion

Browser-Spiel mit Ego-Steuerung, Gravitation und Kollisionen. Dieser öffentliche
Stand enthält **neutrale Testräume**. Das separat vorbereitete Modell des echten
Hauses wird erst nach ausdrücklicher Freigabe veröffentlicht.

## Vercel

| Einstellung | Wert |
| --- | --- |
| Framework / Application Preset | **Vite** |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | `24.x` |
| Umgebungsvariablen | Keine |

`vercel.json` enthält die Build-Einstellungen. Kein Backend und keine Datenbank
sind erforderlich. Das Deployment wird vom Eigentümer eingerichtet.

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

Im Menü lassen sich Testetage, Startpunkt und Mausempfindlichkeit wählen.
Alle vier Testetagen verwenden bewusst dieselbe synthetische Geometrie.

## Stack

- Vite + TypeScript für Entwicklung und statischen Build.
- Three.js für 3D-Szene, Beleuchtung, Schatten und Ego-Kamera.
- Rapier für Kapsel-Controller, Gravitation und Kollisionen.
- HTML/CSS für deutsches Menü und Live-Grundriss.

Eine Einheit entspricht einem Meter. Fester Physik-Takt mit 120 Hz und
interpoliertes Rendering. Diagonale Eingaben werden normalisiert. Der Spieler
kann nicht ohne Kopffreiheit aufstehen. Kleine Stufen werden unterstützt.
Pause, Tabwechsel und Fokusverlust löschen gedrückte Tasten.

## Prüfen

```sh
npm test
npm run build
npm run preview
```

14 Tests führen Rapier aus und prüfen Bewegung, Sprint, Ducken, Kopffreiheit,
Springen/Landung/Deckenkontakt, dünne Wände, Objekte, Türdurchgänge, Stufen,
Bildraten sowie Startpunkte und Raum-Erreichbarkeit.

Ein interaktiver Browser-Spieltest steht noch aus: Nach dem Deployment
Pointer Lock, Mausbewegung, alle Tasten, Pause/Tabwechsel und Raumdurchgänge
in Chrome und Firefox ausprobieren. Touch-Steuerung ist nicht implementiert.

## Code

- `src/data/house.ts`: Modell-Schnittstelle und neutrale Testräume.
- `src/game/model.ts`: gemeinsame Geometrie für Darstellung und Kollisionen.
- `src/game/player.ts`: vom DOM unabhängige Bewegungsphysik.
- `src/game/scene.ts`: Three.js und Rapier-Welt.
- `src/main.ts`: Eingabe, Kamera, Menü und Grundriss.

Siehe [Modell-Schnittstelle](docs/MODEL.md).

## Referenzen

- [Vite auf Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Rapier Character Controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- [Three.js](https://threejs.org/docs/)
