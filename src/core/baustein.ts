/**
 * Die Typen, die **jede** Fassung der Erweiterung braucht (Plan-Punkt 70).
 *
 * Sie standen bis 2026-08-10 zusammen mit allem, was zu einer Server-Anbindung
 * gehört, in einer Datei. Das ging, solange es nur eine Fassung gab — für die
 * Fassung ohne Server hätte es bedeutet, diesen ganzen Code mitzuschleppen,
 * bloß um an zwei Typdeklarationen zu kommen.
 *
 * Hier steht deshalb nur, was auch ohne Server Sinn ergibt.
 */

/**
 * Ein Baustein, so wie ihn die Erweiterung anzeigt und einsetzt.
 *
 * Bewusst ohne `platzhalter` und `minLength`: beides sind abgeleitete Werte,
 * die `parseTextbausteinText()` hier ohnehin selbst bestimmt. Sie mitzuführen
 * hieße, zwei Wahrheiten über denselben Text zu halten.
 */
export interface CachedBaustein {
  id: string;
  titel: string;
  text: string;
  kategorie: string;
  sortierung: number;
}

/**
 * Der Ausschnitt von `chrome.storage.local`, den der Kern braucht.
 *
 * `get(null)` liefert den kompletten Bereich — nötig, wo eine Fassung
 * hinterlassene Schlüssel einsammeln muss. Als Schnittstelle statt als direkter
 * Zugriff, damit der Kern in Node prüfbar bleibt.
 *
 * **Jede der drei Methoden darf werfen.** `chrome.storage` tut das bei vollem
 * Kontingent und bei einem verwaisten Erweiterungskontext; wer sie ruft, muss
 * damit rechnen.
 */
export interface StorageArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
