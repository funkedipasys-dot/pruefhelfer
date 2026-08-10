import { TEXTBAUSTEIN_TARGET_MAX_LENGTH } from './placeholders';
import { INSERTION_SEPARATOR, buildInsertion, effectiveLimit } from './insertion';

describe('effectiveLimit', () => {
  it('nimmt bei leerem Feld das volle maxLength', () => {
    expect(effectiveLimit(500, 0)).toBe(500);
  });

  it('zieht vorhandenen Text UND den Trenner ab', () => {
    // maxLength gilt für den gesamten Feldinhalt. Ohne diesen Abzug würde der
    // Baustein am Ende stillschweigend abgeschnitten.
    expect(effectiveLimit(500, 100)).toBe(500 - 100 - INSERTION_SEPARATOR.length);
  });

  it.each([-1, 0, Number.NaN, 1.5])('fällt bei maxLength=%s auf die 500 des GTÜ-Feldes zurück', (maxLength) => {
    expect(effectiveLimit(maxLength, 0)).toBe(TEXTBAUSTEIN_TARGET_MAX_LENGTH);
  });

  it('wird negativ, wenn das Feld schon voll ist — die Meldung nennt dann die zu befreienden Zeichen', () => {
    expect(effectiveLimit(500, 500)).toBe(-1);
  });
});

describe('buildInsertion', () => {
  const text = 'Bremsbelag vorne bei {{km}} km erneuern.';

  it('setzt die Werte ein und liefert Abschnitt und künftigen Feldinhalt', () => {
    const result = buildInsertion({ existing: '', limit: 500, text, values: { km: '120000' } });

    expect(result).toEqual({
      ok: true,
      snippet: 'Bremsbelag vorne bei 120000 km erneuern.',
      nextValue: 'Bremsbelag vorne bei 120000 km erneuern.',
    });
  });

  it('hängt an vorhandenen Text mit Zeilenumbruch an', () => {
    const result = buildInsertion({ existing: 'Vorbefund.', limit: 500, text, values: { km: '1' } });

    expect(result).toMatchObject({ ok: true, nextValue: 'Vorbefund.\nBremsbelag vorne bei 1 km erneuern.' });
  });

  it('setzt bei leerem Feld KEINEN führenden Umbruch', () => {
    const result = buildInsertion({ existing: '', limit: 500, text: 'Kurz.', values: {} });
    expect(result).toMatchObject({ ok: true, nextValue: 'Kurz.' });
  });

  it('blockiert einen leeren Platzhalterwert', () => {
    const result = buildInsertion({ existing: '', limit: 500, text, values: { km: '   ' } });
    expect(result).toEqual({ ok: false, reason: 'missing_values', names: ['km'] });
  });

  it('misst erst NACH dem Einsetzen', () => {
    // Der Rohtext ist 9 Zeichen lang und passt; erst der Wert sprengt das Limit.
    const result = buildInsertion({ existing: '', limit: 10, text: 'ab{{x}}cd', values: { x: 'zu-lang-weil-lang' } });

    expect(result).toMatchObject({ reason: 'too_long', excess: 21 - 10 });
  });

  it('gibt bei „zu lang" nichts zurück, was sich einfügen ließe', () => {
    const result = buildInsertion({ existing: '', limit: 3, text: 'zu lang', values: {} });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('nextValue');
    expect(result).not.toHaveProperty('snippet');
  });
});
