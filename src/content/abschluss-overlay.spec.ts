// @vitest-environment jsdom

import { NACHZIEHEN, createAbschlussOverlay } from './abschluss-overlay';
import { ABSCHLUSS_DIALOG_SELECTOR } from './abschluss';
import { watchField } from './watcher';
import type { AbschlussFeld, AngemahntesFeld } from './abschluss';
import { writeFieldValue } from './field';
import type { WriteOutcome } from './field';

/** MutationObserver arbeitet als Microtask — einmal die Schlange leerlaufen lassen. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Der Regelfall: Wert steht, Fokus kam an. */
const ANGENOMMEN: WriteOutcome = { accepted: true, focused: true };
/** Die Anwendung hat den Wert zurückgeschrieben. */
const VERWORFEN: WriteOutcome = { accepted: false, focused: true };
/** Wert steht, aber der Fokus kam nicht an — Focus-Trap der Maske. */
const OHNE_FOKUS: WriteOutcome = { accepted: true, focused: false };

function angemahnt(
  name: string,
  input = document.createElement('input'),
  typ: AbschlussFeld['typ'] = 'month',
): AngemahntesFeld {
  return { feld: { name, selector: '#egal', mahnung: name, typ }, input };
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
/**
 * Die Erfolgs- und Fehlermeldung steht immer als Letztes in der Leiste — ein
 * fester Index davor hielt nur so lange, bis Slice 9.2 den Notiz-Hinweis
 * davorsetzte.
 */
const meldung = (shadow: ShadowRoot): HTMLElement =>
  shadow.querySelector<HTMLElement>('.bar > span:last-child')!;
const notiz = (shadow: ShadowRoot): HTMLElement => shadow.querySelector<HTMLElement>('.bar > .notiz')!;

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

const schreibt = (): { calls: [HTMLInputElement, string][]; write: (i: HTMLInputElement, w: string) => WriteOutcome } => {
  const calls: [HTMLInputElement, string][] = [];
  return { calls, write: (input, wert) => (calls.push([input, wert]), ANGENOMMEN) };
};

it('nennt die Felder, die die Maske anmahnt', () => {
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => ANGENOMMEN });
  overlay.attach(maske());

  expect(bar(overlay.shadow).hidden).toBe(false);
  expect(felder(overlay.shadow).map((feld) => feld.firstChild?.textContent)).toEqual(['HU-Fälligkeit']);
  overlay.destroy();
});

it('bleibt weg, solange nichts angemahnt ist', () => {
  const overlay = createAbschlussOverlay({ read: () => [], write: () => ANGENOMMEN });
  overlay.attach(maske());

  expect(bar(overlay.shadow).hidden).toBe(true);
  overlay.destroy();
});

it('wartet auf die nachgeladene Validierungsliste, statt einmal zu messen und aufzugeben', async () => {
  let angemahnte: AngemahntesFeld[] = [];
  const overlay = createAbschlussOverlay({ read: () => angemahnte, write: () => ANGENOMMEN });
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
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => ANGENOMMEN });
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

  // Das Monatsfeld gibt ISO heraus; im Prüffeld muss `08.2028` ankommen.
  eingabe(overlay.shadow).value = '2028-08';
  klick();

  expect(calls).toEqual([[input, '08.2028']]);
  expect(meldung(overlay.shadow).textContent).toBe(`HU-Fälligkeit: 08.2028 eingetragen. ${NACHZIEHEN}`);
  overlay.destroy();
});

it('sagt nach dem Eintrag, dass die Validierungsliste eine Momentaufnahme ist', () => {
  const input = echtesFeld();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write: () => ANGENOMMEN });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '2028-08';
  klick();

  // Ohne diesen Satz stuende der Pruefer vor einer Maske, die weiter "nicht
  // gesetzt" meldet, und hielte den Eintrag fuer misslungen.
  expect(meldung(overlay.shadow).textContent).toContain('schließen und erneut öffnen');
  expect(meldung(overlay.shadow).className).toBe('hinweis');
  overlay.destroy();
});

it('warnt, wenn das Produktionstool den Wert verwirft, statt Erfolg zu melden', () => {
  const input = echtesFeld();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write: () => VERWORFEN });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '2028-12';
  klick();

  expect(meldung(overlay.shadow).className).toBe('fehler');
  expect(meldung(overlay.shadow).textContent).toContain('verworfen');
  overlay.destroy();
});

/**
 * Der teuerste Halbwahrheits-Fall dieser Leiste.
 *
 * Sie schreibt als einzige in ein Feld **hinter** einem offenen Dialog, also
 * gegen den Focus-Trap des CDK an. Kommt der Fokus nicht durch, steht der Wert
 * zwar sichtbar im Feld, das Formular hat ihn aber nie als berührt verbucht:
 * die Pflichtangabe bleibt rot, die Fachlogik rechnet mit dem alten Stand
 * weiter. Eine schlichte Erfolgsmeldung wäre hier gefährlicher als eine
 * Fehlermeldung — der Prüfer sieht das Feld hinter der Maske ja nicht.
 */
it('meldet einen Eintrag ohne Fokus als Fehlschlag, nicht als Erfolg', () => {
  const input = echtesFeld();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write: () => OHNE_FOKUS });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '2028-08';
  klick();

  expect(meldung(overlay.shadow).className).toBe('fehler');
  expect(meldung(overlay.shadow).textContent).toContain('nicht übernommen');
  // Und ausdrücklich **nicht** die Erfolgszeile: sie stünde sonst neben der
  // Warnung und höbe sie auf.
  expect(meldung(overlay.shadow).textContent).not.toContain(NACHZIEHEN);
  overlay.destroy();
});

it('sucht das Ziel erst beim Klick — Angular tauscht das Feld zwischendurch aus', () => {
  let input = echtesFeld();
  const { calls, write } = schreibt();
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit', input)], write });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '2028-08';
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
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => ANGENOMMEN });
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
  const overlay = createAbschlussOverlay({ read: () => [angemahnt('HU-Fälligkeit')], write: () => ANGENOMMEN });

  overlay.attach(maske());
  overlay.detach();
  overlay.attach(maske());

  expect(felder(overlay.shadow)).toHaveLength(1);
  expect(bar(overlay.shadow).hidden).toBe(false);
  overlay.destroy();
});

it('lässt die halb getippte Eingabe stehen, wenn sich in der Maske etwas regt', async () => {
  // Am Kilometerstand geprüft: ein `month`-Feld kann eine halbe Eingabe gar
  // nicht halten, der Browser räumt sie selbst weg.
  const overlay = createAbschlussOverlay({
    read: () => [angemahnt('Laufleistung', document.createElement('input'), 'number')],
    write: () => ANGENOMMEN,
  });
  const pane = maske();
  overlay.attach(pane);

  eingabe(overlay.shadow).value = '1847';
  pane.append(document.createElement('li'));
  await settle();

  expect(eingabe(overlay.shadow).value).toBe('1847');
  overlay.destroy();
});

it('reicht den Kilometerstand unverändert durch — er ist kein Datum', () => {
  const input = echtesFeld();
  const { calls, write } = schreibt();
  const overlay = createAbschlussOverlay({
    read: () => [angemahnt('Laufleistung', input, 'number')],
    write,
  });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '184731';
  klick();

  expect(calls).toEqual([[input, '184731']]);
  overlay.destroy();
});

/**
 * Die volle Kette, so wie sie am Produktionstool hängt: die Leiste mit dem
 * **echten** `writeFieldValue`, nicht mit einem Fake.
 *
 * Der Fall, um den es geht, ist der Alltag dieser Leiste — sie ist die einzige,
 * die in ein Feld hinter einem offenen Dialog schreibt. Der CDK legt über den
 * Hintergrund `inert`, und ein Feld darin meldet trotzdem `disabled === false`,
 * `readOnly === false` und eine ganz normale berechnete Darstellung. Ohne die
 * `inert`-Prüfung in `checkField()` liefe der Schreibversuch durch, der Wert
 * stünde im Feld, die Fokus-Klammer bliebe wirkungslos — und gemeldet würde
 * Erfolg.
 */
describe('gegen das echte writeFieldValue', () => {
  it('schreibt gar nicht erst in ein Feld hinter einem inerten Hintergrund', () => {
    const hintergrund = document.createElement('div');
    hintergrund.setAttribute('inert', '');
    document.body.append(hintergrund);
    const input = document.createElement('input');
    input.value = 'unangetastet';
    hintergrund.append(input);

    const overlay = createAbschlussOverlay({
      read: () => [angemahnt('HU-Fälligkeit', input)],
      write: writeFieldValue,
    });
    overlay.attach(maske());

    eingabe(overlay.shadow).value = '2028-08';
    klick();

    expect(meldung(overlay.shadow).className).toBe('fehler');
    expect(meldung(overlay.shadow).textContent).toContain('lässt sich gerade nicht beschreiben');
    // Das Entscheidende: nichts angefasst.
    expect(input.value).toBe('unangetastet');
    overlay.destroy();
  });

  it('schreibt und meldet Erfolg, wenn das Feld frei zugänglich ist', () => {
    const input = echtesFeld();

    const overlay = createAbschlussOverlay({
      read: () => [angemahnt('HU-Fälligkeit', input)],
      write: writeFieldValue,
    });
    overlay.attach(maske());

    eingabe(overlay.shadow).value = '2028-08';
    klick();

    expect(input.value).toBe('08.2028');
    expect(meldung(overlay.shadow).className).toBe('hinweis');
    expect(meldung(overlay.shadow).textContent).toContain(NACHZIEHEN);
    overlay.destroy();
  });
});

/**
 * Das Zeitfenster bis zur Abnahme am echten Tool: die offene Fassung soll den
 * fehlenden Fokus **nicht** melden, weil niemand gemessen hat, wie oft er
 * fehlt. Der Riegel gegen das stille Halbschreiben bleibt davon unberührt — der
 * sitzt in `checkField()` und nicht hier.
 */
it('schweigt über den fehlenden Fokus, wenn der Aufrufer es so will', () => {
  const input = echtesFeld();
  const overlay = createAbschlussOverlay({
    read: () => [angemahnt('HU-Fälligkeit', input)],
    write: () => OHNE_FOKUS,
    warnOhneFokus: false,
  });
  overlay.attach(maske());

  eingabe(overlay.shadow).value = '2028-08';
  klick();

  expect(meldung(overlay.shadow).className).toBe('hinweis');
  expect(meldung(overlay.shadow).textContent).toContain(NACHZIEHEN);
  overlay.destroy();
});

/**
 * Slice 9.2 — der eigentliche Gewinn des Mängel-Notizhefts.
 *
 * Ein Zettel in der Overalltasche mahnt nichts an; diese Leiste schon. Deshalb
 * ist der wichtigste Fall hier der, in dem die Maske selbst **nichts** vermisst:
 * dass GTÜ zufrieden ist, heißt nicht, dass der Prüfer nichts vergessen hat.
 */
describe('Notiz-Hinweis (Slice 9.2)', () => {
  it('zeigt den Hinweis, wenn zu diesem Auftrag etwas offen ist', async () => {
    const overlay = createAbschlussOverlay({
      read: () => [angemahnt('HU-Fälligkeit', echtesFeld())],
      write: () => ANGENOMMEN,
      notizen: async () => 'Eine offene Notiz: „Querlenker links"',
    });
    overlay.attach(maske());
    await settle();

    expect(notiz(overlay.shadow).textContent).toBe('Eine offene Notiz: „Querlenker links"');
    overlay.destroy();
  });

  it('hält die Leiste allein offen, wenn die Maske nichts vermisst', async () => {
    const overlay = createAbschlussOverlay({
      read: () => [],
      write: () => ANGENOMMEN,
      notizen: async () => '2 offene Notizen, zuerst: „Bremsleitung"',
    });
    overlay.attach(maske());
    await settle();

    expect(bar(overlay.shadow).hidden).toBe(false);
    expect(notiz(overlay.shadow).textContent).toContain('Bremsleitung');
    overlay.destroy();
  });

  it('bleibt still, wenn nichts offen ist', async () => {
    const overlay = createAbschlussOverlay({
      read: () => [],
      write: () => ANGENOMMEN,
      notizen: async () => null,
    });
    overlay.attach(maske());
    await settle();

    expect(notiz(overlay.shadow).textContent).toBe('');
    expect(bar(overlay.shadow).hidden).toBe(true);
    overlay.destroy();
  });

  it('verhält sich ohne die Zusage wie vor Funktion 9', async () => {
    const overlay = createAbschlussOverlay({ read: () => [], write: () => ANGENOMMEN });
    overlay.attach(maske());
    await settle();

    expect(notiz(overlay.shadow).textContent).toBe('');
    expect(bar(overlay.shadow).hidden).toBe(true);
    overlay.destroy();
  });

  it('schluckt einen Fehlschlag beim Holen — das Heft ist eine Erinnerung, kein Riegel', async () => {
    const overlay = createAbschlussOverlay({
      read: () => [angemahnt('HU-Fälligkeit', echtesFeld())],
      write: () => ANGENOMMEN,
      notizen: async () => {
        throw new Error('Service Worker antwortet nicht');
      },
    });
    overlay.attach(maske());
    await settle();

    // Die Felder stehen weiter zur Verfügung, es gibt nur keinen Hinweis.
    expect(notiz(overlay.shadow).textContent).toBe('');
    expect(felder(overlay.shadow)).toHaveLength(1);
    overlay.destroy();
  });

  it('räumt den Hinweis beim Schließen der Maske weg', async () => {
    const overlay = createAbschlussOverlay({
      read: () => [],
      write: () => ANGENOMMEN,
      notizen: async () => 'Eine offene Notiz: „Querlenker links"',
    });
    overlay.attach(maske());
    await settle();
    overlay.detach();

    // Sonst mahnte die nächste Maske mit den Notizen des vorigen Auftrags.
    expect(notiz(overlay.shadow).textContent).toBe('');
    expect(bar(overlay.shadow).hidden).toBe(true);
    overlay.destroy();
  });
});
