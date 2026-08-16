/**
 * Die Leiste über der Abschlussmaske (Slice 1.1, Eintragen seit Slice 1.2).
 *
 * Sie nennt die Felder, die die Maske gerade anmahnt und die die Erweiterung
 * erreichen kann, und nimmt zu jedem den Wert entgegen — geschrieben wird in
 * das echte Feld hinter der Maske.
 *
 * **Das Ziel wird erst im Augenblick des Klicks gesucht** (Slice 1.2), nicht
 * beim Aufbau der Zeile. Zwischen dem Erscheinen der Leiste und dem Klick liegen
 * Sekunden, in denen Angular das Feld austauschen kann; eine beim Zeichnen
 * gemerkte Referenz schriebe dann in einen abgehängten Knoten, und die
 * Rückleseprüfung fände ihren eigenen Wert ordentlich wieder vor.
 *
 * **Sie steht fest am unteren Bildschirmrand, nicht an der Maske.** Ein
 * angeheftetes Band müsste gemessen, nachgeführt und bei jeder Größenänderung
 * neu gerechnet werden — und läge bei einer bildschirmhohen Maske trotzdem
 * daneben. Über einem Modal ist der untere Rand die Stelle, an der ohnehin
 * niemand etwas sucht.
 *
 * **Beobachtet wird trotzdem: die Maske selbst.** Die Validierungsliste
 * entsteht nicht mit der Maske, sondern kommt mit der Antwort auf die Query
 * `validierungsergebnis` nach. Eine einmalige Auswertung beim Verbinden fiele
 * auf „nichts angemahnt" und bliebe für immer dabei — derselbe Fehler, an dem
 * die Kilometerstand-Leiste am 10.08.2026 gescheitert ist.
 */

import { BAR_STYLE } from './bar';
import { checkField } from './field';
import type { AngemahntesFeld } from './abschluss';

/** Ein fester Bezeichner macht den Wirt zum Singleton. */
export const ABSCHLUSS_HOST_ID = 'gtue-abschluss-host';

/**
 * Der Satz, den Slice 1.3 nötig macht.
 *
 * Die Validierungsliste ist eine **Momentaufnahme**: sie entsteht beim Öffnen
 * der Maske aus der Antwort auf `validierungsergebnis` und rechnet nicht nach,
 * wenn währenddessen geschrieben wird. Nach einem Eintrag steht dort weiter
 * „nicht gesetzt", obwohl der Wert im Formularmodell steht.
 *
 * Es zu sagen ist ehrlicher und billiger als der Versuch, die Neuberechnung von
 * außen anzustoßen — dafür müsste die Erweiterung in die Interna einer fremden
 * Anwendung greifen, und beim nächsten GTÜ-Update wieder.
 */
export const NACHZIEHEN = 'Maske einmal schließen und erneut öffnen, dann prüft GTÜ neu.';

/**
 * Fest unten mittig statt an der Maske ausgerichtet — deshalb wird `.bar` aus
 * `BAR_STYLE` hier umgehängt: dort trägt sie `top`/`left` und eine senkrechte
 * Verschiebung, die eine Leiste auf Texthöhe zentriert.
 */
const ABSCHLUSS_STYLE = `${BAR_STYLE}
.bar {
  top: auto;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  gap: 8px;
  padding: 6px 14px;
  background: #fff;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.bar .feld {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #565656;
}
.bar .wert {
  font: inherit;
  width: 7em;
  padding: 2px 8px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  color: #565656;
}
.bar .hinweis:empty { display: none; }
`;

export interface AbschlussOverlayDeps {
  /**
   * Was die Maske anmahnt. Wird bei jeder Regung in ihr neu abgefragt — die
   * Liste kommt nach, und sie kann sich ändern.
   */
  read: (dialog: Element) => readonly AngemahntesFeld[];
  /**
   * Der Wert ins echte Feld, mit Rückleseprüfung: `false` heißt, die Anwendung
   * hat ihn nicht angenommen. Wird gemeldet statt verschwiegen — sonst hätte
   * der Prüfer eine Bestätigung vor sich und ein unverändertes Feld hinter der
   * Maske, das er nicht sehen kann.
   */
  write: (input: HTMLInputElement, wert: string) => boolean;
}

export interface AbschlussOverlayHandle {
  attach: (dialog: HTMLElement) => void;
  detach: () => void;
  destroy: () => void;
  /** Zum Prüfen — der Inhalt liegt sonst hinter der Schattengrenze. */
  readonly shadow: ShadowRoot;
}

export function createAbschlussOverlay(deps: AbschlussOverlayDeps): AbschlussOverlayHandle {
  const host = document.createElement('div');
  host.id = ABSCHLUSS_HOST_ID;
  // Geschlossen wie die übrigen Wirte: was hier steht, benennt Prüffelder.
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = ABSCHLUSS_STYLE;

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.hidden = true;

  const hinweis = document.createElement('span');
  hinweis.className = 'hinweis';

  /** Die Zeilen — je Feld eine, mit eigener Eingabe. */
  const felderNode = document.createElement('span');
  felderNode.className = 'felder';

  /** Erfolg wie Abweisung: dieselbe Stelle, nur eine andere Farbe. */
  const meldung = document.createElement('span');
  meldung.className = 'hinweis';

  bar.append(hinweis, felderNode, meldung);
  shadow.append(style, bar);
  document.body.append(host);

  let dialog: HTMLElement | null = null;

  const melde = (text: string, schlecht: boolean): void => {
    meldung.textContent = text;
    meldung.className = schlecht ? 'fehler' : 'hinweis';
  };

  /**
   * Der Klickweg für ein Feld.
   *
   * Gesucht wird über den Namen, nicht über eine gemerkte Referenz — siehe den
   * Kopf dieser Datei. Der `isTrusted`-Riegel wie überall: was nicht von einem
   * Menschen kommt, schreibt nicht in ein Prüffeld.
   */
  const eintragen = (event: MouseEvent, name: string, eingabe: HTMLInputElement): void => {
    if (!event.isTrusted) return melde('Nur per Klick möglich.', true);

    const current = dialog;
    if (current === null || !current.isConnected) return melde('Die Maske ist nicht mehr offen.', true);

    const wert = eingabe.value.trim();
    if (wert === '') return melde(`Bitte erst einen Wert für ${name} eingeben.`, true);

    const ziel = deps.read(current).find(({ feld }) => feld.name === name);
    if (ziel === undefined) return melde(`${name} ist gerade nicht erreichbar.`, true);

    // Ein gesperrtes Feld nimmt ein `.value` klaglos an — die Rückleseprüfung
    // allein hielte das für einen Erfolg.
    if (checkField(ziel.input) !== null) return melde(`${name} lässt sich gerade nicht beschreiben.`, true);

    if (!deps.write(ziel.input, wert)) {
      return melde(`Das Produktionstool hat „${wert}" verworfen — ${name} steht unverändert.`, true);
    }
    melde(`${name}: ${wert} eingetragen. ${NACHZIEHEN}`, false);
  };

  const zeile = (name: string): HTMLElement => {
    const feld = document.createElement('label');
    feld.className = 'feld';
    feld.textContent = name;

    const eingabe = document.createElement('input');
    eingabe.className = 'wert';
    eingabe.type = 'text';

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.textContent = 'Eintragen';
    knopf.addEventListener('click', (event: MouseEvent) => eintragen(event, name, eingabe));

    feld.append(eingabe, knopf);
    return feld;
  };

  /** Woraus die Zeilen gerade bestehen — sonst würde jede Regung sie neu bauen. */
  let gezeigt = '';

  const refresh = (): void => {
    const current = dialog;
    if (current === null || !current.isConnected) return;

    const felder = deps.read(current);
    // Nichts angemahnt, was wir erreichen — dann gibt es auch nichts
    // anzubieten. Angemeldet bleibt alles: die Liste kann noch kommen.
    bar.hidden = felder.length === 0;
    if (felder.length === 0) return;

    const namen = felder.map(({ feld }) => feld.name);
    // **Nur bei Änderung neu zeichnen.** Der Beobachter meldet jede Regung in
    // der Maske; ein Neuaufbau bei jeder löschte dem Prüfer den halb getippten
    // Wert unter den Fingern weg.
    if (namen.join(', ') === gezeigt) return;
    gezeigt = namen.join(', ');

    hinweis.textContent = 'Diese Maske vermisst:';
    felderNode.replaceChildren(...namen.map(zeile));
    melde('', false);
  };

  const observer = new MutationObserver(refresh);

  return {
    shadow,
    attach(next) {
      dialog = next;
      observer.observe(next, { childList: true, subtree: true, characterData: true });
      refresh();
    },
    detach() {
      observer.disconnect();
      dialog = null;
      bar.hidden = true;
      hinweis.textContent = '';
      felderNode.replaceChildren();
      melde('', false);
      // Sonst hielte die nächste Maske ihre Zeilen für längst gezeichnet.
      gezeigt = '';
    },
    destroy() {
      this.detach();
      host.remove();
    },
  };
}
