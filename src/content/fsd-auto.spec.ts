// @vitest-environment jsdom

import { FSD_AUTO_HOST_ID, createFsdAuto, readFsdOrderRows, setFsdLocked } from './fsd-auto';
import type { FsdAutoHandle } from './fsd-auto';

const UUIDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

let automation: FsdAutoHandle | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(0));
  document.body.replaceChildren();
});

afterEach(() => {
  automation?.destroy();
  automation = null;
  vi.useRealTimers();
});

const settleMutations = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function addOrder(index: number, label = `LER P ${index}`, eligible = true): HTMLElement {
  const uuid = UUIDS[index];
  if (uuid === undefined) throw new Error(`keine Test-UUID für ${index}`);
  const order = document.createElement('app-auftrag-liste-element');
  order.className = 'auftrag-liste-element';
  order.id = `auftrag-liste-auftrag-${uuid}`;
  const identifier = document.createElement('span');
  identifier.id = `auftrag-auftrag-${uuid}-element-kennzeichen`;
  identifier.textContent = `  ${label}  `;
  if (eligible) {
    // Echtes Markup des GTÜ-Tools: der Klick-Handler hängt am Kind
    // `.auftrag-element`, nicht am Wirt. Ein Klick auf den Wirt erreicht ihn
    // nie — genau daran scheiterte die erste Fassung.
    const clickable = document.createElement('div');
    clickable.className = 'auftrag-element';
    clickable.append(identifier);
    order.append(clickable);
  } else {
    order.append(identifier);
  }
  document.body.append(order);
  return order;
}

function runButton(): HTMLButtonElement {
  const button = automation?.shadow.querySelector<HTMLButtonElement>('.run');
  if (button === null || button === undefined) throw new Error('Durchklick-Knopf fehlt');
  return button;
}

function start(trusted = true): FsdAutoHandle {
  automation = createFsdAuto({
    label: 'GINO · Prüfhelfer 0.7.0',
    ...(trusted ? { eventIsTrusted: () => true } : {}),
  });
  return automation;
}

function toggle(): HTMLButtonElement {
  const button = automation?.shadow.querySelector<HTMLButtonElement>('.toggle');
  if (button === null || button === undefined) throw new Error('FSD-Schalter fehlt');
  return button;
}

describe('FSD-Automatik – DOM-Controller', () => {
  it('startet sichtbar, aber AUS, und lehnt einen synthetischen Klick standardmäßig ab', () => {
    automation = createFsdAuto({ label: 'GINO · Prüfhelfer 0.7.0' });

    expect(document.getElementById(FSD_AUTO_HOST_ID)).not.toBeNull();
    expect(automation.snapshot().mode).toBe('off');
    expect(toggle().textContent).toContain('AUS');

    toggle().click();

    expect(automation.snapshot().mode).toBe('off');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('liest Kennzeichen normalisiert und ignoriert ungültige Auftrags-IDs', () => {
    addOrder(0, 'LER   P 609');
    const invalid = document.createElement('app-auftrag-liste-element');
    invalid.className = 'auftrag-liste-element';
    invalid.id = 'auftrag-liste-auftrag-keine-uuid';
    document.body.append(invalid);

    expect(readFsdOrderRows()).toEqual([
      {
        id: `auftrag-liste-auftrag-${UUIDS[0]}`,
        label: 'LER P 609',
        eligible: true,
      },
    ]);
  });

  it('nimmt Bestand und Zugänge während der Baseline auf, ohne sie anzuklicken', async () => {
    const first = addOrder(0);
    const second = addOrder(1);
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    first.addEventListener('click', firstClick);
    second.addEventListener('click', secondClick);
    start();

    toggle().click();
    const duringBaseline = addOrder(2);
    const baselineClick = vi.fn();
    duringBaseline.addEventListener('click', baselineClick);
    await settleMutations();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(automation?.snapshot().mode).toBe('armed');
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).not.toHaveBeenCalled();
    expect(baselineClick).not.toHaveBeenCalled();
  });

  it('klickt einen eindeutig neuen Pending-Auftrag erst nach 30 Sekunden genau einmal', async () => {
    addOrder(0);
    start();
    toggle().click();
    await vi.advanceTimersByTimeAsync(3_000);

    const next = addOrder(1, 'LER P 609');
    const clicked = vi.fn();
    next.addEventListener('click', clicked);
    await settleMutations();

    expect(toggle().textContent).toContain('LER P 609 in 30 s');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(clicked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(toggle().textContent).toContain('LER P 609 geöffnet');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('klickt bei Austausch gleicher Listengröße nicht', async () => {
    const old = addOrder(0);
    start();
    toggle().click();
    await vi.advanceTimersByTimeAsync(3_000);

    old.remove();
    const replacement = addOrder(1);
    const clicked = vi.fn();
    replacement.addEventListener('click', clicked);
    await settleMutations();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(clicked).not.toHaveBeenCalled();
    expect(automation?.snapshot().mode).toBe('armed');
  });

  it('überspringt einen Auftrag, dessen Pending-Marker vor Fälligkeit verschwindet', async () => {
    addOrder(0);
    start();
    toggle().click();
    await vi.advanceTimersByTimeAsync(3_000);

    const next = addOrder(1);
    const clicked = vi.fn();
    next.addEventListener('click', clicked);
    await settleMutations();
    next.querySelector('.auftrag-element')?.remove();
    await settleMutations();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(clicked).not.toHaveBeenCalled();
    expect(toggle().textContent).toContain('übersprungen');
  });

  it('hält bei zwei neuen Aufträgen zehn Sekunden Klickabstand', async () => {
    addOrder(0);
    start();
    toggle().click();
    await vi.advanceTimersByTimeAsync(3_000);

    const first = addOrder(1);
    const second = addOrder(2);
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    first.addEventListener('click', firstClick);
    second.addEventListener('click', secondClick);
    await settleMutations();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(firstClick).toHaveBeenCalledTimes(1);
    expect(secondClick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(secondClick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(secondClick).toHaveBeenCalledTimes(1);
  });

  it('schaltet bei echter Bedienung sofort aus und verwirft den Countdown', async () => {
    addOrder(0);
    start();
    toggle().click();
    await vi.advanceTimersByTimeAsync(3_000);

    const next = addOrder(1);
    const clicked = vi.fn();
    next.addEventListener('click', clicked);
    await settleMutations();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));

    expect(automation?.snapshot().mode).toBe('off');
    expect(toggle().textContent).toContain('Bedienung erkannt');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(clicked).not.toHaveBeenCalled();
  });

  it('klickt das Kind .auftrag-element an, nicht den Wirt', async () => {
    addOrder(0);
    start();
    toggle().click();
    await vi.advanceTimersByTimeAsync(3_000);

    const next = addOrder(1);
    const clickable = next.querySelector('.auftrag-element');
    const targets: string[] = [];
    next.addEventListener('click', (event) => {
      targets.push((event.target as HTMLElement).className);
    });
    await settleMutations();
    await vi.advanceTimersByTimeAsync(30_000);

    // Der Wirt sieht den Klick nur als Blase — Ziel ist das Kind. Landete er
    // direkt auf dem Wirt, liefe er am Angular-Handler vorbei.
    expect(clickable).not.toBeNull();
    expect(targets).toEqual(['auftrag-element']);
  });

  describe('Alle durchklicken', () => {
    it('öffnet jede Zeile der Liste mit Abstand, unabhängig davon ob sie neu ist', async () => {
      const first = addOrder(0);
      const second = addOrder(1);
      const firstClick = vi.fn();
      const secondClick = vi.fn();
      first.addEventListener('click', firstClick);
      second.addEventListener('click', secondClick);
      start();

      runButton().click();

      // Bestandszeilen — die Automatik würde sie nie anfassen.
      expect(firstClick).toHaveBeenCalledTimes(1);
      expect(secondClick).not.toHaveBeenCalled();
      expect(toggle().textContent).toContain('Durchklicken: 1 / 2');

      await vi.advanceTimersByTimeAsync(9_999);
      expect(secondClick).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(secondClick).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(toggle().textContent).toContain('Durchklicken fertig · 2');
      expect(runButton().textContent).toBe('Alle durchklicken');
    });

    it('überspringt eine zwischenzeitlich verschwundene Zeile und läuft weiter', async () => {
      addOrder(0);
      const second = addOrder(1);
      const secondClick = vi.fn();
      second.addEventListener('click', secondClick);
      start();

      runButton().click();
      document.getElementById(`auftrag-liste-auftrag-${UUIDS[0]}`)?.remove();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(secondClick).toHaveBeenCalledTimes(1);
    });

    it('bricht bei echter Bedienung ab und öffnet nichts mehr', async () => {
      addOrder(0);
      const second = addOrder(1);
      const secondClick = vi.fn();
      second.addEventListener('click', secondClick);
      start();

      runButton().click();
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));

      expect(toggle().textContent).toContain('Durchklicken abgebrochen');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(secondClick).not.toHaveBeenCalled();
    });

    it('beendet der eigene Startklick den Lauf nicht', async () => {
      const first = addOrder(0);
      const firstClick = vi.fn();
      first.addEventListener('click', firstClick);
      start();

      // Der Startklick ist echt und trifft die Leiste — er darf nicht als
      // „Bedienung erkannt" gegen den gerade gestarteten Lauf zählen.
      runButton().dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

      expect(firstClick).toHaveBeenCalledTimes(1);
      expect(runButton().textContent).toBe('Abbrechen');
    });

    it('meldet eine leere Liste, statt einen Lauf zu starten', () => {
      start();

      runButton().click();

      expect(toggle().textContent).toContain('Keine Aufträge in der Liste');
      expect(runButton().textContent).toBe('Alle durchklicken');
    });

    it('lässt sich mit demselben Knopf wieder abbrechen', async () => {
      addOrder(0);
      const second = addOrder(1);
      const secondClick = vi.fn();
      second.addEventListener('click', secondClick);
      start();

      runButton().click();
      runButton().click();

      expect(toggle().textContent).toContain('Durchklicken abgebrochen');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(secondClick).not.toHaveBeenCalled();
    });
  });

  describe('Sperre während einer DEV-Aufnahme', () => {
    afterEach(() => {
      setFsdLocked(false);
    });

    it('lässt weder die Automatik noch den Durchlauf starten', async () => {
      const order = addOrder(0);
      const clicked = vi.fn();
      order.addEventListener('click', clicked);
      start();
      setFsdLocked(true);

      toggle().click();
      expect(automation?.snapshot().mode).toBe('off');
      expect(toggle().textContent).toContain('Aufnahme läuft');

      runButton().click();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(clicked).not.toHaveBeenCalled();
    });

    it('gibt beides nach dem Ende der Aufnahme wieder frei', () => {
      addOrder(0);
      start();
      setFsdLocked(true);
      toggle().click();
      expect(automation?.snapshot().mode).toBe('off');

      setFsdLocked(false);
      toggle().click();

      expect(automation?.snapshot().mode).not.toBe('off');
    });
  });

  it('räumt Host, Observer, Listener und Timer beim Teardown ab', async () => {
    addOrder(0);
    const instance = start();
    toggle().click();
    await vi.advanceTimersByTimeAsync(3_000);

    instance.destroy();
    automation = null;
    const next = addOrder(1);
    const clicked = vi.fn();
    next.addEventListener('click', clicked);
    await settleMutations();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(document.getElementById(FSD_AUTO_HOST_ID)).toBeNull();
    expect(clicked).not.toHaveBeenCalled();
  });
});
