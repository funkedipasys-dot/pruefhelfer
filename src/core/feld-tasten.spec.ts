import { describe, expect, it } from 'vitest';
import { datumTaste, monatTaste } from './feld-tasten';

/** Ein fester Bezugspunkt — sonst prüft der Test die Uhr statt die Rechnung. */
const HEUTE = new Date(2026, 7, 21); // 21.08.2026

describe('monatTaste', () => {
  it('setzt mit A den laufenden Monat, unabhängig vom Inhalt', () => {
    expect(monatTaste('a', '', HEUTE)).toBe('2026-08');
    expect(monatTaste('A', '2020-01', HEUTE)).toBe('2026-08');
  });

  it('setzt mit N den nächsten und mit L den letzten Monat', () => {
    expect(monatTaste('n', '', HEUTE)).toBe('2026-09');
    expect(monatTaste('l', '', HEUTE)).toBe('2026-07');
  });

  it('springt über die Jahresgrenze, in beide Richtungen', () => {
    const dezember = new Date(2026, 11, 5);
    expect(monatTaste('n', '', dezember)).toBe('2027-01');
    const januar = new Date(2026, 0, 5);
    expect(monatTaste('l', '', januar)).toBe('2025-12');
    expect(monatTaste('ArrowRight', '2026-12', HEUTE)).toBe('2027-01');
    expect(monatTaste('ArrowLeft', '2026-01', HEUTE)).toBe('2025-12');
  });

  it('blättert mit den Pfeiltasten monatsweise', () => {
    expect(monatTaste('ArrowRight', '2026-08', HEUTE)).toBe('2026-09');
    expect(monatTaste('ArrowLeft', '2026-08', HEUTE)).toBe('2026-07');
  });

  it('setzt bei leerem Feld erst auf den laufenden Monat auf — Richtung egal', () => {
    expect(monatTaste('ArrowLeft', '', HEUTE)).toBe('2026-08');
    expect(monatTaste('ArrowRight', '', HEUTE)).toBe('2026-08');
  });

  it('lässt fremde Tasten in Ruhe', () => {
    expect(monatTaste('x', '2026-08', HEUTE)).toBeNull();
    expect(monatTaste('ArrowUp', '2026-08', HEUTE)).toBeNull();
    expect(monatTaste('Enter', '2026-08', HEUTE)).toBeNull();
  });
});

describe('datumTaste', () => {
  it('setzt H auf heute und G auf gestern', () => {
    expect(datumTaste('h', HEUTE)).toBe('2026-08-21');
    expect(datumTaste('G', HEUTE)).toBe('2026-08-20');
  });

  it('trägt den Monatswechsel mit', () => {
    expect(datumTaste('g', new Date(2026, 8, 1))).toBe('2026-08-31');
  });

  it('lässt fremde Tasten in Ruhe — auch die Pfeiltasten', () => {
    expect(datumTaste('x', HEUTE)).toBeNull();
    expect(datumTaste('ArrowLeft', HEUTE)).toBeNull();
  });
});
