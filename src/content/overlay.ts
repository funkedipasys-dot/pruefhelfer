/**
 * Das feldgebundene Panel im GTÜ-Produktionstool (Plan-Punkt 45).
 *
 * **Kein einziger Knoten landet im Angular-Baum.** Der Wirt hängt an
 * `document.body`, steht `position: fixed` und wird über die
 * Viewport-Koordinaten des Feldes nachgeführt. Ein Element in den Baum der
 * Anwendung zu hängen wäre bequemer — aber Angular räumt seinen eigenen Baum
 * auf, und ein fremder Knoten darin ist entweder sofort wieder weg oder bringt
 * die Änderungserkennung durcheinander.
 *
 * **Alles im eigenen Shadow DOM.** Die Stile der GTÜ-Seite kommen nicht herein,
 * unsere nicht hinaus.
 *
 * Liste, Platzhalterformular und der `isTrusted`-Riegel stecken im gemeinsamen
 * `ui/chooser.ts` — dieselbe Bedienung wie im Popup (Plan-Punkt 47). Hier steht
 * nur, was das Overlay zusätzlich braucht: Wirt, Schatten, Nachführung.
 */

import type { CachedBaustein } from '../core/baustein';
import type { ActionResult, ChooserManagement, PanelContents } from '../ui/chooser';
import { CHOOSER_STYLE, createChooser } from '../ui/chooser';
import type { ApplyResult } from './field';

/** Ein fester Bezeichner macht den Wirt zum Singleton (Plan-Punkt 44). */
export const OVERLAY_HOST_ID = 'gtue-textbausteine-host';

export type { PanelContents };

export interface OverlayDeps {
  /**
   * Wird bei jedem Öffnen neu abgefragt — der Bestand kann sich seit dem
   * letzten Öffnen geändert haben. Bestand und Hinweis kommen zusammen, weil
   * sie aus derselben Antwort des Service Workers stammen.
   */
  loadPanel: () => Promise<PanelContents>;
  /**
   * Führt das Einfügen aus. Das Feld kommt vom Overlay, nicht aus einer
   * Closure des Aufrufers — sonst könnten beide auf verschiedene Elemente
   * zeigen, nachdem die Anwendung das Feld ausgetauscht hat.
   */
  insert: (
    field: HTMLTextAreaElement,
    baustein: CachedBaustein,
    values: Record<string, string>,
  ) => ApplyResult;
  /**
   * Eigene Bausteine anlegen, ändern, löschen (Plan-Punkt 61). **Ohne
   * `template`** — welcher Text sich als Vorlage anbietet, weiß nur das
   * Overlay: es ist der Inhalt des Feldes, an dem das Panel gerade hängt.
   */
  manage?: Omit<ChooserManagement, 'template'>;
  /**
   * Was bei leerem Bestand dasteht. Kommt vom Aufrufer, weil der Rat davon
   * abhängt, woher die Bausteine kommen: „koppeln oder abgleichen" wäre in
   * einer Fassung ohne Server ein Verweis ins Leere (Plan-Punkt 72).
   */
  emptyText?: string;
}

export interface OverlayHandle {
  /** Verbindet das Panel mit einem Feld und beginnt die Nachführung. */
  attach: (field: HTMLTextAreaElement) => void;
  /** Löst die Verbindung, entfernt Listener, versteckt das Panel. */
  detach: () => void;
  /** Entfernt den Wirt vollständig aus dem Dokument. */
  destroy: () => void;
  /** Zum Prüfen — der Inhalt liegt sonst hinter der Shadow-Grenze. */
  readonly shadow: ShadowRoot;
}

/**
 * Optik ans GTÜ-Tool angelehnt (Pixelprobe, siehe CHOOSER_STYLE): Roboto,
 * Pillen-Knopf, Markenrot. Launcher und Panel sind über \`translateX(-100%)\`
 * **rechtsbündig** am Feld — links steht das Label „Bemerkungen", das der
 * Knopf sonst verdeckt.
 */
const STYLE = `
:host { all: initial; }
.launcher, .panel {
  position: fixed;
  z-index: 2147483000;
  font: 13px/1.4 Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #333;
  transform: translateX(-100%);
}
.launcher button {
  font: inherit;
  padding: 3px 14px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  cursor: pointer;
}
.launcher button:hover { border-color: #da1f3d; color: #da1f3d; }
.panel {
  width: 380px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
/* .panel[hidden] braucht keine eigene Regel mehr — die generische steht in
   CHOOSER_STYLE und wird unten angehängt. Zwei Stellen für dieselbe Absicht
   waren der Grund, warum die Fußzeilen des Choosers sie nicht mitbekamen. */
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  background: #f2f2f2;
  border-bottom: 1px solid #e0e0e0;
}
.head .titel { font-weight: 600; color: #565656; }
.head .close {
  font: inherit;
  line-height: 1;
  padding: 2px 8px 4px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: #565656;
  font-size: 18px;
  cursor: pointer;
}
.head .close:hover { background: #fff; color: #da1f3d; }
${CHOOSER_STYLE}`;

export function createOverlay(deps: OverlayDeps): OverlayHandle {
  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const launcher = document.createElement('div');
  launcher.className = 'launcher';
  const launcherButton = document.createElement('button');
  launcherButton.type = 'button';
  launcherButton.textContent = 'Textbausteine';
  launcher.append(launcherButton);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;

  // Kopfzeile mit Schließen-Knopf (Plan-Punkt 63). Escape und ein zweiter
  // Klick auf den Launcher schließen ebenfalls — beides sieht man dem Panel
  // aber nicht an, und der Prüfer steht mit Handschuhen vor dem Fahrzeug.
  const head = document.createElement('div');
  head.className = 'head';
  const headTitle = document.createElement('span');
  headTitle.className = 'titel';
  headTitle.textContent = 'Textbausteine';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'close';
  closeButton.textContent = '×';
  closeButton.title = 'Schließen';
  closeButton.setAttribute('aria-label', 'Schließen');
  head.append(headTitle, closeButton);
  panel.append(head);

  shadow.append(style, launcher, panel);
  document.body.append(host);

  let field: HTMLTextAreaElement | null = null;
  let frame = 0;

  const chooser = createChooser(panel, {
    loadPanel: deps.loadPanel,
    actionLabel: 'Einfügen',
    emptyText: deps.emptyText ?? 'Keine Textbausteine gespeichert.',
    ...(deps.manage !== undefined
      ? {
          manage: {
            ...deps.manage,
            // Der Feldinhalt zum Zeitpunkt des Klicks, nicht der beim Öffnen:
            // dazwischen kann der Prüfer weitergeschrieben haben.
            template: () => {
              const current = field?.value.trim() ?? '';
              return current === '' ? null : current;
            },
          },
        }
      : {}),
    run: (baustein, values) => {
      // Zwischen dem Öffnen des Panels und dem Klick können Sekunden liegen —
      // lange genug, dass die Anwendung das Feld ausgetauscht hat.
      if (field === null || !field.isConnected) {
        return { ok: false, message: 'Das Bemerkungsfeld ist nicht mehr da. Bitte den Prüfschritt erneut öffnen.' };
      }
      const result = deps.insert(field, baustein, values);
      if (!result.ok) return result as ActionResult;
      close();
      return { ok: true };
    },
  });

  // -- Nachführung ---------------------------------------------------------
  // Scroll in der **Capture-Phase**: das Feld steckt in einem eigenen
  // Scroll-Container, dessen Ereignisse nie bis zum Fenster aufsteigen. Ohne
  // Capture bliebe das Panel beim Scrollen stehen. Gedrosselt über
  // `requestAnimationFrame`, sonst rechnet jedes einzelne Scroll-Ereignis die
  // Koordinaten neu.

  const reposition = (): void => {
    if (field === null || !field.isConnected) return;
    const rect = field.getBoundingClientRect();
    const right = `${Math.round(rect.right)}px`;
    launcher.style.top = `${Math.round(rect.top - 28)}px`;
    launcher.style.left = right;
    // Das Panel öffnet **nach oben**, über dem Knopf: das Bemerkungsfeld sitzt
    // im GTÜ-Formular am unteren Rand, unterhalb schnitt der Viewport es ab.
    panel.style.bottom = `${Math.round(window.innerHeight - rect.top + 32)}px`;
    panel.style.left = right;
    // ponytail: kein Flip nach unten — Flip nachrüsten, falls je ein Feld am
    // oberen Viewport-Rand auftaucht.
    panel.style.maxHeight = `${Math.round(Math.max(160, Math.min(window.innerHeight * 0.6, rect.top - 40)))}px`;
  };

  const scheduleReposition = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      reposition();
    });
  };

  const resizeObserver = new ResizeObserver(scheduleReposition);

  function close(): void {
    panel.hidden = true;
    chooser.clear();
  }

  const open = (): void => {
    panel.hidden = false;
    chooser.reset();
    reposition();
    void chooser.refresh();
    chooser.focusSearch();
  };

  launcherButton.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  closeButton.addEventListener('click', close);

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  return {
    shadow,
    attach(next) {
      field = next;
      launcher.hidden = false;
      resizeObserver.observe(next);
      window.addEventListener('scroll', scheduleReposition, { capture: true, passive: true });
      window.addEventListener('resize', scheduleReposition, { passive: true });
      reposition();
    },
    detach() {
      window.removeEventListener('scroll', scheduleReposition, { capture: true });
      window.removeEventListener('resize', scheduleReposition);
      resizeObserver.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      field = null;
      close();
      launcher.hidden = true;
    },
    destroy() {
      this.detach();
      host.remove();
    },
  };
}
