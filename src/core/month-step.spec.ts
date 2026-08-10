import { stepMonth } from './month-step';

describe('einen Monat springen', () => {
  it('geht vom Tool-Format aus einen Monat zurück', () => {
    expect(stepMonth('08.2026', -1)).toBe('07.2026');
  });

  it('geht einen Monat vor', () => {
    expect(stepMonth('08.2026', 1)).toBe('09.2026');
  });

  /** Der Fall aus der Ansage: von 08.2026 dreimal zurück auf den Mai. */
  it('lässt sich wiederholen', () => {
    let value = '08.2026';
    for (let i = 0; i < 3; i += 1) {
      value = stepMonth(value, -1) ?? value;
    }
    expect(value).toBe('05.2026');
  });

  it('rollt über den Jahreswechsel', () => {
    expect(stepMonth('01.2026', -1)).toBe('12.2025');
    expect(stepMonth('12.2025', 1)).toBe('01.2026');
  });

  it('schreibt den Monat zweistellig', () => {
    expect(stepMonth('10.2026', -1)).toBe('09.2026');
    expect(stepMonth('1.2026', 1)).toBe('02.2026');
  });
});

describe('das volle Datum', () => {
  it('behält die Schreibweise, in der es vorgefunden wurde', () => {
    expect(stepMonth('15.08.2026', -1)).toBe('15.07.2026');
  });

  /** Ein Sprung, der aus Januar den März macht, fällt erst später auf. */
  it('kappt den Tag am kürzeren Monat, statt überzulaufen', () => {
    expect(stepMonth('31.01.2026', 1)).toBe('28.02.2026');
    expect(stepMonth('31.03.2026', -1)).toBe('28.02.2026');
  });

  it('kennt den Schalttag', () => {
    expect(stepMonth('31.01.2028', 1)).toBe('29.02.2028');
  });
});

describe('wann nichts passiert', () => {
  it('bei einem leeren Feld', () => {
    expect(stepMonth('', -1)).toBeNull();
    expect(stepMonth('   ', -1)).toBeNull();
  });

  it('bei einer Schreibweise, die hier nicht vorkommt', () => {
    expect(stepMonth('August 2026', -1)).toBeNull();
    expect(stepMonth('2026-08', -1)).toBeNull();
    expect(stepMonth('08/2026', -1)).toBeNull();
  });

  it('bei einem Monat, den es nicht gibt', () => {
    expect(stepMonth('13.2026', -1)).toBeNull();
    expect(stepMonth('00.2026', 1)).toBeNull();
  });

  it('bei einem Tag, den es in diesem Monat nicht gibt', () => {
    expect(stepMonth('31.02.2026', 1)).toBeNull();
  });
});

/** Das Feld bringt `min="1952-01-01"` mit — daran hält sich der Sprung. */
describe('die Grenzen des Feldes', () => {
  it('springt nicht unter die untere Grenze', () => {
    expect(stepMonth('01.1952', -1, { min: '1952-01-01' })).toBeNull();
  });

  it('darf bis auf die Grenze', () => {
    expect(stepMonth('02.1952', -1, { min: '1952-01-01' })).toBe('01.1952');
  });

  /**
   * Ohne Tag zählt der Monat als Ganzes. Sonst wäre Januar 1952 gesperrt, weil
   * der Monat vor dem 1. Januar beginnt — für eine Angabe ohne Tag eine
   * Unterscheidung ohne Bedeutung.
   */
  it('vergleicht eine Angabe ohne Tag nur bis auf den Monat', () => {
    expect(stepMonth('02.1952', -1, { min: '1952-01-15' })).toBe('01.1952');
  });

  it('achtet beim vollen Datum auch auf den Tag', () => {
    expect(stepMonth('14.02.1952', -1, { min: '1952-01-15' })).toBeNull();
    expect(stepMonth('16.02.1952', -1, { min: '1952-01-15' })).toBe('16.01.1952');
  });

  it('springt nicht über die obere Grenze', () => {
    expect(stepMonth('12.2026', 1, { max: '2026-12-31' })).toBeNull();
  });

  it('lässt ohne Grenzen alles zu', () => {
    expect(stepMonth('01.1900', -1)).toBe('12.1899');
  });
});
