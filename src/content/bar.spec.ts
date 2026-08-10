// @vitest-environment jsdom

/**
 * Die gemeinsame Messung der Knopfleisten.
 *
 * Sie stand schon einmal falsch: am Block-Element ausgerichtet landete die
 * Leiste weit rechts vom Text, bei offenem Dialog sogar außerhalb auf dem
 * Backdrop. Genau deshalb steht sie an *einer* Stelle — und genau deshalb
 * gehört sie geprüft.
 *
 * jsdom rechnet kein Layout: alle Rechtecke sind null. Beide Wege werden
 * deshalb mit gestellten Maßen geprüft — was hier zählt, ist die Wahl zwischen
 * Text und Kasten und die Rechnung darauf, nicht die Messung selbst.
 */

import { barPosition, textRect } from './bar';

function rect(box: { top: number; right: number; width: number; height: number }): DOMRect {
  return { ...box, bottom: box.top + box.height, left: box.right - box.width, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
}

/** Ein `mat-label` reicht bis zum Formularrand, sein Text endet viel früher. */
function labelWithText(text: { right: number; width: number }, box: { right: number; width: number }): Element {
  const element = document.createElement('div');
  element.textContent = 'Beschriftung';
  document.body.append(element);

  element.getBoundingClientRect = () => rect({ top: 100, height: 20, ...box });
  document.createRange = () =>
    ({
      selectNodeContents: () => {},
      getBoundingClientRect: () => rect({ top: 100, height: 16, ...text }),
    }) as unknown as Range;

  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('textRect', () => {
  it('misst den Text, nicht den Kasten', () => {
    const element = labelWithText({ right: 300, width: 120 }, { right: 900, width: 720 });

    expect(textRect(element).right).toBe(300);
  });

  /** Ohne Layout gibt es kein Text-Rechteck — dann ist das Element die beste Auskunft. */
  it('fällt auf das Element zurück, wo der Text nicht messbar ist', () => {
    const element = document.createElement('div');
    document.body.append(element);
    element.getBoundingClientRect = () => rect({ top: 100, height: 20, right: 900, width: 720 });
    document.createRange = () =>
      ({
        selectNodeContents: () => {},
        getBoundingClientRect: () => rect({ top: 0, height: 0, right: 0, width: 0 }),
      }) as unknown as Range;

    expect(textRect(element).right).toBe(900);
  });
});

describe('barPosition', () => {
  it('setzt die Leiste rechts neben den Text, auf halbe Texthöhe', () => {
    const element = labelWithText({ right: 300, width: 120 }, { right: 900, width: 720 });

    // 100 + 16/2 = 108 senkrecht; 300 + 8 Abstand waagerecht.
    expect(barPosition(element)).toEqual({ top: 108, left: 308 });
  });

  it('rundet auf ganze Pixel', () => {
    const element = document.createElement('div');
    document.body.append(element);
    document.createRange = () =>
      ({
        selectNodeContents: () => {},
        getBoundingClientRect: () => rect({ top: 100.4, height: 15.3, right: 300.6, width: 120 }),
      }) as unknown as Range;

    expect(barPosition(element)).toEqual({ top: 108, left: 309 });
  });
});
