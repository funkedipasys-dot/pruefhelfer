// @vitest-environment jsdom

import { buildInsertion, effectiveLimit } from '../core/insertion';
import { applyInsertion, checkField } from './field';

const TEXT = 'Bremsbelag vorne bei {{km}} km erneuern.';

function makeField(options: { value?: string; maxLength?: number } = {}): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.maxLength = options.maxLength ?? 500;
  field.value = options.value ?? '';
  document.body.append(field);
  return field;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('checkField', () => {
  it('lässt ein normales Feld durch', () => {
    expect(checkField(makeField())).toBeNull();
  });

  it('erkennt ein Feld, das nicht mehr im Dokument hängt', () => {
    const field = makeField();
    field.remove();
    expect(checkField(field)).toBe('detached');
  });

  it('erkennt ein gesperrtes Feld', () => {
    const field = makeField();
    field.disabled = true;
    expect(checkField(field)).toBe('disabled');
  });

  it('erkennt ein schreibgeschütztes Feld', () => {
    const field = makeField();
    field.readOnly = true;
    expect(checkField(field)).toBe('readonly');
  });

  it('erkennt ein ausgeblendetes Feld', () => {
    const field = makeField();
    field.style.display = 'none';
    expect(checkField(field)).toBe('hidden');
  });
});

describe('applyInsertion', () => {
  it('hängt an, löst input aus und gibt den Abschnitt zurück', () => {
    const field = makeField({ value: 'Vorbefund.' });
    const events: string[] = [];
    field.addEventListener('input', (event) => events.push(`input:${event.bubbles}`));

    const result = applyInsertion(field, { text: TEXT, values: { km: '120000' } });

    expect(result).toEqual({ ok: true, snippet: 'Bremsbelag vorne bei 120000 km erneuern.' });
    expect(field.value).toBe('Vorbefund.\nBremsbelag vorne bei 120000 km erneuern.');
    expect(events).toEqual(['input:true']);
  });

  it('gibt den Fokus nach dem Einfügen wieder ab', () => {
    const field = makeField();
    field.focus();

    applyInsertion(field, { text: 'Kurz.', values: {} });

    expect(document.activeElement).not.toBe(field);
  });

  /**
   * Der Befund vom 10.08.2026. Nach einem Klick auf einen unserer Knöpfe hat das
   * Feld den Fokus **nicht** — und `blur()` auf ein Element ohne Fokus löst kein
   * Ereignis aus. Angular hält das Feld dann für unberührt, die Pflichtangabe
   * bleibt rot, und der Prüfer muss von Hand hinein und wieder heraus.
   */
  it('holt den Fokus selbst, wenn das Feld ihn nicht hat', () => {
    const field = makeField();
    const anderswo = document.createElement('button');
    document.body.append(anderswo);
    anderswo.focus();

    const events: string[] = [];
    for (const type of ['focus', 'input', 'change', 'blur']) {
      field.addEventListener(type, () => events.push(type));
    }

    applyInsertion(field, { text: 'Kurz.', values: {} });

    expect(events).toEqual(['focus', 'input', 'change', 'blur']);
  });

  it.each([
    ['gesperrt', (field: HTMLTextAreaElement) => (field.disabled = true)],
    ['schreibgeschützt', (field: HTMLTextAreaElement) => (field.readOnly = true)],
    ['ausgeblendet', (field: HTMLTextAreaElement) => (field.style.display = 'none')],
  ])('schreibt nichts, wenn das Feld %s ist', (_label, sabotage) => {
    const field = makeField({ value: 'Unverändert.' });
    sabotage(field);

    const result = applyInsertion(field, { text: 'Kurz.', values: {} });

    expect(result.ok).toBe(false);
    expect(field.value).toBe('Unverändert.');
  });

  it('schreibt nichts, wenn ein Platzhalterwert fehlt', () => {
    const field = makeField({ value: 'Unverändert.' });

    const result = applyInsertion(field, { text: TEXT, values: { km: '' } });

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('km') });
    expect(field.value).toBe('Unverändert.');
  });

  it('schreibt nichts und nennt die überzähligen Zeichen, wenn es nicht passt', () => {
    const field = makeField({ value: 'x'.repeat(490), maxLength: 500 });

    const result = applyInsertion(field, { text: 'zwanzig Zeichen lang', values: {} });

    // 490 vorhandene + 1 Trenner + 20 Zeichen = 511, also 11 zu viel.
    expect(result).toEqual({ ok: false, message: 'passt nicht — 11 Zeichen zu viel.' });
    expect(field.value).toBe('x'.repeat(490));
  });

  it('rechnet das vorhandene maxLength des Feldes, nicht die 500 aus dem Rückfall', () => {
    const field = makeField({ maxLength: 20 });

    const result = applyInsertion(field, { text: 'einundzwanzig Zeichen', values: {} });

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('1 Zeichen zu viel') });
  });

  it('merkt, wenn die Anwendung den Wert nach dem input-Ereignis zurückschreibt', () => {
    const field = makeField({ value: 'Original.' });
    // Ein Angular-Formatierer, der die Eingabe verwirft.
    field.addEventListener('input', () => {
      field.value = 'Original.';
    });

    const result = applyInsertion(field, { text: 'Kurz.', values: {} });

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('verworfen') });
    expect(field.value).toBe('Original.');
  });
});

describe('Overlay-Einfügen und Popup-Kopieren (Plan-Punkt 47)', () => {
  const values = { km: '120000' };

  it('liefern denselben Text', () => {
    const field = makeField({ maxLength: 500 });

    const inserted = applyInsertion(field, { text: TEXT, values });
    // Der Popup-Weg hat kein Feld: leerer Bestand, Rückfall-Obergrenze.
    const copied = buildInsertion({ existing: '', limit: effectiveLimit(-1, 0), text: TEXT, values });

    if (!inserted.ok || !copied.ok) throw new Error('unerreichbar');
    expect(inserted.snippet).toBe(copied.snippet);
  });

  it('lehnen dieselben Eingaben ab', () => {
    const field = makeField({ maxLength: 500 });
    const zuLang = 'y'.repeat(600);

    const inserted = applyInsertion(field, { text: zuLang, values: {} });
    const copied = buildInsertion({ existing: '', limit: effectiveLimit(-1, 0), text: zuLang, values: {} });

    expect(inserted.ok).toBe(false);
    expect(copied.ok).toBe(false);
    expect(field.value).toBe('');
  });
});
