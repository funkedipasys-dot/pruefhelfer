// @vitest-environment jsdom

import { MILEAGE_HOST_ID, createMileageOverlay } from './mileage-overlay';
import type { MileageOverlayHandle } from './mileage-overlay';
import type { MileageResult } from './mileage';

interface Harness {
  overlay: MileageOverlayHandle;
  field: HTMLInputElement;
  label: HTMLElement;
  applied: number[];
  result: MileageResult;
  /** Die abgefangenen Klick-Handler — jsdom kann kein vertrautes Ereignis erzeugen. */
  click: (className: string) => (event: { isTrusted: boolean }) => void;
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
  const field = document.createElement('input');
  field.type = 'text';
  const label = document.createElement('span');
  label.className = 'laufleistung-alt';
  label.textContent = '184731 - alter Stand';
  document.body.append(field, label);

  const applied: number[] = [];
  const state = { result: { ok: true } as MileageResult };

  const original = EventTarget.prototype.addEventListener;
  const seen: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }[] = [];
  EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, options) {
    if (listener !== null) seen.push({ target: this, type, listener });
    return original.call(this, type, listener, options);
  };

  let overlay: MileageOverlayHandle;
  try {
    overlay = createMileageOverlay({
      // Immer frisch aus der Beschriftung — so kann der Test sie zwischendurch ändern.
      read: () => {
        const text = document.querySelector('.laufleistung-alt')?.textContent ?? '';
        const digits = /\d+/.exec(text);
        return digits === null ? null : Number(digits[0]);
      },
      apply: (_field, value) => {
        applied.push(value);
        return state.result;
      },
      anchor: () => document.querySelector('.laufleistung-alt'),
    });
  } finally {
    EventTarget.prototype.addEventListener = original;
  }

  harness = {
    overlay,
    field,
    label,
    applied,
    click: (className) => {
      const found = seen.find(
        (entry) =>
          entry.type === 'click' && entry.target instanceof HTMLElement && entry.target.classList.contains(className),
      );
      if (found === undefined || typeof found.listener !== 'function') {
        throw new Error(`Klick-Handler für .${className} nicht gefunden`);
      }
      return found.listener as unknown as (event: { isTrusted: boolean }) => void;
    },
    get result(): MileageResult {
      return state.result;
    },
    set result(next: MileageResult) {
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
const buttons = (): HTMLButtonElement[] => [...shadow().querySelectorAll<HTMLButtonElement>('button')];

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
    const hosts = document.querySelectorAll(`#${MILEAGE_HOST_ID}`);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.parentElement).toBe(document.body);
  });

  it('bleibt versteckt, solange kein Feld verbunden ist', () => {
    expect(query<HTMLElement>('.bar').hidden).toBe(true);
  });
});

describe('Anzeige (Plan-Punkt 68)', () => {
  it('beschriftet die Knöpfe mit dem alten Stand und den Aufschlägen', () => {
    harness.overlay.attach(harness.field);

    expect(query<HTMLElement>('.bar').hidden).toBe(false);
    expect(buttons().map((button) => button.textContent)).toEqual(['184731', '+2', '+5']);
  });

  it('nennt im Titel die Zahl, die der Knopf tatsächlich einträgt', () => {
    harness.overlay.attach(harness.field);

    expect(buttons().map((button) => button.title)).toEqual([
      '184731 eintragen',
      '184733 eintragen',
      '184736 eintragen',
    ]);
  });

  it('bleibt weg, wo kein alter Stand ausgewiesen ist', () => {
    harness.label.remove();

    harness.overlay.attach(harness.field);

    expect(query<HTMLElement>('.bar').hidden).toBe(true);
  });

  it('versteckt sich beim Abmelden wieder', () => {
    harness.overlay.attach(harness.field);

    harness.overlay.detach();

    expect(query<HTMLElement>('.bar').hidden).toBe(true);
  });
});

/**
 * Der Befund aus der Abnahme vom 10.08.2026: bei einer Nachkontrolle stand die
 * Leiste nicht da, obwohl „(Stand Kopiervorlage: 184731)" zu lesen war.
 *
 * Das Feld und die Beschriftung entstehen nicht zusammen. Bei einer
 * Nachkontrolle ist das Formular sofort da und der Stand aus der Kopiervorlage
 * wird nachgeladen. Gemessen wurde aber nur beim Verbinden — und `watchField`
 * meldet nichts Neues, wenn bloß die Umgebung eines gleich gebliebenen Feldes
 * sich ändert. Die Leiste blieb deshalb für immer bei ihrem ersten Befund.
 */
describe('nachgeladener alter Stand', () => {
  it('taucht auf, wenn die Beschriftung erst nach dem Verbinden erscheint', async () => {
    harness.label.remove();
    harness.overlay.attach(harness.field);
    expect(query<HTMLElement>('.bar').hidden).toBe(true);

    document.body.append(harness.label);
    await tick();

    expect(query<HTMLElement>('.bar').hidden).toBe(false);
    expect(buttons()[0]?.textContent).toBe('184731');
  });

  it('taucht auf, wenn die Zahl in eine leere Beschriftung nachgetragen wird', async () => {
    // Angular tauscht hier kein Element aus, sondern nur den Text darin — eine
    // Änderung, die ein reiner childList-Beobachter nicht sieht.
    harness.label.textContent = '';
    harness.overlay.attach(harness.field);
    expect(query<HTMLElement>('.bar').hidden).toBe(true);

    harness.label.textContent = '(Stand Kopiervorlage: 184731)';
    await tick();

    expect(query<HTMLElement>('.bar').hidden).toBe(false);
    expect(buttons()[0]?.textContent).toBe('184731');
  });

  it('zieht die Aufschrift nach, wenn sich der Stand nachträglich ändert', async () => {
    harness.overlay.attach(harness.field);
    expect(buttons()[0]?.textContent).toBe('184731');

    harness.label.textContent = '190000 - alter Stand';
    await tick();

    expect(buttons().map((button) => button.textContent)).toEqual(['190000', '+2', '+5']);
    expect(buttons()[1]?.title).toBe('190002 eintragen');
  });

  it('verschwindet wieder, wenn die Beschriftung eingezogen wird', async () => {
    harness.overlay.attach(harness.field);
    expect(query<HTMLElement>('.bar').hidden).toBe(false);

    harness.label.remove();
    await tick();

    expect(query<HTMLElement>('.bar').hidden).toBe(true);
  });

  it('hört nach dem Abmelden nicht mehr auf die Umgebung', async () => {
    harness.label.remove();
    harness.overlay.attach(harness.field);
    harness.overlay.detach();

    document.body.append(harness.label);
    await tick();

    expect(query<HTMLElement>('.bar').hidden).toBe(true);
  });
});

/**
 * Der Fehler aus der Abnahme vom 2026-08-10 (Plan-Punkt 74): `mat-label` ist
 * ein Block-Element und so breit wie der Dialog. An seinem rechten Rand
 * ausgerichtet landete die Leiste **neben** dem Dialog auf dem Backdrop.
 */
describe('Ausrichtung am Text, nicht am Kasten', () => {
  const originalCreateRange = document.createRange;
  afterEach(() => {
    document.createRange = originalCreateRange;
  });

  const stubRects = (textRight: number, elementRight: number): void => {
    harness.label.getBoundingClientRect = () =>
      ({ top: 400, height: 17, right: elementRight, width: elementRight }) as DOMRect;
    document.createRange = () =>
      ({
        selectNodeContents: () => undefined,
        getBoundingClientRect: () => ({ top: 400, height: 17, right: textRight, width: textRight }) as DOMRect,
      }) as unknown as Range;
  };

  it('hängt die Leiste an das Ende des Textes, nicht an das Ende des Elements', () => {
    stubRects(450, 785);

    harness.overlay.attach(harness.field);

    expect(query<HTMLElement>('.bar').style.left).toBe('458px');
  });

  it('fällt auf das Element zurück, wenn sich der Text nicht messen lässt', () => {
    harness.label.getBoundingClientRect = () =>
      ({ top: 400, height: 17, right: 785, width: 785 }) as DOMRect;
    document.createRange = () =>
      ({
        selectNodeContents: () => undefined,
        getBoundingClientRect: () => ({ top: 0, height: 0, right: 0, width: 0 }) as DOMRect,
      }) as unknown as Range;

    harness.overlay.attach(harness.field);

    expect(query<HTMLElement>('.bar').style.left).toBe('793px');
  });

  it('setzt die Leiste auf die Mitte der Textzeile', () => {
    stubRects(450, 785);

    harness.overlay.attach(harness.field);

    // 400 + 17/2, gerundet.
    expect(query<HTMLElement>('.bar').style.top).toBe('409px');
  });
});

describe('Eintragen (Plan-Punkt 67)', () => {
  it('trägt den alten Stand unverändert ein', () => {
    harness.overlay.attach(harness.field);

    harness.click('uebernehmen')({ isTrusted: true });

    expect(harness.applied).toEqual([184731]);
  });

  it('rechnet die Aufschläge auf', () => {
    harness.overlay.attach(harness.field);
    const [, plusZwei, plusFuenf] = buttons();

    plusZwei?.dispatchEvent(new MouseEvent('click'));
    plusFuenf?.dispatchEvent(new MouseEvent('click'));

    // Synthetisch — der Riegel greift, nichts wurde geschrieben.
    expect(harness.applied).toEqual([]);

    harness.click('offset')({ isTrusted: true });

    expect(harness.applied).toEqual([184733]);
  });

  it('liest den alten Stand beim Klick neu — die Aufschrift ist nur Anzeige', () => {
    harness.overlay.attach(harness.field);
    expect(buttons()[0]?.textContent).toBe('184731');

    // Die Anwendung tauscht die Beschriftung aus, während die Leiste steht.
    harness.label.textContent = '190000 - alter Stand';
    harness.click('uebernehmen')({ isTrusted: true });

    expect(harness.applied).toEqual([190000]);
    // Und die Aufschrift zieht nach dem Eintragen nach.
    expect(buttons()[0]?.textContent).toBe('190000');
  });

  it('schreibt nichts bei einem synthetischen Klick', () => {
    harness.overlay.attach(harness.field);

    query<HTMLButtonElement>('.uebernehmen').click();

    expect(harness.applied).toEqual([]);
    expect(query<HTMLElement>('.fehler').textContent).toBe('Nur per Klick möglich.');
  });

  it('zeigt die Meldung eines gescheiterten Eintrags', () => {
    harness.overlay.attach(harness.field);
    harness.result = { ok: false, message: 'Das Produktionstool hat die Eingabe verworfen.' };

    harness.click('uebernehmen')({ isTrusted: true });

    expect(query<HTMLElement>('.fehler').textContent).toBe('Das Produktionstool hat die Eingabe verworfen.');
  });

  it('räumt die Meldung nach einem geglückten Eintrag wieder ab', () => {
    harness.overlay.attach(harness.field);
    harness.result = { ok: false, message: 'Fehlgeschlagen.' };
    harness.click('uebernehmen')({ isTrusted: true });

    harness.result = { ok: true };
    harness.click('uebernehmen')({ isTrusted: true });

    expect(query<HTMLElement>('.fehler').textContent).toBe('');
  });

  it('schreibt nicht in ein Feld, das nicht mehr im Dokument hängt', () => {
    harness.overlay.attach(harness.field);
    harness.field.remove();

    harness.click('uebernehmen')({ isTrusted: true });

    expect(harness.applied).toEqual([]);
    expect(query<HTMLElement>('.fehler').textContent).toContain('nicht mehr da');
  });

  it('meldet einen verschwundenen alten Stand, statt irgendetwas einzutragen', () => {
    harness.overlay.attach(harness.field);
    harness.label.remove();

    harness.click('uebernehmen')({ isTrusted: true });

    expect(harness.applied).toEqual([]);
    expect(query<HTMLElement>('.fehler').textContent).toContain('Kein alter Stand');
  });
});
