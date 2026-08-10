/**
 * Nachbau von `chrome.storage.local` für die Tests des Kerns.
 *
 * Werte werden beim Schreiben und Lesen geklont — im echten Storage überlebt
 * nur, was serialisiert wurde, und ein versehentlich geteilter Verweis würde
 * sonst als „gespeichert" durchgehen, obwohl er es nicht ist.
 *
 * `crashAfterWrites` bricht mitten in einer Schreibfolge ab. Genau das passiert
 * in MV3, wenn der Service Worker zwischen zwei `await` beendet wird; die
 * Generationen-Mechanik aus Plan-Punkt 52 existiert nur wegen dieses Falls und
 * wäre ohne ihn nicht prüfbar.
 */

import type { StorageArea } from '../core/baustein';

export class SimulatedCrash extends Error {
  constructor() {
    super('simulierter Abbruch');
  }
}

export class FakeStorage implements StorageArea {
  readonly data = new Map<string, unknown>();
  /** Schreibvorgänge (`set`/`remove`) in Reihenfolge. */
  readonly writes: string[] = [];
  /** Nach so vielen Schreibvorgängen bricht der nächste ab. `null` = nie. */
  crashAfterWrites: number | null = null;

  async get(keys: string[] | null): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    const wanted = keys ?? [...this.data.keys()];
    for (const key of wanted) {
      if (this.data.has(key)) result[key] = structuredClone(this.data.get(key));
    }
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.beforeWrite(`set:${Object.keys(items).join(',')}`);
    for (const [key, value] of Object.entries(items)) this.data.set(key, structuredClone(value));
  }

  async remove(keys: string[]): Promise<void> {
    this.beforeWrite(`remove:${keys.join(',')}`);
    for (const key of keys) this.data.delete(key);
  }

  /** Das Praefix wird hereingereicht: Generationen sind eine Sache der Kopplung,
   *  und dieser Nachbau muss auch ohne sie brauchbar bleiben. */
  generationKeys(prefix: string): string[] {
    return [...this.data.keys()].filter((key) => key.startsWith(prefix));
  }

  private beforeWrite(label: string): void {
    if (this.crashAfterWrites !== null && this.writes.length >= this.crashAfterWrites) {
      throw new SimulatedCrash();
    }
    this.writes.push(label);
  }
}
