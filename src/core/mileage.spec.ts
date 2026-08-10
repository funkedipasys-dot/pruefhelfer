import { MILEAGE_OFFSETS, parseAltStand } from './mileage';

describe('parseAltStand', () => {
  it('liest die Schreibweise aus dem Dialog „Wegstreckenzähler ändern"', () => {
    expect(parseAltStand('184731 - alter Stand')).toBe(184731);
  });

  it('liest die Schreibweise aus dem Fahrzeug-Formular', () => {
    expect(parseAltStand(' (Stand Erstbericht: 184731) ')).toBe(184731);
  });

  /** Dieselbe Zeile bei einer Nachkontrolle (gesehen am 10.08.2026). */
  it('liest die Schreibweise aus der Kopiervorlage', () => {
    expect(parseAltStand('(Stand Kopiervorlage: 184731)')).toBe(184731);
  });

  it('nimmt Punkte als Tausendertrenner', () => {
    expect(parseAltStand('184.731 - alter Stand')).toBe(184731);
  });

  it('nimmt auch geschützte Leerzeichen als Tausendertrenner', () => {
    expect(parseAltStand('184 731 - alter Stand')).toBe(184731);
    expect(parseAltStand('184 731 - alter Stand')).toBe(184731);
  });

  /** Der teuerste denkbare Fehler: eine Nachkommastelle als Kilometer zu lesen. */
  it('schneidet bei einem Komma ab, statt die Nachkommastelle anzuhängen', () => {
    expect(parseAltStand('184731,5 km')).toBe(184731);
  });

  it('liefert null, wo keine Zahl steht', () => {
    expect(parseAltStand('kein alter Stand vorhanden')).toBeNull();
    expect(parseAltStand('')).toBeNull();
  });

  it('liest den Wert auch ohne umgebenden Text', () => {
    expect(parseAltStand('0')).toBe(0);
  });

  it('lässt sich von einem Bindestrich nicht zu einer zweiten Zahl verleiten', () => {
    expect(parseAltStand('184731 - alter Stand vom 24.10.2014')).toBe(184731);
  });

  /**
   * Derselbe Fehler wie beim Komma, nur ohne Komma: stünde hinter der Zahl
   * eine zweite, bloß durch ein Leerzeichen getrennt, ergäbe ein Trenner ohne
   * Dreiergruppen-Prüfung wieder den zehnfachen Kilometerstand.
   */
  it('hängt keine zweite Zahl an, die nur durch ein Leerzeichen getrennt ist', () => {
    expect(parseAltStand('184731 5 - alter Stand')).toBe(184731);
    expect(parseAltStand('184731 5')).toBe(184731);
  });

  it('nimmt einen Trenner nur vor einer vollen Dreiergruppe', () => {
    // Gruppiert: der Trenner gehört zur Zahl.
    expect(parseAltStand('1.184.731 km')).toBe(1184731);
    // Nicht gruppiert: die Zahl endet vor dem Trenner.
    expect(parseAltStand('184 73 - alter Stand')).toBe(184);
  });
});

describe('MILEAGE_OFFSETS', () => {
  it('bietet genau die beiden Aufschläge an', () => {
    expect([...MILEAGE_OFFSETS]).toEqual([2, 5]);
  });
});
