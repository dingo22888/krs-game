# Supabase Auth und Highscores – Umsetzungsplan

Stand: 17.09.2026. Plan, noch keine Datenbankänderung oder Auth-Umstellung.
Mellis neues Minispiel ist auf Wunsch zurückgestellt. Die begonnenen Änderungen
wurden zurückgenommen. Dieser Plan umfasst Boxtraining, Tic-Tac-Toe und Pong.

## 1. Projektentscheidung

Empfehlung: eigenes Supabase-Projekt `krs-game`, Region EU. Das trennt Daten,
Benutzer, Auth-Konfiguration und Betriebsrisiken von Hometrack. Free erlaubt
aktuell zwei aktive Projekte über die relevanten Organisationen hinweg; ob ein
Platz frei ist, wurde nicht im Konto geprüft. Free-Projekte können nach einer
Woche Inaktivität pausiert werden.

Hometrack mitzubenutzen ist möglich, wenn kein zweiter Platz frei ist und ein
neues kostenpflichtiges Projekt vermieden werden soll. Dann:

- Spieltabellen in eigenem Schema `krs_game`, Migrationen nur für dieses Schema.
- Gemeinsames Supabase Auth: Schema-Trennung schafft keine getrennten Benutzer.
- Eigene Spielmitgliedschaft erforderlich; ein Hometrack-Login gibt nicht
  automatisch Zugang zum Hausspiel und umgekehrt.
- Vorher vorhandene Tabellenrechte, RLS-Regeln, Auth-Trigger, Registrierungswege,
  Redirect-URLs und Mailvorlagen in Hometrack prüfen. Regeln, die pauschal alle
  angemeldeten Benutzer zulassen, könnten auch Spielkonten Zugriff geben.
- Hometrack-Site-URL und Auth-Einstellungen nicht ungeprüft überschreiben.
- Gemeinsam genutzte Ressourcen und Backups bleiben gekoppelt.

Die tatsächliche Hometrack-Konfiguration wurde nicht inspiziert. Die Empfehlung
beruht auf der gewünschten Trennung beider Anwendungen.

## 2. Zugang zum privaten Haus

- E-Mail und Passwort mit Supabase Auth; Anzeigename für Ranglisten.
- Nur eingeladene/freigeschaltete Benutzer. Im eigenen Projekt öffentliche und
  anonyme Registrierung abschalten. Bei geteiltem Projekt bestehende Registrierung
  erhalten, Zugang zum Spiel über explizite Mitgliedschaft beschränken.
- Einladung, Passwort setzen, Anmeldung, Sitzungsverlängerung, Passwort vergessen,
  Abmelden. Kein zusätzlicher Google-Login im ersten Schritt.
- Eigenen SMTP-Versand konfigurieren: Supabases Standardversand ist für Tests und
  versendet nur an vorautorisierte Team-Adressen. SMTP-Daten gehören in die
  Supabase-Einstellungen, nicht in GitHub oder Chat.
- Callback- und Recovery-URLs für die Produktionsdomain exakt freigeben;
  Vorschau/localhost gezielt separat konfigurieren.
- Die bestehende Vite-App bleibt. Supabase-Client übernimmt Auth und Sessions.
  Geschützte Vercel-APIs erhalten den Access Token als Bearer-Token und prüfen
  ihn serverseitig mit Supabase sowie die aktive Spielmitgliedschaft.
- `/api/house-model` stellt das Modell ausschließlich nach diesen Prüfungen
  bereit. Blob bleibt privat bei Vercel. Kein Modellumzug zu Supabase.
- Abmelden beendet das Spiel und entfernt geladene private Modelldaten aus dem
  laufenden Clientzustand. Private API-Antworten nicht öffentlich cachen.
- Das alte gemeinsame Passwort erst nach erfolgreichem Test ersetzen. In der
  neuen Betriebsart darf der alte Passwort-Cookie kein alternativer Zugang sein.

## 3. Kleine Datenstruktur

| Tabelle | Zweck |
| --- | --- |
| `game_members` | Benutzer-ID, Freischaltung/Sperre; ausschließlich administrativ verwaltet |
| `player_profiles` | Benutzer-ID, Anzeigename; keine E-Mail in der Rangliste |
| `game_runs` | Benutzer, Spiel, Regelversion, Start, Ablauf, Abschlussstatus |
| `game_scores` | Genau ein Ergebnis je Lauf, Wert, relevante Ergebnisdetails, Zeitpunkt |

Spiel-IDs und Wertungsregeln zunächst im Code. Benutzer-ID immer aus der geprüften
Session ableiten. Fremdschlüssel auf Auth-Benutzer, Löschregeln festlegen.
Rangliste zeigt pro Spiel und Regelversion nur den besten Lauf je Spieler;
bei identischer Wertung gleiche Platzierung, stabile Sortierung für die Anzeige.
Indizes auf Spiel/Regelversion/Wertung und Benutzer-ID. Erste Ansicht: Top 20,
eigener Rekord und eigener Rang. Keine Realtime-Abonnements erforderlich.

## 4. Vorgeschlagene Wertung

| Spiel | Gewerteter Lauf | Rangfolge |
| --- | --- | --- |
| Boxtraining | Explizit gestartete 60-Sekunden-Challenge, Training bleibt frei verfügbar | Höchste abwechselnde Treffer-Serie, dann gültige Treffer |
| Tic-Tac-Toe | Feste Challenge aus 10 Partien gegen denselben KI-Modus; Startrecht wechselt | Sieg 3, Remis 1, Niederlage 0; Summe bis 30 |
| Pong | Bestehende Partie bis 5 Punkte | Zuerst gewonnen vor verloren, dann eigene Punkte minus Gegnerpunkte; gleiche Ergebnisse teilen den Rang |

Pong hat damit bewusst eine einfache Ergebnisrangliste, keine künstlich
unbegrenzte Punkteskala. Keine kumulierten Lebenszeitpunkte, die nur häufiges
Spielen belohnen. Regeländerungen erhalten eine neue Version, damit alte und
neue Leistungen nicht vermischt werden. Abgebrochene Läufe zählen nicht.

## 5. Ergebnisübermittlung und Zugriffsschutz

- Gemeinsame Schnittstelle: Lauf starten, einmal beenden, Rangliste abrufen.
- Vercel-Endpunkte prüfen Session, Mitgliedschaft, Spiel, Version, Payload-Größe,
  Ablaufzeit und zulässige Ergebniswerte. Server vergibt die Lauf-ID.
- Ergebnisabschluss und Markierung als abgeschlossen in einer DB-Transaktion;
  eindeutige Lauf-ID verhindert doppelte Einträge bei Wiederholungen/Netzfehlern.
- Keine direkten Score-Schreibrechte für Browser. Servergeheimnis ausschließlich
  in Vercel-Umgebungsvariablen. Privilegierte Serverzugriffe benötigen eigene
  Berechtigungsprüfungen, da sie RLS umgehen können.
- RLS und minimale Grants auf allen erreichbaren Spieltabellen. Ranglisten nur
  für aktive Spielmitglieder; Benutzer ändern nur ihr eigenes Profil und können
  sich nicht selbst freischalten. Serveroperationen ebenfalls darauf prüfen.
- Plausibilitätsprüfungen und begrenzte Starts/Abschlüsse pro Benutzer. Kein
  Netzwerkaufruf je Frame oder je Boxschlag.
- Browserberechnete Werte sind manipulierbar. Für eine private Familienrangliste
  reichen diese Maßnahmen als erste Stufe; sie sind kein vollständiger
  Cheat-Schutz. Servernachrechnung von Spielereignissen wäre eine spätere Stufe.

## 6. Reihenfolge mit kleinen, überprüfbaren Schritten

1. Projektwahl, Zugang/Connection und SMTP klären; nötige Variablennamen liefern.
   Keine Schlüssel in den Chat kopieren.
2. Migrationen und RLS-Tests erstellen. Auth zunächst in Preview einbauen.
   Einladung/Recovery/Logout sowie Zugriff ohne Mitgliedschaft prüfen.
3. Modell-API umstellen. Ohne Login und ohne Mitgliedschaft muss der Abruf
   scheitern; gültige Mitglieder erhalten das private Modell. Erst dann den
   gemeinsamen Passwortschutz ablösen.
4. Gemeinsame Lauf-/Ergebnis-/Ranglisten-API und Pong als ersten Anschluss bauen.
   Zwei Konten, doppelte Abschlüsse, abgelaufene Läufe und API-Fehler prüfen.
5. Box-Challenge und Tic-Tac-Toe-Challenge ergänzen. Bestehendes freies Spielen
   erhalten, gewertete Läufe klar kennzeichnen.
6. Ranglisten im Menü und nach dem Ergebnis anzeigen. Speichern nur am Laufende;
   Liste beim Öffnen/Abschluss laden. Speicherausfall verständlich anzeigen.
7. Desktop und Touch prüfen, anschließend wie vereinbart veröffentlichen.

Nicht Teil dieses Schritts: neues Minispiel, Multiplayer, Realtime, eigene
Admin-Oberfläche oder Grafikumbau. Benutzerverwaltung zunächst im Dashboard.

## Quellen

- [Supabase Pricing](https://supabase.com/pricing)
- [Projektlimit und Abrechnung](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Auth-Konfiguration](https://supabase.com/docs/guides/auth/general-configuration)
- [SMTP-Versand](https://supabase.com/docs/guides/auth/auth-smtp)
- [Eigene Schemas](https://supabase.com/docs/guides/api/using-custom-schemas)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
