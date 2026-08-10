// @vitest-environment jsdom

import { watchField } from './watcher';

const SELECTOR = '#bemerkung';

/** MutationObserver arbeitet als Microtask — einmal die Schlange leerlaufen lassen. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function addField(id = 'bemerkung'): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.id = id;
  document.body.append(field);
  return field;
}

interface Log {
  attached: HTMLTextAreaElement[];
  detaches: number;
  events: string[];
}

function start(ignoreWithin?: Element): { log: Log; stop: () => void } {
  const log: Log = { attached: [], detaches: 0, events: [] };
  const stop = watchField({
    root: document,
    selector: SELECTOR,
    ...(ignoreWithin !== undefined ? { ignoreWithin } : {}),
    onAttach: (field) => {
      log.attached.push(field);
      log.events.push('attach');
    },
    onDetach: () => {
      log.detaches += 1;
      log.events.push('detach');
    },
  });
  return { log, stop };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('watchField — SPA-Lebenszyklus', () => {
  it('findet ein Feld, das schon dasteht', () => {
    const field = addField();
    const { log, stop } = start();

    expect(log.attached).toEqual([field]);
    stop();
  });

  it('findet ein Feld, das erst später erscheint', async () => {
    const { log, stop } = start();
    expect(log.attached).toHaveLength(0);

    const field = addField();
    await settle();

    expect(log.attached).toEqual([field]);
    stop();
  });

  it('meldet ab, wenn das Feld verschwindet', async () => {
    const field = addField();
    const { log, stop } = start();

    field.remove();
    await settle();

    expect(log.events).toEqual(['attach', 'detach']);
    stop();
  });

  it('fängt ein neu erzeugtes Feld wieder ein', async () => {
    const first = addField();
    const { log, stop } = start();

    first.remove();
    await settle();
    const second = addField();
    await settle();

    expect(log.events).toEqual(['attach', 'detach', 'attach']);
    expect(log.attached[1]).toBe(second);
    expect(log.attached[1]).not.toBe(first);
    stop();
  });

  it('meldet beim Austausch in einem Zug erst ab, dann an', async () => {
    const first = addField();
    const { log, stop } = start();

    // Angular ersetzt den Teilbaum: altes Feld raus, neues rein, eine Mutation.
    first.remove();
    const second = addField();
    await settle();

    expect(log.events).toEqual(['attach', 'detach', 'attach']);
    expect(log.attached[1]).toBe(second);
    stop();
  });

  it('meldet dasselbe Feld nicht doppelt an', async () => {
    addField();
    const { log, stop } = start();

    // Fremde Mutationen an anderer Stelle im Baum.
    for (let i = 0; i < 5; i += 1) document.body.append(document.createElement('span'));
    await settle();

    expect(log.attached).toHaveLength(1);
    stop();
  });

  it('meldet beim Anhalten ein verbundenes Feld ab', () => {
    addField();
    const { log, stop } = start();

    stop();

    expect(log.events).toEqual(['attach', 'detach']);
  });

  it('reagiert nach dem Anhalten nicht mehr', async () => {
    const { log, stop } = start();
    stop();

    addField();
    await settle();

    expect(log.attached).toHaveLength(0);
  });

  it('übergeht Änderungen im eigenen Wirt', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    addField();
    const { log, stop } = start(host);

    // Das eigene Panel baut seinen Inhalt um — daraus darf keine Neuauswertung
    // folgen. Ein Fehler hier wäre nicht falsch, nur teuer; abgesichert ist es
    // ohnehin durch die Idempotenz.
    host.append(document.createElement('div'));
    await settle();

    expect(log.events).toEqual(['attach']);
    stop();
  });

  it('wertet trotzdem aus, wenn im selben Schwung auch außerhalb des Wirts etwas passiert', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const { log, stop } = start(host);

    host.append(document.createElement('div'));
    const field = addField();
    await settle();

    expect(log.attached).toEqual([field]);
    stop();
  });
});
