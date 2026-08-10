/**
 * Die Knopfleiste am Kilometerstand-Feld (Plan-Punkt 68).
 *
 * Aufbau wie beim Textbaustein-Panel: eigener Wirt an `document.body`, eigener
 * Schatten, `position: fixed` und Nachführung über die Viewport-Koordinaten.
 * Kein Knoten im Angular-Baum.
 *
 * Sie hängt an der **Beschriftung** mit dem alten Stand, nicht am Eingabefeld:
 * dort steht die Zahl, um die es geht, und rechts davon ist an beiden Stellen
 * Platz. Fehlt die Beschriftung, gibt es keinen alten Stand — dann bleibt die
 * Leiste weg, statt einen Knopf ohne Wert anzubieten.
 *
 * **Und sie wertet fortlaufend aus, nicht einmal beim Verbinden.** Das Feld und
 * die Beschriftung entstehen nicht zwingend zusammen: bei einer Nachkontrolle
 * steht das Feld sofort da, der Stand aus der Kopiervorlage wird nachgeladen.
 * Eine einmalige Messung beim Verbinden fiele dann auf „kein alter Stand" und
 * bliebe für immer dabei — `watchField` meldet nichts Neues, das Feld ist ja
 * dasselbe Element geblieben. Genau daran ist die Abnahme vom 10.08.2026
 * gescheitert.
 */

import { MILEAGE_OFFSETS } from '../core/mileage';
import { BAR_STYLE, barPosition } from './bar';
import type { MileageResult } from './mileage';

/** Ein fester Bezeichner macht den Wirt zum Singleton. */
export const MILEAGE_HOST_ID = 'gtue-kilometerstand-host';

/**
 * Wie weit über dem Feld beobachtet wird.
 *
 * Die Beschriftung ist kein Kind des Feldes, sondern ein Geschwister ein paar
 * Ebenen höher — `findAltStandLabel` klettert genau deshalb nach oben.
 * Beobachtet wird derselbe Bereich: hoch genug, dass die Beschriftung darin
 * auftauchen kann, niedrig genug, dass nicht jede Regung des Formulars gemeldet
 * wird. Ein Selektor stünde hier besser, aber welche Hülle die beiden Stellen
 * gemeinsam haben, ist von außen nicht verlässlich zu erraten.
 */
const SCOPE_DEPTH = 5;

export interface MileageOverlayDeps {
  /**
   * Der alte Stand zu diesem Feld. Wird bei jeder Änderung in der Umgebung
   * **und** bei jedem Klick neu abgefragt — zwischen Anzeigen und Klicken kann
   * die Anwendung die Beschriftung ausgetauscht haben.
   */
  read: (field: HTMLInputElement) => number | null;
  apply: (field: HTMLInputElement, value: number) => MileageResult;
  /** Die Beschriftung, an der die Leiste hängt. `null` = am Feld ausrichten. */
  anchor: (field: HTMLInputElement) => Element | null;
}

export interface MileageOverlayHandle {
  attach: (field: HTMLInputElement) => void;
  detach: () => void;
  destroy: () => void;
  /** Zum Prüfen — der Inhalt liegt sonst hinter der Schattengrenze. */
  readonly shadow: ShadowRoot;
}

export function createMileageOverlay(deps: MileageOverlayDeps): MileageOverlayHandle {
  const host = document.createElement('div');
  host.id = MILEAGE_HOST_ID;
  // Geschlossen: die Aufschrift der Knöpfe nennt den Kilometerstand, der
  // eingetragen wird. Käme die Seite an sie heran, könnte sie eine andere Zahl
  // anzeigen als die, die der Klick einträgt.
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = BAR_STYLE;

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.hidden = true;

  const uebernehmen = document.createElement('button');
  uebernehmen.type = 'button';
  uebernehmen.className = 'uebernehmen';

  const offsetButtons = MILEAGE_OFFSETS.map((offset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'offset';
    button.textContent = `+${offset}`;
    button.dataset['offset'] = String(offset);
    return button;
  });

  const fehler = document.createElement('span');
  fehler.className = 'fehler';

  bar.append(uebernehmen, ...offsetButtons, fehler);
  shadow.append(style, bar);
  document.body.append(host);

  let field: HTMLInputElement | null = null;
  let observedAnchor: Element | null = null;
  let frame = 0;

  /** Beschriftet die Knöpfe mit den Zahlen, die sie tatsächlich eintragen. */
  const label = (base: number): void => {
    uebernehmen.textContent = String(base);
    uebernehmen.title = `${base} eintragen`;
    uebernehmen.setAttribute('aria-label', `Kilometerstand ${base} eintragen`);
    for (const button of offsetButtons) {
      const offset = Number(button.dataset['offset']);
      button.title = `${base + offset} eintragen`;
      button.setAttribute('aria-label', `Kilometerstand ${base + offset} eintragen`);
    }
  };

  /**
   * Anzeigen oder verschwinden — und wenn anzeigen, dann mit der Zahl, die
   * gerade dasteht, an der Stelle, an der sie gerade steht.
   *
   * Der eine Weg für alles: Auftauchen der Beschriftung, Nachladen des Wertes,
   * Bildlauf, Größenänderung. Ein zweiter Weg nur fürs Verschieben wäre
   * sparsamer, aber die Messung der Beschriftung kostet ohnehin denselben
   * Aufstieg durch den Baum — er käme also nur mit einer zweiten Stelle, an der
   * das Anzeigen falsch sein kann.
   */
  const refresh = (): void => {
    const current = field;
    if (current === null || !current.isConnected) return;

    const base = deps.read(current);
    // Ohne alten Stand gibt es nichts zu übernehmen — die Leiste bleibt weg.
    // Auftauchen kann er trotzdem noch, dafür bleibt alles angemeldet.
    if (base === null) {
      bar.hidden = true;
      // Die Beschriftung von vorhin ist mit dem Wert verschwunden; sie weiter
      // zu beobachten hieße, an einem Element zu hängen, das die Anwendung
      // längst ausgetauscht hat.
      observeAnchor(null);
      return;
    }

    label(base);
    bar.hidden = false;

    const anchor = deps.anchor(current);
    observeAnchor(anchor);

    const { top, left } = barPosition(anchor ?? current);
    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
  };

  /** Immer nur eine Beschriftung beobachten — die, an der die Leiste hängt. */
  const observeAnchor = (anchor: Element | null): void => {
    if (anchor === observedAnchor) return;
    if (observedAnchor !== null) resizeObserver.unobserve(observedAnchor);
    if (anchor !== null) resizeObserver.observe(anchor);
    observedAnchor = anchor;
  };

  const schedule = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  };

  const resizeObserver = new ResizeObserver(schedule);
  /**
   * Das Erscheinen der Beschriftung ist eine Änderung am Baum, das Nachtragen
   * der Zahl in eine vorhandene Beschriftung nur eine am Text — der eine
   * Beobachter sieht nicht, was der andere sieht, deshalb beides.
   *
   * Die eigenen Knöpfe lösen das nicht aus: sie liegen hinter der
   * Schattengrenze, und dahinter schaut ein `MutationObserver` nicht.
   */
  const mutationObserver = new MutationObserver(schedule);

  /**
   * Der gemeinsame Klickweg.
   *
   * **Der alte Stand wird hier neu gelesen**, nicht aus der Beschriftung von
   * vorhin genommen: die Knopfaufschrift ist Anzeige, verbindlich ist, was in
   * dem Moment auf der Seite steht.
   *
   * Der `isTrusted`-Riegel wie überall — ein per Skript ausgelöster Klick soll
   * nichts in ein Prüffeld schreiben. Der geschlossene Schatten hält die Seite
   * schon von diesen Knöpfen fern; der Riegel ist die zweite Reihe und gilt
   * auch für alles, was den Schatten legitim erreicht.
   */
  const run = (offset: number) => (event: MouseEvent): void => {
    if (!event.isTrusted) {
      fehler.textContent = 'Nur per Klick möglich.';
      return;
    }
    const current = field;
    if (current === null || !current.isConnected) {
      fehler.textContent = 'Das Feld ist nicht mehr da.';
      return;
    }

    const base = deps.read(current);
    if (base === null) {
      fehler.textContent = 'Kein alter Stand ablesbar.';
      return;
    }

    const result = deps.apply(current, base + offset);
    fehler.textContent = result.ok ? '' : result.message;
    if (result.ok) label(base);
  };

  uebernehmen.addEventListener('click', run(0));
  for (const button of offsetButtons) {
    button.addEventListener('click', run(Number(button.dataset['offset'])));
  }

  return {
    shadow,
    attach(next) {
      field = next;
      fehler.textContent = '';

      resizeObserver.observe(next);
      const scope = scopeOf(next);
      resizeObserver.observe(scope);
      mutationObserver.observe(scope, { childList: true, subtree: true, characterData: true });
      window.addEventListener('scroll', schedule, { capture: true, passive: true });
      window.addEventListener('resize', schedule, { passive: true });

      refresh();
    },
    detach() {
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      field = null;
      observedAnchor = null;
      bar.hidden = true;
      fehler.textContent = '';
    },
    destroy() {
      this.detach();
      host.remove();
    },
  };
}

/** Der beobachtete Ausschnitt: so viele Ebenen über dem Feld, wie es gibt. */
function scopeOf(field: Element): Element {
  let node: Element = field;
  for (let depth = 0; depth < SCOPE_DEPTH; depth += 1) {
    const parent = node.parentElement;
    if (parent === null) break;
    node = parent;
  }
  return node;
}
