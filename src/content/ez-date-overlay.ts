/**
 * Der Korrektur-Knopf am Erstzulassungsfeld.
 *
 * Aufbau wie die Kilometerstand-Leiste: eigener Wirt an `document.body`,
 * eigener Schatten, `position: fixed`, kein Knoten im Angular-Baum. Geteilt sind
 * Optik und Messung (`bar.ts`), eigen ist, **wann** die Leiste erscheint.
 *
 * Und da liegt der Unterschied. Der Kilometerstand hängt an einem Feld, das
 * kommt und geht — taucht es auf, gibt es etwas anzubieten. Das
 * Erstzulassungsfeld steht die ganze Zeit da; was sich ändert, ist sein
 * *Inhalt*. `watchField` bemerkt das nicht, denn das Element bleibt dasselbe.
 * Diese Leiste hört deshalb selbst am Feld mit.
 */

import { BAR_STYLE, barPosition } from './bar';
import type { EzDateProposal } from '../core/ez-date';
import type { EzDateResult } from './ez-date';

/** Ein fester Bezeichner macht den Wirt zum Singleton. */
export const EZ_DATE_HOST_ID = 'gtue-erstzulassung-host';

export interface EzDateOverlayDeps {
  /**
   * Der Vorschlag zum aktuellen Inhalt. Wird bei jeder Änderung **und** bei
   * jedem Klick neu abgefragt — die Aufschrift ist Anzeige, verbindlich ist,
   * was im Moment des Klicks im Feld steht.
   */
  read: (field: HTMLInputElement) => EzDateProposal | null;
  apply: (field: HTMLInputElement, text: string) => EzDateResult;
  /** Die Fehlermeldung, an der die Leiste hängt. `null` = am Feld ausrichten. */
  anchor: (field: HTMLInputElement) => Element | null;
}

export interface EzDateOverlayHandle {
  attach: (field: HTMLInputElement) => void;
  detach: () => void;
  destroy: () => void;
  /** Zum Prüfen — der Inhalt liegt sonst hinter der Schattengrenze. */
  readonly shadow: ShadowRoot;
}

/** Die Ereignisse, nach denen der Inhalt ein anderer sein kann. */
const FIELD_EVENTS = ['change', 'blur'] as const;

export function createEzDateOverlay(deps: EzDateOverlayDeps): EzDateOverlayHandle {
  const host = document.createElement('div');
  host.id = EZ_DATE_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = BAR_STYLE;

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.hidden = true;

  // Steht direkt hinter der roten Meldung des Tools und sagt, was der Knopf
  // daneben ist. Ohne ihn steht dort eine nackte Zahl neben einer
  // Fehlermeldung — die man auch für einen zweiten Fehler halten könnte.
  const hinweis = document.createElement('span');
  hinweis.className = 'hinweis';
  hinweis.textContent = 'Korrekturvorschlag:';

  const uebernehmen = document.createElement('button');
  uebernehmen.type = 'button';
  uebernehmen.className = 'uebernehmen';

  const fehler = document.createElement('span');
  fehler.className = 'fehler';

  bar.append(hinweis, uebernehmen, fehler);
  shadow.append(style, bar);
  document.body.append(host);

  let field: HTMLInputElement | null = null;
  let frame = 0;

  /**
   * Anzeigen oder verschwinden — und wenn anzeigen, dann an der richtigen
   * Stelle.
   *
   * Ohne Vorschlag bleibt die Leiste weg. Das ist der Normalfall: solange ein
   * vierstelliges Jahr im Feld steht, gibt es nichts zu korrigieren. Nach einem
   * geglückten Klick tritt genau das ein, und die Leiste räumt sich damit von
   * selbst ab.
   */
  const refresh = (): void => {
    const current = field;
    if (current === null || !current.isConnected) return;

    const proposal = deps.read(current);
    if (proposal === null) {
      bar.hidden = true;
      return;
    }

    uebernehmen.textContent = proposal.text;
    uebernehmen.title = `${proposal.text} eintragen`;
    uebernehmen.setAttribute('aria-label', `Erstzulassung ${proposal.text} eintragen`);
    bar.hidden = false;

    const { top, left } = barPosition(deps.anchor(current) ?? current);
    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
  };

  /**
   * Gebündelt aufs nächste Einzelbild.
   *
   * Nicht nur, um Bildlauf und Größenänderung zu drosseln: Angular verarbeitet
   * die Eingabe **nach** unseren Zuhörern. Beim Verlassen des Feldes steht die
   * rote Meldung noch gar nicht da, an der die Leiste hängen soll — eine
   * Auswertung im selben Zug ergäbe die richtige Aufschrift an der falschen
   * Stelle.
   */
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  };

  const resizeObserver = new ResizeObserver(schedule);
  // Das Erscheinen und Verschwinden der Fehlermeldung ist eine Änderung am
  // Baum, keine an einer Größe — der eine Beobachter sieht nicht, was der
  // andere sieht.
  const mutationObserver = new MutationObserver(schedule);

  /**
   * Der Klickweg.
   *
   * Der Vorschlag wird hier **neu gelesen** statt aus der Aufschrift genommen.
   * Der `isTrusted`-Riegel wie überall: unser Schatten ist offen, und ein per
   * Skript ausgelöster Klick soll nichts in ein Prüffeld schreiben.
   */
  uebernehmen.addEventListener('click', (event: MouseEvent): void => {
    if (!event.isTrusted) {
      fehler.textContent = 'Nur per Klick möglich.';
      return;
    }
    const current = field;
    if (current === null || !current.isConnected) {
      fehler.textContent = 'Das Feld ist nicht mehr da.';
      return;
    }

    const proposal = deps.read(current);
    if (proposal === null) {
      fehler.textContent = 'Hier ist gerade nichts zu korrigieren.';
      return;
    }

    const result = deps.apply(current, proposal.text);
    fehler.textContent = result.ok ? '' : result.message;
    // Nach dem Eintrag hat sich der Inhalt geändert: entweder es gibt keinen
    // Vorschlag mehr, oder das Tool hat etwas anderes daraus gemacht.
    if (result.ok) schedule();
  });

  return {
    shadow,
    attach(next) {
      field = next;
      fehler.textContent = '';

      for (const type of FIELD_EVENTS) next.addEventListener(type, schedule);
      resizeObserver.observe(next);
      const container = next.closest('mat-form-field, .mat-mdc-form-field') ?? next.parentElement;
      if (container !== null) {
        resizeObserver.observe(container);
        mutationObserver.observe(container, { childList: true, subtree: true });
      }
      window.addEventListener('scroll', schedule, { capture: true, passive: true });
      window.addEventListener('resize', schedule, { passive: true });

      refresh();
    },
    detach() {
      if (field !== null) {
        for (const type of FIELD_EVENTS) field.removeEventListener(type, schedule);
      }
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      field = null;
      bar.hidden = true;
      fehler.textContent = '';
    },
    destroy() {
      this.detach();
      host.remove();
    },
  };
}
