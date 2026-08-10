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
import { stepMonth } from '../core/month-step';

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
 * Das ist der Fall bei einem leeren Feld, einer unverstandenen Schreibweise und
 * am Rand des erlaubten Bereichs. **Ein leeres Feld wird bewusst nicht
 * befüllt** — ein Datum, das nur entstanden ist, weil jemand eine Pfeiltaste
 * gedrückt hat, gehört nicht in einen Prüfbericht.
 */
export function stepFieldMonth(field: HTMLInputElement, step: number): boolean {
  if (checkField(field) !== null) return false;

  const next = stepMonth(field.value, step, {
    min: field.getAttribute('min') ?? undefined,
    max: field.getAttribute('max') ?? undefined,
  });
  if (next === null) return false;

  field.value = next;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  if (field.value !== next) return false;

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
