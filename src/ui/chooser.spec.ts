// @vitest-environment jsdom

import { CHOOSER_STYLE, createChooser } from './chooser';
import type { ActionResult, Chooser, ChooserManagement } from './chooser';
import type { CachedBaustein } from '../core/baustein';

const BAUSTEINE: CachedBaustein[] = [
  { id: '1', titel: 'Ohne Platzhalter', text: 'Kurzer Vermerk.', kategorie: 'Allgemein', sortierung: 10 },
  { id: '2', titel: 'Mit Platzhalter', text: 'Bei {{km}} km erneuern.', kategorie: 'Allgemein', sortierung: 20 },
];

/** Ein eigener Baustein — erkennbar allein an der Kennung. */
const EIGENER: CachedBaustein = {
  id: 'local-abc',
  titel: 'Mein Text',
  text: 'Selbst getippt.',
  kategorie: 'Eigene',
  sortierung: 1,
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Klick auf einen Knopf, den der `isTrusted`-Riegel durchlässt. */
type TrustedClick = (event: { isTrusted: boolean }) => void;

interface Setup {
  chooser: Chooser;
  container: HTMLElement;
  runs: { id: string; values: Record<string, string> }[];
  /** Die abgefangenen Klick-Handler — jsdom kann kein vertrautes Ereignis erzeugen. */
  action: TrustedClick;
  save: TrustedClick;
  remove: TrustedClick;
}

interface SetupOptions {
  actionLabel?: string;
  result?: () => Promise<ActionResult>;
  manage?: ChooserManagement;
  /** Bestand je `refresh()`-Aufruf; der letzte Eintrag gilt für alle weiteren. */
  bausteine?: CachedBaustein[][];
}

function setup(options: SetupOptions = {}): Setup {
  const container = document.createElement('div');
  document.body.append(container);
  const runs: Setup['runs'] = [];
  const rounds = options.bausteine ?? [BAUSTEINE];
  let round = 0;

  const original = EventTarget.prototype.addEventListener;
  const seen: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }[] = [];
  EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, opts) {
    if (listener !== null) seen.push({ target: this, type, listener });
    return original.call(this, type, listener, opts);
  };

  let chooser: Chooser;
  try {
    chooser = createChooser(container, {
      loadPanel: async () => {
        const items = rounds[Math.min(round, rounds.length - 1)] as CachedBaustein[];
        round += 1;
        return { bausteine: items, hint: null };
      },
      actionLabel: options.actionLabel ?? 'Kopieren',
      emptyText: 'Nichts da.',
      run: async (baustein, values) => {
        runs.push({ id: baustein.id, values });
        return options.result === undefined ? { ok: true } : options.result();
      },
      ...(options.manage !== undefined ? { manage: options.manage } : {}),
    });
  } finally {
    EventTarget.prototype.addEventListener = original;
  }

  const handlerFor = (className: string): TrustedClick => {
    const found = seen.find(
      (entry) =>
        entry.type === 'click' && entry.target instanceof HTMLElement && entry.target.classList.contains(className),
    );
    if (found === undefined || typeof found.listener !== 'function') {
      throw new Error(`Klick-Handler für .${className} nicht gefunden`);
    }
    return found.listener as unknown as TrustedClick;
  };

  return {
    chooser,
    container,
    runs,
    action: handlerFor('primary'),
    save: handlerFor('save'),
    remove: handlerFor('remove'),
  };
}

/** Sammelt die Aufrufe an der Verwaltung ein. */
function fakeManagement(
  overrides: { save?: () => Promise<ActionResult>; template?: () => string | null } = {},
): ChooserManagement & { saved: { id: string | null; titel: string; text: string }[]; removed: string[] } {
  const saved: { id: string | null; titel: string; text: string }[] = [];
  const removed: string[] = [];
  return {
    saved,
    removed,
    save: async (draft) => {
      saved.push(draft);
      return overrides.save === undefined ? { ok: true } : overrides.save();
    },
    remove: async (id) => {
      removed.push(id);
      return { ok: true };
    },
    ...(overrides.template !== undefined ? { template: overrides.template } : {}),
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

/**
 * Der Befund vom 10.08.2026: „Speichern" und „Abbrechen" standen schon in der
 * Liste, obwohl das Formular gar nicht offen war.
 *
 * `setView()` setzte `hidden` die ganze Zeit richtig — nur trägt die Regel des
 * Browsers dafür (`[hidden] { display: none }`) das schwächste Gewicht im
 * Stylesheet-Stapel, und `.form-footer { display: flex }` schlug sie. Ein Test
 * auf die **Eigenschaft** `hidden` hätte das nie bemerkt; darum wird hier
 * gemessen, was am Ende zu sehen ist.
 */
describe('verborgen heißt unsichtbar', () => {
  /**
   * Am Stylesheet selbst geprüft, nicht über `getComputedStyle`: jsdom bildet
   * die Kaskade hier nicht wie ein Browser ab und liefert für ein `hidden`
   * gesetztes Element auch dann `none`, wenn die Regel fehlt. Ein Test darauf
   * wäre grün gewesen, während die Knöpfe im Prüftool weiter dastanden.
   */
  const regeln = (): CSSStyleRule[] => {
    const style = document.createElement('style');
    style.textContent = CHOOSER_STYLE;
    document.head.append(style);
    const sheet = style.sheet;
    if (sheet === null) throw new Error('Stylesheet nicht geparst');
    return [...sheet.cssRules].filter((rule): rule is CSSStyleRule => 'selectorText' in rule);
  };

  it('macht [hidden] stärker als jede eigene display-Regel', () => {
    const alle = regeln();
    const riegel = alle.find((rule) => rule.selectorText === '[hidden]');

    expect(riegel?.style.display).toBe('none');
    expect(riegel?.style.getPropertyPriority('display')).toBe('important');
  });

  it('hat überhaupt display-Regeln, gegen die der Riegel nötig ist', () => {
    // Ohne diese Prüfung könnte der Riegel eines Tages als überflüssig gelten.
    const setzen = regeln().filter((rule) => rule.selectorText !== '[hidden]' && rule.style.display !== '');

    expect(setzen.map((rule) => rule.selectorText)).toContain('.form-footer');
    expect(setzen.map((rule) => rule.selectorText)).toContain('.footer');
  });

  it('verbirgt beide Fußzeilen, solange die Liste zu sehen ist', async () => {
    const { chooser, container } = setup({ manage: fakeManagement() });
    await chooser.refresh();

    expect(container.querySelector<HTMLElement>('.footer')?.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>('.form-footer')?.hidden).toBe(true);
  });

  it('zeigt Speichern und Abbrechen erst im Formular', async () => {
    const { chooser, container } = setup({ manage: fakeManagement() });
    await chooser.refresh();

    container.querySelector<HTMLButtonElement>('.manage button')?.click();

    expect(container.querySelector<HTMLElement>('.form-footer')?.hidden).toBe(false);
    // Und der Einfügen-Knopf bleibt weg — er gehört zur Auswahl, nicht hierher.
    expect(container.querySelector<HTMLElement>('.footer')?.hidden).toBe(true);
  });
});

/**
 * Der Befund vom 10.08.2026: der Klick auf „Bremswerte manuell (BBKP)" führte
 * direkt zum Knopf „Einfügen" — was da eingefügt würde, stand nirgends. Zwei
 * Sätze Amtsdeutsch gingen ungelesen ins Gutachten.
 */
describe('Vorschau vor dem Einfügen', () => {
  const preview = (container: HTMLElement): HTMLElement => {
    const node = container.querySelector<HTMLElement>('.preview');
    if (node === null) throw new Error('keine Vorschau im Panel');
    return node;
  };

  it('bleibt in der Liste weg', async () => {
    const { chooser, container } = setup();
    await chooser.refresh();

    expect(preview(container).hidden).toBe(true);
  });

  it('zeigt den vollständigen Text, sobald ein Titel gewählt ist', async () => {
    const { chooser, container } = setup();
    await chooser.refresh();

    (container.querySelectorAll<HTMLButtonElement>('.item')[0] as HTMLButtonElement).click();

    expect(preview(container).hidden).toBe(false);
    expect(container.querySelector('.preview .titel')?.textContent).toBe('Ohne Platzhalter');
    expect(container.querySelector('.preview .text')?.textContent).toBe('Kurzer Vermerk.');
  });

  it('steht auch bei einem Baustein mit Platzhaltern da', async () => {
    const { chooser, container } = setup();
    await chooser.refresh();

    (container.querySelectorAll<HTMLButtonElement>('.item')[1] as HTMLButtonElement).click();

    // Neben dem Eingabefeld für den Platzhalter, nicht statt seiner.
    expect(preview(container).hidden).toBe(false);
    expect(container.querySelector('.preview .text')?.textContent).toBe('Bei {{km}} km erneuern.');
    expect(container.querySelector<HTMLInputElement>('.values input')).not.toBeNull();
  });

  /** Kein `innerHTML`, nirgends — die Vorschau ist die erste Stelle mit Fließtext. */
  it('rendert getippten Text als Text, nicht als Auszeichnung', async () => {
    const boesartig: CachedBaustein = {
      id: '9',
      titel: '<img src=x onerror=alert(1)>',
      text: '<script>alert(1)</script>',
      kategorie: 'Allgemein',
      sortierung: 1,
    };
    const { chooser, container } = setup({ bausteine: [[boesartig]] });
    await chooser.refresh();

    (container.querySelectorAll<HTMLButtonElement>('.item')[0] as HTMLButtonElement).click();

    expect(container.querySelector('.preview .text')?.textContent).toBe('<script>alert(1)</script>');
    expect(container.querySelector('.preview script')).toBeNull();
    expect(container.querySelector('.preview img')).toBeNull();
  });

  it('räumt sich beim Zurück wieder ab', async () => {
    const { chooser, container } = setup();
    await chooser.refresh();
    (container.querySelectorAll<HTMLButtonElement>('.item')[0] as HTMLButtonElement).click();

    chooser.reset();

    expect(preview(container).hidden).toBe(true);
    expect(container.querySelector('.preview .text')?.textContent).toBe('');
  });
});

describe('createChooser', () => {
  it('beschriftet den Aktionsknopf, wie der Aufrufer es verlangt', () => {
    const { container } = setup({ actionLabel: 'Kopieren' });
    expect(container.querySelector('.footer .primary')?.textContent).toBe('Kopieren');
  });

  it('nennt die Aktion beim Namen, wenn der Klick synthetisch war', async () => {
    const { chooser, container, runs } = setup({ actionLabel: 'Kopieren' });
    await chooser.refresh();
    (container.querySelectorAll<HTMLButtonElement>('.item')[0] as HTMLButtonElement).click();

    container.querySelector<HTMLButtonElement>('.footer .primary')?.click();

    expect(runs).toEqual([]);
    expect(container.querySelector('.message')?.textContent).toBe('Kopieren ist nur per Klick möglich.');
  });

  it('führt eine asynchrone Aktion aus und kehrt danach zur Liste zurück', async () => {
    const { chooser, container, runs, action } = setup();
    await chooser.refresh();
    (container.querySelectorAll<HTMLButtonElement>('.item')[0] as HTMLButtonElement).click();

    action({ isTrusted: true });
    await settle();

    expect(runs).toEqual([{ id: '1', values: {} }]);
    expect(container.querySelector<HTMLElement>('.footer')?.hidden).toBe(true);
    expect(container.querySelector('.message')?.textContent).toBe('');
  });

  it('zeigt die Meldung einer gescheiterten Aktion und bleibt in der Auswahl', async () => {
    const { chooser, container, action } = setup({
      result: async () => ({ ok: false, message: 'Kopieren nicht möglich.' }),
    });
    await chooser.refresh();
    (container.querySelectorAll<HTMLButtonElement>('.item')[0] as HTMLButtonElement).click();

    action({ isTrusted: true });
    await settle();

    expect(container.querySelector('.message')?.textContent).toBe('Kopieren nicht möglich.');
    expect(container.querySelector<HTMLElement>('.footer')?.hidden).toBe(false);
  });

  it('sammelt die getippten Platzhalterwerte ein', async () => {
    const { chooser, container, runs, action } = setup();
    await chooser.refresh();
    (container.querySelectorAll<HTMLButtonElement>('.item')[1] as HTMLButtonElement).click();
    const input = container.querySelector<HTMLInputElement>('.values input');
    if (input === null) throw new Error('Eingabefeld fehlt');
    input.value = '120000';

    action({ isTrusted: true });
    await settle();

    expect(runs).toEqual([{ id: '2', values: { km: '120000' } }]);
  });

  it('leert bei „clear" auch das Suchfeld', async () => {
    const { chooser, container } = setup();
    await chooser.refresh();
    const search = container.querySelector<HTMLInputElement>('.search input');
    if (search === null) throw new Error('Suchfeld fehlt');
    search.value = 'ohne';
    search.dispatchEvent(new Event('input'));
    expect(container.querySelectorAll('.item')).toHaveLength(1);

    chooser.clear();

    expect(search.value).toBe('');
  });
});

/** Eigene Bausteine anlegen, bearbeiten, löschen (Plan-Punkt 61). */
describe('Verwaltung eigener Bausteine', () => {
  const openNew = (container: HTMLElement): void => {
    container.querySelector<HTMLButtonElement>('.manage button')?.click();
  };

  const type = (container: HTMLElement, titel: string, text: string): void => {
    const titelInput = container.querySelector<HTMLInputElement>('.form input');
    const textInput = container.querySelector<HTMLTextAreaElement>('.form textarea');
    if (titelInput === null || textInput === null) throw new Error('Formularfelder fehlen');
    titelInput.value = titel;
    textInput.value = text;
  };

  it('bleibt ohne Verwaltung eine reine Auswahl', async () => {
    const { chooser, container } = setup({ bausteine: [[...BAUSTEINE, EIGENER]] });
    await chooser.refresh();

    expect(container.querySelector<HTMLElement>('.manage')?.hidden).toBe(true);
    expect(container.querySelector('.row .edit')).toBeNull();
  });

  it('bietet den Stift nur an eigenen Bausteinen an', async () => {
    const manage = fakeManagement();
    const { chooser, container } = setup({ manage, bausteine: [[...BAUSTEINE, EIGENER]] });
    await chooser.refresh();

    const edits = container.querySelectorAll<HTMLButtonElement>('.edit');
    expect(edits).toHaveLength(1);
    expect(edits[0]?.getAttribute('aria-label')).toBe('„Mein Text" bearbeiten');
    expect(container.querySelector<HTMLElement>('.manage')?.hidden).toBe(false);
  });

  it('legt einen neuen Baustein ohne Kennung an und lädt die Liste danach neu', async () => {
    const manage = fakeManagement();
    const { chooser, container, save } = setup({ manage, bausteine: [BAUSTEINE, [...BAUSTEINE, EIGENER]] });
    await chooser.refresh();

    openNew(container);
    type(container, 'Mein Text', 'Selbst getippt.');
    save({ isTrusted: true });
    await settle();

    expect(manage.saved).toEqual([{ id: null, titel: 'Mein Text', text: 'Selbst getippt.' }]);
    expect(container.querySelector<HTMLElement>('.form')?.hidden).toBe(true);
    expect(container.querySelector('.message')?.textContent).toBe('Gespeichert.');
    // Der neue Baustein steht in der Liste — also wurde wirklich neu geladen.
    expect(container.querySelectorAll('.item')).toHaveLength(3);
  });

  it('übernimmt beim Bearbeiten die Kennung und die vorhandenen Werte', async () => {
    const manage = fakeManagement();
    const { chooser, container, save } = setup({ manage, bausteine: [[...BAUSTEINE, EIGENER]] });
    await chooser.refresh();

    container.querySelector<HTMLButtonElement>('.edit')?.click();
    expect(container.querySelector<HTMLInputElement>('.form input')?.value).toBe('Mein Text');
    expect(container.querySelector<HTMLTextAreaElement>('.form textarea')?.value).toBe('Selbst getippt.');

    type(container, 'Mein Text v2', 'Überarbeitet.');
    save({ isTrusted: true });
    await settle();

    expect(manage.saved).toEqual([{ id: 'local-abc', titel: 'Mein Text v2', text: 'Überarbeitet.' }]);
  });

  it('zeigt die Ablehnung des Kerns und lässt den getippten Text stehen', async () => {
    const manage = fakeManagement({ save: async () => ({ ok: false, message: 'Bitte einen Titel eintragen.' }) });
    const { chooser, container, save } = setup({ manage });
    await chooser.refresh();

    openNew(container);
    type(container, '', 'Selbst getippt.');
    save({ isTrusted: true });
    await settle();

    expect(container.querySelector('.message')?.textContent).toBe('Bitte einen Titel eintragen.');
    expect(container.querySelector<HTMLElement>('.form')?.hidden).toBe(false);
    expect(container.querySelector<HTMLTextAreaElement>('.form textarea')?.value).toBe('Selbst getippt.');
  });

  it('speichert nicht, wenn der Klick synthetisch war', async () => {
    const manage = fakeManagement();
    const { chooser, container } = setup({ manage });
    await chooser.refresh();

    openNew(container);
    type(container, 'Untergeschoben', 'Von der Seite eingeschleust.');
    container.querySelector<HTMLButtonElement>('.form-footer .save')?.click();
    await settle();

    expect(manage.saved).toEqual([]);
    expect(container.querySelector('.message')?.textContent).toBe('Speichern ist nur per Klick möglich.');
  });

  it('löscht erst beim zweiten Klick', async () => {
    const manage = fakeManagement();
    const { chooser, container, remove } = setup({ manage, bausteine: [[...BAUSTEINE, EIGENER], BAUSTEINE] });
    await chooser.refresh();
    container.querySelector<HTMLButtonElement>('.edit')?.click();

    remove({ isTrusted: true });
    await settle();
    expect(manage.removed).toEqual([]);
    expect(container.querySelector('.remove')?.textContent).toBe('Wirklich löschen?');

    remove({ isTrusted: true });
    await settle();
    expect(manage.removed).toEqual(['local-abc']);
    expect(container.querySelector('.message')?.textContent).toBe('Gelöscht.');
  });

  it('entschärft den Löschknopf wieder, sobald weitergetippt wird', async () => {
    const manage = fakeManagement();
    const { chooser, container, remove } = setup({ manage, bausteine: [[...BAUSTEINE, EIGENER]] });
    await chooser.refresh();
    container.querySelector<HTMLButtonElement>('.edit')?.click();

    remove({ isTrusted: true });
    const textInput = container.querySelector<HTMLTextAreaElement>('.form textarea');
    textInput?.dispatchEvent(new Event('input'));
    remove({ isTrusted: true });
    await settle();

    expect(manage.removed).toEqual([]);
  });

  it('bietet beim Anlegen den Feldinhalt als Vorlage an, beim Bearbeiten nicht', async () => {
    const manage = fakeManagement({ template: () => 'Im Feld stehender Text' });
    const { chooser, container } = setup({ manage, bausteine: [[...BAUSTEINE, EIGENER]] });
    await chooser.refresh();

    openNew(container);
    const template = container.querySelector<HTMLButtonElement>('.form .template');
    expect(template?.hidden).toBe(false);
    template?.click();
    expect(container.querySelector<HTMLTextAreaElement>('.form textarea')?.value).toBe('Im Feld stehender Text');

    container.querySelector<HTMLButtonElement>('.edit')?.click();
    expect(container.querySelector<HTMLElement>('.form .template')?.hidden).toBe(true);
  });

  it('lässt den Vorlagen-Knopf weg, wenn das Feld leer ist', async () => {
    const manage = fakeManagement({ template: () => null });
    const { chooser, container } = setup({ manage });
    await chooser.refresh();

    openNew(container);

    expect(container.querySelector<HTMLElement>('.form .template')?.hidden).toBe(true);
  });

  it('verbirgt das Löschen beim Anlegen — es gibt noch nichts zu löschen', async () => {
    const manage = fakeManagement();
    const { chooser, container } = setup({ manage });
    await chooser.refresh();

    openNew(container);

    expect(container.querySelector<HTMLElement>('.form-footer .remove')?.hidden).toBe(true);
  });

  it('kehrt bei „Abbrechen" zur Liste zurück, ohne zu speichern', async () => {
    const manage = fakeManagement();
    const { chooser, container } = setup({ manage });
    await chooser.refresh();

    openNew(container);
    type(container, 'Verworfen', 'Wird nicht gespeichert.');
    const cancel = [...container.querySelectorAll<HTMLButtonElement>('.form-footer button')].find(
      (button) => button.textContent === 'Abbrechen',
    );
    cancel?.click();

    expect(manage.saved).toEqual([]);
    expect(container.querySelector<HTMLElement>('.form')?.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>('.list')?.hidden).toBe(false);
  });
});
