// @vitest-environment jsdom

/**
 * Die Rückfallebene des Popups.
 *
 * Sie ist der einzige Weg an die Texte, wenn das Produktionstool umgebaut wurde
 * und kein Feld mehr erkannt wird — ohne sie wäre ein geänderter Selektor ein
 * Totalausfall. Ausgerechnet dieser Weg war bis 0.6.1 ungetestet.
 */

import { copyToClipboard } from './clipboard';
import { TEXTBAUSTEIN_TARGET_MAX_LENGTH } from '../core/placeholders';

let written: string[];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string): Promise<void> => {
        written.push(text);
      },
    },
  });
});

describe('copyToClipboard', () => {
  it('legt den Baustein in die Zwischenablage', async () => {
    const result = await copyToClipboard({ text: 'Fahrzeug ohne Beanstandung.' }, {});

    expect(result).toEqual({ ok: true });
    expect(written).toEqual(['Fahrzeug ohne Beanstandung.']);
  });

  it('setzt die Platzhalterwerte ein', async () => {
    const result = await copyToClipboard({ text: 'Bremsbelag bei {{km}} km erneuern.' }, { km: '184731' });

    expect(result).toEqual({ ok: true });
    expect(written).toEqual(['Bremsbelag bei 184731 km erneuern.']);
  });

  /** Derselbe Riegel wie beim Einfügen — sonst liefe der eine Weg dem anderen davon. */
  it('kopiert nichts, wenn ein Platzhalterwert fehlt', async () => {
    const result = await copyToClipboard({ text: 'Stand {{km}} km' }, { km: '   ' });

    expect(result).toMatchObject({ ok: false });
    expect(written).toEqual([]);
  });

  /**
   * Die Zwischenablage selbst hat keine Grenze — kopiert wird aber, um von Hand
   * ins Bemerkungsfeld einzusetzen. Was dort nicht hineinpasst, hier
   * durchzulassen hieße, den Prüfer den Text im Feld abgeschnitten wiederfinden
   * zu lassen.
   */
  it('lehnt ab, was nicht ins Bemerkungsfeld passen würde', async () => {
    const zuLang = 'x'.repeat(TEXTBAUSTEIN_TARGET_MAX_LENGTH + 1);

    const result = await copyToClipboard({ text: zuLang }, {});

    expect(result).toMatchObject({ ok: false });
    expect(written).toEqual([]);
  });

  it('lässt exakt die Grenze passieren', async () => {
    const genau = 'x'.repeat(TEXTBAUSTEIN_TARGET_MAX_LENGTH);

    const result = await copyToClipboard({ text: genau }, {});

    expect(result).toEqual({ ok: true });
    expect(written).toEqual([genau]);
  });

  /** Ohne Nutzeraktivierung verweigert Chrome den Zugriff — das ist kein Absturz. */
  it('meldet einen verweigerten Zugriff als Rat, von Hand zu übernehmen', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (): Promise<void> => {
          throw new Error('NotAllowedError');
        },
      },
    });

    const result = await copyToClipboard({ text: 'Fahrzeug ohne Beanstandung.' }, {});

    expect(result).toEqual({
      ok: false,
      message: 'Kopieren nicht möglich. Bitte den Text von Hand übernehmen.',
    });
  });
});
