// @vitest-environment jsdom

import { EZ_DATE_HOST_ID, createEzDateOverlay } from './ez-date-overlay';
import type { EzDateOverlayHandle } from './ez-date-overlay';
import type { EzDateResult } from './ez-date';
import { proposeEzDate } from '../core/ez-date';

const HEUTE = new Date(2026, 7, 10);

interface Harness {
  overlay: EzDateOverlayHandle;
  field: HTMLInputElement;
  wrapper: HTMLElement;
  meldung: HTMLElement;
  applied: string[];
  result: EzDateResult;
  /** Der abgefangene Klick-Handler — jsdom kann kein vertrautes Ereignis erzeugen. */
  click: (event: { isTrusted: boolean }) => void;
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame ??= ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame ??= ((handle: number) => clearTimeout(handle)) as typeof cancelAnimationFrame;
});

let harness: Harness;

beforeEach(() => {
  document.body.replaceChildren();

  const wrapper = document.createElement('mat-form-field');
  const field = document.createElement('input');
  field.id = 'fahrzeug-erstzulassung';
  field.value = '25.12.0010';
  const meldung = document.createElement('mat-error');
  meldung.textContent = 'Eingabe muss nach dem 1.5.1893 sein.';
  wrapper.append(field, meldung);
  document.body.append(wrapper);

  const applied: string[] = [];
  const state = { result: { ok: true } as EzDateResult };

  const original = EventTarget.prototype.addEventListener;
  const seen: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }[] = [];
  EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, options) {
    if (listener !== null) seen.push({ target: this, type, listener });
    return original.call(this, type, listener, options);
  };

  let overlay: EzDateOverlayHandle;
  try {
    overlay = createEzDateOverlay({
      // Immer frisch aus dem Feld — so kann der Test den Inhalt zwischendurch ändern.
      read: (target) => proposeEzDate(target.value, HEUTE),
      apply: (target, text) => {
        applied.push(text);
        if (state.result.ok) target.value = text;
        return state.result;
      },
      anchor: () => document.querySelector('mat-error'),
    });
  } finally {
    EventTarget.prototype.addEventListener = original;
  }

  harness = {
    overlay,
    field,
    wrapper,
    meldung,
    applied,
    click: (() => {
      const found = seen.find(
        (entry) =>
          entry.type === 'click' && entry.target instanceof HTMLElement && entry.target.classList.contains('uebernehmen'),
      );
      if (found === undefined || typeof found.listener !== 'function') {
        throw new Error('Klick-Handler nicht gefunden');
      }
      return found.listener as unknown as (event: { isTrusted: boolean }) => void;
    })(),
    get result(): EzDateResult {
      return state.result;
    },
    set result(next: EzDateResult) {
      state.result = next;
    },
  };
});

afterEach(() => {
  harness.overlay.destroy();
});

const shadow = (): ShadowRoot => harness.overlay.shadow;
const query = <T extends Element>(selector: string): T => {
  const node = shadow().querySelector<T>(selector);
  if (node === null) throw new Error(`nicht gefunden: ${selector}`);
  return node;
};
const bar = (): HTMLElement => query<HTMLElement>('.bar');
const knopf = (): HTMLButtonElement => query<HTMLButtonElement>('.uebernehmen');

/**
 * Wartet die gebündelte Auswertung ab.
 *
 * Zwei Einzelbilder, nicht eines: die Leiste meldet sich erst aus dem Microtask
 * des Beobachters zum Einzelbild an — also **nach** diesem Warten und damit
 * hinter ihm in derselben Liste. Ein einzelnes Warten liefe ihr davon und der
 * Test prüfte den Zustand von vorher.
 */
const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
};

describe('Wirt und Schatten', () => {
  it('hängt genau einen eigenen Wirt an body', () => {
    expect(document.querySelectorAll(`#${EZ_DATE_HOST_ID}`)).toHaveLength(1);
  });

  it('bleibt versteckt, solange kein Feld verbunden ist', () => {
    expect(bar().hidden).toBe(true);
  });
});

describe('wann der Knopf erscheint', () => {
  it('zeigt den Vorschlag, wenn ein zweistelliges Jahr im Feld steht', () => {
    harness.overlay.attach(harness.field);

    expect(bar().hidden).toBe(false);
    expect(knopf().textContent).toBe('25.12.2010');
  });

  it('bleibt weg, wo das Jahr vierstellig ist — der Normalfall', () => {
    harness.field.value = '25.12.2010';

    harness.overlay.attach(harness.field);

    expect(bar().hidden).toBe(true);
  });

  it('bleibt weg bei einem Datum, das es nicht gibt', () => {
    harness.field.value = '29.02.21';

    harness.overlay.attach(harness.field);

    expect(bar().hidden).toBe(true);
  });

  it('sagt an, was der Knopf daneben ist', () => {
    harness.overlay.attach(harness.field);

    // Eine nackte Zahl neben einer roten Meldung liest sich wie ein zweiter
    // Fehler, nicht wie ein Angebot.
    expect(query('.hinweis').textContent).toBe('Korrekturvorschlag:');
  });

  it('nennt im Titel, was der Knopf tatsächlich einträgt', () => {
    harness.overlay.attach(harness.field);

    expect(knopf().title).toBe('25.12.2010 eintragen');
    expect(knopf().getAttribute('aria-label')).toBe('Erstzulassung 25.12.2010 eintragen');
  });

  it('versteckt sich beim Abmelden wieder', () => {
    harness.overlay.attach(harness.field);
    harness.overlay.detach();

    expect(bar().hidden).toBe(true);
  });
});

/**
 * Der Unterschied zur Kilometerstand-Leiste: hier bleibt das Element dasselbe
 * und nur sein Inhalt ändert sich. `watchField` sieht das nicht.
 */
describe('auf Änderungen im Feld reagieren', () => {
  it('taucht auf, sobald der Inhalt einen Vorschlag hergibt', async () => {
    harness.field.value = '';
    harness.overlay.attach(harness.field);
    expect(bar().hidden).toBe(true);

    harness.field.value = '25.12.10';
    harness.field.dispatchEvent(new Event('change'));
    await tick();

    expect(bar().hidden).toBe(false);
    expect(knopf().textContent).toBe('25.12.2010');
  });

  it('verschwindet wieder, wenn der Prüfer das Jahr selbst ausschreibt', async () => {
    harness.overlay.attach(harness.field);
    expect(bar().hidden).toBe(false);

    harness.field.value = '25.12.2010';
    harness.field.dispatchEvent(new Event('blur'));
    await tick();

    expect(bar().hidden).toBe(true);
  });

  it('hört auch nach dem Abmelden nicht mehr am Feld mit', async () => {
    harness.overlay.attach(harness.field);
    harness.overlay.detach();

    harness.field.value = '25.12.10';
    harness.field.dispatchEvent(new Event('change'));
    await tick();

    expect(bar().hidden).toBe(true);
  });

  it('bemerkt die Meldung, die erst nach dem Verlassen des Feldes erscheint', async () => {
    harness.meldung.remove();
    harness.field.value = '';
    harness.overlay.attach(harness.field);
    expect(bar().hidden).toBe(true);

    // Nur eine Änderung am Baum, kein Ereignis am Feld: sähe die Leiste allein
    // auf `change` und `blur`, bliebe sie hier weg.
    harness.field.value = '25.12.10';
    harness.wrapper.append(harness.meldung);
    await tick();

    expect(bar().hidden).toBe(false);
    expect(knopf().textContent).toBe('25.12.2010');
  });
});

describe('Ausrichtung am Text der Meldung', () => {
  const originalCreateRange = document.createRange;
  afterEach(() => {
    document.createRange = originalCreateRange;
  });

  it('hängt den Knopf an das Ende des Meldungstextes, nicht an das Ende des Elements', () => {
    harness.meldung.getBoundingClientRect = () => ({ top: 250, height: 16, right: 520, width: 520 }) as DOMRect;
    document.createRange = () =>
      ({
        selectNodeContents: () => undefined,
        getBoundingClientRect: () => ({ top: 250, height: 16, right: 232, width: 232 }) as DOMRect,
      }) as unknown as Range;

    harness.overlay.attach(harness.field);

    expect(bar().style.left).toBe('240px');
    expect(bar().style.top).toBe('258px');
  });
});

describe('Eintragen', () => {
  it('trägt den Vorschlag ein', () => {
    harness.overlay.attach(harness.field);

    harness.click({ isTrusted: true });

    expect(harness.applied).toEqual(['25.12.2010']);
  });

  it('liest den Vorschlag beim Klick neu — die Aufschrift ist nur Anzeige', () => {
    harness.overlay.attach(harness.field);
    expect(knopf().textContent).toBe('25.12.2010');

    // Zwischen Anzeigen und Klicken hat der Prüfer etwas anderes getippt.
    harness.field.value = '01.06.95';
    harness.click({ isTrusted: true });

    expect(harness.applied).toEqual(['01.06.1995']);
  });

  it('schreibt nichts bei einem synthetischen Klick', () => {
    harness.overlay.attach(harness.field);

    harness.click({ isTrusted: false });

    expect(harness.applied).toEqual([]);
    expect(query('.fehler').textContent).toBe('Nur per Klick möglich.');
  });

  it('schreibt nicht in ein Feld, das nicht mehr im Dokument hängt', () => {
    harness.overlay.attach(harness.field);
    harness.field.remove();

    harness.click({ isTrusted: true });

    expect(harness.applied).toEqual([]);
    expect(query('.fehler').textContent).toBe('Das Feld ist nicht mehr da.');
  });

  it('meldet einen verschwundenen Vorschlag, statt irgendetwas einzutragen', () => {
    harness.overlay.attach(harness.field);
    harness.field.value = '25.12.2010';

    harness.click({ isTrusted: true });

    expect(harness.applied).toEqual([]);
    expect(query('.fehler').textContent).toBe('Hier ist gerade nichts zu korrigieren.');
  });

  it('zeigt die Meldung eines gescheiterten Eintrags', () => {
    harness.result = { ok: false, message: 'Das Feld ist gesperrt.' };
    harness.overlay.attach(harness.field);

    harness.click({ isTrusted: true });

    expect(query('.fehler').textContent).toBe('Das Feld ist gesperrt.');
  });

  it('räumt sich nach einem geglückten Eintrag selbst ab', async () => {
    harness.overlay.attach(harness.field);

    harness.click({ isTrusted: true });
    await tick();

    expect(query('.fehler').textContent).toBe('');
    // Der Wert steht jetzt vierstellig im Feld — es gibt nichts mehr anzubieten.
    expect(bar().hidden).toBe(true);
  });
});
