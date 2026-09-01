// @vitest-environment jsdom

import { ABSCHLUSS_FELDER, angemahnteFelder, ausIso, findAbschlussDialog, normalisiere } from './abschluss';

const HU = ABSCHLUSS_FELDER[0]!;
const UMA = ABSCHLUSS_FELDER[1]!;
const KM = ABSCHLUSS_FELDER[2]!;

/** Die Maske, wie das CDK sie einhängt: außerhalb des Formulars, am Body. */
function maske(...meldungen: string[]): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'cdk-overlay-pane mat-mdc-dialog-panel';
  for (const meldung of meldungen) {
    const zeile = document.createElement('li');
    zeile.textContent = meldung;
    pane.append(zeile);
  }
  document.body.append(pane);
  return pane;
}

/** Das echte Feld im Formular hinter der Maske. */
function feld(selector: string): HTMLInputElement {
  const input = document.createElement('input');
  input.id = selector.slice(1);
  document.body.append(input);
  return input;
}

beforeEach(() => {
  document.body.replaceChildren();
});

it('findet die offene Maske und meldet sonst nichts', () => {
  expect(findAbschlussDialog()).toBeNull();
  const pane = maske();
  expect(findAbschlussDialog()).toBe(pane);
});

it('bietet das Feld an, das die Maske anmahnt', () => {
  const pane = maske('Fahrzeug HU Fälligkeit nicht gesetzt');
  const input = feld(HU.selector);

  expect(angemahnteFelder(pane)).toEqual([{ feld: HU, input }]);
});

it('bietet nichts an, was die Maske nicht anmahnt', () => {
  const pane = maske('Fahrzeug HU Fälligkeit nicht gesetzt');
  feld(HU.selector);
  feld(UMA.selector);

  expect(angemahnteFelder(pane).map((treffer) => treffer.feld)).toEqual([HU]);
});

it('bietet nichts an, wenn das Feld hinter der Maske fehlt — UMA gibt es nicht immer', () => {
  const pane = maske('Datum der beigestellten UMA nicht gesetzt');

  expect(angemahnteFelder(pane)).toEqual([]);
});

it('erkennt die UMA am gemessenen Wortlaut, nicht am Feldnamen', () => {
  const pane = maske('Datum der beigestellten UMA nicht gesetzt');
  const input = feld(UMA.selector);

  expect(angemahnteFelder(pane)).toEqual([{ feld: UMA, input }]);
});

it('liest über Elementgrenzen hinweg — textContent klebt ohne Leerzeichen zusammen', () => {
  const pane = maske();
  const zeile = document.createElement('div');
  zeile.innerHTML = '<span>HU-Fälligkeit</span><span>nicht gesetzt</span>';
  pane.append(zeile);
  const input = feld(HU.selector);

  expect(angemahnteFelder(pane)).toEqual([{ feld: HU, input }]);
});

it('bietet den Kilometerstand an, wenn die Maske ihn anmahnt', () => {
  const pane = maske('Fahrzeug Laufleistung nicht gesetzt');
  const input = feld(KM.selector);

  expect(angemahnteFelder(pane)).toEqual([{ feld: KM, input }]);
});

it('rechnet ISO in die Schreibweise des Produktionstools um', () => {
  // Monatsgenau die HU-Fälligkeit, tagesgenau das UMA-Datum.
  expect(ausIso('2026-08')).toBe('08.2026');
  expect(ausIso('2026-08-17')).toBe('17.08.2026');
  // Ein Kilometerstand ist kein Datum und bleibt, wie er ist — ebenso alles,
  // was hier nicht verstanden wird.
  expect(ausIso('184731')).toBe('184731');
  expect(ausIso('')).toBe('');
});

it('dampft Text auf den Wortkern ein', () => {
  expect(normalisiere('HU-Fälligkeit nicht gesetzt')).toBe(normalisiere('hu fälligkeit\nnicht  gesetzt'));
});
