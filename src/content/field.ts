/**
 * Der Umgang mit dem Bemerkungsfeld des GTÜ-Produktionstools
 * (Plan-Punkt 48, 49).
 *
 * Das Feld gehört einer Angular-Anwendung, die es jederzeit austauschen,
 * ausblenden oder sperren kann. Zwischen dem Öffnen des Panels und dem Klick
 * auf „Einfügen" liegen Sekunden — genug, damit der Prüfer den Reiter wechselt
 * oder die Anwendung den Prüfauftrag abschließt. Deshalb wird **unmittelbar
 * vor dem Schreiben** neu geprüft, nicht beim Verbinden.
 */

import { buildInsertion, effectiveLimit } from '../core/insertion';
import { describeSubstitutionFailure } from '../core/placeholders';

/** Das Bemerkungsfeld im Ergebnis-Schritt des Produktionstools. */
export const FIELD_SELECTOR = '#inspectmobility-ergebnis-bemerkung-input-textarea';

export type FieldIssue = 'detached' | 'hidden' | 'disabled' | 'readonly' | 'inert';

/**
 * `null` heißt: beschreibbar.
 *
 * Gilt für Textfelder wie für einzeilige Eingaben — die Prüfung ist dieselbe.
 * Die **Formulierungen** darunter sind es nicht: `describeFieldIssue()` spricht
 * vom Bemerkungsfeld, der Kilometerstand hat eigene (Plan-Punkt 67).
 *
 * **`inert` ist der Fall, den die anderen vier nicht sehen.** Ein Feld in einem
 * `inert`-Teilbaum meldet `disabled === false`, `readOnly === false` und eine
 * ganz normale berechnete Darstellung — es ist trotzdem nicht bedienbar, und
 * `focus()` darauf tut nichts. Genau das legt der CDK über den Hintergrund,
 * sobald ein Material-Dialog offen ist: also über das Feld, in das die
 * Abschluss-Leiste schreiben will. Ohne diese Zeile käme der Wert an, die
 * Fokus-Klammer bliebe wirkungslos, und das Formular hielte das Feld weiter für
 * unberührt — gemeldet würde trotzdem Erfolg.
 */
export function checkField(field: HTMLTextAreaElement | HTMLInputElement): FieldIssue | null {
  if (!field.isConnected) return 'detached';
  if (field.disabled) return 'disabled';
  if (field.readOnly) return 'readonly';
  // Kein `field.inert`: das Attribut vererbt sich an den Teilbaum, die
  // Eigenschaft spiegelt aber nur das Attribut am Element selbst.
  if (field.closest('[inert]') !== null) return 'inert';
  if (!isVisible(field)) return 'hidden';
  return null;
}

export function describeFieldIssue(issue: FieldIssue): string {
  switch (issue) {
    case 'detached':
      return 'Das Bemerkungsfeld ist nicht mehr da. Bitte den Prüfschritt erneut öffnen.';
    case 'hidden':
      return 'Das Bemerkungsfeld ist gerade nicht sichtbar.';
    case 'disabled':
      return 'Das Bemerkungsfeld ist gesperrt.';
    case 'readonly':
      return 'Das Bemerkungsfeld lässt sich nicht mehr ändern.';
    case 'inert':
      return 'Das Bemerkungsfeld liegt hinter einem Dialog und nimmt gerade nichts an.';
  }
}

/**
 * Ein Wert so ins Feld, dass die Anwendung ihn auch annimmt.
 *
 * **Der Fokus ist kein Beiwerk, er ist der Kern.** `blur()` tut nichts, wenn das
 * Element gar nicht den Fokus hat — und nach einem Klick auf einen unserer
 * Knöpfe hat es ihn nie. Die Zeile stand da, die Ereignisse blieben aus, und der
 * Prüfer musste hinterher von Hand ins Feld und wieder heraus, damit Angular die
 * Eingabe übernimmt (Befund vom 10.08.2026). Genau diesen Weg geht die Funktion
 * jetzt selbst: hinein, schreiben, hinaus.
 *
 * Warum das nötig ist: Angular bindet den Wert an `input`, aber das *Berühren*
 * des Feldes — und damit die Neubewertung der Pflichtangabe — an `blur`. Der
 * Datumswähler formatiert obendrein erst beim Verlassen nach. Ohne die
 * Fokus-Klammer kommt zwar die Zahl an, das Formular hält das Feld aber
 * weiterhin für unberührt und leer.
 *
 * `preventScroll`, weil das Feld beim Klick ohnehin zu sehen war: ein Sprung der
 * Seite wäre nur eine Überraschung.
 *
 * Gibt zurück, ob der Wert stehen geblieben ist. Die Gegenprüfung sitzt
 * **zwischen** `input` und `change`: beide späteren Ereignisse können selbst
 * eine Änderung auslösen und das Ergebnis verfälschen.
 *
 * **Und ob der Fokus überhaupt ankam** — gemessen, nicht angenommen. Ein
 * Focus-Trap holt ihn sich zurück, ein `inert`-Teilbaum nimmt ihn gar nicht
 * erst an; in beiden Fällen läuft danach auch `blur()` ins Leere, und die
 * Neubewertung der Pflichtangabe bleibt aus. Der Wert steht dann sichtbar im
 * Feld, das Formular hält es aber weiter für unberührt: genau der Fehler vom
 * 12.08.2026, nur eine Ebene tiefer. `checkField()` fängt den `inert`-Fall
 * vorher ab — diese Messung deckt den Rest.
 */
export interface WriteOutcome {
  /** Der Wert steht im Feld — die Anwendung hat ihn nicht zurückgeschrieben. */
  readonly accepted: boolean;
  /** Der Fokus kam an. Ohne ihn bleibt das Feld für Angular unberührt. */
  readonly focused: boolean;
}

export function writeFieldValue(field: HTMLTextAreaElement | HTMLInputElement, next: string): WriteOutcome {
  field.focus({ preventScroll: true });
  // Vor dem Schreiben gemessen: `input` kann selbst Fokus verschieben.
  const focused = field.ownerDocument.activeElement === field;

  field.value = next;
  field.dispatchEvent(new Event('input', { bubbles: true }));

  const accepted = field.value === next;
  if (accepted) field.dispatchEvent(new Event('change', { bubbles: true }));

  // Auch bei verworfener Eingabe: das Feld soll so zurückbleiben, wie es
  // vorgefunden wurde, und nicht mit einem Fokus, den niemand gesetzt hat.
  field.blur();
  return { accepted, focused };
}

export type ApplyResult =
  | { ok: true; snippet: string }
  | { ok: false; message: string };

/**
 * Setzt die Werte ein und hängt den Baustein an.
 *
 * **Nichts wird geschrieben, bevor nicht alles geprüft ist** (Plan-Punkt 50):
 * fehlt ein Platzhalterwert oder passt das Ergebnis nicht ins Feld, bleibt der
 * Inhalt unangetastet und der Aufrufer bekommt die Meldung.
 *
 * Geschrieben wird über `writeFieldValue()` — mit der Fokus-Klammer, sonst
 * bleibt das Feld für Angular unberührt. Nach dem `input`-Ereignis wird
 * gegengeprüft: schreibt die Anwendung den Wert zurück, etwa weil ein eigener
 * Formatierer dazwischenfunkt, hätte der Prüfer sonst eine Erfolgsmeldung vor
 * sich und ein unverändertes Feld.
 */
export function applyInsertion(
  field: HTMLTextAreaElement,
  request: { text: string; values: Readonly<Record<string, string>> },
): ApplyResult {
  const issue = checkField(field);
  if (issue !== null) return { ok: false, message: describeFieldIssue(issue) };

  const existing = field.value;
  const insertion = buildInsertion({
    existing,
    limit: effectiveLimit(field.maxLength, existing.length),
    text: request.text,
    values: request.values,
  });
  if (!insertion.ok) return { ok: false, message: describeSubstitutionFailure(insertion) };

  if (!writeFieldValue(field, insertion.nextValue).accepted) {
    return { ok: false, message: 'Das Produktionstool hat die Eingabe verworfen. Bitte erneut versuchen.' };
  }

  return { ok: true, snippet: insertion.snippet };
}

/**
 * Sichtbarkeit über die berechnete Darstellung.
 *
 * Bewusst nicht `checkVisibility()`: die Methode gibt es erst ab Chrome 105,
 * das Manifest lässt aber ab 102 zu (Plan-Punkt 38). Und bewusst nicht über
 * `getBoundingClientRect()`: ein Feld, das gerade aus dem sichtbaren Bereich
 * gescrollt ist, hat trotzdem ein Rechteck — beschreibbar ist es aber sehr
 * wohl.
 */
function isVisible(field: HTMLTextAreaElement | HTMLInputElement): boolean {
  if (field.hidden) return false;
  const style = field.ownerDocument.defaultView?.getComputedStyle(field);
  if (style === undefined) return true;
  return style.display !== 'none' && style.visibility !== 'hidden';
}
