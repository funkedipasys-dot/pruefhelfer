import {
  TEXTBAUSTEIN_TARGET_MAX_LENGTH,
  describePlaceholderIssue,
  describeSubstitutionFailure,
  parseTextbausteinText,
  substituteTextbaustein,
} from './placeholders';

/**
 * Der erste Block spiegelt `test/textbaustein-placeholder.util.spec.ts` aus dem
 * Backend Fall für Fall. Weicht die Extension hier ab, akzeptiert sie einen
 * Baustein, den das Backend beim Speichern abgelehnt hätte — oder umgekehrt.
 *
 * Der zweite Block deckt ab, was es im Backend nicht gibt: die Substitution und
 * die Prüfung gegen die Feldgrenze **nach** dem Einsetzen (Plan-Punkt 50).
 */
describe('parseTextbausteinText — Spiegel der Backend-Grammatik', () => {
  describe('gültige Grammatik', () => {
    it('erkennt einen einfachen Platzhalter', () => {
      const parsed = parseTextbausteinText('Kennzeichen {{kennzeichen}} geprüft.');

      expect(parsed.issues).toEqual([]);
      expect(parsed.names).toEqual(['kennzeichen']);
      expect(parsed.occurrences).toBe(1);
      expect(parsed.literalLength).toBe('Kennzeichen  geprüft.'.length);
      expect(parsed.minLength).toBe('Kennzeichen  geprüft.'.length + 1);
    });

    it('akzeptiert Text ganz ohne Platzhalter', () => {
      const parsed = parseTextbausteinText('Fahrzeug ohne Beanstandung.');

      expect(parsed.issues).toEqual([]);
      expect(parsed.names).toEqual([]);
      expect(parsed.occurrences).toBe(0);
      expect(parsed.minLength).toBe('Fahrzeug ohne Beanstandung.'.length);
    });

    it.each([
      ['a', '{{a}}'],
      ['a1', '{{a1}}'],
      ['mit_unterstrich', '{{mit_unterstrich}}'],
      ['a'.repeat(32), `{{${'a'.repeat(32)}}}`],
    ])('lässt den Namen %s zu', (name, text) => {
      const parsed = parseTextbausteinText(text);

      expect(parsed.issues).toEqual([]);
      expect(parsed.names).toEqual([name]);
    });

    it('behält die Reihenfolge des ersten Vorkommens und dedupliziert Namen', () => {
      const parsed = parseTextbausteinText('{{zwei}} {{eins}} {{zwei}}');

      expect(parsed.names).toEqual(['zwei', 'eins']);
      expect(parsed.occurrences).toBe(3);
    });

    it('erlaubt einzelne geschweifte Klammern als Literal', () => {
      const parsed = parseTextbausteinText('Wert {x} und } bleiben Text.');

      expect(parsed.issues).toEqual([]);
      expect(parsed.minLength).toBe('Wert {x} und } bleiben Text.'.length);
    });
  });

  describe('ungültige Grammatik — Fehler statt stillem Literaltext', () => {
    it.each([
      ['Leerzeichen innerhalb der Klammern', '{{ kennzeichen }}'],
      ['Großbuchstaben', '{{Kennzeichen}}'],
      ['führende Ziffer', '{{1kennzeichen}}'],
      ['Bindestrich', '{{kenn-zeichen}}'],
      ['leerer Name', '{{}}'],
      ['33 Zeichen', `{{${'a'.repeat(33)}}}`],
    ])('lehnt %s ab', (_label, text) => {
      const parsed = parseTextbausteinText(text);

      expect(parsed.issues.map((i) => i.kind)).toEqual(['invalid_name']);
      expect(parsed.names).toEqual([]);
    });

    it('meldet ein nicht geschlossenes {{ und bricht die Analyse dort ab', () => {
      const parsed = parseTextbausteinText('Anfang {{kennzeichen und Rest');

      expect(parsed.issues).toEqual([{ kind: 'unclosed', index: 7 }]);
    });

    it('meldet ein verwaistes }} außerhalb eines Platzhalters', () => {
      const parsed = parseTextbausteinText('Ende }} hier');

      expect(parsed.issues).toEqual([{ kind: 'stray_close', index: 5 }]);
    });

    it('meldet alle Verstöße auf einmal, nicht nur den ersten', () => {
      const parsed = parseTextbausteinText('{{Gross}} und {{kenn-zeichen}}');

      expect(parsed.issues).toHaveLength(2);
      expect(parsed.issues.every((i) => i.kind === 'invalid_name')).toBe(true);
    });

    it('behandelt eine verschachtelte Öffnung als ungültigen Namen', () => {
      const parsed = parseTextbausteinText('{{a{{b}}');

      expect(parsed.issues.map((i) => i.kind)).toEqual(['invalid_name']);
    });

    it('liefert für jeden Verstoß eine deutsche, verortete Meldung', () => {
      const parsed = parseTextbausteinText('{{ kennzeichen }}');

      const message = describePlaceholderIssue(parsed.issues[0]!);
      expect(message).toContain('kein gültiger Platzhalter');
      expect(message).toContain('Position 0');
    });
  });

  describe('Mindestlänge — je Vorkommen, nicht je eindeutigem Namen', () => {
    it('zählt denselben Platzhalter zehnmal als zehn Zeichen', () => {
      const parsed = parseTextbausteinText('{{mm}}'.repeat(10));

      expect(parsed.names).toEqual(['mm']);
      expect(parsed.occurrences).toBe(10);
      expect(parsed.literalLength).toBe(0);
      expect(parsed.minLength).toBe(10);
    });
  });
});

describe('substituteTextbaustein', () => {
  it('setzt einen Wert ein', () => {
    const result = substituteTextbaustein('Kennzeichen {{kennzeichen}} geprüft.', {
      kennzeichen: 'AB-CD 123',
    });

    expect(result).toEqual({ ok: true, text: 'Kennzeichen AB-CD 123 geprüft.' });
  });

  it('setzt einen mehrfach vorkommenden Namen überall ein, obwohl er nur einmal abgefragt wird', () => {
    const result = substituteTextbaustein('{{mm}}/{{mm}}/{{mm}}', { mm: '07' });

    expect(result).toEqual({ ok: true, text: '07/07/07' });
  });

  it('kommt ohne Platzhalter aus', () => {
    const result = substituteTextbaustein('Fahrzeug ohne Beanstandung.', {});

    expect(result).toEqual({ ok: true, text: 'Fahrzeug ohne Beanstandung.' });
  });

  it('verweigert die Substitution, wenn der Bausteintext selbst ungültig ist', () => {
    const result = substituteTextbaustein('{{Gross}}', { Gross: 'egal' });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'invalid_text' });
  });

  it('blockiert bei fehlendem Wert', () => {
    const result = substituteTextbaustein('{{a}} und {{b}}', { a: 'x' });

    expect(result).toEqual({ ok: false, reason: 'missing_values', names: ['b'] });
  });

  it('behandelt einen Wert aus reinem Leerraum als fehlend', () => {
    // Sähe im Feld aus wie eine vergessene Eingabe.
    const result = substituteTextbaustein('{{a}}', { a: '   ' });

    expect(result).toEqual({ ok: false, reason: 'missing_values', names: ['a'] });
  });

  it('setzt den Wert ohne umgebenden Leerraum ein', () => {
    // Gemessen wird an der getrimmten Fassung — eingesetzt gehört dieselbe,
    // sonst stünde der Leerraum im Prüfvermerk und zählte gegen die Grenze.
    const result = substituteTextbaustein('Stand {{km}} km', { km: '  184731  ' });

    expect(result).toEqual({ ok: true, text: 'Stand 184731 km' });
  });

  it('rechnet die Länge an der getrimmten Fassung', () => {
    // Ungetrimmt wären es 12 Zeichen und der Baustein passte nicht.
    const result = substituteTextbaustein('{{a}}', { a: '    xx    ' }, 2);

    expect(result).toEqual({ ok: true, text: 'xx' });
  });

  it('prüft die Länge erst NACH dem Einsetzen', () => {
    // Der Rohtext ist mit 9 Zeichen kurz; erst der Wert sprengt die Grenze.
    const result = substituteTextbaustein('{{a}}', { a: 'x'.repeat(20) }, 10);

    expect(result).toEqual({ ok: false, reason: 'too_long', length: 20, limit: 10, excess: 10 });
  });

  it('lässt exakt die Grenze passieren', () => {
    const result = substituteTextbaustein('{{a}}', { a: 'x'.repeat(10) }, 10);

    expect(result).toEqual({ ok: true, text: 'x'.repeat(10) });
  });

  it('nutzt ohne ausdrückliches Limit die 500 des GTÜ-Feldes', () => {
    const zuLang = substituteTextbaustein('{{a}}', { a: 'x'.repeat(501) });
    const genau = substituteTextbaustein('{{a}}', { a: 'x'.repeat(500) });

    expect(zuLang).toMatchObject({ ok: false, limit: TEXTBAUSTEIN_TARGET_MAX_LENGTH });
    expect(genau).toMatchObject({ ok: true });
  });

  it('nennt die Überschreitung in Zeichen, wie es das Overlay anzeigt', () => {
    const result = substituteTextbaustein('{{a}}', { a: 'x'.repeat(12) }, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(describeSubstitutionFailure(result)).toBe('passt nicht — 2 Zeichen zu viel.');
    }
  });
});
