// @vitest-environment jsdom

import { OVERLAY_HOST_ID, createOverlay } from './overlay';
import type { OverlayHandle } from './overlay';
import type { ApplyResult } from './field';
import type { CachedBaustein } from '../core/baustein';

const BAUSTEINE: CachedBaustein[] = [
  { id: '1', titel: 'Bremsbelag', text: 'Bremsbelag vorne bei {{km}} km erneuern.', kategorie: 'Bremsanlage', sortierung: 10 },
  { id: '2', titel: 'Bremsscheibe', text: 'Bremsscheibe hinten prüfen.', kategorie: 'Bremsanlage', sortierung: 20 },
  { id: '3', titel: 'Reifenprofil', text: 'Reifenprofil unter Mindestmaß.', kategorie: 'Räder', sortierung: 30 },
];

interface Harness {
  overlay: OverlayHandle;
  field: HTMLTextAreaElement;
  inserts: { baustein: CachedBaustein; values: Record<string, string> }[];
  result: ApplyResult;
  /** Der beim Anlegen abgefangene Klick-Handler des „Einfügen"-Knopfes. */
  insertHandler: (event: { isTrusted: boolean }) => void;
}

/**
 * jsdom kann keine vertrauten Ereignisse erzeugen: `isTrusted` ist dort eine
 * nicht überschreibbare Eigenschaft jeder Ereignis-Instanz. Für den
 * **negativen** Fall — den, auf den es sicherheitshalber ankommt — genügt das:
 * ein echter `.click()` ist synthetisch und muss abprallen, und genau das wird
 * unten über den vollen DOM-Weg geprüft.
 *
 * Für den positiven Fall wird der registrierte Handler beim Anlegen des
 * Overlays abgefangen und mit einem vertrauten Ereignis gerufen. Dass er
 * überhaupt am richtigen Knopf hängt, beweist der negative Test.
 */
function captureInsertHandler(build: () => OverlayHandle): {
  overlay: OverlayHandle;
  handler: (event: { isTrusted: boolean }) => void;
} {
  const original = EventTarget.prototype.addEventListener;
  const seen: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }[] = [];
  EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, options) {
    if (listener !== null) seen.push({ target: this, type, listener });
    return original.call(this, type, listener, options);
  };
  try {
    const overlay = build();
    const found = seen.find(
      (entry) =>
        entry.type === 'click' &&
        entry.target instanceof HTMLElement &&
        entry.target.classList.contains('primary'),
    );
    if (found === undefined || typeof found.listener !== 'function') {
      throw new Error('Klick-Handler des Einfügen-Knopfes nicht gefunden');
    }
    return { overlay, handler: found.listener as unknown as (event: { isTrusted: boolean }) => void };
  } finally {
    EventTarget.prototype.addEventListener = original;
  }
}

/** jsdom kennt weder ResizeObserver noch zwangsläufig requestAnimationFrame. */
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame ??= ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame ??= ((handle: number) => clearTimeout(handle)) as typeof cancelAnimationFrame;
});

let harness: Harness;

beforeEach(() => {
  document.body.replaceChildren();
  const field = document.createElement('textarea');
  field.maxLength = 500;
  document.body.append(field);

  const inserts: Harness['inserts'] = [];
  const state = { result: { ok: true, snippet: 'eingefügt' } as ApplyResult };

  const { overlay, handler } = captureInsertHandler(() =>
    createOverlay({
      loadPanel: async () => ({ bausteine: BAUSTEINE, hint: null }),
      insert: (_field, baustein, values) => {
        inserts.push({ baustein, values });
        return state.result;
      },
    }),
  );
  overlay.attach(field);

  harness = {
    overlay,
    field,
    inserts,
    insertHandler: handler,
    get result(): ApplyResult {
      return state.result;
    },
    set result(next: ApplyResult) {
      state.result = next;
    },
  };
});

afterEach(() => {
  harness.overlay.destroy();
});

const shadow = (): ShadowRoot => harness.overlay.shadow;
const query = <T extends Element>(selector: string): T => {
  const node = shadow().querySelector<T>(selector);
  if (node === null) throw new Error(`nicht gefunden: ${selector}`);
  return node;
};
const items = (): HTMLButtonElement[] => [...shadow().querySelectorAll<HTMLButtonElement>('.item')];
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function openPanel(): Promise<void> {
  query<HTMLButtonElement>('.launcher button').click();
  await settle();
}

/**
 * Der Klick eines Menschen, wie ihn Chrome liefert.
 *
 * Wartet einen Durchlauf ab: die Aktion darf asynchron sein — im Popup ist sie
 * es (Zwischenablage) —, deshalb erscheint eine Meldung erst danach.
 */
async function trustedClick(): Promise<void> {
  harness.insertHandler({ isTrusted: true });
  await settle();
}

describe('Wirt und Schatten (Plan-Punkt 45)', () => {
  it('hängt genau einen Wirt direkt an body — nichts im Angular-Baum', () => {
    const hosts = document.querySelectorAll(`#${OVERLAY_HOST_ID}`);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.parentElement).toBe(document.body);
  });

  it('hält den gesamten Inhalt hinter der Shadow-Grenze', () => {
    expect(document.querySelector('.panel')).toBeNull();
    expect(shadow().querySelector('.panel')).not.toBeNull();
  });

  it('räumt den Wirt beim Zerstören wieder ab', () => {
    harness.overlay.destroy();
    expect(document.getElementById(OVERLAY_HOST_ID)).toBeNull();
  });
});

describe('Liste (Plan-Punkt 46)', () => {
  it('gruppiert nach Kategorie in der Reihenfolge des Bestands', async () => {
    await openPanel();

    const headings = [...shadow().querySelectorAll('.category')].map((node) => node.textContent);
    expect(headings).toEqual(['Bremsanlage', 'Räder']);
    expect(items().map((node) => node.textContent)).toEqual(['Bremsbelag', 'Bremsscheibe', 'Reifenprofil']);
  });

  it('filtert über das Suchfeld', async () => {
    await openPanel();
    const search = query<HTMLInputElement>('.search input');

    search.value = 'reifen';
    search.dispatchEvent(new Event('input'));

    expect(items().map((node) => node.textContent)).toEqual(['Reifenprofil']);
  });

  it('sucht auch im Bausteintext', async () => {
    await openPanel();
    const search = query<HTMLInputElement>('.search input');

    search.value = 'mindestmaß';
    search.dispatchEvent(new Event('input'));

    expect(items()).toHaveLength(1);
  });

  it('schreibt Markup aus einem Titel als Text, nicht als Element', async () => {
    harness.overlay.destroy();
    const overlay = createOverlay({
      loadPanel: async () => ({
        bausteine: [{ ...(BAUSTEINE[0] as CachedBaustein), titel: '<img src=x onerror=alert(1)>' }],
        hint: null,
      }),
      insert: () => ({ ok: true, snippet: '' }),
    });
    harness.overlay = overlay;
    overlay.attach(harness.field);

    (overlay.shadow.querySelector('.launcher button') as HTMLButtonElement).click();
    await settle();

    const item = overlay.shadow.querySelector('.item');
    expect(item?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(overlay.shadow.querySelector('img')).toBeNull();
  });
});

describe('Auswahl und Platzhalter (Plan-Punkt 47)', () => {
  it('fragt für jeden Platzhalter einen Wert ab', async () => {
    await openPanel();
    (items()[0] as HTMLButtonElement).click();

    const inputs = [...shadow().querySelectorAll<HTMLInputElement>('.values input')];
    expect(inputs.map((node) => node.dataset['platzhalter'])).toEqual(['km']);
  });

  it('zeigt für einen Baustein ohne Platzhalter kein Eingabefeld', async () => {
    await openPanel();
    (items()[1] as HTMLButtonElement).click();

    expect(query<HTMLElement>('.values').hidden).toBe(true);
    expect(query<HTMLElement>('.footer').hidden).toBe(false);
  });

  it('reicht die getippten Werte weiter', async () => {
    await openPanel();
    (items()[0] as HTMLButtonElement).click();
    query<HTMLInputElement>('.values input').value = '120000';

    await trustedClick();

    expect(harness.inserts).toEqual([{ baustein: BAUSTEINE[0], values: { km: '120000' } }]);
  });

  it('führt über „Zurück" wieder zur Liste', async () => {
    await openPanel();
    (items()[0] as HTMLButtonElement).click();

    query<HTMLButtonElement>('.footer button:not(.primary)').click();

    expect(query<HTMLElement>('.footer').hidden).toBe(true);
    expect(items()).toHaveLength(3);
  });
});

describe('Einfügen (Plan-Punkt 51)', () => {
  it('schreibt bei einem synthetischen Klick nichts', async () => {
    await openPanel();
    (items()[1] as HTMLButtonElement).click();

    // Genau das, was die GTÜ-Seite tun könnte: den Knopf finden und klicken.
    query<HTMLButtonElement>('.footer .primary').click();

    expect(harness.inserts).toEqual([]);
    expect(query('.message').textContent).toContain('nur per Klick');
  });

  it('schreibt bei einem echten Klick', async () => {
    await openPanel();
    (items()[1] as HTMLButtonElement).click();

    await trustedClick();

    expect(harness.inserts).toHaveLength(1);
  });

  it('schließt das Panel nach dem Einfügen', async () => {
    await openPanel();
    (items()[1] as HTMLButtonElement).click();

    await trustedClick();

    expect(query<HTMLElement>('.panel').hidden).toBe(true);
  });

  it('bleibt offen und zeigt die Meldung, wenn es nicht passt', async () => {
    harness.result = { ok: false, message: 'passt nicht — 11 Zeichen zu viel.' };
    await openPanel();
    (items()[1] as HTMLButtonElement).click();

    await trustedClick();

    expect(query<HTMLElement>('.panel').hidden).toBe(false);
    expect(query('.message').textContent).toBe('passt nicht — 11 Zeichen zu viel.');
  });

  it('schreibt nicht mehr, wenn das Feld inzwischen weg ist', async () => {
    await openPanel();
    (items()[1] as HTMLButtonElement).click();
    harness.field.remove();

    await trustedClick();

    expect(harness.inserts).toEqual([]);
    expect(query('.message').textContent).toContain('nicht mehr da');
  });
});

describe('Zustand aus dem Service Worker', () => {
  it('zeigt den Hinweis über veralteten Bestand', async () => {
    harness.overlay.destroy();
    const overlay = createOverlay({
      loadPanel: async () => ({ bausteine: BAUSTEINE, hint: 'Bestand könnte veraltet sein.' }),
      insert: () => ({ ok: true, snippet: '' }),
    });
    harness.overlay = overlay;
    overlay.attach(harness.field);

    (overlay.shadow.querySelector('.launcher button') as HTMLButtonElement).click();
    await settle();

    expect(overlay.shadow.querySelector('.hint')?.textContent).toBe('Bestand könnte veraltet sein.');
  });

  it('erklärt einen leeren Bestand, statt eine leere Liste zu zeigen', async () => {
    harness.overlay.destroy();
    const overlay = createOverlay({
      loadPanel: async () => ({ bausteine: [], hint: null }),
      insert: () => ({ ok: true, snippet: '' }),
    });
    harness.overlay = overlay;
    overlay.attach(harness.field);

    (overlay.shadow.querySelector('.launcher button') as HTMLButtonElement).click();
    await settle();

    expect(overlay.shadow.querySelector('.empty')?.textContent).toBe('Keine Textbausteine gespeichert.');
  });

  /**
   * Der Rat bei leerem Bestand hängt davon ab, woher die Bausteine kommen
   * (Plan-Punkt 72): „koppeln oder abgleichen" wäre in einer Fassung ohne
   * Server ein Verweis ins Leere.
   */
  it('übernimmt den Rat des Aufrufers, wenn er einen mitgibt', async () => {
    harness.overlay.destroy();
    const overlay = createOverlay({
      loadPanel: async () => ({ bausteine: [], hint: null }),
      insert: () => ({ ok: true, snippet: '' }),
      emptyText: 'Bitte im Popup koppeln oder abgleichen.',
    });
    harness.overlay = overlay;
    overlay.attach(harness.field);

    (overlay.shadow.querySelector('.launcher button') as HTMLButtonElement).click();
    await settle();

    expect(overlay.shadow.querySelector('.empty')?.textContent).toContain('koppeln');
  });
});

describe('Aufbau', () => {
  /**
   * Der Starter darf nicht dastehen, bevor ein Feld gefunden ist. `detach()`
   * würde ihn verstecken — aber `detach()` läuft nie, wenn nie ein Feld da war,
   * und das ist auf allen Seiten des Tools außerhalb des Ergebnis-Schritts der
   * Normalfall. Sichtbar erzeugt stand er dort ohne `top`/`left` herum.
   *
   * Deshalb ein eigenes Overlay statt `harness`: das legt in `beforeEach`
   * immer sofort ein Feld an und käme an diesen Zustand nie heran.
   */
  it('lässt den Starter weg, solange kein Feld verbunden ist', () => {
    const overlay = createOverlay({
      loadPanel: async () => ({ bausteine: BAUSTEINE, hint: null }),
      insert: () => ({ ok: true, snippet: '' }),
    });

    try {
      const launcher = overlay.shadow.querySelector<HTMLElement>('.launcher');
      expect(launcher?.hidden).toBe(true);
      expect(overlay.shadow.querySelector<HTMLElement>('.panel')?.hidden).toBe(true);
    } finally {
      overlay.destroy();
    }
  });

  it('zeigt den Starter, sobald ein Feld verbunden ist', () => {
    expect(query<HTMLElement>('.launcher').hidden).toBe(false);
  });

  /**
   * Der Schatten ist geschlossen: die GTÜ-Seite darf die Vorschau nicht
   * umschreiben können, während `run()` weiterhin den ausgewählten Baustein
   * einfügt. Geprüft wird am Wirt im Dokument, nicht am zurückgegebenen
   * `shadow` — genau diesen Weg nähme ein Skript der Seite.
   */
  it('hält den Schatten für die Seite verschlossen', () => {
    const host = document.getElementById(OVERLAY_HOST_ID);

    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBeNull();
  });
});

describe('Abbau', () => {
  it('versteckt Starter und Panel beim Abmelden', async () => {
    await openPanel();

    harness.overlay.detach();

    expect(query<HTMLElement>('.launcher').hidden).toBe(true);
    expect(query<HTMLElement>('.panel').hidden).toBe(true);
  });

  it('lässt sich nach dem Abmelden erneut verbinden', async () => {
    harness.overlay.detach();
    harness.overlay.attach(harness.field);

    await openPanel();

    expect(items()).toHaveLength(3);
  });
});

describe('Schließen über die Kopfzeile (Plan-Punkt 63)', () => {
  it('schließt das Panel', async () => {
    await openPanel();
    expect(query<HTMLElement>('.panel').hidden).toBe(false);

    query<HTMLButtonElement>('.head .close').click();

    expect(query<HTMLElement>('.panel').hidden).toBe(true);
  });

  it('lässt den Starter stehen, das Panel ist danach wieder zu öffnen', async () => {
    await openPanel();
    query<HTMLButtonElement>('.head .close').click();

    expect(query<HTMLElement>('.launcher').hidden).toBe(false);
    await openPanel();

    expect(query<HTMLElement>('.panel').hidden).toBe(false);
  });

  it('verwirft die angefangene Auswahl — beim nächsten Öffnen steht die Liste da', async () => {
    await openPanel();
    items()[0]?.click();
    expect(query<HTMLElement>('.footer').hidden).toBe(false);

    query<HTMLButtonElement>('.head .close').click();
    await openPanel();

    expect(query<HTMLElement>('.footer').hidden).toBe(true);
    expect(query<HTMLElement>('.list').hidden).toBe(false);
  });
});

describe('Eigene Bausteine im Panel (Plan-Punkt 61)', () => {
  /** Ein zweites Overlay, diesmal mit Verwaltung — der Harness baut ohne. */
  function withManagement(): OverlayHandle {
    return createOverlay({
      loadPanel: async () => ({ bausteine: BAUSTEINE, hint: null }),
      insert: () => ({ ok: true, snippet: 'eingefügt' }),
      manage: { save: async () => ({ ok: true }), remove: async () => ({ ok: true }) },
    });
  }

  it('zeigt ohne Verwaltung keinen Anlege-Knopf', async () => {
    await openPanel();

    expect(query<HTMLElement>('.manage').hidden).toBe(true);
  });

  it('bietet den aktuellen Feldinhalt als Vorlage an, ohne umgebenden Leerraum', async () => {
    const overlay = withManagement();
    try {
      harness.field.value = '  Bereits getippter Vermerk.  ';
      overlay.attach(harness.field);
      overlay.shadow.querySelector<HTMLButtonElement>('.launcher button')?.click();
      await settle();

      overlay.shadow.querySelector<HTMLButtonElement>('.manage button')?.click();
      const template = overlay.shadow.querySelector<HTMLButtonElement>('.form .template');
      expect(template?.hidden).toBe(false);
      template?.click();

      expect(overlay.shadow.querySelector<HTMLTextAreaElement>('.form textarea')?.value).toBe(
        'Bereits getippter Vermerk.',
      );
    } finally {
      overlay.destroy();
    }
  });

  it('lässt den Vorlagen-Knopf weg, solange das Feld leer ist', async () => {
    const overlay = withManagement();
    try {
      harness.field.value = '   ';
      overlay.attach(harness.field);
      overlay.shadow.querySelector<HTMLButtonElement>('.launcher button')?.click();
      await settle();

      overlay.shadow.querySelector<HTMLButtonElement>('.manage button')?.click();

      expect(overlay.shadow.querySelector<HTMLElement>('.form .template')?.hidden).toBe(true);
    } finally {
      overlay.destroy();
    }
  });
});
