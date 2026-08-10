/**
 * Der Umgang mit dem Erstzulassungsfeld des Produktionstools.
 *
 * Anders als beim Kilometerstand gibt es dieses Feld **einmal**: es steht im
 * Fahrzeug-Formular, nicht in einem Dialog. Ein Selektor genügt deshalb, und
 * `watchField` kann ihn direkt bekommen.
 */

import { checkField, writeFieldValue } from './field';
import { proposeEzDate } from '../core/ez-date';
import type { EzDateProposal } from '../core/ez-date';

/** Das Feld „Datum der EZ" im Fahrzeug-Formular. */
export const EZ_DATE_FIELD_SELECTOR = '#fahrzeug-erstzulassung';

/**
 * Die Fehlermeldung unter dem Feld — dort, wo die Leiste hängt.
 *
 * Material hängt sie in dieselbe `mat-form-field` wie das Eingabefeld. Die
 * Suche beginnt deshalb dort und nicht am Dokument: eine Meldung an einem
 * *anderen* Feld ist nicht gemeint, und es sind auf dieser Seite immer mehrere
 * sichtbar.
 *
 * Beide Schreibweisen, weil beide vorkommen können: das Element `mat-error`
 * selbst und die Klasse, die Material ihm gibt.
 */
export const EZ_ERROR_SELECTOR = 'mat-error, .mat-mdc-form-field-error, .mat-error';
const FORM_FIELD_SELECTOR = 'mat-form-field, .mat-mdc-form-field';

/**
 * Der Wortlaut, den das Tool bei einem verrutschten Jahrhundert zeigt.
 *
 * Nur der Anfang, nicht der ganze Satz: das Datum darin ist mal `1.5.1893`, mal
 * `01.05.1893`, je nachdem wer es formatiert.
 */
const MESSAGE = /^Eingabe muss nach dem/i;

/** Wie weit aufwärts nach der Meldung gesucht wird, bevor aufgegeben wird. */
const MAX_DEPTH = 6;

/**
 * Die Meldung zu **diesem** Feld, oder `null`.
 *
 * Zwei Wege, weil der erste sich am 10.08.2026 als zu eng erwiesen hat: die
 * Leiste hing am Eingabefeld statt an der Meldung und landete damit über dem
 * „Geschätzt"-Schalter daneben. Welche Klassen das Tool an seine Meldung hängt,
 * ist von außen nicht verlässlich zu erraten.
 *
 * 1. **Über die Material-Klassen**, innerhalb der Hülle des Feldes. Der
 *    Normalfall, wenn das Tool `mat-error` verwendet.
 * 2. **Über den Wortlaut.** Von unten nach oben, bis ein Vorfahr genau ein Blatt
 *    mit diesem Text enthält. Mehrdeutig heißt `null` — bei zwei fehlerhaften
 *    Datumsfeldern gehört die erste Meldung nicht zwingend zu diesem Feld.
 *
 * Findet keiner der beiden etwas, richtet sich die Leiste am Eingabefeld aus.
 * Sie steht dann gedrängter, aber sie steht — kein Grund, den Vorschlag ganz
 * wegzulassen.
 */
export function findEzDateError(field: Element): Element | null {
  const formField = field.closest(FORM_FIELD_SELECTOR);
  const bySelector = formField?.querySelector(EZ_ERROR_SELECTOR) ?? null;
  if (bySelector !== null) return bySelector;
  return findByText(field);
}

function findByText(field: Element): Element | null {
  let node = field.parentElement;
  for (let depth = 0; node !== null && depth < MAX_DEPTH; depth += 1) {
    const found: Element[] = [];
    for (const candidate of node.querySelectorAll('*')) {
      // Nur Blätter: sonst käme jede umschließende Hülle mit, und gemessen
      // würde am Ende ein Kasten statt der Textzeile.
      if (candidate.children.length === 0 && MESSAGE.test((candidate.textContent ?? '').trim())) {
        found.push(candidate);
      }
    }
    if (found.length > 1) return null;
    if (found.length === 1) return found[0] ?? null;
    node = node.parentElement;
  }
  return null;
}

/**
 * Der Vorschlag zum aktuellen Inhalt des Feldes, oder `null`.
 *
 * Der Stichtag kommt von außen: die Regel „welches Jahrhundert" hängt am
 * heutigen Datum, und ein Test soll nicht an dem Tag scheitern, an dem er
 * ausgeführt wird.
 */
export function readEzDateProposal(field: HTMLInputElement, today: Date = new Date()): EzDateProposal | null {
  return proposeEzDate(field.value, today);
}

export type EzDateResult = { ok: true } | { ok: false; message: string };

/**
 * Trägt das vorgeschlagene Datum ein.
 *
 * Derselbe Weg wie beim Kilometerstand: **unmittelbar vor dem Schreiben**
 * prüfen, dann über `writeFieldValue()` schreiben. Der Datumswähler formatiert
 * erst beim Verlassen des Feldes nach und meldet erst dann seine Prüfung neu —
 * ohne die Fokus-Klammer bliebe die rote Meldung stehen, obwohl das richtige
 * Datum dasteht. Genau das war am 10.08.2026 zu sehen.
 */
export function applyEzDate(field: HTMLInputElement, text: string): EzDateResult {
  const issue = checkField(field);
  if (issue !== null) {
    return {
      ok: false,
      message:
        issue === 'detached'
          ? 'Das Feld für die Erstzulassung ist nicht mehr da.'
          : 'Das Feld für die Erstzulassung lässt sich gerade nicht beschreiben.',
    };
  }

  if (field.maxLength > 0 && text.length > field.maxLength) {
    return { ok: false, message: `${text} passt nicht in das Feld.` };
  }

  if (!writeFieldValue(field, text)) {
    return { ok: false, message: 'Das Produktionstool hat die Eingabe verworfen. Bitte erneut versuchen.' };
  }

  return { ok: true };
}
