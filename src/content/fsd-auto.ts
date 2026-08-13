/**
 * FSD-Automatik für neu eingehende Aufträge, plus „Alle durchklicken".
 *
 * Ein ausdrücklich aktivierter Schalter bewaffnet die Automatik. Der
 * Zustandskern entscheidet fail-safe, ob die Auftragsliste eindeutig gewachsen
 * ist; dieser Adapter beobachtet das SPA-DOM, zeigt den Zustand und klickt einen
 * fälligen Auftrag genau einmal an.
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
  // fragt nicht, ob etwas neu ist, sondern arbeitet eine beim Start gezogene
  // Liste stumpf ab. Eine feste Liste ist hier das Richtige — käme während des
  // Laufs ein Auftrag dazu, gehört er der Automatik, nicht diesem Durchlauf.
  let run: { ids: string[]; index: number } | null = null;
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
      state.textContent = `Durchklicken: ${run.index} / ${run.ids.length}`;
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

  const processDue = (currentTime: number): void => {
    let candidate: FsdCandidate | null;
    while ((candidate = core.takeDue(currentTime)) !== null) {
      const row = resolveFsdOrder(doc, candidate.id);
      if (row === null) {
        transientMessage = { text: `${candidate.label} übersprungen`, until: currentTime + OPENED_MESSAGE_MS };
        continue;
      }

      try {
        row.click();
        core.recordOpened(currentTime);
        transientMessage = { text: `${candidate.label} geöffnet`, until: currentTime + OPENED_MESSAGE_MS };
      } catch {
        transientMessage = { text: `${candidate.label} übersprungen`, until: currentTime + OPENED_MESSAGE_MS };
      }
      // Ein erfolgreicher Klick setzt den 10-Sekunden-Abstand. Deshalb endet
      // dieser Wake hier; ein weiterer fälliger Auftrag bekommt einen neuen.
      break;
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
    core.enable(readRows(), now());
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
  const runStep = (): void => {
    runTimer = null;
    if (destroyed || run === null) return;

    const id = run.ids[run.index];
    if (id === undefined) {
      const total = run.ids.length;
      stopRun(`Durchklicken fertig · ${total}`);
      render();
      schedule();
      return;
    }

    run.index += 1;
    try {
      resolveFsdOrder(doc, id)?.click();
    } catch {
      // Eine einzelne unklickbare Zeile beendet den Durchlauf nicht.
    }
    render();
    runTimer = view.setTimeout(runStep, betweenOpensMs);
  };

  const startRun = (): void => {
    const ids = readRows()
      .filter((row) => row.eligible)
      .map((row) => row.id);
    if (ids.length === 0) {
      transientMessage = { text: 'Keine Aufträge in der Liste', until: now() + OPENED_MESSAGE_MS };
      render();
      schedule();
      return;
    }

    // Automatik und Durchlauf würden einander sonst die Klicks streitig machen.
    deactivate(null);
    run = { ids, index: 0 };
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
    core.observe(readRows(), now());
    render();
    schedule();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  render();

  return {
    shadow,
    snapshot: () => core.snapshot(),
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
