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

**Ohne Konto, ohne Server, ohne Registrierung.** Alles bleibt auf dem Gerät.

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

Kein Hintergrunddienst, kein Netzwerkzugriff, keine Telemetrie. Insbesondere
wird **nicht erfasst, welcher Textbaustein benutzt wurde** — das wäre eine
Leistungsüberwachung des Prüfers und geht eine Erweiterung nichts an.

Das ist nicht nur behauptet, sondern geprüft: `src/light/build.spec.ts` baut die
Erweiterung und durchsucht das **Ergebnis** nach jedem Weg, auf dem ein Byte den
Rechner verlassen könnte — `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
`EventSource`, `RTCPeerConnection`, dynamisches `import()`, `new Image()`,
Nachrichten an einen Hintergrunddienst, und Serveradressen dazu. Findet sich
etwas davon, schlägt der Test fehl. Dass die Liste selbst noch greift, prüft ein
zweiter Test an absichtlich schmutzigen Beispielen. `pnpm test` führt beide mit
aus — nachprüfbar, ohne mir zu glauben.

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
