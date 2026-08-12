/**
 * Versionsabfrage der offenen Fassung.
 *
 * **Warum es das gibt.** Eine entpackt geladene Erweiterung hat keinen
 * Update-Weg — Chrome aktualisiert sie nie. Ein Fehler wie der vom 2026-08-12
 * (HU fällig zeigte ein Datum an, das die Anwendung nie übernommen hatte)
 * bleibt deshalb so lange in Betrieb, bis jemand von sich aus nachsieht. Das
 * ist bei einem Werkzeug, das an einem Prüfbericht mitschreibt, nicht
 * hinnehmbar.
 *
 * **Was dabei übertragen wird: nichts.** Es ist ein `GET` auf eine öffentliche
 * Datei in einem öffentlichen Repo, ohne Kopfzeilen, ohne Kennung, ohne
 * Nutzlast. Der Server erfährt dasselbe, was er erführe, wenn jemand die Datei
 * im Browser öffnet. Es geht **keine** Information über den Prüfer, den
 * Auftrag, die Textbausteine oder die Nutzung hinaus — und es gibt keinen
 * Rückkanal, über den das ginge.
 *
 * **Und es läuft nicht im Hintergrund.** Die offene Fassung hat keinen Service
 * Worker; gefragt wird ausschließlich, wenn das Popup geöffnet wird, und
 * höchstens einmal am Tag. Wer das Popup nie öffnet, erzeugt nie einen Aufruf.
 *
 * Der Aufruf ist die **einzige** Ausnahme im Netz-Wächter
 * (`src/light/build.spec.ts`) und dort namentlich benannt. Jeder andere
 * Ausgang lässt den Test weiterhin fehlschlagen.
 */

import type { StorageArea } from './baustein';

/** Das Manifest der offenen Fassung im öffentlichen Repo. */
export const UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/funkedipasys-dot/pruefhelfer/main/src/light/manifest.json';

export const UPDATE_STATE_KEY = 'pruefhelfer.update';

/** Höchstens einmal am Tag — auch wenn das Popup zehnmal geöffnet wird. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Ein hängender Abruf darf das Popup nicht blockieren. */
export const UPDATE_TIMEOUT_MS = 8_000;

export interface UpdateState {
  /** Epoch-ms des letzten **erfolgreichen** Abrufs. */
  zuletztGeprueft: number;
  /** Zuletzt gesehene Fassungsnummer, oder `null`. */
  gesehen: string | null;
}

export interface UpdatePruefung {
  fetchFn: typeof fetch;
  area: StorageArea;
  jetzt: number;
  aktuelleVersion: string;
}

/**
 * Die neuere Fassungsnummer, oder `null`.
 *
 * Scheitert der Abruf, wird **nicht** gespeichert: ein Aussetzer soll den
 * Hinweis nicht einen Tag lang verzögern. Popup-Öffnungen sind selten und
 * vom Prüfer ausgelöst — ein erneuter Versuch kostet nichts.
 */
export async function pruefeAufUpdate(optionen: UpdatePruefung): Promise<string | null> {
  const stand = await leseStand(optionen.area);

  if (stand !== null && optionen.jetzt - stand.zuletztGeprueft < UPDATE_CHECK_INTERVAL_MS) {
    return neuerOderNull(stand.gesehen, optionen.aktuelleVersion);
  }

  const gesehen = await hole(optionen.fetchFn);
  if (gesehen === null) return stand === null ? null : neuerOderNull(stand.gesehen, optionen.aktuelleVersion);

  await optionen.area.set({
    [UPDATE_STATE_KEY]: { zuletztGeprueft: optionen.jetzt, gesehen } satisfies UpdateState,
  });
  return neuerOderNull(gesehen, optionen.aktuelleVersion);
}

/**
 * Vergleicht zwei Fassungsnummern der Form `A.B.C`.
 *
 * Nur die drei Zahlen zählen. Alles Unlesbare gilt als 0 — eine kaputte Angabe
 * aus dem Netz darf keinen Hinweis erzeugen, aber auch keinen Fehler werfen.
 */
export function istNeuer(entfernt: string, aktuell: string): boolean {
  const zahlen = (wert: string): number[] =>
    wert.split('.').map((teil) => {
      const zahl = Number(teil);
      return Number.isFinite(zahl) && zahl >= 0 ? zahl : 0;
    });

  const e = zahlen(entfernt);
  const a = zahlen(aktuell);
  for (let i = 0; i < 3; i += 1) {
    const unterschied = (e[i] ?? 0) - (a[i] ?? 0);
    if (unterschied !== 0) return unterschied > 0;
  }
  return false;
}

function neuerOderNull(gesehen: string | null, aktuell: string): string | null {
  return gesehen !== null && istNeuer(gesehen, aktuell) ? gesehen : null;
}

async function hole(fetchFn: typeof fetch): Promise<string | null> {
  const abbruch = new AbortController();
  const wecker = setTimeout(() => {
    abbruch.abort();
  }, UPDATE_TIMEOUT_MS);

  try {
    const antwort = await fetchFn(UPDATE_MANIFEST_URL, { signal: abbruch.signal });
    if (!antwort.ok) return null;
    const koerper = (await antwort.json()) as { version?: unknown };
    return typeof koerper.version === 'string' ? koerper.version : null;
  } catch {
    // Offline, Zeitüberschreitung, kaputte Antwort — alles derselbe Fall:
    // kein Hinweis. Ein Werkzeug, das ohne Netz arbeitet, darf daran nicht
    // scheitern.
    return null;
  } finally {
    clearTimeout(wecker);
  }
}

async function leseStand(area: StorageArea): Promise<UpdateState | null> {
  const gespeichert = await area.get([UPDATE_STATE_KEY]);
  const wert = gespeichert[UPDATE_STATE_KEY];
  if (typeof wert !== 'object' || wert === null) return null;

  const { zuletztGeprueft, gesehen } = wert as Partial<UpdateState>;
  if (typeof zuletztGeprueft !== 'number' || !Number.isFinite(zuletztGeprueft)) return null;
  if (gesehen !== null && typeof gesehen !== 'string') return null;
  return { zuletztGeprueft, gesehen };
}
