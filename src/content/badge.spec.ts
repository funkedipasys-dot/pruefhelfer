// @vitest-environment jsdom

import { BADGE_HOST_ID, createBadge } from './badge';
import type { BadgeHandle } from './badge';

let badge: BadgeHandle;

beforeEach(() => {
  document.body.replaceChildren();
  // Eine erfundene Nummer: geprüft wird, dass die Aufschrift durchgereicht wird,
  // nicht welche gerade aktuell ist.
  badge = createBadge('Prüfhelfer 9.9.9');
});

afterEach(() => {
  badge.destroy();
});

const query = <T extends Element>(selector: string): T => {
  const node = badge.shadow.querySelector<T>(selector);
  if (node === null) throw new Error(`nicht gefunden: ${selector}`);
  return node;
};

it('hängt genau einen eigenen Wirt an body', () => {
  expect(document.querySelectorAll(`#${BADGE_HOST_ID}`)).toHaveLength(1);
});

it('nennt Fassung und Nummer — sonst beantwortet es die Anschlussfrage nicht', () => {
  expect(query('.text').textContent).toBe('Prüfhelfer 9.9.9');
});

it('ist von Anfang an sichtbar, anders als die Knöpfe an den Feldern', () => {
  expect(query<HTMLElement>('.badge').hidden).toBe(false);
});

it('fängt keinen Klick ab, der dem Produktionstool gegolten hätte', () => {
  const style = badge.shadow.querySelector('style')?.textContent ?? '';
  expect(style).toContain('pointer-events: none');
});

it('sitzt oben in der Kopfleiste, nicht unten', () => {
  // Unten lag es über dem Blättern-Knopf des Tools (Abnahme 10.08.2026).
  const style = badge.shadow.querySelector('style')?.textContent ?? '';
  expect(style).toContain('top: 8px');
  expect(style).not.toContain('bottom:');
});

it('räumt sich restlos ab', () => {
  badge.destroy();
  expect(document.getElementById(BADGE_HOST_ID)).toBeNull();
});

it('hält den Schatten für die Seite verschlossen', () => {
  // Ein Kennzeichen, das die Seite umschreiben kann, wäre als Nachweis
  // wertlos — sie käme über `host.shadowRoot` daran.
  expect(document.getElementById(BADGE_HOST_ID)?.shadowRoot).toBeNull();
});
