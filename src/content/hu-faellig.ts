/**
 * Pfeiltasten im Feld „HU fällig": links einen Monat zurück, rechts einen vor.
 *
 * **Warum hier nicht `writeFieldValue()` benutzt wird.** Die Knöpfe an den
 * anderen Feldern schreiben von außen und müssen den Fokus deshalb erst holen
 * und danach wieder abgeben. Hier ist das Gegenteil richtig: der Prüfer *steht*
 * im Feld, und genau dort soll er bleiben — sonst ginge nach dem ersten Sprung
 * nichts mehr, und dreimal zurück wäre unmöglich. Geschrieben wird deshalb wie
 * beim Tippen: Wert setzen, `input` melden, Fokus behalten. Das abschließende
 * `blur` besorgt der Prüfer selbst, wenn er das Feld verlässt.
 */

import { checkField } from './field';
import { currentMonth, stepMonth } from '../core/month-step';

/** Das Feld „HU fällig" in den zusätzlichen Angaben. */
export const HU_FAELLIG_FIELD_SELECTOR = '#inspectmobility-zusaetzlicheangaben-hufaellig-textinput-input';

/**
 * Welche Taste wohin springt.
 *
 * Links und rechts, weil der Prüfer es so verlangt hat — obwohl beide sonst den
 * Schreibcursor bewegen. In einem Feld, dessen ganzer Inhalt `08.2026` lautet,
 * ist an dem Cursor nichts zu bewegen, was den Tausch nicht wert wäre.
 */
export const MONTH_STEP_KEYS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * Springt einen Monat, wenn es etwas zu springen gibt.
 *
 * `false` heißt: nichts angefasst, die Taste soll ihre normale Wirkung behalten.
 * Das ist der Fall bei einer unverstandenen Schreibweise und am Rand des
 * erlaubten Bereichs.
 *
 * **Ein leeres Feld liefert der erste Druck den aktuellen Monat — ungesprungen.**
 * Vorher diente der aktuelle Monat als Ausgangspunkt und wurde sofort
 * übersprungen: aus einem leeren Feld wurde mit Pfeil rechts direkt der
 * Folgemonat, mit Pfeil links der Vormonat, und der laufende Monat war der
 * einzige, der sich nicht mit einem Druck einstellen ließ. Er ist aber der
 * häufigste Fall. Jetzt setzt der erste Druck nur auf, jeder weitere blättert.
 * Die Richtung der ersten Taste ist dabei bewusst egal — sie sagt nur „fang an".
 */
export function stepFieldMonth(field: HTMLInputElement, step: number): boolean {
  if (checkField(field) !== null) return false;

  const bounds = {
    min: field.getAttribute('min') ?? undefined,
    max: field.getAttribute('max') ?? undefined,
  };
  const current = field.value.trim();
  // Schrittweite 0 auf den aktuellen Monat: gibt ihn unverändert zurück, prüft
  // ihn aber gegen dieselben Feldgrenzen wie jeden anderen Wert.
  const next = current === '' ? stepMonth(currentMonth(), 0, bounds) : stepMonth(current, step, bounds);
  if (next === null) return false;

  field.value = next;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  if (field.value !== next) return false;

  // **Ohne `change` bleibt es bei der Anzeige.** Am echten Tool am 2026-08-12
  // gemessen: nach `input` allein steht der neue Monat im Feld, das
  // Formularmodell trägt aber weiter den alten — „Letzte HU" rührte sich nicht,
  // und die Anwendung rechnete mit dem alten Wert weiter. Erst `change` löst
  // die `dateChange`-Meldung des Datepickers aus, an der die Fachlogik hängt.
  //
  // `writeFieldValue()` in `field.ts` macht das längst richtig; hier fehlte es,
  // weil dieser Pfad bewusst daran vorbeigeht, um den Fokus zu behalten. Ein
  // Fokusverlust ist dafür nicht nötig — `change` genügt, und das Blättern mit
  // den Pfeiltasten bleibt möglich.
  field.dispatchEvent(new Event('change', { bubbles: true }));

  // Der Cursor landet nach dem Setzen am Anfang; ans Ende ist die Stelle, an
  // der beim Tippen weitergemacht würde.
  field.setSelectionRange?.(next.length, next.length);
  return true;
}

export interface MonthStepperHandle {
  attach: (field: HTMLInputElement) => void;
  detach: () => void;
}

/**
 * Hängt die Tastenbedienung an das Feld — und wieder ab.
 *
 * Kein Overlay, kein Wirt, kein Schatten: hier ist nichts zu sehen, es gibt nur
 * einen Zuhörer am Feld selbst. Ein `keydown` reicht, weil das Wiederholen beim
 * Gedrückthalten davon schon abgedeckt ist.
 */
export function createMonthStepper(): MonthStepperHandle {
  let field: HTMLInputElement | null = null;

  const onKeydown = (event: KeyboardEvent): void => {
    // Wie überall: was nicht von einem Menschen kommt, schreibt nicht in ein
    // Prüffeld.
    if (!event.isTrusted) return;
    // Mit Zusatztaste bedeuten die Pfeile etwas anderes — wortweise springen,
    // markieren. Das bleibt, wie es ist.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const step = MONTH_STEP_KEYS[event.key];
    if (step === undefined) return;

    const current = field;
    if (current === null || !current.isConnected) return;

    if (stepFieldMonth(current, step)) {
      // Erst jetzt: sonst stünde der Cursor still, obwohl gar nichts gesprungen
      // ist.
      event.preventDefault();
    }
  };

  return {
    attach(next) {
      field = next;
      next.addEventListener('keydown', onKeydown);
    },
    detach() {
      field?.removeEventListener('keydown', onKeydown);
      field = null;
    },
  };
}
