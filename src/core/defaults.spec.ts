/**
 * Die Standardtexte müssen dieselben Zusagen erfüllen wie ein Bestand aus dem
 * Backend — sonst bricht der Chooser genau dann, wenn es keinen Sync gibt, der
 * es reparieren könnte.
 */

import { DEFAULT_BAUSTEINE } from './defaults';
import { parseTextbausteinText } from './placeholders';

describe('DEFAULT_BAUSTEINE', () => {
  it('sind vorhanden', () => {
    expect(DEFAULT_BAUSTEINE.length).toBeGreaterThan(0);
  });

  it('bestehen die Platzhalter-Grammatik', () => {
    for (const baustein of DEFAULT_BAUSTEINE) {
      expect(parseTextbausteinText(baustein.text).issues).toEqual([]);
    }
  });

  it('haben eindeutige Ids und lückenlos gefüllte Felder', () => {
    const ids = new Set(DEFAULT_BAUSTEINE.map((b) => b.id));
    expect(ids.size).toBe(DEFAULT_BAUSTEINE.length);
    for (const baustein of DEFAULT_BAUSTEINE) {
      expect(baustein.titel.trim()).not.toBe('');
      expect(baustein.text.trim()).not.toBe('');
      expect(baustein.kategorie.trim()).not.toBe('');
      expect(Number.isInteger(baustein.sortierung)).toBe(true);
    }
  });

  it('sind nach Sortierung aufsteigend abgelegt', () => {
    const sortierungen = DEFAULT_BAUSTEINE.map((b) => b.sortierung);
    expect(sortierungen).toEqual([...sortierungen].sort((a, b) => a - b));
  });
});
