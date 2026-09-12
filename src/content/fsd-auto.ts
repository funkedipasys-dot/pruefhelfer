/**
 * FSD-Automatik für neu eingehende Aufträge, plus „Alle durchklicken".
 *
 * Ein ausdrücklich aktivierter Schalter bewaffnet die Automatik. Der
 * Zustandskern entscheidet fail-safe, ob die Auftragsliste eindeutig gewachsen
 * ist; dieser Adapter beobachtet das SPA-DOM, zeigt den Zustand und klickt einen
 * fälligen Auftrag genau einmal an.
 *
 * **Seit 2026-09-11 auch von außen scharf zu stellen** (`setArmed`): der
 * Service Worker meldet über `content.ts`, ob die Dauereinstellung an ist und
 * ob der Rechner im Leerlauf steht (`chrome.idle`, systemweit — Christians
 * Entscheidung vom 2026-09-10). Der Schalter in der Leiste bleibt als Notaus
 * und sichtbarer Zustand; er entscheidet nichts mehr allein.
 *
 * **In beiden Fassungen.** Bis 2026-08-13 lag das hier unter `src/pro/`, aus
 * einer Produktentscheidung — nicht aus einer technischen Abhängigkeit. Diese
 * Datei geht nirgends ans Netz und rührt keinen Speicher an; die Trennlinie
 * zwischen Pro und offener Fassung ist allein die GINO-Verbindung. Wie die
 * Leiste sich nennt, entscheidet der Aufrufer über `options.label`.
 */

import { FSD_BETWEEN_OPENS_MS, FsdAutoCore } from './fsd-auto-core';
import type { FsdAutoCoreOptions, FsdAutoSnapshot, FsdCandidate, FsdOrderRow } from './fsd-auto-core';

/**
 * Bewusst ohne Produktnamen: derselbe Quelltext liegt im öffentlichen Repo,
 * das nur „Prüfhelfer Lite" heißt. Die Marke steht im Label, nicht in der ID.
 */
export const FSD_AUTO_HOST_ID = 'pruefhelfer-fsd-auto-host';
export const FSD_ORDER_SELECTOR =
  'app-auftrag-liste-element.auftrag-liste-element[id^="auftrag-liste-auftrag-"]';

/**
 * Das **Kind**, das den Auftrag öffnet — nicht der Wirt.
 *
 * Am echten Tool am 2026-08-12 nachgemessen: `hostElement.click()` bleibt
 * wirkungslos, `hostElement.querySelector('.auftrag-element').click()` öffnet
 * den Auftrag sofort. Angular hängt den Handler an dieses Kind, und ein
 * Klick-Ereignis läuft von innen nach außen — ein Klick auf den Wirt erreicht
 * das Kind also nie. Die frühere Fassung klickte den Wirt an und konnte
 * deshalb prinzipiell nichts auslösen.
 */
export const FSD_ORDER_CLICK_SELECTOR = '.auftrag-element';

/**
 * Das virtuelle Sichtfenster der Auftragsliste (Slice 1.7).
 *
 * **Gemessen am 2026-08-21** mit der DEV-Fassung, an einer Liste mit 24
 * Aufträgen: gleichzeitig im DOM lagen **8** — alles darunter existierte nicht.
 * Genau das war Christians Befund „mehr als sieben werden nicht erkannt".
 *
 * Zwei Werte aus derselben Messung tragen den Umbau:
 * `scrollTop` selbst zu setzen rendert **sofort** nach (erste neue Zeile nach
 * 0 ms), und die Zeilen-IDs bleiben über das Scrollen hinweg **stabil** —
 * Angular vergibt beim Neurendern dieselben. Ohne beides wäre der Durchlauf
 * unten nicht baubar gewesen.
 */
export const FSD_LIST_VIEWPORT_SELECTOR = '#auftrag-liste cdk-virtual-scroll-viewport';

/** Wie weit je Halt gescrollt wird: eine Seite mit Überlappung. */
const SCROLL_ANTEIL = 0.8;

/**
 * Kurze Pause nach einem Scrollsprung, bevor neu gelesen wird. Gemessen hat
 * das Nachrendern 0 ms gebraucht; ein Lidschlag Puffer kostet nichts und
 * deckt einen langsameren Rechner ab.
 */
const SCROLL_SETTLE_MS = 60;

/**
 * Notbremse gegen eine Liste, die beim Klicken an den Anfang zurückspringt.
 * Ein Durchlauf, der nur noch scrollt und nichts mehr klickt, endet dann von
 * selbst, statt endlos weiterzulaufen.
 */
const MAX_SCROLL_SCHRITTE = 100;

const ORDER_ID =
  /^auftrag-liste-auftrag-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const OPENED_MESSAGE_MS = 3_000;
const COUNTDOWN_TICK_MS = 1_000;

const STYLE = `
:host {
  all: initial;
  position: fixed;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483001;
  pointer-events: none;
}
.control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  font: 12px/1.4 Roboto, "Helvetica Neue", Arial, sans-serif;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}
.brand { color: #565656; }
.separator { color: #cbcdcf; }
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 156px;
  padding: 2px 10px;
  border: 1px solid #b8babc;
  border-radius: 999px;
  background: #f7f7f7;
  color: #565656;
  font: inherit;
  cursor: pointer;
}
.toggle:hover, .toggle:focus-visible { border-color: #da1f3d; outline: none; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #777; flex: 0 0 auto; }
.toggle[data-mode="baselining"] .dot { background: #d88a00; }
.toggle[data-mode="armed"] .dot, .toggle[data-mode="waiting"] .dot { background: #17833b; }
.toggle[data-mode="off"] .dot { background: #da1f3d; }
.state { overflow: hidden; text-overflow: ellipsis; }
.run {
  padding: 2px 10px;
  border: 1px solid #b8babc;
  border-radius: 999px;
  background: #f7f7f7;
  color: #565656;
  font: inherit;
  cursor: pointer;
}
.run:hover, .run:focus-visible { border-color: #da1f3d; outline: none; }
.run[data-running="true"] { border-color: #da1f3d; color: #da1f3d; }
`;

/**
 * Sperre für die DEV-Fassung (Plan E1d).
 *
 * Die DEV-Fassung baut auf der Pro-Fassung auf — und die ist die einzige, die
 * selbst klicken kann. Liefe die Automatik während einer Aufnahme, stünden
 * unsere eigenen Klicks im Mitschnitt und wären von echter Bedienung kaum zu
 * unterscheiden. Genau die Verwechslung soll die Aufnahme ja ausschließen.
 *
 * Bewusst ein Modulzustand und kein Parameter: die Leiste gibt es pro Seite
 * genau einmal, und der Rekorder soll sie sperren können, ohne dass die
 * Verdrahtung in `content.ts` etwas von der DEV-Fassung wissen muss. Die
 * Pro-Fassung ruft das hier nie auf.
 */
let locked = false;

export function setFsdLocked(value: boolean): void {
  locked = value;
}

export function isFsdLocked(): boolean {
  return locked;
}

export interface FsdAutoOptions extends FsdAutoCoreOptions {
  document?: Document;
  /** Fassung und Version links vom Schalter. */
  label: string;
  now?: () => number;
  /** Testnaht; Produktion verwendet ausschließlich `Event.isTrusted`. */
  eventIsTrusted?: (event: Event) => boolean;
}

export interface FsdAutoHandle {
  destroy: () => void;
  snapshot: () => FsdAutoSnapshot;
  /**
   * Scharf oder still von außen. `reason` steht bei `false` hinter „AUS ·";
   * so sieht der Prüfer, dass die Automatik nur auf den Leerlauf wartet.
   * Läuft gerade „Alle durchklicken" oder ist die Leiste gesperrt (DEV), wird
   * nicht scharf gestellt — ein Durchlauf gehört dem, der ihn angestoßen hat.
   */
  setArmed: (armed: boolean, reason?: string | null) => void;
  /** Zum Prüfen; der produktive Shadow Root bleibt geschlossen. */
  readonly shadow: ShadowRoot;
}

export function createFsdAuto(options: FsdAutoOptions): FsdAutoHandle {
  const doc = options.document ?? document;
  const view = doc.defaultView;
  if (view === null) throw new Error('FSD-Automatik benötigt ein Browserfenster');

  const now = options.now ?? Date.now;
  const eventIsTrusted = options.eventIsTrusted ?? ((event: Event) => event.isTrusted);
  const core = new FsdAutoCore(options);
  let destroyed = false;
  let wakeTimer: number | null = null;
  let transientMessage: { text: string; until: number } | null = null;
  let offReason: string | null = null;

  // Der ausdrückliche Durchlauf ist bewusst **kein** Zustand des Kerns: er
  // fragt nicht, ob etwas neu ist, sondern arbeitet die Liste ab.
  //
  // **Kein Schnappschuss mehr (Slice 1.7, 2026-08-21).** Bis dahin zog der
  // Start die IDs einmalig und klickte sie der Reihe nach. Bei einer
  // virtualisierten Liste sind das nur die acht gerade sichtbaren — der Rest
  // stand nie im DOM, und die Meldung „fertig · 8" behauptete Vollständigkeit
  // über einer Liste von 24. Jetzt wird **je Schritt neu gelesen**: geklickt
  // wird die erste noch nicht geklickte Zeile, und ist keine mehr da, wird eine
  // Seite weitergescrollt. Damit wird nie eine ID geklickt, die gerade nicht im
  // DOM steht — der frühere stille Fehlschlag entfällt von selbst.
  //
  // Was dabei aus dem alten Kommentar bleibt: käme während des Laufs ein
  // Auftrag dazu, gehört er der Automatik. Er wird hier trotzdem mitgenommen,
  // wenn er unterwegs ins Sichtfenster gerät — das ist der Preis dafür, dass
  // „alle" jetzt wirklich alle heißt, und ein geöffneter Auftrag zu viel ist
  // harmloser als zwei Drittel nie geöffnet.
  let run: { geklickt: Set<string>; scrollSchritte: number } | null = null;
  let runTimer: number | null = null;
  const betweenOpensMs = options.betweenOpensMs ?? FSD_BETWEEN_OPENS_MS;

  const host = doc.createElement('div');
  host.id = FSD_AUTO_HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = doc.createElement('style');
  style.textContent = STYLE;
  const control = doc.createElement('div');
  control.className = 'control';
  const brand = doc.createElement('span');
  brand.className = 'brand';
  brand.textContent = options.label;
  const separator = doc.createElement('span');
  separator.className = 'separator';
  separator.textContent = '·';
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toggle';
  toggle.setAttribute('aria-label', 'FSD-Automatik umschalten');
  const dot = doc.createElement('span');
  dot.className = 'dot';
  const state = doc.createElement('span');
  state.className = 'state';
  state.setAttribute('aria-live', 'polite');
  toggle.append(dot, state);
  const runButton = doc.createElement('button');
  runButton.type = 'button';
  runButton.className = 'run';
  runButton.textContent = 'Alle durchklicken';
  control.append(brand, separator, toggle, runButton);
  shadow.append(style, control);
  doc.body.append(host);

  const readRows = (): FsdOrderRow[] => readFsdOrderRows(doc);

  /**
   * Die Gesamthöhe der Auftragsliste — das Signal, an dem die Automatik seit
   * Slice 1.8 erkennt, dass ein Auftrag dazugekommen ist (`fsd-auto-core.ts`).
   * Sie beschreibt **alle** Aufträge, auch die nie gerenderten; beim Scrollen
   * bleibt sie konstant.
   *
   * `null` heißt „kein Sichtfenster gefunden" — dann fällt der Kern auf die
   * alte Regel zurück und verhält sich wie vor Slice 1.8.
   */
  const listenHoehe = (): number | null =>
    doc.querySelector<HTMLElement>(FSD_LIST_VIEWPORT_SELECTOR)?.scrollHeight ?? null;

  const render = (): void => {
    const current = core.snapshot();
    const currentTime = now();
    toggle.dataset['mode'] = current.mode;
    toggle.setAttribute('aria-pressed', String(current.mode !== 'off'));
    runButton.dataset['running'] = String(run !== null);
    runButton.textContent = run === null ? 'Alle durchklicken' : 'Abbrechen';

    // Ein laufender Durchlauf ist das, was der Prüfer gerade angestoßen hat —
    // seine Fortschrittsanzeige geht allem anderen vor.
    if (run !== null) {
      // Ohne Schnappschuss gibt es keinen Nenner: wie viele Aufträge die Liste
      // insgesamt hat, wüsste man erst, wenn man einmal ganz durchgescrollt
      // wäre — und das ist genau das, was der Durchlauf gerade tut.
      state.textContent = `Durchklicken: ${run.geklickt.size}`;
      return;
    }

    if (transientMessage !== null && transientMessage.until <= currentTime) transientMessage = null;
    if (transientMessage !== null) {
      state.textContent = transientMessage.text;
      return;
    }

    switch (current.mode) {
      case 'off':
        state.textContent = offReason === null ? 'FSD-Automatik: AUS' : `AUS · ${offReason}`;
        break;
      case 'baselining':
        state.textContent = 'FSD-Automatik: STARTET…';
        break;
      case 'armed':
        state.textContent = 'FSD-Automatik: BEREIT';
        break;
      case 'waiting': {
        const seconds = Math.max(0, Math.ceil(((current.nextWakeAt ?? currentTime) - currentTime) / 1_000));
        state.textContent = `${current.next?.label ?? 'Neuer Auftrag'} in ${seconds} s`;
        break;
      }
    }
  };

  const clearWakeTimer = (): void => {
    if (wakeTimer === null) return;
    view.clearTimeout(wakeTimer);
    wakeTimer = null;
  };

  const schedule = (): void => {
    clearWakeTimer();
    if (destroyed) return;
    const current = core.snapshot();
    const currentTime = now();
    const wakeAt = current.nextWakeAt;
    const transientAt = transientMessage?.until ?? null;
    const candidates = [wakeAt, transientAt].filter((value): value is number => value !== null);
    if (current.mode === 'waiting' && wakeAt !== null) {
      candidates.push(Math.min(wakeAt, currentTime + COUNTDOWN_TICK_MS));
    }
    if (candidates.length === 0) return;
    const nextAt = Math.min(...candidates);
    wakeTimer = view.setTimeout(runWake, Math.max(0, nextAt - currentTime));
  };

  /**
   * **Übersprungene werden gesammelt, nicht überschrieben.** Der Durchlauf zieht
   * in einem Wake alle fälligen Kandidaten, bis einer klickbar ist; jeder
   * vorherige gilt danach als abgehakt. Wurde je Fehlschlag nur die
   * `transientMessage` neu gesetzt, sah der Prüfer am Ende einen einzigen Namen
   * — und hielt die anderen für geöffnet, obwohl sie stillschweigend wegfielen.
   */
  const processDue = (currentTime: number): void => {
    const uebersprungen: string[] = [];
    let candidate: FsdCandidate | null;
    let geoeffnet: string | null = null;

    while ((candidate = core.takeDue(currentTime)) !== null) {
      const row = resolveFsdOrder(doc, candidate.id);
      if (row === null) {
        uebersprungen.push(candidate.label);
        continue;
      }

      try {
        row.click();
        core.recordOpened(currentTime);
        geoeffnet = candidate.label;
      } catch {
        uebersprungen.push(candidate.label);
      }
      // Ein erfolgreicher Klick setzt den 10-Sekunden-Abstand. Deshalb endet
      // dieser Wake hier; ein weiterer fälliger Auftrag bekommt einen neuen.
      break;
    }

    const teile: string[] = [];
    if (uebersprungen.length > 0) teile.push(`${uebersprungen.join(', ')} übersprungen`);
    if (geoeffnet !== null) teile.push(`${geoeffnet} geöffnet`);
    if (teile.length > 0) {
      transientMessage = { text: teile.join(' · '), until: currentTime + OPENED_MESSAGE_MS };
    }
  };

  function runWake(): void {
    wakeTimer = null;
    if (destroyed) return;
    const currentTime = now();
    const current = core.snapshot();
    if (current.mode === 'baselining') core.finishBaseline(readRows(), currentTime);
    processDue(currentTime);
    render();
    schedule();
  }

  const deactivate = (reason: string | null): void => {
    core.disable();
    transientMessage = null;
    offReason = reason;
    clearWakeTimer();
    render();
  };

  const activate = (): void => {
    offReason = null;
    transientMessage = null;
    core.enable(readRows(), now(), listenHoehe());
    render();
    schedule();
  };

  const clearRunTimer = (): void => {
    if (runTimer === null) return;
    view.clearTimeout(runTimer);
    runTimer = null;
  };

  const stopRun = (message: string | null): void => {
    if (run === null) return;
    run = null;
    clearRunTimer();
    if (message !== null) transientMessage = { text: message, until: now() + OPENED_MESSAGE_MS };
  };

  /**
   * Öffnet den nächsten Auftrag der Laufliste und legt sich für den
   * Öffnungsabstand schlafen. Eine inzwischen verschwundene Zeile wird
   * übersprungen, nicht abgebrochen — die Liste ist live, und ein einzelner
   * Ausfall darf den Rest des Durchlaufs nicht kosten.
   */
  /**
   * Scrollt die Liste eine Seite weiter. `false` heißt „unten angekommen" —
   * und damit endet der Durchlauf.
   *
   * Ohne Sichtfenster (Liste nicht mehr virtualisiert, oder Selektor gebrochen)
   * gibt es nichts zu scrollen; dann arbeitet der Durchlauf genau das ab, was
   * im DOM steht. Das ist derselbe Umfang wie vor Slice 1.7 — kein Rückschritt,
   * nur kein Gewinn.
   */
  const scrolleWeiter = (): boolean => {
    const viewport = doc.querySelector<HTMLElement>(FSD_LIST_VIEWPORT_SELECTOR);
    if (viewport === null) return false;

    const maximum = viewport.scrollHeight - viewport.clientHeight;
    if (viewport.scrollTop >= maximum - 1) return false;

    const schritt = Math.max(1, Math.round(viewport.clientHeight * SCROLL_ANTEIL));
    viewport.scrollTop = Math.min(maximum, viewport.scrollTop + schritt);
    // Angular hängt am `scroll`-Ereignis; ein gesetztes `scrollTop` löst es
    // nicht überall von selbst aus.
    viewport.dispatchEvent(new view.Event('scroll'));
    return true;
  };

  const runStep = (): void => {
    runTimer = null;
    if (destroyed || run === null) return;
    const aktuell = run;

    const naechste = readRows().find((row) => row.eligible && !aktuell.geklickt.has(row.id));
    if (naechste !== undefined) {
      aktuell.geklickt.add(naechste.id);
      aktuell.scrollSchritte = 0;
      try {
        resolveFsdOrder(doc, naechste.id)?.click();
      } catch {
        // Eine einzelne unklickbare Zeile beendet den Durchlauf nicht.
      }
      render();
      runTimer = view.setTimeout(runStep, betweenOpensMs);
      return;
    }

    // Im Sichtfenster ist nichts Ungeklicktes mehr — weiter nach unten sehen.
    if (aktuell.scrollSchritte < MAX_SCROLL_SCHRITTE && scrolleWeiter()) {
      aktuell.scrollSchritte += 1;
      runTimer = view.setTimeout(runStep, SCROLL_SETTLE_MS);
      return;
    }

    stopRun(`Durchklicken fertig · ${aktuell.geklickt.size}`);
    render();
    schedule();
  };

  const startRun = (): void => {
    if (!readRows().some((row) => row.eligible)) {
      transientMessage = { text: 'Keine Aufträge in der Liste', until: now() + OPENED_MESSAGE_MS };
      render();
      schedule();
      return;
    }

    // Von oben anfangen, sonst hieße „alle" nur „alle ab hier": wer vor dem
    // Klick nach unten gescrollt hat, verlöre die Aufträge darüber.
    const viewport = doc.querySelector<HTMLElement>(FSD_LIST_VIEWPORT_SELECTOR);
    if (viewport !== null && viewport.scrollTop > 0) {
      viewport.scrollTop = 0;
      viewport.dispatchEvent(new view.Event('scroll'));
    }

    // Automatik und Durchlauf würden einander sonst die Klicks streitig machen.
    deactivate(null);
    run = { geklickt: new Set<string>(), scrollSchritte: 0 };
    runStep();
  };

  const refuseWhileLocked = (): boolean => {
    if (!locked) return false;
    transientMessage = { text: 'Aufnahme läuft — gesperrt', until: now() + OPENED_MESSAGE_MS };
    render();
    schedule();
    return true;
  };

  const onToggle = (event: Event): void => {
    if (!eventIsTrusted(event)) return;
    if (run !== null) return;
    if (refuseWhileLocked()) return;
    if (core.snapshot().mode === 'off') activate();
    else deactivate(null);
  };

  const onRun = (event: Event): void => {
    if (!eventIsTrusted(event)) return;
    if (run === null && refuseWhileLocked()) return;
    if (run === null) startRun();
    else {
      stopRun('Durchklicken abgebrochen');
      render();
      schedule();
    }
  };

  /**
   * Echte Bedienung schaltet ab. Das gilt auch für den Durchlauf: wer wieder
   * am Rechner sitzt, will nicht, dass ihm weiter Aufträge aufgehen. Klicks
   * auf die Leiste selbst zählen nicht — sonst würde der Startklick den
   * Durchlauf im selben Atemzug beenden. Selbst ausgelöste Klicks sind
   * synthetisch und damit nicht `isTrusted`.
   */
  const onHumanActivity = (event: Event): void => {
    if (!eventIsTrusted(event)) return;
    if (event.composedPath().includes(host)) return;
    if (run !== null) {
      stopRun('Durchklicken abgebrochen');
      render();
      schedule();
      return;
    }
    if (core.snapshot().mode === 'off') return;
    deactivate('Bedienung erkannt');
  };

  toggle.addEventListener('click', onToggle);
  runButton.addEventListener('click', onRun);
  doc.addEventListener('pointerdown', onHumanActivity, true);
  doc.addEventListener('keydown', onHumanActivity, true);

  const observer = new view.MutationObserver(() => {
    if (destroyed || core.snapshot().mode === 'off') return;
    core.observe(readRows(), now(), listenHoehe());
    render();
    schedule();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  render();

  return {
    shadow,
    snapshot: () => core.snapshot(),
    setArmed(armed, reason = null) {
      if (destroyed || run !== null) return;
      if (!armed) {
        deactivate(reason);
        return;
      }
      if (locked || core.snapshot().mode !== 'off') return;
      activate();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearWakeTimer();
      clearRunTimer();
      run = null;
      core.disable();
      observer.disconnect();
      toggle.removeEventListener('click', onToggle);
      runButton.removeEventListener('click', onRun);
      doc.removeEventListener('pointerdown', onHumanActivity, true);
      doc.removeEventListener('keydown', onHumanActivity, true);
      host.remove();
    },
  };
}

/**
 * Eignung heißt **anklickbar**, nicht „trägt ein Statussymbol".
 *
 * Die frühere Bedingung `.status-icon.clock` stammte aus einer Annahme und
 * wurde nie am echten Tool geprüft — dort gibt es in der Auftragszeile
 * überhaupt kein Statussymbol (nur `icon-car` vor dem Kennzeichen, in jeder
 * Zeile). Sie traf deshalb nie zu, und jeder erkannte Auftrag wurde sofort als
 * ungeeignet abgehakt. Das Tool kennt in der Liste keinen Unterschied zwischen
 * „schon geöffnet" und „noch offen"; das einzige belastbare Kriterium ist, ob
 * die Zeile ihr klickbares Kind hat.
 */
export function readFsdOrderRows(doc: Document = document): FsdOrderRow[] {
  const rows: FsdOrderRow[] = [];
  for (const element of doc.querySelectorAll<HTMLElement>(FSD_ORDER_SELECTOR)) {
    if (!ORDER_ID.test(element.id)) continue;
    rows.push({
      id: element.id,
      label: readOrderLabel(element),
      eligible: element.querySelector(FSD_ORDER_CLICK_SELECTOR) !== null,
    });
  }
  return rows;
}

/** Liefert das klickbare Kind der Zeile, nicht die Zeile selbst. */
function resolveFsdOrder(doc: Document, id: string): HTMLElement | null {
  if (!ORDER_ID.test(id)) return null;
  const element = doc.getElementById(id);
  if (!(element instanceof HTMLElement) || !element.matches(FSD_ORDER_SELECTOR)) return null;
  return element.querySelector<HTMLElement>(FSD_ORDER_CLICK_SELECTOR);
}

function readOrderLabel(element: HTMLElement): string {
  const identifier = element.querySelector<HTMLElement>('[id$="-element-kennzeichen"]')?.textContent?.trim();
  if (identifier !== undefined && identifier.length > 0) return identifier.replace(/\s+/g, ' ');
  const match = ORDER_ID.exec(element.id);
  return match?.[1]?.slice(0, 8) ?? 'Neuer Auftrag';
}
