/**
 * Der Umgang mit den Kilometerstand-Feldern des Produktionstools
 * (Plan-Punkt 66, 67).
 *
 * Dasselbe Feld gibt es **zweimal**: einmal im Dialog „Wegstreckenzähler
 * ändern", einmal im Fahrzeug-Formular dahinter. Solange der Dialog offen ist,
 * ist nur sein Feld erreichbar — das andere liegt unter dem Backdrop. Ein
 * Selektor mit Komma würde das nicht abbilden: `querySelector` nimmt den ersten
 * Treffer in Dokumentreihenfolge, und das ist das Feld der Seite, nicht das des
 * Dialogs. Deshalb entscheidet `resolveMileageField()` in dieser Reihenfolge.
 */

import { checkField, writeFieldValue } from './field';
import { parseAltStand } from '../core/mileage';

/** Die beiden Kilometerstand-Felder, Dialog zuerst. */
export const MILEAGE_FIELD_SELECTORS = [
  '#fahrzeug-dialog-laufleistung-input',
  '#fahrzeug-laufleistung-input',
] as const;

/** Ein offener Material-Dialog. Er verdeckt alles darunter. */
export const OPEN_DIALOG_SELECTOR = 'mat-dialog-container.mdc-dialog--open';

/**
 * Ein Dialog-Container, **offen oder nicht**. Material lässt ihn während der
 * Schließ-Animation stehen; sein Feld ist dann noch da, aber schon nicht mehr
 * gemeint.
 */
export const ANY_DIALOG_SELECTOR = 'mat-dialog-container';

/** Die Beschriftung mit dem alten Stand — an beiden Stellen dieselbe Klasse. */
export const ALT_STAND_SELECTOR = '.laufleistung-alt';

/**
 * Das Feld, das gerade bedient werden kann.
 *
 * Bei offenem Dialog wird **nur in ihm** gesucht. Das ist nicht bloß eine
 * Rangfolge: würde die Leiste am verdeckten Feld der Seite hängen, schwebte sie
 * über dem Backdrop mitten im Dialog und schriebe in ein Feld, das der Prüfer
 * gar nicht sieht.
 */
export function resolveMileageField(root: Document | Element): HTMLInputElement | null {
  const dialog = root.querySelector(OPEN_DIALOG_SELECTOR);

  // Ein offener Dialog verdeckt alles: entweder er hat ein Feld, oder es gibt
  // gerade keins. Auf die Seite dahinter auszuweichen hieße, in ein Feld zu
  // schreiben, das der Prüfer nicht sieht.
  if (dialog !== null) return firstConnected(dialog);

  // Ein Feld in einem geschlossenen Dialog zählt nicht — der ist im Abgang.
  // Übersprungen, nicht abgebrochen: dahinter liegt das Feld der Seite, und
  // genau das ist dann gemeint.
  return firstConnected(root, (field) => field.closest(ANY_DIALOG_SELECTOR) === null);
}

function firstConnected(
  scope: Document | Element,
  accept: (field: HTMLInputElement) => boolean = () => true,
): HTMLInputElement | null {
  for (const selector of MILEAGE_FIELD_SELECTORS) {
    const found = scope.querySelector<HTMLInputElement>(selector);
    if (found !== null && found.isConnected && accept(found)) return found;
  }
  return null;
}

/**
 * Die Beschriftung, die zu **diesem** Feld gehört.
 *
 * Von unten nach oben, bis ein Vorfahr genau eine Beschriftung enthält. Ein
 * `document.querySelector` wäre kürzer und bei offenem Dialog falsch — dann
 * gibt es zwei, und die erste gehört zur Seite dahinter. Mehrdeutig heißt
 * deshalb `null`: lieber keinen Knopf anbieten als den falschen Kilometerstand.
 */
export function findAltStandLabel(field: Element): Element | null {
  let node = field.parentElement;
  while (node !== null) {
    const found = node.querySelectorAll(ALT_STAND_SELECTOR);
    if (found.length > 1) return null;
    if (found.length === 1) return found[0] ?? null;
    node = node.parentElement;
  }
  return null;
}

/** Der alte Stand zu diesem Feld, oder `null` wenn keiner ausgewiesen ist. */
export function readAltStand(field: Element): number | null {
  const label = findAltStandLabel(field);
  if (label === null) return null;
  return parseAltStand(label.textContent ?? '');
}

export type MileageResult = { ok: true } | { ok: false; message: string };

/**
 * Schreibt den Wert ins Feld.
 *
 * Wie beim Bemerkungsfeld wird **unmittelbar vor dem Schreiben** geprüft und
 * **nach** dem `input`-Ereignis gegengeprüft: Angular hört auf genau dieses
 * Ereignis, und ein eigener Formatierer könnte den Wert zurückschreiben. Der
 * Prüfer hätte sonst eine Erfolgsmeldung vor sich und ein unverändertes Feld.
 *
 * Den Rest besorgt `writeFieldValue()` samt Fokus-Klammer: das Feld ist als
 * Pflichtfeld rot umrandet, solange Angular es für unberührt hält, und berührt
 * ist es erst nach einem echten `blur`.
 */
export function applyMileage(field: HTMLInputElement, value: number): MileageResult {
  const issue = checkField(field);
  if (issue !== null) {
    return {
      ok: false,
      message:
        issue === 'detached'
          ? 'Das Feld für den Kilometerstand ist nicht mehr da.'
          : 'Das Feld für den Kilometerstand lässt sich gerade nicht beschreiben.',
    };
  }

  // Ohne Tausendertrenner: das Feld lässt zwar Punkte zu, aber die Schreibweise
  // ohne Trenner ist die, die das Tool selbst anzeigt.
  const next = String(value);
  if (field.maxLength > 0 && next.length > field.maxLength) {
    return { ok: false, message: `${next} passt nicht in das Feld.` };
  }

  if (!writeFieldValue(field, next)) {
    return { ok: false, message: 'Das Produktionstool hat die Eingabe verworfen. Bitte erneut versuchen.' };
  }

  return { ok: true };
}
