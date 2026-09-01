/**
 * `chrome.storage.local` als `StorageArea` (Plan-Punkt 71).
 *
 * `chrome.storage.local` erfüllt die Schnittstelle bereits — nur die Typen
 * weichen ab. Die Umsetzung steht einmal hier, weil jede Fassung sie braucht,
 * gleich aus welchem Erweiterungskontext heraus geschrieben wird.
 *
 * **Abgesichert wird hier nichts, und das ist Absicht.** Wo eine Fassung
 * Zugangsdaten aufbewahrt, gehört der Zugriffsschutz an die Stelle, die sie
 * hält — nicht in diesen Adapter, der nur Typen glattzieht. Für die eigenen
 * Textbausteine ist ohnehin nichts abzusichern: sie liegen auf dem Gerät des
 * Prüfers, und `chrome.storage` steht nur Erweiterungskontexten offen, nicht
 * der besuchten Seite.
 *
 * **Fehler werden durchgereicht, nicht geschluckt.** `chrome.storage` wirft,
 * wenn das Kontingent voll ist oder der Erweiterungskontext nach einem Neuladen
 * verwaist zurückbleibt. Das hier zu einem leeren Ergebnis zu glätten hieße,
 * einen Ausfall als „nichts gespeichert" auszugeben — die Aufrufer fangen ihn
 * und sagen, was los ist.
 */

import type { StorageArea } from './core/baustein';

export const chromeArea: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};
