/**
 * Die Abschlussmaske („Vorschau & Abschließen") und das, was sie anmahnt.
 *
 * Die Maske schlägt unten an, das angemahnte Feld sitzt oben im Panel
 * `Fahrzeug`. Heute heißt das: Maske schließen, hochscrollen, eintragen,
 * herunterscrollen, Maske erneut öffnen. Damit die Erweiterung das abkürzen
 * kann, muss sie zweierlei wissen: *ist die Maske offen* und *welches der
 * Felder, die wir bedienen können, mahnt sie gerade an*.
 *
 * **Gelesen wird der Text, nicht die Struktur.** Wie die Validierungsliste
 * aufgebaut ist — Liste, Tabelle, verschachtelte Spans —, ist von außen nicht
 * verlässlich zu erraten und beim nächsten GTÜ-Update ohnehin wieder anders.
 * Der Wortlaut dagegen ist gemessen („Fahrzeug HU Fälligkeit nicht gesetzt")
 * und fachlich verankert. `normalisiere()` wirft alles weg, was zwischen den
 * Wörtern stehen könnte — dann ist es gleichgültig, ob „HU Fälligkeit" und
 * „nicht gesetzt" in einem Element stehen oder in dreien.
 *
 * **Angeboten wird nur, was die Maske nennt.** Nicht alles, was wir könnten:
 * ein Feld, das die Validierung nicht anmahnt, ist entweder gefüllt oder für
 * diesen Auftrag ohne Belang — in beiden Fällen hat die Erweiterung dort nichts
 * vorzuschlagen.
 */

/** Die Abschlussmaske selbst. Ein CDK-Overlay, kein Kind des App-Baums. */
export const ABSCHLUSS_DIALOG_SELECTOR = '.cdk-overlay-pane.mat-mdc-dialog-panel';

export interface AbschlussFeld {
  /** Wie das Feld im Overlay heißt. */
  readonly name: string;
  /** Das echte Feld im Formular hinter der Maske — es bleibt dort im DOM. */
  readonly selector: string;
  /** Die Mahnung, bereits normalisiert (siehe `normalisiere`). */
  readonly mahnung: string;
  /**
   * Der `type` der Eingabe in der Leiste.
   *
   * `month` und `date` bringen Pfeiltasten, Tastatureingabe und einen Wähler
   * mit — vom Browser, nicht von uns. Ein `text`-Feld für ein Datum hieße,
   * beides selbst zu bauen und beim nächsten Chrome-Update selbst zu pflegen.
   * Was dabei herauskommt, ist ISO; `ausIso()` bringt es in die Schreibweise
   * des Produktionstools.
   */
  readonly typ: 'month' | 'date' | 'number';
}

/**
 * Was die Erweiterung aus der Maske heraus bedienen kann.
 *
 * Drei Einträge: die HU-Fälligkeit ist der gemessene Regelfall, das UMA-Datum
 * der bedingte — es existiert nur, wenn „Art der UMA" auf „Beigestellte AU"
 * steht —, die Laufleistung die dritte Mahnung, die im Alltag immer wieder
 * kommt. Steht ein Feld nicht im DOM, wird es auch nicht angeboten; dafür ist
 * keine Sonderbehandlung nötig, `angemahnteFelder()` findet es dann schlicht
 * nicht.
 *
 * **Die HU-Fälligkeit ist monatsgenau, das UMA-Datum tagesgenau.** Deshalb
 * `month` gegen `date` — die Wahl bestimmt zugleich, was `ausIso()` daraus
 * macht.
 *
 * **Die Wortlaute von UMA und Laufleistung sind abgeleitet, nicht gemessen** —
 * anders als der der HU-Fälligkeit. Bleibt eines der Felder am lebenden System
 * aus, obwohl die Maske es anmahnt, sind diese Zeilen die erste Stelle zum
 * Nachsehen.
 */
export const ABSCHLUSS_FELDER: readonly AbschlussFeld[] = [
  {
    name: 'HU-Fälligkeit',
    selector: '#inspectmobility-zusaetzlicheangaben-hufaellig-textinput-input',
    mahnung: 'hufalligkeitnichtgesetzt',
    typ: 'month',
  },
  {
    name: 'UMA-Datum',
    selector: '#inspectmobility-uma-datum-uma-textinput-input',
    // Gemessener Wortlaut: „Datum der beigestellten UMA nicht gesetzt". Die
    // vorherige Fassung stand auf `umadatumnichtgesetzt` — abgeleitet aus dem
    // Feldnamen und in der echten Meldung nirgends enthalten; das Feld wäre nie
    // angeboten worden. Gesucht wird deshalb nur der Kern hinter dem Kürzel.
    mahnung: 'umanichtgesetzt',
    typ: 'date',
  },
  {
    name: 'Laufleistung',
    // Das Feld im Fahrzeug-Formular, nicht das im Dialog „Wegstreckenzähler
    // ändern" — der ist bei offener Abschlussmaske nie offen.
    selector: '#fahrzeug-laufleistung-input',
    mahnung: 'laufleistungnichtgesetzt',
    typ: 'number',
  },
];

/**
 * ISO in die Schreibweise des Produktionstools.
 *
 * `2026-08` wird `08.2026`, `2026-08-17` wird `17.08.2026` — genau die beiden
 * Formen, die `month` und `date` liefern. Alles andere bleibt unangetastet: ein
 * Kilometerstand ist kein Datum, und eine Zeichenkette, die hier nicht
 * verstanden wird, soll unverändert weitergereicht und von der Rückleseprüfung
 * beurteilt werden — nicht hier heimlich verbogen.
 */
export function ausIso(wert: string): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(wert);
  if (match === null) return wert;
  const [, jahr = '', monat = '', tag] = match;
  return tag === undefined ? `${monat}.${jahr}` : `${tag}.${monat}.${jahr}`;
}

/**
 * Text auf seinen Wortkern eindampfen: klein, ohne Umlautpunkte, ohne alles,
 * was kein Buchstabe und keine Ziffer ist.
 *
 * Damit überlebt der Vergleich, was `textContent` einer verschachtelten Liste
 * antut: fehlende Leerzeichen an Elementgrenzen, doppelte Zeilenumbrüche,
 * Bindestriche. „HU-Fälligkeit nicht gesetzt" und „HU Fälligkeitnicht gesetzt"
 * werden beide zu `hufalligkeitnichtgesetzt`.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9ß]/g, '');
}

/** Die offene Abschlussmaske, oder `null`. */
export function findAbschlussDialog(root: Document | Element = document): HTMLElement | null {
  const dialog = root.querySelector<HTMLElement>(ABSCHLUSS_DIALOG_SELECTOR);
  return dialog !== null && dialog.isConnected ? dialog : null;
}

export interface AngemahntesFeld {
  readonly feld: AbschlussFeld;
  readonly input: HTMLInputElement;
}

/**
 * Die Felder, die diese Maske anmahnt **und** die hinter ihr noch im DOM
 * stehen.
 *
 * Beides muss zutreffen. Eine Mahnung ohne Feld wäre ein Angebot, das ins Leere
 * schriebe; ein Feld ohne Mahnung wäre ein Vorschlag, um den niemand gebeten
 * hat.
 */
export function angemahnteFelder(
  dialog: Element,
  root: Document | Element = document,
): AngemahntesFeld[] {
  const text = normalisiere(dialog.textContent ?? '');
  const gefunden: AngemahntesFeld[] = [];

  for (const feld of ABSCHLUSS_FELDER) {
    if (!text.includes(feld.mahnung)) continue;
    const input = root.querySelector<HTMLInputElement>(feld.selector);
    if (input !== null && input.isConnected) gefunden.push({ feld, input });
  }

  return gefunden;
}
