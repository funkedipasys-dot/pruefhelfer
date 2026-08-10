/**
 * Popup der offenen Fassung (Plan-Punkt 72).
 *
 * Eine einzige Aufgabe: **Rückfallebene**. Findet die Erweiterung auf der Seite
 * kein Bemerkungsfeld — weil das Produktionstool umgebaut wurde oder der Prüfer
 * an einer anderen Stelle steht —, kommt er hier trotzdem an seine Texte und
 * kopiert sie von Hand. Ohne diesen Weg wäre ein geänderter Selektor ein
 * Totalausfall.
 *
 * Kein Koppeln, keine Diagnose, kein Verwalten: angelegt und bearbeitet wird im
 * Panel am Feld, wo der Text auch gebraucht wird.
 */

import { chromeArea } from '../chrome-area';
import { DEFAULT_BAUSTEINE } from '../core/defaults';
import { readLocalBausteine } from '../core/local';
import { CHOOSER_STYLE, createChooser } from '../ui/chooser';
import { copyToClipboard } from '../ui/clipboard';

const container = document.getElementById('chooser');
if (container === null) throw new Error('Element fehlt: chooser');

const style = document.createElement('style');
style.textContent = CHOOSER_STYLE;
document.head.append(style);

const chooser = createChooser(container, {
  loadPanel: async () => ({
    bausteine: [...DEFAULT_BAUSTEINE, ...(await readLocalBausteine(chromeArea))],
    hint: null,
  }),
  actionLabel: 'Kopieren',
  emptyText: 'Keine Textbausteine vorhanden.',
  run: copyToClipboard,
});

void chooser.refresh();
