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
 *
 * **Die eine Ausnahme vom „ohne Server":** beim Öffnen wird höchstens einmal
 * täglich die Fassungsnummer im öffentlichen Repo abgefragt. Ohne das bliebe
 * ein Fehler wie der vom 2026-08-12 unbemerkt in Betrieb — eine entpackt
 * geladene Erweiterung aktualisiert sich nie von selbst. Begründung und Umfang
 * stehen in `core/update-check.ts`; der Netz-Wächter kennt genau diesen einen
 * Aufruf und schlägt bei jedem anderen weiter fehl.
 */

import { chromeArea } from '../chrome-area';
import { DEFAULT_BAUSTEINE } from '../core/defaults';
import { SPEICHER_UNERREICHBAR, readLocalBausteine } from '../core/local';
import { pruefeAufUpdate } from '../core/update-check';
import { CHOOSER_STYLE, createChooser } from '../ui/chooser';
import { copyToClipboard } from '../ui/clipboard';

/** Wörtlich wie in `sw.ts` und `content.ts` — kein Import, siehe dort. */
const FSD_AUTOMATIK_KEY = 'fsd.automatik';

const container = document.getElementById('chooser');
if (container === null) throw new Error('Element fehlt: chooser');

const style = document.createElement('style');
style.textContent = CHOOSER_STYLE;
document.head.append(style);

const chooser = createChooser(container, {
  // Wie im Content-Script: ist der Speicher weg, bleiben die eingebauten Texte
  // stehen. Gerade hier — das Popup **ist** die Rückfallebene; es ausgerechnet
  // dann leer zu zeigen, wenn etwas klemmt, nähme ihm seinen Zweck.
  loadPanel: async () => {
    try {
      return { bausteine: [...DEFAULT_BAUSTEINE, ...(await readLocalBausteine(chromeArea))], hint: null };
    } catch {
      return { bausteine: [...DEFAULT_BAUSTEINE], hint: `Nur die eingebauten Texte — ${SPEICHER_UNERREICHBAR}` };
    }
  },
  actionLabel: 'Kopieren',
  emptyText: 'Keine Textbausteine vorhanden.',
  run: copyToClipboard,
});

void chooser.refresh();
void zeigeUpdateHinweis();
void bindeFsdAutomatik();

/**
 * Die Dauereinstellung der FSD-Automatik — direkt im Speicher, die Seite
 * hört über `chrome.storage.onChanged` mit. Ohne Speicher bleibt der Haken
 * einfach aus; er ist Zugabe, nicht Rückfallebene.
 */
async function bindeFsdAutomatik(): Promise<void> {
  const box = document.getElementById('fsd-automatik');
  if (!(box instanceof HTMLInputElement)) return;
  try {
    box.checked = (await chromeArea.get([FSD_AUTOMATIK_KEY]))[FSD_AUTOMATIK_KEY] === true;
  } catch {
    return;
  }
  box.addEventListener('change', (event) => {
    if (!event.isTrusted) return;
    void chromeArea.set({ [FSD_AUTOMATIK_KEY]: box.checked }).catch(() => {
      box.checked = !box.checked;
    });
  });
}

/**
 * Der Hinweis ist reine Zugabe: schlägt der Abruf fehl, bleibt das Popup
 * unverändert brauchbar. Deshalb wird hier nichts weitergereicht und nichts
 * gemeldet — ohne Netz gibt es schlicht keinen Hinweis.
 */
async function zeigeUpdateHinweis(): Promise<void> {
  const hinweis = document.getElementById('update-notice');
  const link = document.getElementById('update-link');
  if (hinweis === null || link === null) return;

  const neuere = await pruefeAufUpdate({
    fetchFn: fetch,
    area: chromeArea,
    jetzt: Date.now(),
    aktuelleVersion: chrome.runtime.getManifest().version,
  });
  if (neuere === null) return;

  link.textContent = `Update auf v${neuere}`;
  hinweis.title = `Installiert ist v${chrome.runtime.getManifest().version}`;
  hinweis.hidden = false;
}
