/**
 * Der alte Kilometerstand aus der Beschriftung (Plan-Punkt 65).
 *
 * Das Produktionstool zeigt ihn an zwei Stellen, in zwei Schreibweisen:
 *
 * - im Dialog „Wegstreckenzähler ändern": `184731 - alter Stand`
 * - im Fahrzeug-Formular: `(Stand Erstbericht: 184731)`
 *
 * Beide tragen dieselbe Klasse `laufleistung-alt`, also genügt **ein** Parser.
 * Er steht hier und nicht im Content-Script, damit die Schreibweisen ohne
 * Browser prüfbar sind — sie sind das einzige an diesem Feature, was das
 * GTÜ-Tool jederzeit ändern kann.
 */

/**
 * Aufschläge, die neben dem alten Stand angeboten werden.
 *
 * Zwischen Ablesen und Prüfung bewegt sich das Fahrzeug ein paar Kilometer.
 * Mehr Knöpfe hießen mehr Zielfläche zum Vergreifen — getippt werden kann
 * weiterhin jeder beliebige Wert.
 */
export const MILEAGE_OFFSETS = [2, 5] as const;

/**
 * Liest die erste Zahl aus der Beschriftung.
 *
 * Punkte und geschützte Leerzeichen innerhalb der Zahl gelten als
 * Tausendertrenner (`184.731`) und fallen weg. Ein **Komma** beendet die Zahl,
 * statt mitgelesen zu werden: eine Laufleistung ist ganzzahlig, und aus
 * `184731,5` darf nie `1847315` werden — ein um den Faktor zehn zu hoher
 * Kilometerstand wäre der teuerste denkbare Fehler dieses Features.
 */
export function parseAltStand(text: string): number | null {
  // Trennzeichen als Escape-Sequenzen: geschuetztes und schmales
  // geschuetztes Leerzeichen waeren im Quelltext nicht von einem
  // normalen zu unterscheiden.
  const match = /\d[\d.\u00a0\u202f ]*/.exec(text);
  if (match === null) return null;

  const digits = match[0].replace(/\D/g, '');
  if (digits === '') return null;

  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}
