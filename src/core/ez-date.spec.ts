import { proposeEzDate } from './ez-date';

/** Der Tag, an dem das Feature entstand — als fester Bezugspunkt. */
const HEUTE = new Date(2026, 7, 10);

const vorschlag = (value: string, today = HEUTE): string | null => proposeEzDate(value, today)?.text ?? null;

describe('zweistelliges Jahr', () => {
  it('deutet die zwei Ziffern als das jüngste Jahr, das nicht in der Zukunft liegt', () => {
    expect(vorschlag('25.12.10')).toBe('25.12.2010');
  });

  it('liest den Wert genauso, nachdem das Tool ihn umgebaut hat', () => {
    expect(vorschlag('25.12.0010')).toBe('25.12.2010');
  });

  it('kommt vor und nach dem Umbau zum selben Ergebnis', () => {
    expect(vorschlag('25.12.10')).toBe(vorschlag('25.12.0010'));
  });

  it('deckt die am echten Tool beobachteten Werte ab', () => {
    // Christians Aufnahmen vom 10.08.2026, 16:58 und 17:25.
    expect(vorschlag('25.12.0010')).toBe('25.12.2010');
    expect(vorschlag('24.10.0014')).toBe('24.10.2014');
  });

  it('legt ein Jahr, das sonst in der Zukunft läge, ins vorige Jahrhundert', () => {
    expect(vorschlag('25.12.99')).toBe('25.12.1999');
    expect(vorschlag('25.12.27')).toBe('25.12.1927');
  });

  it('entscheidet am ganzen Datum, nicht am Jahr allein', () => {
    // Am 10.08.2026: der 25.12.2026 ist noch nicht gewesen, der 01.01. schon.
    expect(vorschlag('25.12.26')).toBe('25.12.1926');
    expect(vorschlag('01.01.26')).toBe('01.01.2026');
  });

  it('lässt den heutigen Tag selbst noch zu', () => {
    expect(vorschlag('10.08.26')).toBe('10.08.2026');
  });

  it('nimmt die Jahrhundertwende als 2000', () => {
    expect(vorschlag('25.12.00')).toBe('25.12.2000');
  });

  it('schreibt Tag und Monat zweistellig', () => {
    expect(vorschlag('5.3.10')).toBe('05.03.2010');
  });

  it('übergeht Leerraum ringsum', () => {
    expect(vorschlag('  25.12.10  ')).toBe('25.12.2010');
  });
});

describe('kein Vorschlag', () => {
  it('fasst ein vierstelliges Jahr nicht an', () => {
    expect(vorschlag('25.12.2010')).toBeNull();
  });

  it('rät auch bei einem vierstellig falschen Jahr nichts', () => {
    // 1810 liegt vor der Schranke des Feldes — aber hier ist nichts verrutscht,
    // und aus 1810 „1910" zu machen wäre geraten.
    expect(vorschlag('25.12.1810')).toBeNull();
  });

  it('schlägt kein Datum vor, das es nicht gibt', () => {
    expect(vorschlag('29.02.21')).toBeNull();
    expect(vorschlag('31.02.10')).toBeNull();
    expect(vorschlag('31.04.10')).toBeNull();
    expect(vorschlag('25.13.10')).toBeNull();
    expect(vorschlag('00.12.10')).toBeNull();
  });

  it('nimmt den 29. Februar, wo es ihn gibt', () => {
    expect(vorschlag('29.02.20')).toBe('29.02.2020');
  });

  it('lässt alles liegen, was nicht wie ein Datum aussieht', () => {
    expect(vorschlag('')).toBeNull();
    expect(vorschlag('abc')).toBeNull();
    expect(vorschlag('25/12/10')).toBeNull();
    expect(vorschlag('25.12.')).toBeNull();
    expect(vorschlag('25.12.10.')).toBeNull();
    expect(vorschlag('25.12.10 Uhr')).toBeNull();
  });
});

describe('Schranke des Feldes', () => {
  it('bleibt in jedem Fall nach dem 1.5.1893', () => {
    // Das kleinste erreichbare Jahr ist 1900 — die Schranke kann von hier aus
    // nicht unterschritten werden. Schlägt dieser Test fehl, hat das Tool sie
    // angehoben und die Regel braucht eine Untergrenze.
    for (let jahr = 0; jahr < 100; jahr += 1) {
      const treffer = proposeEzDate(`01.01.${String(jahr).padStart(2, '0')}`, HEUTE);
      expect(treffer?.year ?? 1900).toBeGreaterThanOrEqual(1894);
    }
  });
});
