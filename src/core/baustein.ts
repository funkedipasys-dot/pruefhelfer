/**
 * Die Typen, die **jede** Fassung der Erweiterung braucht (Plan-Punkt 70).
 *
 * Sie standen bis 2026-08-10 zusammen mit dem Kopplungs-Umschlag in einer
 * Datei. Das ging, solange es nur eine Fassung gab — für die Fassung ohne
 * Server hätte es bedeutet, den kompletten Kopplungs-Code mitzuschleppen,
 * bloß um an zwei Typdeklarationen zu kommen.
 *
 * Hier steht deshalb nur, was ohne Backend Sinn ergibt. Was zur Kopplung
 * gehört — Umschlag, Zugangsdaten, Generationen — bleibt in der Pro-Fassung und
 * ist nicht Teil dieses Repos.
 */

/**
 * Ein Baustein, so wie ihn die Erweiterung anzeigt und einsetzt.
 *
 * Bewusst weniger Felder als `TextbausteinView` im Backend: `platzhalter` und
 * `minLength` sind dort abgeleitete Werte, die `parseTextbausteinText()` hier
 * ohnehin selbst bestimmt. Sie mitzuführen hieße, zwei Wahrheiten über
 * denselben Text zu halten.
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
 * `get(null)` liefert den kompletten Bereich — nötig, um verwaiste
 * Generationen einzusammeln. Als Schnittstelle statt als direkter Zugriff,
 * damit der Kern in Node prüfbar bleibt.
 */
export interface StorageArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
