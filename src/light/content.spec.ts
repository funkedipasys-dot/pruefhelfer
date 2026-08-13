// @vitest-environment jsdom

/**
 * Was passiert, wenn das Content-Script ein zweites Mal eingespeist wird.
 *
 * Der Fall ist nicht exotisch, er ist der Regelfall beim Ausrollen: der Prüfer
 * lädt die neue Fassung, die GTÜ-Seite bleibt offen. Bis 0.6.1 räumte `start()`
 * dabei nur die vier Wirte per Bezeichner ab — alles, was am *Formular* hängt,
 * blieb. Der Monatsschritt an „HU fällig" hat gar keinen Wirt, nur einen
 * Zuhörer am Feld: eine Pfeiltaste sprang danach zwei Monate statt einen.
 *
 * Lautlos, in einem Feld des Prüfberichts — deshalb steht der Test hier und
 * nicht bei den Beobachtern.
 */

import { HU_FAELLIG_FIELD_SELECTOR } from '../content/hu-faellig';
import { BADGE_HOST_ID } from '../content/badge';
import { FSD_AUTO_HOST_ID } from '../content/fsd-auto';
import { OVERLAY_HOST_ID } from '../content/overlay';

/** Was die Zuhörer am Feld von einem echten Tastendruck sehen. */
interface FakeKeydown {
  isTrusted: boolean;
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
}

/**
 * jsdom kann `isTrusted` nicht setzen — die Eigenschaft ist an jeder
 * Ereignis-Instanz nicht überschreibbar. Für diesen Test zählt aber gerade der
 * *vertraute* Fall, also werden die Zuhörer beim Anmelden abgefangen und
 * unmittelbar gerufen. Dass der Riegel überhaupt greift, prüft
 * `hu-faellig.spec.ts` über den vollen DOM-Weg.
 *
 * Abgemeldete Zuhörer fallen wieder heraus: genau das ist die Eigenschaft, um
 * die es geht.
 */
function captureKeydownListeners(target: EventTarget): {
  listeners: () => ((event: FakeKeydown) => void)[];
  restore: () => void;
} {
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const active = new Set<(event: FakeKeydown) => void>();

  EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, options) {
    if (this === target && type === 'keydown' && typeof listener === 'function') {
      active.add(listener as unknown as (event: FakeKeydown) => void);
    }
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (this: EventTarget, type, listener, options) {
    if (this === target && type === 'keydown' && typeof listener === 'function') {
      active.delete(listener as unknown as (event: FakeKeydown) => void);
    }
    return remove.call(this, type, listener, options);
  };

  return {
    listeners: () => [...active],
    restore: () => {
      EventTarget.prototype.addEventListener = add;
      EventTarget.prototype.removeEventListener = remove;
    },
  };
}

function arrowLeft(): FakeKeydown {
  return {
    isTrusted: true,
    key: 'ArrowLeft',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: () => {},
  };
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

let field: HTMLInputElement;

beforeEach(() => {
  document.body.replaceChildren();
  delete (window as unknown as Record<string, unknown>)['__pruefhelferTeardown'];

  field = document.createElement('input');
  field.id = HU_FAELLIG_FIELD_SELECTOR.slice(1);
  field.value = '08.2026';
  document.body.append(field);
});

/**
 * Im Browser endet die letzte Instanz mit der Seite. jsdom räumt seine Globals
 * dagegen weg, während ihre Beobachter noch feuern — deshalb hier von Hand.
 * Dass das überhaupt geht, ist genau die Eigenschaft, um die es unten geht.
 */
afterEach(() => {
  (window as unknown as { __pruefhelferTeardown?: () => void }).__pruefhelferTeardown?.();
});

/** Eine Einspeisung des Content-Scripts, wie Chrome sie ausführt. */
async function inject(): Promise<void> {
  vi.resetModules();
  await import('./content');
}

describe('Erneute Einspeisung (Extension-Reload bei offener Seite)', () => {
  it('lässt eine Pfeiltaste auch nach der zweiten Einspeisung nur einen Monat springen', async () => {
    const captured = captureKeydownListeners(field);
    try {
      await inject();
      await inject();

      for (const listener of captured.listeners()) listener.call(field, arrowLeft());
    } finally {
      captured.restore();
    }

    expect(field.value).toBe('07.2026');
  });

  it('meldet den Zuhörer der Vorgängerin am Feld ab', async () => {
    const captured = captureKeydownListeners(field);
    try {
      await inject();
      expect(captured.listeners()).toHaveLength(1);

      await inject();

      expect(captured.listeners()).toHaveLength(1);
    } finally {
      captured.restore();
    }
  });

  it('hinterlässt jeden Wirt genau einmal', async () => {
    await inject();
    await inject();
    await inject();

    for (const id of [OVERLAY_HOST_ID, FSD_AUTO_HOST_ID]) {
      expect(document.querySelectorAll(`#${id}`), id).toHaveLength(1);
    }
  });

  /**
   * Der Wechsel vom Badge zur Leiste (2026-08-13) betrifft nicht nur den
   * Neubau: auf einer offenen Seite hängt noch das Badge der Vorgängerin. Ohne
   * das Abräumen stünden beide übereinander — und weil diese Fassung
   * `createBadge()` gar nicht mehr ruft, fiele es keinem anderen Test auf.
   */
  it('räumt das Badge einer Vorgängerin ab', async () => {
    const alt = document.createElement('div');
    alt.id = BADGE_HOST_ID;
    document.body.append(alt);

    await inject();

    expect(document.querySelectorAll(`#${BADGE_HOST_ID}`)).toHaveLength(0);
  });

  it('hinterlegt den Griff, an dem die nächste Einspeisung abräumt', async () => {
    await inject();

    expect(typeof (window as unknown as Record<string, unknown>)['__pruefhelferTeardown']).toBe('function');
  });
});
