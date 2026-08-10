// @vitest-environment jsdom

import { HU_FAELLIG_FIELD_SELECTOR, createMonthStepper, stepFieldMonth } from './hu-faellig';

/** Das Feld so, wie das Tool es rendert — mit der Grenze aus dem Attribut. */
function makeField(value = '08.2026'): HTMLInputElement {
  const field = document.createElement('input');
  field.type = 'text';
  field.id = 'inspectmobility-zusaetzlicheangaben-hufaellig-textinput-input';
  field.setAttribute('min', '1952-01-01');
  field.value = value;
  document.body.append(field);
  return field;
}

interface FakeEvent {
  isTrusted: boolean;
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
  readonly defaultPrevented: boolean;
}

function fakeEvent(key: string, modifier: Partial<FakeEvent> = {}): FakeEvent {
  let prevented = false;
  return {
    isTrusted: true,
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifier,
    preventDefault: () => {
      prevented = true;
    },
    get defaultPrevented(): boolean {
      return prevented;
    },
  };
}

interface Tastatur {
  press: (key: string, modifier?: Partial<FakeEvent>) => FakeEvent;
  detach: () => void;
  entfernt: () => boolean;
}

/**
 * Meldet die Tastenbedienung an und fängt den Zuhörer dabei ab.
 *
 * Der Umweg ist nötig, weil jsdom `isTrusted` an einem selbst ausgelösten
 * Ereignis fest auf `false` verdrahtet — die Eigenschaft lässt sich nicht
 * überschreiben, und genau sie liest der Riegel. Derselbe Kniff wie in den
 * Overlay-Tests: der Zuhörer wird beim Anmelden eingesammelt und mit einem
 * gestellten Ereignis aufgerufen. Dass er tatsächlich am Feld hängt und wieder
 * abgeht, prüft `entfernt()` über den echten Weg.
 */
function anmelden(field: HTMLInputElement): Tastatur {
  const handle = createMonthStepper();
  // Als Liste, nicht als einzelne Bindung: eine Zuweisung aus einer Funktion
  // heraus verengt TypeScript sonst auf `never`.
  const angemeldete: ((event: FakeEvent) => void)[] = [];
  const entferntMit: unknown[] = [];

  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (this: EventTarget, type, candidate, options) {
    if (this === field && type === 'keydown' && typeof candidate === 'function') {
      angemeldete.push(candidate as unknown as (event: FakeEvent) => void);
    }
    return originalAdd.call(this, type, candidate, options);
  };
  EventTarget.prototype.removeEventListener = function (this: EventTarget, type, candidate, options) {
    if (this === field && type === 'keydown') entferntMit.push(candidate);
    return originalRemove.call(this, type, candidate, options);
  };

  try {
    handle.attach(field);
  } finally {
    EventTarget.prototype.addEventListener = originalAdd;
  }

  const angemeldet = angemeldete[0];
  if (angemeldet === undefined) throw new Error('kein keydown-Zuhörer am Feld angemeldet');

  return {
    press: (key, modifier) => {
      const event = fakeEvent(key, modifier);
      angemeldet(event);
      return event;
    },
    detach: () => {
      try {
        handle.detach();
      } finally {
        EventTarget.prototype.removeEventListener = originalRemove;
      }
    },
    entfernt: () => entferntMit.includes(angemeldet),
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('das Feld finden', () => {
  it('trifft das Feld „HU fällig"', () => {
    const field = makeField();
    expect(document.querySelector(HU_FAELLIG_FIELD_SELECTOR)).toBe(field);
  });
});

describe('stepFieldMonth', () => {
  it('schreibt den Nachbarmonat und meldet ihn dem Formular', () => {
    const field = makeField();
    const events: string[] = [];
    for (const type of ['input', 'blur']) field.addEventListener(type, () => events.push(type));

    expect(stepFieldMonth(field, -1)).toBe(true);

    expect(field.value).toBe('07.2026');
    // **Kein `blur`.** Der Prüfer steht im Feld und soll dort bleiben, sonst
    // ginge der zweite Sprung nicht mehr.
    expect(events).toEqual(['input']);
  });

  it('setzt den Cursor ans Ende, damit weitergetippt werden kann', () => {
    const field = makeField();

    stepFieldMonth(field, -1);

    expect(field.selectionStart).toBe('07.2026'.length);
  });

  it('befüllt ein leeres Feld nicht', () => {
    const field = makeField('');

    expect(stepFieldMonth(field, -1)).toBe(false);
    expect(field.value).toBe('');
  });

  it('hält sich an die Grenze aus dem min-Attribut', () => {
    const field = makeField('01.1952');

    expect(stepFieldMonth(field, -1)).toBe(false);
    expect(field.value).toBe('01.1952');
  });

  it.each([
    ['gesperrt', (field: HTMLInputElement) => (field.disabled = true)],
    ['schreibgeschützt', (field: HTMLInputElement) => (field.readOnly = true)],
  ])('rührt ein %s Feld nicht an', (_label, sabotage) => {
    const field = makeField();
    sabotage(field);

    expect(stepFieldMonth(field, -1)).toBe(false);
    expect(field.value).toBe('08.2026');
  });

  it('meldet einen Fehlschlag, wenn das Formular den Wert zurückschreibt', () => {
    const field = makeField();
    field.addEventListener('input', () => {
      field.value = '08.2026';
    });

    expect(stepFieldMonth(field, -1)).toBe(false);
  });
});

describe('die Tastenbedienung', () => {
  it('springt mit der linken Pfeiltaste zurück', () => {
    const field = makeField();

    anmelden(field).press('ArrowLeft');

    expect(field.value).toBe('07.2026');
  });

  it('springt mit der rechten Pfeiltaste vor', () => {
    const field = makeField();

    anmelden(field).press('ArrowRight');

    expect(field.value).toBe('09.2026');
  });

  /** Der Fall aus der Ansage: dreimal drücken, dann steht Mai da. */
  it('summiert sich über mehrere Druckvorgänge', () => {
    const field = makeField();
    const tastatur = anmelden(field);

    tastatur.press('ArrowLeft');
    tastatur.press('ArrowLeft');
    tastatur.press('ArrowLeft');

    expect(field.value).toBe('05.2026');
  });

  it('hält den Schreibcursor an, wo tatsächlich gesprungen wurde', () => {
    const field = makeField();

    expect(anmelden(field).press('ArrowLeft').defaultPrevented).toBe(true);
  });

  it('lässt die Taste in Ruhe, wo nichts zu springen ist', () => {
    const field = makeField('');

    // Sonst stünde der Cursor still, obwohl gar nichts passiert ist.
    expect(anmelden(field).press('ArrowLeft').defaultPrevented).toBe(false);
  });

  it('lässt andere Tasten durch', () => {
    const field = makeField();
    const tastatur = anmelden(field);

    tastatur.press('ArrowUp');
    tastatur.press('Backspace');

    expect(field.value).toBe('08.2026');
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)(
    'lässt die Pfeiltaste mit %s in Ruhe',
    (modifier) => {
      const field = makeField();

      // Wortweise springen und Markieren bleiben, wie sie sind.
      anmelden(field).press('ArrowLeft', { [modifier]: true });

      expect(field.value).toBe('08.2026');
    },
  );

  it('schreibt nichts bei einem synthetischen Tastendruck', () => {
    const field = makeField();

    anmelden(field).press('ArrowLeft', { isTrusted: false });

    expect(field.value).toBe('08.2026');
  });

  it('hört nach dem Abmelden nicht mehr zu', () => {
    const field = makeField();
    const tastatur = anmelden(field);
    tastatur.detach();

    tastatur.press('ArrowLeft');

    expect(field.value).toBe('08.2026');
    // Und der Zuhörer hängt auch nicht mehr am Feld.
    expect(tastatur.entfernt()).toBe(true);
  });
});
