# Persönliche Konten und Highscores

Die Anbindung ist für das eigene Supabase-Projekt `krs-game` vorbereitet. Das
Hausmodell bleibt im privaten Vercel Blob. Es gibt keine öffentliche Registrierung
in der Anwendung und keine automatischen Spielmitgliedschaften.

## 1. Supabase Auth einrichten

Im Dashboard des **krs-game**-Projekts:

- Authentication → Sign In / Providers: E-Mail/Passwort aktivieren. **Allow new
  users to sign up** ausschalten, anonyme Anmeldung ausgeschaltet lassen.
- URL Configuration: Site URL `https://game.krausonline.de`.
- Redirect URLs: `https://game.krausonline.de/` und
  `https://game.krausonline.de/?set-password=1`. Für Preview genau die zum Test
  verwendete URL zusätzlich freigeben, keine pauschale Freigabe fremder Domains.
- SMTP: eigenen Mailversand für Einladungen/Passwort-Reset eintragen. Der
  Supabase-Standardversand ist eingeschränkt und kein verlässlicher Familienversand.
- Users → Add user → Create new user: erstes persönliches Konto mit E-Mail und
  eigenem Passwort erstellen/als bestätigt anlegen. Alternativ mit eingerichtetem
  SMTP einladen. Passwörter ausschließlich dort eingeben, nicht in GitHub/Chat.

Danach dieses Konto im SQL-Editor explizit freischalten (Platzhalter ersetzen):

```sql
begin;
insert into public.game_members(user_id)
select id from auth.users where lower(email) = lower('DEINE-EMAIL')
on conflict (user_id) do update set active = true;

insert into public.player_profiles(user_id, display_name)
select id, 'Dein Anzeigename' from auth.users where lower(email) = lower('DEINE-EMAIL')
on conflict (user_id) do update set display_name = excluded.display_name;
commit;
```

Alternativ kann die Freischaltung über die verbundene Supabase-App erfolgen,
sobald der Benutzer angelegt wurde und die gewünschte Benutzer-ID bekannt ist.
Weitere Personen werden genauso einzeln freigeschaltet. Zum Sperren `active=false`
setzen; die Server-API prüft die Mitgliedschaft bei jedem geschützten Aufruf.

## 2. Vercel-Konfiguration und Umschalten

Die Supabase-Marketplace-Verbindung liefert üblicherweise:

| Variable | Verwendung |
| --- | --- |
| `SUPABASE_URL` | URL des eigenen Game-Projekts |
| `SUPABASE_PUBLISHABLE_KEY` | Öffentlicher Schlüssel für Login |
| `SUPABASE_SECRET_KEY` | Privilegierter Schlüssel nur auf dem Server |
| `GAME_AUTH_MODE` | `supabase` zum Aktivieren, Standard ohne Variable: `password` |

Legacy-Schlüsselnamen `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` werden
auch unterstützt. **Keine geheimen Schlüssel mit `VITE_` oder `NEXT_PUBLIC_`
präfixieren.** Der Browser erhält über `/api/auth?config` nur URL und öffentlichen
Schlüssel. Ein versehentlich dort hinterlegter Secret-/Service-Schlüssel wird
abgewiesen.

Zuerst für eine Preview `GAME_AUTH_MODE=supabase` setzen. Auch die private
Blob-Verknüpfung und `HOUSE_MODEL_URL` müssen in dieser Umgebung verfügbar sein.
Neu deployen und den persönlichen Login, Modellabruf, Wertung und Logout mit dem
freigeschalteten Konto prüfen. Danach dieselbe Einstellung in Production setzen
und erneut deployen. In Supabase-Betriebsart akzeptiert die Modell-API **keinen
alten Passwort-Cookie** mehr. Fehlende Konfiguration führt zu einer Sperre,
nicht zu einem Rückfall auf das gemeinsame Passwort.

Bis zur ausdrücklichen Aktivierung bleibt der vorhandene Passwortzugang nutzbar;
Ranglisten und persönliche Kontoeinstellungen sind dann ausgeblendet. Ein bewusstes
Rollback auf `GAME_AUTH_MODE=password` reaktiviert den bisherigen gemeinsamen
Zugang und ist daher keine Lösung für gesperrte Einzelkonten.

## 3. Wertungen

- **Pong:** Am PC „Gewertete Partie“ starten. Eine Partie bis fünf Punkte;
  Siege stehen vor Niederlagen, danach zählt die Punktedifferenz.
- **Tic-Tac-Toe:** Beim Betreten der Küchentafel beginnt automatisch eine
  10-Partien-Wertung. Mensch/Küche beginnen
  abwechselnd. Sieg 3, Remis 1, Niederlage 0 Punkte. Die nächste Partie ist erst
  nach Ende der vorigen verfügbar.
- **Boxen:** Der erste Treffer startet automatisch eine 60-Sekunden-Wertung.
  Alternativ `B` oder den Wertungsbutton nutzen.
  Längste wechselnde Serie zählt zuerst, Trefferzahl danach. Pause/Verlassen der
  Runde bricht die Wertung ab.
- Highscores mit `H` oder dem direkten Highscore-Button öffnen. Die Rangliste
  pausiert das Spiel und den Box-Timer, ohne die laufende Wertung abzubrechen.
  „Weiter spielen“ setzt die Partie fort; bei gesperrter Mausfreigabe erneut klicken.
  Top 20 plus eigener bester Lauf. Gleiche Ergebnisse teilen
  denselben Rang. Anzeigenamen lassen sich im Menü ändern; E-Mail bleibt privat.
- Netzwerkfehler beim Abschluss: „Erneut speichern“ übermittelt denselben Lauf.
  Ein Primärschlüssel und eine Transaktion verhindern doppelte Einträge. Nicht
  gespeicherte Ergebnisse bleiben nur in der aktuellen Sitzung, nicht nach Reload.

Die Server-API validiert Spiel, Ergebnisse, Laufbesitz, Ablauf, Mindestdauer und
Startfrequenz. Es gibt keine Browser-Schreibrechte auf die Tabellen/RPCs. Das ist
eine private Familienwertung mit Plausibilitätsprüfung; browserberechnete
Ergebnisse sind nicht vollständig gegen Manipulation abgesichert.

## Datenbank und Prüfung

Migration: `supabase/migrations/20260917083048_game_auth_highscores.sql`.
Alle vier Tabellen haben RLS und keine Grants für `anon`/`authenticated`.
Nur `service_role` darf über die geprüften Vercel-Endpunkte darauf zugreifen;
RPCs verwenden `SECURITY INVOKER`, feste leere Suchpfade und explizite EXECUTE-Grants.
Der Advisor-Hinweis „RLS Enabled No Policy“ ist bei diesem absichtlich vollständig
serverseitigen Zugriffsmodell erwartbar: Browserzugriff bleibt vollständig gesperrt.
[Supabase-Erklärung](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Verifiziert: API-Tests mit echten SDK-Aufrufen gegen simulierte HTTP-Antworten,
Datenbank-Transaktion mit temporären Testbenutzern und anschließendem Rollback,
Browser-Abläufe mit lokaler API-Simulation. Ein echter Konto-/Mailversandtest ist
erst nach Einrichtung des ersten Kontos und SMTP möglich.

### Pause und Rückkehr

Esc pausiert Tic-Tac-Toe und Pong samt Spielstand. „Minispiel fortsetzen“ setzt die Partie mit freiem Cursor fort. „Zurück ins Haus“ bzw. „Aufstehen“ verlässt das Minispiel und bricht eine unfertige Wertung ab. Boxtraining wird beim Öffnen des Esc-Menüs weiterhin abgebrochen.
