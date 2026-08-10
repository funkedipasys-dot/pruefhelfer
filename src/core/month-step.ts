/**
 * Einen Monat vor oder zurück — die Rechnung hinter den Pfeiltasten im Feld
 * „HU fällig".
 *
 * Browserfrei, damit die Rechnerei ohne DOM prüfbar bleibt. Das Feld selbst
 * bringt zwei Schreibweisen mit: das Tool zeigt `08.2026`, der Datumswähler
 * dahinter kann aber auch ein volles Datum halten. Beide werden gelesen und in
 * **derselben** Form zurückgegeben — ein Sprung würde sonst nebenbei das Format
 * ändern, und das hat niemand verlangt.
 */

export interface MonthBounds {
  /** Aus dem `min`-Attribut des Feldes, ISO `JJJJ-MM-TT`. */
  readonly min?: string | undefined;
  readonly max?: string | undefined;
}

const MONTH_ONLY = /^(\d{1,2})\.(\d{4})$/;
const FULL_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

interface Parsed {
  readonly day: number | null;
  readonly month: number;
  readonly year: number;
}

/**
 * Der Nachbar-Monat zum Inhalt, oder `null`.
 *
 * `null` heißt durchweg „nichts anzubieten" und nie „irgendwas geraten": ein
 * leeres Feld, eine unverstandene Schreibweise, ein Monat jenseits der Grenzen
 * des Feldes. Die Taste soll dann tun, was sie sonst tut.
 *
 * Der Tag wird gekappt, nicht übergetragen: vom 31.01. einen Monat vor führt auf
 * den 28.02., nicht auf den 03.03. Ein Sprung, der aus Januar den März macht,
 * wäre die Sorte Überraschung, die man im Prüfbericht erst später bemerkt.
 */
export function stepMonth(value: string, step: number, bounds: MonthBounds = {}): string | null {
  const parsed = parse(value.trim());
  if (parsed === null) return null;

  const total = parsed.year * 12 + (parsed.month - 1) + step;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  if (year < 1000 || year > 9999) return null;

  const day = parsed.day === null ? null : Math.min(parsed.day, daysInMonth(year, month));
  if (!withinBounds({ day, month, year }, bounds)) return null;

  return day === null ? `${pad(month)}.${year}` : `${pad(day)}.${pad(month)}.${year}`;
}

function parse(value: string): Parsed | null {
  const full = FULL_DATE.exec(value);
  if (full !== null) {
    const [, dayText, monthText, yearText] = full;
    if (dayText === undefined || monthText === undefined || yearText === undefined) return null;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    if (!plausible(month, year) || day < 1 || day > daysInMonth(year, month)) return null;
    return { day, month, year };
  }

  const monthOnly = MONTH_ONLY.exec(value);
  if (monthOnly !== null) {
    const [, monthText, yearText] = monthOnly;
    if (monthText === undefined || yearText === undefined) return null;
    const month = Number(monthText);
    const year = Number(yearText);
    if (!plausible(month, year)) return null;
    return { day: null, month, year };
  }

  return null;
}

/**
 * Die Grenzen des Feldes einhalten.
 *
 * Bei einer Angabe ohne Tag wird nur bis auf den Monat verglichen: `08.2026`
 * gegen `min="1952-01-01"` fragt nach dem Monat, nicht nach dem ersten Tag
 * darin. Sonst wäre der Monat, in dem die Grenze liegt, fälschlich gesperrt.
 */
function withinBounds(value: Parsed, bounds: MonthBounds): boolean {
  const min = bounds.min === undefined ? null : parseIso(bounds.min);
  const max = bounds.max === undefined ? null : parseIso(bounds.max);
  if (min !== null && compare(value, min) < 0) return false;
  if (max !== null && compare(value, max) > 0) return false;
  return true;
}

function compare(value: Parsed, limit: Parsed): number {
  if (value.year !== limit.year) return value.year - limit.year;
  if (value.month !== limit.month) return value.month - limit.month;
  // Ohne Tag zählt der Monat als Ganzes — er liegt dann nie außerhalb.
  if (value.day === null || limit.day === null) return 0;
  return value.day - limit.day;
}

function parseIso(value: string): Parsed | null {
  const match = ISO.exec(value.trim());
  if (match === null) return null;
  const [, yearText, monthText, dayText] = match;
  if (yearText === undefined || monthText === undefined || dayText === undefined) return null;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!plausible(month, year)) return null;
  return { day, month, year };
}

function plausible(month: number, year: number): boolean {
  return month >= 1 && month <= 12 && year >= 1000 && year <= 9999;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
