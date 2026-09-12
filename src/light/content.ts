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
import {
  LOCAL_ID_PREFIX,
  SPEICHER_UNERREICHBAR,
  deleteLocalBaustein,
  readLocalBausteine,
  saveLocalBaustein,
} from '../core/local';
import { ABSCHLUSS_DIALOG_SELECTOR, angemahnteFelder } from '../content/abschluss';
import { ABSCHLUSS_HOST_ID, createAbschlussOverlay } from '../content/abschluss-overlay';
import { BADGE_HOST_ID } from '../content/badge';
import { hideWhileDialogOpen } from '../content/dialog';
import { EZ_DATE_FIELD_SELECTOR, applyEzDate, findEzDateError, readEzDateProposal } from '../content/ez-date';
import { EZ_DATE_HOST_ID, createEzDateOverlay } from '../content/ez-date-overlay';
import { FIELD_SELECTOR, applyInsertion, writeFieldValue } from '../content/field';
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
  const ids = [OVERLAY_HOST_ID, MILEAGE_HOST_ID, EZ_DATE_HOST_ID, BADGE_HOST_ID, FSD_AUTO_HOST_ID, ABSCHLUSS_HOST_ID];
  for (const id of ids) {
    document.getElementById(id)?.remove();
  }

  const overlay = createOverlay({
    loadPanel,
    insert: (field, baustein, values) => applyInsertion(field, { text: baustein.text, values }),
    // **Beide Wege fangen den Speicher ab.** Die Pro-Fassung schreibt über
    // ihren Service Worker und bekommt einen Fehlschlag dort schon als Antwort
    // zurück; hier wird direkt geschrieben, also muss der Fehlschlag hier zur
    // Meldung werden. Der häufigste Fall ist nicht das Kontingent, sondern ein
    // Neuladen der Erweiterung bei offener Seite: dieses Content-Script bleibt
    // verwaist zurück, und jeder `chrome.*`-Aufruf wirft ab da sofort.
    manage: {
      save: async (draft) => {
        try {
          const result = await saveLocalBaustein(chromeArea, {
            // Die Kennung entsteht beim Anlegen und bleibt dann erhalten.
            id: draft.id ?? `${LOCAL_ID_PREFIX}${crypto.randomUUID()}`,
            titel: draft.titel,
            text: draft.text,
          });
          return result.ok ? { ok: true } : { ok: false, message: result.message };
        } catch {
          return { ok: false, message: SPEICHER_UNERREICHBAR };
        }
      },
      remove: async (id): Promise<ActionResult> => {
        try {
          await deleteLocalBaustein(chromeArea, id);
          return { ok: true };
        } catch {
          return { ok: false, message: SPEICHER_UNERREICHBAR };
        }
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

  // Scharf im Leerlauf (seit 0.21.0, wie Pro): der Hintergrunddienst schreibt
  // `fsd.leerlauf` nach `chrome.storage.local`, das Popup `fsd.automatik`;
  // hier wird beides gelesen und mitgehört. Ist die Einstellung aus, bleibt
  // der Handschalter in der Leiste unberührt. Schlüssel wörtlich wie in
  // `sw.ts` — ein Import von dort zöge dessen `chrome.idle`-Aufrufe hierher.
  const fsd = { an: false, leerlauf: false };
  const stelleFsd = (): void => {
    if (fsd.an) fsdAuto.setArmed(fsd.leerlauf, 'scharf bei Leerlauf');
  };
  const onFsdSpeicher = (aenderungen: Record<string, chrome.storage.StorageChange>): void => {
    if ('fsd.automatik' in aenderungen) fsd.an = aenderungen['fsd.automatik']?.newValue === true;
    if ('fsd.leerlauf' in aenderungen) fsd.leerlauf = aenderungen['fsd.leerlauf']?.newValue === true;
    stelleFsd();
  };
  // Ohne Speicher (Kontext verwaist, siehe oben) keine Automatik von allein —
  // der Handschalter in der Leiste bleibt.
  const fsdSpeicher = ((): typeof chrome.storage.onChanged | null => {
    try {
      return chrome.storage.onChanged;
    } catch {
      return null;
    }
  })();
  fsdSpeicher?.addListener(onFsdSpeicher);
  void Promise.resolve()
    .then(() => chromeArea.get(['fsd.automatik', 'fsd.leerlauf']))
    .then((werte) => {
      fsd.an = werte['fsd.automatik'] === true;
      fsd.leerlauf = werte['fsd.leerlauf'] === true;
      stelleFsd();
    })
    .catch(() => {});

  // Die einzige Leiste, die bei offenem Dialog erscheinen *soll* — sie steht
  // deshalb nicht in der Liste von `hideWhileDialogOpen`.
  const abschluss = createAbschlussOverlay({
    read: (dialog) => angemahnteFelder(dialog),
    write: writeFieldValue,
    // **Vorerst keine Warnung über einen fehlenden Fokus.** Ob der Focus-Trap
    // der Abschlussmaske den `focus()` auf das Feld dahinter durchlässt, ist am
    // echten Produktionstool noch nicht gemessen. Schlägt er immer zu, stünde
    // hier bei jedem Eintrag eine Warnung — und diese Fassung wird öffentlich
    // verteilt. Erst messen, dann melden; die `inert`-Prüfung in `checkField()`
    // greift unabhängig davon und verhindert das stille Halbschreiben.
    warnOhneFokus: false,
  });

  // Jeder Beobachter überspringt die Wirte **aller** Overlays, nicht nur den
  // eigenen: sonst weckt jede Regung des einen die Beobachter der anderen drei.
  const hosts = [overlay.shadow.host, mileage.shadow.host, ezDate.shadow.host, abschluss.shadow.host];

  const stops = [
    // Solange ein Dialog offen ist, ist alles hier Bedienung auf einem Bild:
    // die Felder darunter liegen unter dem Backdrop.
    hideWhileDialogOpen([overlay.shadow, ezDate.shadow, fsdAuto.shadow]),
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
    watchField<HTMLElement>({
      root: document,
      selector: ABSCHLUSS_DIALOG_SELECTOR,
      ignoreWithin: hosts,
      onAttach: (dialog) => abschluss.attach(dialog),
      onDetach: () => abschluss.detach(),
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
    fsdSpeicher?.removeListener(onFsdSpeicher);
    fsdAuto.destroy();
    overlay.destroy();
    mileage.destroy();
    ezDate.destroy();
    abschluss.destroy();
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
 *
 * **Ist der Speicher nicht erreichbar, bleiben die eingebauten Texte.** Sie
 * liegen im Bündel und brauchen niemanden zu fragen. Das Panel deshalb ganz
 * leer zu lassen hieße, dem Prüfer wegen seiner eigenen fünf Texte auch noch
 * die fünf zu nehmen, die ohnehin dabei sind. Der Hinweis sagt, was fehlt —
 * eine stille Kurzliste wäre die schlechtere Auskunft.
 */
async function loadPanel(): Promise<PanelContents> {
  try {
    return { bausteine: [...DEFAULT_BAUSTEINE, ...(await readLocalBausteine(chromeArea))], hint: null };
  } catch {
    return { bausteine: [...DEFAULT_BAUSTEINE], hint: `Nur die eingebauten Texte — ${SPEICHER_UNERREICHBAR}` };
  }
}
