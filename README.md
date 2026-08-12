# Prüfhelfer

[![CI](https://github.com/funkedipasys-dot/pruefhelfer/actions/workflows/ci.yml/badge.svg)](https://github.com/funkedipasys-dot/pruefhelfer/actions/workflows/ci.yml)

Eine Chrome-Erweiterung für Prüfingenieure, die täglich im GTÜ-Produktionstool
arbeiten. Sie nimmt vier Handgriffe ab, die sich pro Prüfung wiederholen:

- **Textbausteine** ins Bemerkungsfeld einsetzen — ein paar gängige Vermerke sind
  eingebaut, eigene lassen sich direkt am Feld anlegen. Der vollständige Text
  steht vor dem Einfügen da, nicht erst danach.
- **Kilometerstand übernehmen** — im Dialog „Wegstreckenzähler ändern" steht der
  alte Stand direkt unter dem leeren Pflichtfeld. Ein Klick trägt ihn ein,
  wahlweise mit `+2` oder `+5` für die Kilometer zwischen Ablesen und Prüfung.
- **Erstzulassung mit zweistelligem Jahr** — `25.12.10` wird im Tool zu
  `25.12.0010` und damit zum Fehler. Neben der Meldung erscheint ein Knopf mit
  dem Datum, das gemeint war; ein Klick trägt es ein.
- **HU fällig monatsweise** — im Feld stehend springt `←` einen Monat zurück,
  `→` einen vor. Aus `08.2026` wird mit drei Anschlägen `05.2026`.

**Ohne Konto, ohne Registrierung.** Alles, was du eingibst, bleibt auf dem
Gerät — es gibt keinen Server, an den es gehen könnte.

Die **einzige** Ausnahme ist eine Versionsabfrage: beim Öffnen des Popups wird
höchstens einmal am Tag nachgesehen, ob eine neuere Fassung veröffentlicht
wurde. Details unter [Was sie darf](#was-sie-darf).

Dass sie läuft, zeigt ein kleines weißes Kennzeichen oben mittig — mit
Fassungsnummer, damit auch die Frage „ist es der neue Stand?" beantwortet ist.
Es fängt keinen Klick ab.

**Website:** <https://funkedipasys-dot.github.io/pruefhelfer/> —
**Direkt-Download der aktuellen Version:**
[pruefhelfer.zip](https://github.com/funkedipasys-dot/pruefhelfer/releases/latest/download/pruefhelfer.zip)

## Installieren

Bis zur Veröffentlichung im Chrome Web Store als entpackte Erweiterung. Nötig
sind [Node.js](https://nodejs.org) ab 20 und `pnpm` (`corepack enable`):

1. [pruefhelfer.zip](https://github.com/funkedipasys-dot/pruefhelfer/releases/latest/download/pruefhelfer.zip)
   herunterladen und in einen dauerhaften Ordner entpacken — oder selbst bauen:
   dieses Repo herunterladen, `pnpm install && pnpm build`, das Ergebnis liegt
   in `dist/`.
2. `chrome://extensions` öffnen, **Entwicklermodus** einschalten.
3. „Entpackte Erweiterung laden" → den entpackten Ordner (bzw. `dist/`) auswählen.
4. Einen Prüfauftrag im Produktionstool öffnen. Am Bemerkungsfeld erscheint
   oben rechts der Knopf **Textbausteine**; neben dem alten Kilometerstand
   erscheinen die Übernahme-Knöpfe; neben einer Erstzulassung mit zweistelligem
   Jahr steht der Korrektur-Vorschlag.

## Was sie darf

| Berechtigung | Wofür |
|---|---|
| `storage` | Die selbst angelegten Textbausteine, lokal auf diesem Gerät. |
| Zugriff auf `shell-frontend.gtue.world` | Ohne Zugriff auf die Seite kein Knopf an ihrem Feld. |
| Zugriff auf `raw.githubusercontent.com/funkedipasys-dot/pruefhelfer/*` | Die Versionsabfrage. Nur dieses eine öffentliche Repo, sonst nichts. |

Kein Hintergrunddienst, keine Telemetrie. Insbesondere wird **nicht erfasst,
welcher Textbaustein benutzt wurde** — das wäre eine Leistungsüberwachung des
Prüfers und geht eine Erweiterung nichts an.

### Die Versionsabfrage

Seit 0.6.7 gibt es genau einen Netzwerkaufruf, und er verdient eine ehrliche
Beschreibung statt eines Kleingedruckten.

**Warum.** Diese Erweiterung wird entpackt installiert. Chrome aktualisiert sie
deshalb **nie** von selbst. Am 12.08.2026 gab es einen Fehler, bei dem im Feld
„HU fällig" ein Datum stand, das die Anwendung nie übernommen hatte — sichtbar
richtig, tatsächlich falsch. So etwas darf nicht monatelang unbemerkt in Betrieb
bleiben, nur weil niemand von sich aus nach einer neuen Fassung sieht.

**Was passiert.** Beim Öffnen des Popups, höchstens einmal in 24 Stunden, wird
diese Datei gelesen:

```
https://raw.githubusercontent.com/funkedipasys-dot/pruefhelfer/main/src/light/manifest.json
```

Ein `GET` auf eine öffentliche Datei in einem öffentlichen Repo. Ohne Kennung,
ohne Kopfzeilen, ohne Nutzlast. Verglichen wird nur die Fassungsnummer.

**Was dabei übertragen wird.** Nichts über dich. GitHub sieht denselben Aufruf,
den es sähe, wenn du die Datei im Browser öffnest — also deine IP-Adresse, wie
bei jedem Seitenaufruf im Netz. Es geht **kein** Textbaustein, **kein**
Kennzeichen, **kein** Auftrag und **keine** Nutzungsinformation hinaus. Es gibt
auch keinen Weg, auf dem das ginge: die Anfrage hat keinen Körper, und die
Antwort wird nur auf die Fassungsnummer hin ausgewertet.

**Wenn du das nicht willst:** öffne das Popup nicht — ohne Popup kein Aufruf.
Die Erweiterung arbeitet am Feld vollständig ohne Netz. Oder entziehe unter
`chrome://extensions` den Zugriff auf `raw.githubusercontent.com`; dann
unterbleibt die Abfrage und sonst ändert sich nichts.

### Nachprüfbar, ohne mir zu glauben

Das ist nicht nur behauptet, sondern geprüft: `src/light/build.spec.ts` baut die
Erweiterung und durchsucht das **Ergebnis** nach jedem Weg, auf dem ein Byte den
Rechner verlassen könnte — `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
`EventSource`, `RTCPeerConnection`, dynamisches `import()`, `new Image()`,
Nachrichten an einen Hintergrunddienst, und Serveradressen dazu.

- Im **Content-Script** — dem Teil, der am Prüfauftrag mitarbeitet — ist **jeder**
  dieser Wege verboten. Dort gibt es keine Ausnahme.
- Im **Popup** ist genau eine Erwähnung von `fetch` erlaubt, und ein weiterer
  Test verlangt, dass außer der Manifest-Adresse und dem Link auf die
  Release-Seite **keine** weitere Adresse im Bündel vorkommt. „Eine Ausnahme"
  ist damit eine geprüfte Zahl, keine Zählweise.

Dass die Liste selbst noch greift, prüft ein zweiter Test an absichtlich
schmutzigen Beispielen. `pnpm test` führt alle mit aus.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/core/` | Browserfreier Kern: Platzhalter-Grammatik, Einfüge-Logik, eigene Bausteine, Kilometerstand-Parser, Jahrhundert-Regel fürs EZ-Datum. **Kein `chrome.*`** — muss in Node testbar bleiben. |
| `src/content/` | Feldbeobachtung, Panel, Kilometerstand- und Erstzulassungs-Leiste im Produktionstool. |
| `src/ui/` | Die Bedienung, die Panel und Popup teilen. |
| `src/light/` | Die Einstiegspunkte dieser Fassung. |

Zwei Entwurfsentscheidungen, die den Rest erklären:

**Kein einziger Knoten landet im Angular-Baum der Anwendung.** Panel und Leiste
hängen an `document.body`, stehen `position: fixed` und werden über die
Viewport-Koordinaten nachgeführt. Alles Weitere steckt im eigenen Shadow DOM:
die Stile der Seite kommen nicht herein, unsere nicht hinaus.

**Geschrieben wird nur auf einen echten Klick.** Jeder Handler prüft
`event.isTrusted`. Ein per Skript ausgelöster Klick — von der Seite, von einer
anderen Erweiterung — schreibt nichts in ein Prüffeld.

```bash
pnpm install
pnpm package   # typecheck + Tests + Build nach dist/
```

Verweise der Form „Plan-Punkt 47" in den Kommentaren zeigen auf das interne
Umsetzungsdokument, aus dem dieser Code entstanden ist. Es gehört zur
Pro-Fassung und ist nicht Teil dieses Repos; die Kommentare stehen trotzdem
für sich.

## Pro-Fassung

Es gibt eine zweite Fassung, in der die Textbausteine zentral für ein ganzes
Büro gepflegt und auf alle gekoppelten Geräte verteilt werden, statt auf jedem
Rechner einzeln zu entstehen. Sie ist nicht Teil dieses Repos.

## Lizenz

Quelltext offen einsehbar, private und geschäftliche **Nutzung** der Erweiterung
erlaubt — aber keine Weiterverbreitung und keine abgeleiteten Werke.
Einzelheiten in [LICENSE](LICENSE). Kein Open Source im Sinne der OSI.

## Kein Produkt der GTÜ

Prüfhelfer ist ein unabhängiges Projekt: für die Verwendung mit dem Prüfsystem
der GTÜ Gesellschaft für Technische Überwachung mbH entwickelt, aber nicht von
ihr — es wird von der GTÜ weder herausgegeben noch unterstützt, geprüft oder
freigegeben. „GTÜ" ist hier ausschließlich als Angabe darüber genannt, in
welcher Anwendung die Erweiterung arbeitet.

Keine Gewähr: Die Erweiterung trägt Werte in Felder eines Prüfberichts ein.
**Was dort steht, verantwortet der Prüfer** — vor dem Übernehmen prüfen.
