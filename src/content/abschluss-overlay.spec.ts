// @vitest-environment jsdom

import { NACHZIEHEN, createAbschlussOverlay } from './abschluss-overlay';
import { ABSCHLUSS_DIALOG_SELECTOR } from './abschluss';
import { watchField } from './watcher';
import type { AngemahntesFeld } from './abschluss';

/** MutationObserver arbeitet als Microtask — einmal die Schlange leerlaufen lassen. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function angemahnt(name: string, input = document.createElement('input')): AngemahntesFeld {
  return { feld: { name, selector: '#egal', mahnung: name }, input };
}

/** Ein Feld, das dasteht wie eines im Formular: verbunden, sichtbar, beschreibbar. */
function echtesFeld(): HTMLInputElement {
  const input = document.createElement('input');
  document.body.append(input);
  return input;
}

function maske(): HTMLElement {
  const pane = document.createElement('div');
  document.body.append(pane);
  return pane;
}

const bar = (shadow: ShadowRoot): HTMLElement => shadow.querySelector<HTMLElement>('.bar')!;
const felder = (shadow: ShadowRoot): HTMLElement[] => [...shadow.querySelectorAll<HTMLElement>('.feld')];
const eingabe = (shadow: ShadowRoot, index = 0): HTMLInputElement =>
  felder(shadow)[index]!.querySelector<HTMLInputElement>('.wert')!;
const meldung = (shadow: ShadowRoot): HTMLElement => shadow.querySelectorAll<HTMLElement>('.bar > span')[2]!;

/**
 * jsdom kann `isTrusted` nicht setzen — die Eigenschaft ist an jeder
 * Ereignis-Instanz nicht überschreibbar (siehe `light/content.spec.ts`). Für die
 * Klickwege zählt aber gerade der *vertraute* Fall, also werden die Zuhörer beim
 * Anmelden abgefangen und selbst gerufen.
 */
type FakeClick = (event: { isTrusted: boolean }) => void;
const angemeldet: { target: EventTarget; listener: FakeClick }[] = [];
const add = EventTarget.prototype.addEventListener;

const klick = (index = 0, isTrusted = true): void => {
  angemeldet[index]!.listener({ isTrusted });
};

beforeEach(() => {
  document.body.replaceChildren();
  angemeldet.length = 0;
  EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, options) {
    if (type === 'click' && typeof listener === 'function') {
      angemeldet.push({ target: this, listener: listener as unknown as FakeClick });
    }
    return add.call(this, type, listener, options);
  };
});

afterEach(() => {
  EventTarget.prototype.addEventListener = add;
});

const schreibt = (): { calls: [HTMLInputElement, string][]; write: (i: HTMLInputElement, w: string) => boolean } => {
  const calls: [HTMLInputElement, string][] = [];
  return { calls, write: (input, wert) => (calls.push([input, wert]), true) };
};

it('nennt die Felder, die die Maske anmahnt', () => {
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => true });
  overlay.attach(maske());

  expect(bar(overlay.shadow).hidden).toBe(false);
  expect(felder(overlay.shadow).map((feld) => feld.firstChild?.textContent)).toEqual(['HU-Fälligkeit']);
  overlay.destroy();
});

it('bleibt weg, solange nichts angemahnt ist', () => {
  const overlay = createAbschlussOverlay({ read: () => [], write: () => true });
  overlay.attach(maske());

  expect(bar(overlay.shadow).hidden).toBe(true);
  overlay.destroy();
});

it('wartet auf die nachgeladene Validierungsliste, statt einmal zu messen und aufzugeben', async () => {
  let angemahnte: AngemahntesFeld[] = [];
  const overlay = createAbschlussOverlay({ read: () => angemahnte, write: () => true });
  const pane = maske();
  overlay.attach(pane);
  expect(bar(overlay.shadow).hidden).toBe(true);

  // Die Antwort auf `validierungsergebnis` trifft ein.
  angemahnte = [angemahnt('HU-Fälligkeit'), angemahnt('UMA-Datum')];
  pane.append(document.createElement('li'));
  await settle();

  expect(felder(overlay.shadow).map((feld) => feld.firstChild?.textContent)).toEqual(['HU-Fälligkeit', 'UMA-Datum']);
  overlay.destroy();
});

it('räumt beim Abmelden ab — sonst überlebte die Leiste ihre Maske', () => {
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => true });
  overlay.attach(maske());

  overlay.detach();
  expect(bar(overlay.shadow).hidden).toBe(true);
  expect(felder(overlay.shadow)).toHaveLength(0);
  overlay.destroy();
});

it('trägt den getippten Wert in das echte Feld ein', () => {
  const input = echtesFeld();
  const { calls, write } = schreibt();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = ' 08.2028 ';
  klick();

  expect(calls).toEqual([[input, '08.2028']]);
  expect(meldung(overlay.shadow).textContent).toBe(`HU-Fälligkeit: 08.2028 eingetragen. ${NACHZIEHEN}`);
  overlay.destroy();
});

it('sagt nach dem Eintrag, dass die Validierungsliste eine Momentaufnahme ist', () => {
  const input = echtesFeld();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write: () => true });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '08.2028';
  klick();

  // Ohne diesen Satz stuende der Pruefer vor einer Maske, die weiter "nicht
  // gesetzt" meldet, und hielte den Eintrag fuer misslungen.
  expect(meldung(overlay.shadow).textContent).toContain('schließen und erneut öffnen');
  expect(meldung(overlay.shadow).className).toBe('hinweis');
  overlay.destroy();
});

it('warnt, wenn das Produktionstool den Wert verwirft, statt Erfolg zu melden', () => {
  const input = echtesFeld();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write: () => false });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '13.2028';
  klick();

  expect(meldung(overlay.shadow).className).toBe('fehler');
  expect(meldung(overlay.shadow).textContent).toContain('verworfen');
  overlay.destroy();
});

it('sucht das Ziel erst beim Klick — Angular tauscht das Feld zwischendurch aus', () => {
  let input = echtesFeld();
  const { calls, write } = schreibt();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '08.2028';
  const ersetzt = echtesFeld();
  input.remove();
  input = ersetzt;
  klick();

  expect(calls).toEqual([[ersetzt, '08.2028']]);
  overlay.destroy();
});

it('schreibt nicht in ein gesperrtes Feld — die Rückleseprüfung allein hielte das für einen Erfolg', () => {
  const input = echtesFeld();
  input.disabled = true;
  const { calls, write } = schreibt();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '08.2028';
  klick();

  expect(calls).toEqual([]);
  expect(meldung(overlay.shadow).className).toBe('fehler');
  overlay.destroy();
});

it('schreibt nichts ohne Wert und nichts ohne echten Klick', () => {
  const input = echtesFeld();
  const { calls, write } = schreibt();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write });
  overlay.attach(maske());

  klick();
  expect(meldung(overlay.shadow).textContent).toContain('Bitte erst einen Wert');

  eingabe(overlay.shadow).value = '08.2028';
  klick(0, false);
  expect(meldung(overlay.shadow).textContent).toBe('Nur per Klick möglich.');
  expect(calls).toEqual([]);
  overlay.destroy();
});

/**
 * Slice 1.4 — verdrahtet wie im Content-Script, weil genau die Verdrahtung die
 * Behauptung trägt: der Beobachter meldet die Maske ab, sobald das CDK sie aus
 * dem Dokument nimmt. Eine Leiste, die ihre Maske überlebt, böte Felder an, um
 * die niemand mehr gebeten hat.
 */
it('erscheint mit der Maske und verschwindet mit ihr', async () => {
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => true });
  const stop = watchField<HTMLElement>({
    root: document,
    selector: ABSCHLUSS_DIALOG_SELECTOR,
    ignoreWithin: overlay.shadow.host,
    onAttach: (dialog) => overlay.attach(dialog),
    onDetach: () => overlay.detach(),
  });
  expect(bar(overlay.shadow).hidden).toBe(true);

  const pane = document.createElement('div');
  pane.className = 'cdk-overlay-pane mat-mdc-dialog-panel';
  document.body.append(pane);
  await settle();
  expect(bar(overlay.shadow).hidden).toBe(false);

  pane.remove();
  await settle();
  expect(bar(overlay.shadow).hidden).toBe(true);

  stop();
  overlay.destroy();
});

it('zeichnet die Zeilen für eine zweite Maske neu', async () => {
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => true });

  overlay.attach(maske());
  overlay.detach();
  overlay.attach(maske());

  expect(felder(overlay.shadow)).toHaveLength(1);
  expect(bar(overlay.shadow).hidden).toBe(false);
  overlay.destroy();
});

it('lässt die halb getippte Eingabe stehen, wenn sich in der Maske etwas regt', async () => {
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => true });
  const pane = maske();
  overlay.attach(pane);

  eingabe(overlay.shadow).value = '08.20';
  pane.append(document.createElement('li'));
  await settle();

  expect(eingabe(overlay.shadow).value).toBe('08.20');
  overlay.destroy();
});
