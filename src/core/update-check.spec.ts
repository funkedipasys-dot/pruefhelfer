import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_MANIFEST_URL,
  UPDATE_STATE_KEY,
  istNeuer,
  pruefeAufUpdate,
} from './update-check';
import { FakeStorage } from '../testing/fake-storage';

const JETZT = 1_700_000_000_000;

function antwort(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

function fetchStub(...antworten: (Response | Error)[]): typeof fetch & { rufe: string[] } {
  const rufe: string[] = [];
  const fn = (async (url: string) => {
    rufe.push(String(url));
    const naechste = antworten.shift();
    if (naechste instanceof Error) throw naechste;
    return naechste ?? antwort({ version: '0.0.0' });
  }) as unknown as typeof fetch & { rufe: string[] };
  fn.rufe = rufe;
  return fn;
}

describe('istNeuer', () => {
  it.each([
    ['0.6.7', '0.6.6', true],
    ['0.7.0', '0.6.9', true],
    ['1.0.0', '0.9.9', true],
    ['0.6.6', '0.6.6', false],
    ['0.6.5', '0.6.6', false],
    ['0.6', '0.6.0', false],
  ])('%s gegen %s ist %s', (entfernt, aktuell, erwartet) => {
    expect(istNeuer(entfernt, aktuell)).toBe(erwartet);
  });

  it('behandelt Unlesbares als 0, statt zu werfen', () => {
    expect(istNeuer('kaputt', '0.6.6')).toBe(false);
    expect(istNeuer('0.6.7', 'kaputt')).toBe(true);
  });
});

describe('pruefeAufUpdate', () => {
  it('meldet eine neuere Fassung und merkt sich den Abruf', async () => {
    const area = new FakeStorage();
    const fetchFn = fetchStub(antwort({ version: '0.7.0' }));

    const neuere = await pruefeAufUpdate({ fetchFn, area, jetzt: JETZT, aktuelleVersion: '0.6.6' });

    expect(neuere).toBe('0.7.0');
    expect(fetchFn.rufe).toEqual([UPDATE_MANIFEST_URL]);
    expect((await area.get([UPDATE_STATE_KEY]))[UPDATE_STATE_KEY]).toEqual({
      zuletztGeprueft: JETZT,
      gesehen: '0.7.0',
    });
  });

  it('meldet nichts, wenn die eigene Fassung aktuell ist', async () => {
    const area = new FakeStorage();

    const neuere = await pruefeAufUpdate({
      fetchFn: fetchStub(antwort({ version: '0.6.6' })),
      area,
      jetzt: JETZT,
      aktuelleVersion: '0.6.6',
    });

    expect(neuere).toBeNull();
  });

  it('fragt innerhalb von 24 Stunden nicht erneut', async () => {
    const area = new FakeStorage();
    const fetchFn = fetchStub(antwort({ version: '0.7.0' }), antwort({ version: '0.8.0' }));

    await pruefeAufUpdate({ fetchFn, area, jetzt: JETZT, aktuelleVersion: '0.6.6' });
    const zweite = await pruefeAufUpdate({
      fetchFn,
      area,
      jetzt: JETZT + UPDATE_CHECK_INTERVAL_MS - 1,
      aktuelleVersion: '0.6.6',
    });

    // Zehnmal das Popup zu öffnen darf nicht zehn Aufrufe erzeugen.
    expect(fetchFn.rufe).toHaveLength(1);
    expect(zweite).toBe('0.7.0');
  });

  it('fragt nach Ablauf der Frist wieder', async () => {
    const area = new FakeStorage();
    const fetchFn = fetchStub(antwort({ version: '0.7.0' }), antwort({ version: '0.8.0' }));

    await pruefeAufUpdate({ fetchFn, area, jetzt: JETZT, aktuelleVersion: '0.6.6' });
    const zweite = await pruefeAufUpdate({
      fetchFn,
      area,
      jetzt: JETZT + UPDATE_CHECK_INTERVAL_MS,
      aktuelleVersion: '0.6.6',
    });

    expect(fetchFn.rufe).toHaveLength(2);
    expect(zweite).toBe('0.8.0');
  });

  it('bleibt ohne Netz still und merkt sich nichts', async () => {
    const area = new FakeStorage();

    const neuere = await pruefeAufUpdate({
      fetchFn: fetchStub(new Error('offline')),
      area,
      jetzt: JETZT,
      aktuelleVersion: '0.6.6',
    });

    expect(neuere).toBeNull();
    // Nicht gespeichert: ein Aussetzer darf den Hinweis nicht einen Tag lang
    // verzögern.
    expect((await area.get([UPDATE_STATE_KEY]))[UPDATE_STATE_KEY]).toBeUndefined();
  });

  it('verwirft eine Antwort ohne brauchbare Fassungsnummer', async () => {
    const area = new FakeStorage();

    const neuere = await pruefeAufUpdate({
      fetchFn: fetchStub(antwort({ irgendwas: true })),
      area,
      jetzt: JETZT,
      aktuelleVersion: '0.6.6',
    });

    expect(neuere).toBeNull();
  });

  it('verwirft eine Fehlerantwort', async () => {
    const area = new FakeStorage();

    const neuere = await pruefeAufUpdate({
      fetchFn: fetchStub(antwort({ version: '9.9.9' }, false)),
      area,
      jetzt: JETZT,
      aktuelleVersion: '0.6.6',
    });

    expect(neuere).toBeNull();
  });
});
