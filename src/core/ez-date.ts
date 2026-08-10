/**
 * Das zweistellige Jahr im Erstzulassungsdatum.
 *
 * Wer `25.12.10` tippt, meint 2010. Das Produktionstool macht daraus
 * `25.12.0010` und meldet „Eingabe muss nach dem 1.5.1893 sein." — ein Datum
 * aus dem Jahr zehn. Die Erweiterung kann den Umbau des Tools nicht verhindern,
 * aber sie kann daneben anbieten, was offensichtlich gemeint war.
 *
 * Die Regel steht hier und nicht im Content-Script, damit sie ohne Browser
 * prüfbar ist: welches Jahrhundert zu einer zweistelligen Zahl gehört, ist die
 * einzige Stelle dieses Features, an der man sich irren kann.
 */

/**
 * Die untere Schranke des Feldes (`min="1893-05-01"`).
 *
 * Sie kann von einem Vorschlag aus dieser Datei gar nicht unterschritten werden
 * — das kleinste erreichbare Jahr ist 1900. Geprüft wird trotzdem: die Schranke
 * gehört dem Tool, und wenn das Tool sie eines Tages anhebt, soll hier ein Test
 * fehlschlagen und kein Prüfer einen abgelehnten Vorschlag angeboten bekommen.
 */
export const EZ_MIN = { year: 1893, month: 5, day: 1 } as const;

export interface EzDateProposal {
  /** Fertig zum Eintragen, in der Schreibweise des Feldes: `25.12.2010`. */
  readonly text: string;
  readonly year: number;
}

/** `25.12.0010` oder `25.12.10` — Tag, Monat, Jahr, sonst nichts. */
const DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{1,4})$/;

/**
 * Der Vorschlag zu einem Datum mit zweistellig gemeintem Jahr, oder `null`.
 *
 * **`null` ist der Normalfall.** Vorgeschlagen wird nur, wo das Jahr unter 100
 * liegt — also genau dort, wo jemand zwei Ziffern getippt hat. Ein vierstelliges
 * Jahr wird nicht angefasst, auch kein falsches: aus `25.12.1810` „1910" zu
 * machen wäre geraten, nicht korrigiert.
 *
 * Es ist gleichgültig, ob der Wert vor oder nach dem Umbau durch das Tool
 * gelesen wird: `25.12.10` und `25.12.0010` ergeben denselben Vorschlag. Das
 * erspart es, sich in die Reihenfolge der Ereignisse einzuhängen.
 *
 * **Das Jahrhundert entscheidet der Kalender, nicht eine feste Zahl.** `10` wird
 * zu 2010, `27` zu 1927 — denn ein Fahrzeug, das erst 2027 zugelassen wird,
 * steht heute nicht auf der Hebebühne. Verglichen wird das ganze Datum, nicht
 * nur das Jahr: am 10.08.2026 ist `25.12.26` noch Zukunft und meint 1926.
 */
export function proposeEzDate(value: string, today: Date): EzDateProposal | null {
  const match = DATE.exec(value.trim());
  if (match === null) return null;

  const [, dayText, monthText, yearText] = match;
  // Die drei Gruppen sind durch den Ausdruck garantiert; der Prüfer davor
  // besteht nur, weil der Übersetzer das nicht weiß.
  if (dayText === undefined || monthText === undefined || yearText === undefined) return null;

  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  // Vierstellig heißt: hier ist nichts verrutscht. Auch `0100` nicht — das
  // liegt zwar in ferner Vergangenheit, aber niemand tippt zwei Ziffern und
  // bekommt daraus eine dreistellige Zahl.
  if (year >= 100) return null;

  const recent = makeDate(2000 + year, month, day);
  const chosen = recent !== null && recent.getTime() <= today.getTime() ? 2000 + year : 1900 + year;

  const date = makeDate(chosen, month, day);
  // Kein Datum, das es nicht gibt: aus `29.02.21` wird nichts vorgeschlagen,
  // weder 2021 noch 1921 hat einen 29. Februar.
  if (date === null) return null;
  if (date.getTime() > today.getTime()) return null;

  const min = new Date(EZ_MIN.year, EZ_MIN.month - 1, EZ_MIN.day);
  if (date.getTime() < min.getTime()) return null;

  return { text: `${pad(day)}.${pad(month)}.${chosen}`, year: chosen };
}

/**
 * Ein Datum, das es wirklich gibt — sonst `null`.
 *
 * `new Date(2021, 1, 29)` wirft nicht, sondern rutscht auf den 1. März. Der
 * Rückvergleich fängt das ab. Die Jahre bleiben dabei unangetastet, weil sie
 * hier immer vierstellig ankommen: die Sonderregel, die 0-99 auf 1900-1999
 * abbildet, greift erst gar nicht.
 */
function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  const same = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return same ? date : null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
