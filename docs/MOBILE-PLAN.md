# Mobile Spielbarkeit

Status: Geplant und vom Nutzer am 08.09.2026 zur Ablage bestätigt. Umsetzung zurückgestellt; zunächst Raumwirkung und Realismus verbessern.

## Ziel

Browser-Version für Smartphones im Querformat, mit iPhone/Safari und Android/Chrome als Testzielen. Vorhandenen Stack aus Vite, Three.js und Rapier weiterverwenden.

## 1. Spielzustand und Eingabe

- Menü, Spielen und Pause unabhängig von Pointer Lock verwalten.
- Startbutton auf Touch-Geräten freigeben; Pointer Lock nur für Maussteuerung verwenden.
- Maus/Tastatur und Touch liefern dieselben Bewegungs- und Aktionsbefehle. Kollision, Treppen, Sprung und weiches Ducken weiterverwenden.
- Touch-Erkennung plus Einstellung Automatisch / Touch / Maus; Hybridgeräte berücksichtigen.
- Bei Loslassen, pointercancel, verlorenem Pointer Capture, App-Wechsel und Pause alle Eingaben zurücksetzen.

## 2. Touch-Steuerung

| Aktion | Bedienung |
| --- | --- |
| Bewegen | Virtueller Joystick unten links, analog dosierbar |
| Umschauen | Wischen auf der rechten Bildschirmhälfte |
| Schnell gehen | Joystick in den äußeren Bereich ziehen |
| Springen | Großer Button rechts |
| Ducken | Umschaltbutton; erneutes Antippen fordert Aufstehen an, Kopffreiheit bleibt erforderlich |
| Pause / Einstellungen | Button oben rechts |

Mehrere Berührungen getrennt nach Pointer-ID verwalten. Pointer Capture hält Joystick und Blicksteuerung stabil; Browsergesten nur auf den Spielflächen unterdrücken. Touch-Empfindlichkeit und Button-Größe einstellbar machen.

## 3. Boxtraining und weitere Minispiele

- In Schlagdistanz zwei große Faustbuttons anzeigen; ein Tipp löst genau einen linken oder rechten Schlag aus.
- Trefferprüfung, Reichweite, Pendelphysik und Serienwertung beibehalten.
- Bewegungsstick und freie Wischfläche bleiben für Abstand und Blickrichtung erreichbar.
- Treffer- und Serienanzeige kompakt anordnen.
- Kontextabhängige Aktionsflächen als Grundlage für weitere Minispiele verwenden.

## 4. Oberfläche und Unterbrechungen

- Querformat als Hauptlayout; im Hochformat pausierte Ansicht mit Drehhinweis.
- Minimap verkleinern und einklappbar machen; Raumanzeige und Hilfen reduzieren.
- Sichere Abstände zu Displayaussparungen und Systemgesten berücksichtigen.
- Passwortdialog und Einstellungen auch mit Bildschirmtastatur bedienbar halten.
- Nach App-Wechsel oder Displaysperre nur durch Weiter fortsetzen.
- Audio durch Tippen auf Spielen/Weiter aktivieren; Lautstärke und Stummschaltung behalten.
- Vollbild nur als optionale Verbesserung; Spielstart darf nicht davon abhängen.

## 5. Leistung

Ausgangslage: Antialiasing, weiche Schatten, Render-Pixelverhältnis bis 1,75, Physikschritt 1/120 s.

- Mobiles Grafikprofil mit geringerer Renderauflösung und günstigeren Schatten anbieten.
- Auf echten Geräten messen, insbesondere auf Treppen und beim Boxtraining.
- Ziel: möglichst 60 FPS, auf schwächeren Geräten stabile 30 FPS.
- Physikfrequenz erst nach Messung und erneuter Prüfung von Kollision, Treppen und Boxsack ändern.

## 6. Abnahme

Auf echtem iPhone und Android-Gerät:

- Anmelden, privates Modell automatisch laden und alle Etagen erreichen.
- Gleichzeitig bewegen, umschauen und springen.
- Unter Dachschrägen ducken und bei ausreichender Höhe aufstehen.
- Boxtraining, Serien, Sounds und Lautstärke bedienen.
- Drehen, App-Wechsel, Displaysperre und Fortsetzen ohne festhängende Eingaben.
- Mindestens zehn Minuten spielen, Erwärmung und Leistungseinbrüche prüfen.
- Desktop-Steuerung auf Regressionen prüfen.

## Umsetzungsetappen

1. Touch-Bewegung und Pause.
2. Mobile Oberfläche und Boxtraining.
3. Geräteprüfung und Leistungsoptimierung.

Homescreen-Installation ist eine spätere Ergänzung und keine Voraussetzung. Das private Hausmodell wird weiterhin nach Anmeldung serverseitig geladen; ein Offline-Cache für private Hausdaten ist nicht Teil dieses Plans.

## Referenzen

- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
