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
import { BADGE_HOST_ID } from '../content/badge';
import { EZ_DATE_FIELD_SELECTOR, applyEzDate, findEzDateError, readEzDateProposal } from '../content/ez-date';
import { EZ_DATE_HOST_ID, createEzDateOverlay } from '../content/ez-date-overlay';
import { FIELD_SELECTOR, applyInsertion } from '../content/field';
import { FSD_AUTO_HOST_ID, createFsdAuto } from '../content/fsd-auto';
import { HU_FAELLIG_FIELD_SELECTOR, createMonthStepper } from '../content/hu-faellig';
import { applyMileage, findAltStandLabel, readAltStand, resolveMileageField } from '../content/mileage';
import { MILEAGE_HOST_ID, createMileageOverlay } from '../content/mileage-overlay';
import { OVERLAY_HOST_ID, createOverlay } from '../content/overlay';
import type { PanelContents } from '../content/overlay';
import { watchField } from '../content/watcher';
import type { ActionResult } from '../ui/chooser';

/**
 * Der Griff, mit dem eine spätere Einspeisung diese hier abräumt.
 *
 * Der Isolated World der Erweiterung überlebt eine erneute Einspeisung — ein
 * Merker auf `window` ist deshalb der einzige Weg, an die Vorgängerin
 * heranzukommen. Die Seite sieht ihn nicht: sie hat ihr eigenes `window`.
 */
const TEARDOWN = '__pruefhelferTeardown';

interface TeardownHolder {
  [TEARDOWN]?: () => void;
}

start();

function start(): void {
  const holder = window as unknown as TeardownHolder;

  // **Die Vorgängerin abräumen statt auszusteigen** — sonst wird ein Update nie
  // wirksam, solange die Seite offen bleibt.
  //
  // Ihre Wirte zu löschen genügt dafür nicht. Was an ihnen hängt, verschwindet
  // mit ihnen; was am *Formular* hängt, bleibt. Der Monatsschritt an „HU fällig"
  // hat gar keinen Wirt, nur einen Zuhörer am Feld: nach der zweiten Einspeisung
  // sprang eine Pfeiltaste zwei Monate, nach der dritten drei — lautlos, in
  // einem Feld des Prüfberichts.
  holder[TEARDOWN]?.();

  // Rückfall für eine Vorgängerin, die den Merker noch nicht kannte (Fassungen
  // bis 0.6.1). Ihre Zuhörer bleiben dann zwar, aber wenigstens steht nichts
  // doppelt auf dem Schirm.
  // `BADGE_HOST_ID` bleibt in der Liste, obwohl diese Fassung kein Badge mehr
  // anlegt: eine Vorgängerin bis 0.6.8 hat eines hinterlassen, und das muss
  // weichen, sonst hängen Badge und Leiste übereinander.
  for (const id of [OVERLAY_HOST_ID, MILEAGE_HOST_ID, EZ_DATE_HOST_ID, BADGE_HOST_ID, FSD_AUTO_HOST_ID]) {
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

  const mileage = createMileageOverlay({
    read: readAltStand,
    apply: applyMileage,
    anchor: findAltStandLabel,
  });

  const ezDate = createEzDateOverlay({
    read: readEzDateProposal,
    apply: applyEzDate,
    anchor: findEzDateError,
  });

  const huFaellig = createMonthStepper();

  // Die Leiste ersetzt das frühere passive Versions-Badge — sie trägt Fassung
  // und Versionsnummer selbst. Ohne die fremde Marke: diese Fassung wird
  // öffentlich verteilt und trägt den Namen aus ihrem eigenen Manifest (siehe
  // `build.spec.ts`).
  //
  // Nicht in `hosts`: ihr Shadow ist `closed`, seine Regungen erreichen einen
  // Beobachter am Dokument gar nicht erst. Nur der Wirt selbst taucht auf — ein
  // einziges Mal beim Anlegen.
  const fsdAuto = createFsdAuto({ label: `Prüfhelfer ${version()}` });

  // Jeder Beobachter überspringt die Wirte **aller** Overlays, nicht nur den
  // eigenen: sonst weckt jede Regung des einen die Beobachter der anderen zwei.
  const hosts = [overlay.shadow.host, mileage.shadow.host, ezDate.shadow.host];

  const stops = [
    watchField({
      root: document,
      selector: FIELD_SELECTOR,
      ignoreWithin: hosts,
      onAttach: (field) => overlay.attach(field),
      onDetach: () => overlay.detach(),
    }),
    watchField<HTMLInputElement>({
      root: document,
      selector: resolveMileageField,
      ignoreWithin: hosts,
      onAttach: (field) => mileage.attach(field),
      onDetach: () => mileage.detach(),
    }),
    watchField<HTMLInputElement>({
      root: document,
      selector: EZ_DATE_FIELD_SELECTOR,
      ignoreWithin: hosts,
      onAttach: (field) => ezDate.attach(field),
      onDetach: () => ezDate.detach(),
    }),
    watchField<HTMLInputElement>({
      root: document,
      selector: HU_FAELLIG_FIELD_SELECTOR,
      ignoreWithin: hosts,
      onAttach: (field) => huFaellig.attach(field),
      onDetach: () => huFaellig.detach(),
    }),
  ];

  holder[TEARDOWN] = () => {
    // Zuerst den Merker löschen: `destroy()` ruft `detach()`, und nichts davon
    // soll bei einem Fehler in der Mitte eine halb abgeräumte Instanz
    // zurücklassen, die eine dritte Einspeisung noch einmal abzuräumen versucht.
    delete holder[TEARDOWN];
    // `stop()` meldet ein verbundenes Feld ab — das ist der Zuhörer am Formular,
    // um den es geht. `destroy()` räumt danach die Wirte weg.
    for (const stop of stops) stop();
    fsdAuto.destroy();
    overlay.destroy();
    mileage.destroy();
    ezDate.destroy();
  };
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
