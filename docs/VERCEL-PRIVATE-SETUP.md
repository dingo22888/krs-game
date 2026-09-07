# Privater Vercel-Betrieb

Der öffentliche GitHub-Stand enthält kein Hausmodell. Die Produktionsseite
lädt die private Datei nach einer erfolgreichen Anmeldung aus einem privaten
Vercel-Blob-Store.

## Einmalige Einrichtung

1. In Vercel das Projekt `krs-game` öffnen und zu **Storage** wechseln.
2. **Create Database → Blob** wählen und beim Zugriff **Private** auswählen.
3. Den Store mit dem Projekt und der Production-Umgebung verbinden. Vercel
   stellt für serverseitige Funktionen standardmäßig `BLOB_STORE_ID` und den
   kurzlebigen `VERCEL_OIDC_TOKEN` bereit. Der Token wird nicht in den Browser
   ausgeliefert.
4. Im Blob-Store den Reiter **Files** öffnen und dort **Upload** wählen. Falls
   dieser Button in deiner Vercel-Ansicht fehlt, kann der offizielle CLI-Weg
   verwendet werden (aus dem verknüpften Projektverzeichnis):

   ```sh
   npx vercel login
   npx vercel link
   npx vercel blob put ./krausmansion-model.json \
     --pathname krausmansion-model.json \
     --content-type application/json \
     --access private
   ```

   Der Befehl verwendet bei einem verknüpften Projekt automatisch die
   kurzlebige OIDC-Anmeldung. Die resultierende private URL hat das Format:

   `https://<store-id>.private.blob.vercel-storage.com/krausmansion-model.json`

5. In **Settings → Environment Variables** mindestens diese Variablen setzen:

   | Variable | Wert |
   | --- | --- |
   | `GAME_PASSWORD` | ein eigenes, ausreichend langes Passwort |
   | `GAME_AUTH_SECRET` | zufälliger langer Wert zum Signieren der Sitzungen |
   | `HOUSE_MODEL_URL` | private Blob-URL aus Schritt 4 (Pflicht) |

   Alle drei Variablen müssen für **Production** gesetzt werden. `GAME_PASSWORD`
   und `GAME_AUTH_SECRET` als Secret markieren. Das Passwort nicht an mich oder
   in den Chat schicken.

6. Eine neue Production-Deployment auslösen. Danach fragt die Seite beim ersten
   Besuch nach dem Passwort und lädt das Modell automatisch.

Für lokale Entwicklung bleibt der neutrale Testraum aktiv; die lokalen JSON-
Importfunktionen bleiben dort als Fallback erhalten. In Production wird kein
Modell aus `localStorage` verwendet.

## Sicherheitshinweise

- Der Blob-Store muss **Private** sein, nicht Public.
- `HOUSE_MODEL_URL` darf im Frontend stehen, weil die URL allein keinen Zugriff
  gewährt. Der Blob-Zugriffstoken bleibt ausschließlich in der Vercel Function.
- Bei einer Passwortänderung müssen `GAME_PASSWORD` und möglichst auch
  `GAME_AUTH_SECRET` aktualisiert und neu deployed werden.
- Ein eingeloggter Browser muss die Geometrie zum Rendern erhalten. Ein Nutzer,
  der das Spiel benutzen darf, kann sie daher technisch aus den Browser-
  Entwicklerwerkzeugen auslesen. Gegen anonyme Besucher ist der Abruf geschützt.

## Vercel-Verbindung

Ein Vercel-API-Token muss nicht im Chat geteilt werden. Wenn die autorisierte
Vercel-Integration in deiner Codex-Sitzung Storage- und Umgebungsvariablen-
Aktionen anbietet, können die Schritte 1–5 dort ausgeführt werden; andernfalls
genügt das Vercel-Dashboard. Ein lokaler `vercel login`-Workflow ist ebenfalls
möglich.
