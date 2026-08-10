/**
 * Content-Script der offenen Fassung (Plan-Punkt 71, 72).
 *
 * Dieselben Bausteine wie in der Pro-Fassung — Panel, Kilometerstand-Leiste,
 * Platzhalter-Grammatik —, nur **ohne alles, was mit einem Server zu tun hat**:
 * keine Kopplung, kein Abgleich, kein Netzwerkzugriff, kein Service Worker.
 *
 * **Warum hier direkt auf den Speicher zugegriffen wird.** Die Pro-Fassung
 * leitet jeden Schreibvorgang über ihren Service Worker, weil dort ein
 * Geräte-Token liegt, den das Content-Script nicht sehen darf. Diese Fassung
 * hat keinen Token. Was bliebe, wäre ein Hintergrundprozess, der nichts täte,
 * als Aufrufe durchzureichen — und eine Berechtigung mehr im Manifest. Die
 * eigenen Textbausteine liegen ohnehin nur auf diesem Gerät, und `chrome.storage`
 * ist für die besuchte Seite unerreichbar.
 */

import { chromeArea } from '../chrome-area';
import { DEFAULT_BAUSTEINE } from '../core/defaults';
import { LOCAL_ID_PREFIX, deleteLocalBaustein, readLocalBausteine, saveLocalBaustein } from '../core/local';
import { BADGE_HOST_ID, createBadge } from '../content/badge';
import { EZ_DATE_FIELD_SELECTOR, applyEzDate, findEzDateError, readEzDateProposal } from '../content/ez-date';
import { EZ_DATE_HOST_ID, createEzDateOverlay } from '../content/ez-date-overlay';
import { FIELD_SELECTOR, applyInsertion } from '../content/field';
import { HU_FAELLIG_FIELD_SELECTOR, createMonthStepper } from '../content/hu-faellig';
import { applyMileage, findAltStandLabel, readAltStand, resolveMileageField } from '../content/mileage';
import { MILEAGE_HOST_ID, createMileageOverlay } from '../content/mileage-overlay';
import { OVERLAY_HOST_ID, createOverlay } from '../content/overlay';
import type { PanelContents } from '../content/overlay';
import { watchField } from '../content/watcher';
import type { ActionResult } from '../ui/chooser';

start();

function start(): void {
  // Wirte einer früheren Einspeisung abräumen statt auszusteigen — sonst wird
  // ein Update nie wirksam, solange die Seite offen bleibt. Begründung
  // ausführlich in `src/content.ts`.
  for (const id of [OVERLAY_HOST_ID, MILEAGE_HOST_ID, EZ_DATE_HOST_ID, BADGE_HOST_ID]) {
    document.getElementById(id)?.remove();
  }

  const overlay = createOverlay({
    loadPanel,
    insert: (field, baustein, values) => applyInsertion(field, { text: baustein.text, values }),
    manage: {
      save: async (draft) => {
        const result = await saveLocalBaustein(chromeArea, {
          // Die Kennung entsteht beim Anlegen und bleibt dann erhalten.
          id: draft.id ?? `${LOCAL_ID_PREFIX}${crypto.randomUUID()}`,
          titel: draft.titel,
          text: draft.text,
        });
        return result.ok ? { ok: true } : { ok: false, message: result.message };
      },
      remove: async (id): Promise<ActionResult> => {
        await deleteLocalBaustein(chromeArea, id);
        return { ok: true };
      },
    },
  });

  watchField({
    root: document,
    selector: FIELD_SELECTOR,
    ignoreWithin: overlay.shadow.host,
    onAttach: (field) => overlay.attach(field),
    onDetach: () => overlay.detach(),
  });

  const mileage = createMileageOverlay({
    read: readAltStand,
    apply: applyMileage,
    anchor: findAltStandLabel,
  });

  watchField<HTMLInputElement>({
    root: document,
    selector: resolveMileageField,
    ignoreWithin: mileage.shadow.host,
    onAttach: (field) => mileage.attach(field),
    onDetach: () => mileage.detach(),
  });

  const ezDate = createEzDateOverlay({
    read: readEzDateProposal,
    apply: applyEzDate,
    anchor: findEzDateError,
  });

  watchField<HTMLInputElement>({
    root: document,
    selector: EZ_DATE_FIELD_SELECTOR,
    ignoreWithin: ezDate.shadow.host,
    onAttach: (field) => ezDate.attach(field),
    onDetach: () => ezDate.detach(),
  });

  const huFaellig = createMonthStepper();

  watchField<HTMLInputElement>({
    root: document,
    selector: HU_FAELLIG_FIELD_SELECTOR,
    onAttach: (field) => huFaellig.attach(field),
    onDetach: () => huFaellig.detach(),
  });

  // Ohne „GINO" und ohne die fremde Marke: diese Fassung wird öffentlich
  // verteilt und trägt den Namen aus ihrem eigenen Manifest.
  createBadge(`Prüfhelfer ${version()}`);
}

/** Die Fassungsnummer fürs Kennzeichen — ohne sie ist es nur ein Lämpchen. */
function version(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '?';
  }
}

/**
 * Die eingebauten Standardtexte, dahinter die selbst angelegten.
 *
 * Bei jedem Öffnen neu gelesen — zwischen zwei Prüfschritten kann im Panel
 * etwas angelegt oder gelöscht worden sein. Kein Hinweis über der Liste: in
 * dieser Fassung ist „kein Server" der Normalzustand und keine Meldung wert.
 */
async function loadPanel(): Promise<PanelContents> {
  return { bausteine: [...DEFAULT_BAUSTEINE, ...(await readLocalBausteine(chromeArea))], hint: null };
}
