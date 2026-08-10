/**
 * Was aus einem Baustein und den getippten Werten tatsächlich im Feld landet
 * (Plan-Punkt 47, 48, 49, 50).
 *
 * **Ein Weg für beide Wege.** Overlay-Einfügen und Popup-Kopieren rufen
 * dieselbe Funktion. Täten sie es nicht, entstünde über den Kopieren-Knopf ein
 * Text, den der Einfüge-Weg abgelehnt hätte — der Prüfer würde ihn von Hand
 * ins Feld setzen und dort abgeschnitten wiederfinden.
 *
 * Ohne DOM: das Feld liefert nur zwei Zahlen (`maxLength`, Länge des
 * vorhandenen Inhalts), die Rechnung darauf gehört nicht in den Browser.
 */

import type { SubstitutionFailure } from './placeholders';
import { TEXTBAUSTEIN_TARGET_MAX_LENGTH, substituteTextbaustein } from './placeholders';

/** Der Baustein wird an vorhandenen Text angehängt, getrennt durch Zeilenumbruch. */
export const INSERTION_SEPARATOR = '\n';

export interface InsertionRequest {
  /** Aktueller Feldinhalt. Für den Kopieren-Weg leer — dort gibt es kein Feld. */
  existing: string;
  /** Wirksame Obergrenze des Zielfeldes, siehe `effectiveLimit()`. */
  limit: number;
  /** Rohtext des Bausteins, mit Platzhaltern. */
  text: string;
  /** Was der Nutzer getippt hat, je Platzhaltername. */
  values: Readonly<Record<string, string>>;
}

export type Insertion =
  | {
      ok: true;
      /** Nur der Baustein — das, was der Kopieren-Knopf in die Zwischenablage legt. */
      snippet: string;
      /** Der komplette künftige Feldinhalt, inklusive vorhandenem Text und Trenner. */
      nextValue: string;
    }
  | ({ ok: false } & SubstitutionFailure);

/**
 * Die Obergrenze, gegen die geprüft wird.
 *
 * `maxLength` gilt für den **gesamten** Feldinhalt, nicht für den eingefügten
 * Abschnitt. Was schon im Feld steht — plus der Trenner — geht dem Baustein
 * also vom Budget ab. Diese Rechnung zu unterschlagen wäre der teuerste
 * denkbare Fehler dieser Extension: das Feld akzeptiert stillschweigend nur die
 * ersten `maxLength` Zeichen, und der Rest des Prüfvermerks verschwindet, ohne
 * dass irgendwer es merkt.
 *
 * Ein leeres Feld hat kein Trennzeichen — sonst würde der Baustein mit einem
 * führenden Umbruch beginnen und ein Zeichen weniger zur Verfügung haben, als
 * er darf.
 *
 * Bleibt kein Budget übrig, wird der Wert **negativ**. Das ist Absicht: die
 * Meldung „N Zeichen zu viel" nennt dann genau so viele Zeichen, wie im Feld
 * frei werden müssen — den Trenner eingerechnet.
 */
export function effectiveLimit(maxLength: number, existingLength: number): number {
  // Ein Feld ohne `maxlength` meldet -1. Der Rückfall ist die Grenze des
  // GTÜ-Bemerkungsfeldes (Plan-Punkt 48).
  const cap = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : TEXTBAUSTEIN_TARGET_MAX_LENGTH;
  if (existingLength <= 0) return cap;
  return cap - existingLength - INSERTION_SEPARATOR.length;
}

/**
 * Erst einsetzen, dann messen (Plan-Punkt 50). Gegen den Rohtext zu prüfen
 * würde einen Baustein durchlassen, der erst mit den Werten zu lang wird.
 *
 * Passt es nicht, wird **nichts** zurückgegeben, was man einfügen könnte — der
 * Aufrufer kann den Text also nicht versehentlich doch schreiben.
 */
export function buildInsertion(request: InsertionRequest): Insertion {
  const result = substituteTextbaustein(request.text, request.values, request.limit);
  if (!result.ok) return result;

  const nextValue =
    request.existing === '' ? result.text : `${request.existing}${INSERTION_SEPARATOR}${result.text}`;
  return { ok: true, snippet: result.text, nextValue };
}
