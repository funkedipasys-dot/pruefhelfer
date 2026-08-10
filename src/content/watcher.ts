/**
 * Das Bemerkungsfeld finden und behalten (Plan-Punkt 44).
 *
 * Das GTÜ-Produktionstool ist eine Single-Page-Anwendung: das Feld entsteht,
 * verschwindet und entsteht **als neues Element** wieder, ohne dass die Seite
 * neu geladen wird. Ein einmaliges `querySelector` beim Start fände es je nach
 * Zeitpunkt gar nicht — oder hielte später einen Verweis auf ein Element, das
 * längst aus dem Dokument entfernt wurde.
 *
 * **Die Verlässlichkeit kommt aus der Idempotenz, nicht aus dem Filter.** Jede
 * Auswertung fragt den Zustand neu ab und vergleicht ihn mit dem bekannten;
 * ändert sich nichts, passiert nichts. Deshalb kann der Beobachter beliebig oft
 * feuern — auch ausgelöst durch das eigene Overlay — ohne dass eine Schleife
 * entsteht. Der Filter darunter spart nur Arbeit.
 */

export interface FieldWatcherOptions<T extends HTMLElement = HTMLTextAreaElement> {
  /** Üblicherweise `document`. */
  root: Document | Element;
  /**
   * Ein Selektor — oder eine eigene Regel, wenn mehrere Felder in Frage kommen
   * und die Auswahl vom Zustand der Seite abhängt (Plan-Punkt 66: bei offenem
   * Dialog zählt dessen Feld, nicht das gleichnamige dahinter).
   */
  selector: string | ((root: Document | Element) => T | null);
  /** Ein passendes Feld ist aufgetaucht oder wurde durch ein anderes ersetzt. */
  onAttach: (field: T) => void;
  /** Das zuletzt gemeldete Feld ist weg. Folgt immer vor einem erneuten `onAttach`. */
  onDetach: () => void;
  /**
   * Änderungen innerhalb dieses Elements werden übersprungen — das ist der
   * eigene Overlay-Wirt. Er hängt zwar außerhalb des Angular-Baums an
   * `document.body`, wird aber vom selben Beobachter erfasst.
   */
  ignoreWithin?: Element;
}

/** Beendet die Beobachtung. Meldet ein noch verbundenes Feld vorher ab. */
export type StopWatching = () => void;

export function watchField<T extends HTMLElement = HTMLTextAreaElement>(
  options: FieldWatcherOptions<T>,
): StopWatching {
  let current: T | null = null;

  const resolve = (): void => {
    const found =
      typeof options.selector === 'function'
        ? options.selector(options.root)
        : options.root.querySelector<T>(options.selector);
    const next = found !== null && found.isConnected ? found : null;
    if (next === current) return;

    // Auch beim Austausch gegen ein anderes Element wird erst abgemeldet: der
    // Abnehmer soll seine Listener am alten Feld loswerden, bevor er neue am
    // neuen anbringt.
    if (current !== null) options.onDetach();
    current = next;
    if (current !== null) options.onAttach(current);
  };

  const ignoreWithin = options.ignoreWithin;
  const observer = new MutationObserver((records) => {
    if (ignoreWithin !== undefined && records.every((record) => isWithin(record, ignoreWithin))) return;
    resolve();
  });

  const target = options.root instanceof Document ? options.root.documentElement : options.root;
  observer.observe(target, { childList: true, subtree: true });

  // Das Feld kann schon dastehen, bevor das Content-Script läuft — bei
  // `run_at: document_idle` ist das sogar der Normalfall.
  resolve();

  return () => {
    observer.disconnect();
    if (current !== null) {
      current = null;
      options.onDetach();
    }
  };
}

function isWithin(record: MutationRecord, host: Element): boolean {
  return record.target === host || (record.target instanceof Node && host.contains(record.target));
}
