/**
 * `chrome.storage.local` als `StorageArea` (Plan-Punkt 71).
 *
 * `chrome.storage.local` erfüllt die Schnittstelle bereits — nur die Typen
 * weichen ab. Die Umsetzung steht einmal hier, weil beide Fassungen sie
 * brauchen: die Pro-Fassung im Service Worker, die offene Fassung direkt im
 * Content-Script.
 *
 * **Abgesichert wird hier nichts.** Der Zugriffsschutz auf vertrauenswürdige
 * Kontexte gehört zur Kopplung und steht deshalb im Service Worker der
 * Pro-Fassung: er schützt den Geräte-Token. Wo es keinen Token gibt, gibt es
 * nichts zu schützen — die eigenen Textbausteine liegen ohnehin auf dem Gerät
 * des Prüfers und sind für die besuchte Seite unerreichbar, weil
 * `chrome.storage` nur Erweiterungskontexten offensteht.
 */

import type { StorageArea } from './core/baustein';

export const chromeArea: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};
