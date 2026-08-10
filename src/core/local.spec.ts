import {
  LOCAL_ID_PREFIX,
  LOCAL_KATEGORIE,
  LOCAL_KEY,
  MAX_TITEL_LENGTH,
  deleteLocalBaustein,
  isLocalId,
  readLocalBausteine,
  saveLocalBaustein,
  validateLocalDraft,
} from './local';
import { FakeStorage } from '../testing/fake-storage';

const draft = (id: string, titel: string, text: string) => ({ id: `${LOCAL_ID_PREFIX}${id}`, titel, text });

describe('readLocalBausteine', () => {
  it('liefert ohne gespeicherte Einträge eine leere Liste', async () => {
    expect(await readLocalBausteine(new FakeStorage())).toEqual([]);
  });

  it('überspringt unbrauchbare Einträge, statt den ganzen Bestand zu verwerfen', async () => {
    const area = new FakeStorage();
    area.data.set(LOCAL_KEY, [
      { id: 'local-a', titel: 'Gut', text: 'Text A' },
      { id: 'local-b', titel: '', text: 'Titel fehlt' },
      null,
      { id: 'fremd-c', titel: 'Falsches Präfix', text: 'Text C' },
      { id: 'local-d', titel: 'Auch gut', text: 'Text D' },
    ]);

    const items = await readLocalBausteine(area);

    expect(items.map((item) => item.id)).toEqual(['local-a', 'local-d']);
  });

  it('verträgt einen Speicherwert, der kein Array ist', async () => {
    const area = new FakeStorage();
    area.data.set(LOCAL_KEY, { nicht: 'ein Array' });

    expect(await readLocalBausteine(area)).toEqual([]);
  });

  it('leitet Kategorie und Sortierung aus der Reihenfolge ab, statt sie zu speichern', async () => {
    const area = new FakeStorage();
    await saveLocalBaustein(area, draft('a', 'Erster', 'Text A'));
    await saveLocalBaustein(area, draft('b', 'Zweiter', 'Text B'));

    expect(await readLocalBausteine(area)).toEqual([
      { id: 'local-a', titel: 'Erster', text: 'Text A', kategorie: LOCAL_KATEGORIE, sortierung: 1 },
      { id: 'local-b', titel: 'Zweiter', text: 'Text B', kategorie: LOCAL_KATEGORIE, sortierung: 2 },
    ]);
    expect(area.data.get(LOCAL_KEY)).toEqual([
      { id: 'local-a', titel: 'Erster', text: 'Text A' },
      { id: 'local-b', titel: 'Zweiter', text: 'Text B' },
    ]);
  });
});

describe('saveLocalBaustein', () => {
  it('hängt einen neuen Baustein an und gibt den vollständigen Bestand zurück', async () => {
    const area = new FakeStorage();

    const result = await saveLocalBaustein(area, draft('a', 'Titel', 'Ein Text'));

    expect(result).toEqual({
      ok: true,
      bausteine: [{ id: 'local-a', titel: 'Titel', text: 'Ein Text', kategorie: LOCAL_KATEGORIE, sortierung: 1 }],
    });
  });

  it('ersetzt bei bekannter Kennung an Ort und Stelle, statt anzuhängen', async () => {
    const area = new FakeStorage();
    await saveLocalBaustein(area, draft('a', 'Erster', 'Text A'));
    await saveLocalBaustein(area, draft('b', 'Zweiter', 'Text B'));

    await saveLocalBaustein(area, draft('a', 'Erster, überarbeitet', 'Text A neu'));

    expect(await readLocalBausteine(area)).toMatchObject([
      { id: 'local-a', titel: 'Erster, überarbeitet', text: 'Text A neu', sortierung: 1 },
      { id: 'local-b', titel: 'Zweiter', sortierung: 2 },
    ]);
  });

  it('speichert Titel und Text ohne umgebenden Leerraum', async () => {
    const area = new FakeStorage();

    await saveLocalBaustein(area, draft('a', '  Titel  ', '  Ein Text  '));

    expect(await readLocalBausteine(area)).toMatchObject([{ titel: 'Titel', text: 'Ein Text' }]);
  });

  it('schreibt nichts, wenn der Entwurf abgelehnt wird', async () => {
    const area = new FakeStorage();

    const result = await saveLocalBaustein(area, draft('a', '', 'Ein Text'));

    expect(result.ok).toBe(false);
    expect(area.writes).toEqual([]);
  });
});

describe('deleteLocalBaustein', () => {
  it('entfernt den Baustein und vergibt die Sortierung lückenlos neu', async () => {
    const area = new FakeStorage();
    await saveLocalBaustein(area, draft('a', 'Erster', 'Text A'));
    await saveLocalBaustein(area, draft('b', 'Zweiter', 'Text B'));
    await saveLocalBaustein(area, draft('c', 'Dritter', 'Text C'));

    const rest = await deleteLocalBaustein(area, 'local-b');

    expect(rest).toMatchObject([
      { id: 'local-a', sortierung: 1 },
      { id: 'local-c', sortierung: 2 },
    ]);
  });

  it('ist bei unbekannter Kennung kein Fehler', async () => {
    const area = new FakeStorage();
    await saveLocalBaustein(area, draft('a', 'Erster', 'Text A'));

    expect(await deleteLocalBaustein(area, 'local-gibt-es-nicht')).toHaveLength(1);
  });
});

describe('validateLocalDraft', () => {
  it('lehnt einen leeren Titel ab', () => {
    expect(validateLocalDraft(draft('a', '   ', 'Ein Text'))).toEqual({
      ok: false,
      message: 'Bitte einen Titel eintragen.',
    });
  });

  it('lehnt einen zu langen Titel ab', () => {
    const result = validateLocalDraft(draft('a', 'x'.repeat(MAX_TITEL_LENGTH + 1), 'Ein Text'));

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain(`${MAX_TITEL_LENGTH}`);
  });

  it('lehnt einen leeren Text ab', () => {
    expect(validateLocalDraft(draft('a', 'Titel', '  '))).toEqual({
      ok: false,
      message: 'Bitte einen Text eintragen.',
    });
  });

  it('lehnt einen Text ab, der die Platzhalter-Grammatik verletzt', () => {
    const result = validateLocalDraft(draft('a', 'Titel', 'Kennzeichen {{Kennzeichen}} geprüft'));

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain('kein gültiger Platzhalter');
  });

  it('lehnt einen Text ab, der schon in kürzester Fassung nicht ins Bemerkungsfeld passt', () => {
    const result = validateLocalDraft(draft('a', 'Titel', 'x'.repeat(501)));

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain('passt nicht ins Bemerkungsfeld');
  });

  it('nimmt einen Text mit gültigen Platzhaltern an', () => {
    expect(validateLocalDraft(draft('a', 'Titel', 'Fahrzeug {{kennzeichen}} geprüft'))).toEqual({
      ok: true,
      entry: { id: 'local-a', titel: 'Titel', text: 'Fahrzeug {{kennzeichen}} geprüft' },
    });
  });

  it('lehnt eine Kennung ohne eigenes Präfix ab — sonst entstünde ein Eintrag mit Server-Kennung', () => {
    expect(validateLocalDraft({ id: 'srv-42', titel: 'Titel', text: 'Ein Text' })).toMatchObject({ ok: false });
    expect(isLocalId('srv-42')).toBe(false);
  });
});
