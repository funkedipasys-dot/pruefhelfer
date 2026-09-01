/**
 * Die Tastenkürzel der Abschluss-Leiste — die Rechnung dahinter, ohne DOM.
 *
 * Das Produktionstool bedient sein Feld „HU fällig" mit Buchstaben statt mit
 * Zahlen: `A` setzt den laufenden Monat, `N` den nächsten, `L` den letzten, und
 * die Pfeiltasten blättern monatsweise. Unser eigenes Feld in der
 * Abschluss-Leiste ist ein nacktes `<input type="month">` und konnte das
 * bisher nicht — wer zwischen beiden Masken wechselt, muss sonst umdenken.
 * Deshalb **1:1 dieselbe Bedienung**, nicht eine eigene Erfindung.
 *
 * Beim Datumsfeld (UMA) gilt dasselbe eine Ebene tiefer: `H` heute, `G`
 * gestern.
 *
 * Die Werte hier sind ISO (`JJJJ-MM` bzw. `JJJJ-MM-TT`) — das ist die Form, die
 * ein natives `month`- bzw. `date`-Feld als `value` annimmt. Die Schreibweise
 * des Produktionstools (`MM.JJJJ`) rechnet `month-step.ts` für **dessen** Feld;
 * die beiden dürfen nicht verwechselt werden.
 */

const ISO_MONAT = /^(\d{4})-(\d{2})$/;

/** Die Kürzel des Monatsfeldes: Versatz in Monaten vom laufenden Monat aus. */
const MONATS_KUERZEL: Readonly<Record<string, number>> = { a: 0, n: 1, l: -1 };

/** Die Kürzel des Datumsfeldes: Versatz in Tagen von heute aus. */
const TAGES_KUERZEL: Readonly<Record<string, number>> = { h: 0, g: -1 };

/**
 * Die Pfeiltasten blättern monatsweise statt zwischen Monat und Jahr zu
 * springen. Das kostet die eingebaute Segmentnavigation des `month`-Feldes —
 * und genau das ist gewollt: das Tool blättert dort ebenfalls ganze Monate
 * (`MONTH_STEP_KEYS` in `hu-faellig.ts`), und zwei Felder mit gegensätzlicher
 * Pfeiltastenbedeutung sind schlimmer als eine fehlende Segmentnavigation.
 */
const MONATS_SCHRITT: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * Was die Taste im Monatsfeld ergibt, oder `null`, wenn sie uns nichts angeht.
 *
 * `null` heißt „Finger weg" — der Aufrufer lässt die Taste dann tun, was sie
 * sonst täte. Nur bei einem Treffer wird die Voreinstellung abgefangen.
 *
 * Ein leeres Feld setzt bei den Pfeiltasten erst einmal nur auf den laufenden
 * Monat auf; die Richtung des ersten Drucks ist dabei egal. Das ist dieselbe
 * Regel wie am Feld des Produktionstools und der häufigste Fall: der Prüfer
 * will meist ohnehin in der Nähe von heute landen.
 */
export function monatTaste(key: string, value: string, heute: Date = new Date()): string | null {
  const kuerzel = MONATS_KUERZEL[key.toLowerCase()];
  if (kuerzel !== undefined) return verschiebeMonat(monatVon(heute), kuerzel);

  const schritt = MONATS_SCHRITT[key];
  if (schritt === undefined) return null;

  const aktuell = ISO_MONAT.exec(value.trim());
  if (aktuell === null) return monatVon(heute);
  return verschiebeMonat(value.trim(), schritt);
}

/**
 * Was die Taste im Datumsfeld ergibt, oder `null`.
 *
 * Bewusst **ohne** Pfeiltasten: Christians Vorgabe nennt für das UMA-Datum nur
 * `H` und `G`. Ein `date`-Feld hat drei Segmente, und ihm die
 * Segmentnavigation ungefragt zu nehmen wäre eine Verschlechterung, die
 * niemand verlangt hat.
 */
export function datumTaste(key: string, heute: Date = new Date()): string | null {
  const versatz = TAGES_KUERZEL[key.toLowerCase()];
  if (versatz === undefined) return null;

  const tag = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + versatz);
  return `${tag.getFullYear()}-${pad(tag.getMonth() + 1)}-${pad(tag.getDate())}`;
}

function monatVon(heute: Date): string {
  return `${heute.getFullYear()}-${pad(heute.getMonth() + 1)}`;
}

function verschiebeMonat(iso: string, schritt: number): string | null {
  const match = ISO_MONAT.exec(iso);
  if (match === null) return null;
  const [, jahrText, monatText] = match;
  if (jahrText === undefined || monatText === undefined) return null;

  const gesamt = Number(jahrText) * 12 + (Number(monatText) - 1) + schritt;
  const jahr = Math.floor(gesamt / 12);
  const monat = (gesamt % 12) + 1;
  if (jahr < 1000 || jahr > 9999) return null;
  return `${jahr}-${pad(monat)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
