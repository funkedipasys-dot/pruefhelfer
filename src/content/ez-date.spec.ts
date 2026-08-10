// @vitest-environment jsdom

import { EZ_DATE_FIELD_SELECTOR, applyEzDate, findEzDateError, readEzDateProposal } from './ez-date';

const HEUTE = new Date(2026, 7, 10);

/** Ein Feld so, wie Material es rendert: Eingabe und Meldung in einer Hülle. */
function formField(id: string, value: string, error?: string): HTMLInputElement {
  const wrapper = document.createElement('mat-form-field');
  const field = document.createElement('input');
  field.id = id;
  field.value = value;
  wrapper.append(field);
  if (error !== undefined) {
    const meldung = document.createElement('mat-error');
    meldung.textContent = error;
    wrapper.append(meldung);
  }
  document.body.append(wrapper);
  return field;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('das Feld finden', () => {
  it('trifft das Erstzulassungsfeld', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    expect(document.querySelector(EZ_DATE_FIELD_SELECTOR)).toBe(field);
  });
});

describe('die Fehlermeldung als Aufhänger', () => {
  it('nimmt die Meldung aus derselben Hülle', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010', 'Eingabe muss nach dem 1.5.1893 sein.');
    expect(findEzDateError(field)?.textContent).toBe('Eingabe muss nach dem 1.5.1893 sein.');
  });

  it('greift nicht nach der Meldung eines anderen Feldes', () => {
    formField('fahrzeug-hu', '', 'Pflichtfeld');
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    expect(findEzDateError(field)).toBeNull();
  });

  it('bleibt ohne Meldung ohne Aufhänger — die Leiste hängt sich dann ans Feld', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    expect(findEzDateError(field)).toBeNull();
  });

  it('kommt auch mit der Klassenschreibweise zurecht', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'mat-mdc-form-field';
    const field = document.createElement('input');
    const meldung = document.createElement('div');
    meldung.className = 'mat-mdc-form-field-error';
    meldung.textContent = 'Eingabe muss nach dem 1.5.1893 sein.';
    wrapper.append(field, meldung);
    document.body.append(wrapper);
    expect(findEzDateError(field)).toBe(meldung);
  });

  it('meldet null, wo es gar keine Hülle gibt', () => {
    const field = document.createElement('input');
    document.body.append(field);
    expect(findEzDateError(field)).toBeNull();
  });
});

/**
 * Der Befund aus der Abnahme vom 10.08.2026: der Knopf hing am Eingabefeld statt
 * an der Meldung und lag damit über dem „Geschätzt"-Schalter. Welche Klassen das
 * Tool an seine Meldung hängt, ist von außen nicht verlässlich zu erraten — der
 * Wortlaut schon.
 */
describe('die Meldung über den Wortlaut finden', () => {
  it('findet sie auch ohne Material-Klassen', () => {
    const huelle = document.createElement('div');
    const field = document.createElement('input');
    const meldung = document.createElement('div');
    meldung.className = 'irgendwas-eigenes';
    meldung.textContent = 'Eingabe muss nach dem 1.5.1893 sein.';
    huelle.append(field, meldung);
    document.body.append(huelle);

    expect(findEzDateError(field)).toBe(meldung);
  });

  it('nimmt das Blatt, nicht die Hülle darum', () => {
    const huelle = document.createElement('div');
    const field = document.createElement('input');
    const wrapper = document.createElement('div');
    const meldung = document.createElement('span');
    meldung.textContent = 'Eingabe muss nach dem 01.05.1893 sein.';
    wrapper.append(meldung);
    huelle.append(field, wrapper);
    document.body.append(huelle);

    // Der Wrapper trägt denselben Text, ist aber ein Kasten über die volle
    // Breite — an ihm gemessen läge der Knopf wieder daneben.
    expect(findEzDateError(field)).toBe(meldung);
  });

  it('bleibt bei zwei fehlerhaften Datumsfeldern lieber still', () => {
    const huelle = document.createElement('div');
    const field = document.createElement('input');
    const eine = document.createElement('div');
    eine.textContent = 'Eingabe muss nach dem 1.5.1893 sein.';
    const andere = document.createElement('div');
    andere.textContent = 'Eingabe muss nach dem 1.5.1893 sein.';
    huelle.append(field, eine, andere);
    document.body.append(huelle);

    expect(findEzDateError(field)).toBeNull();
  });

  it('lässt sich von fremdem Text nicht beirren', () => {
    const huelle = document.createElement('div');
    const field = document.createElement('input');
    const fremd = document.createElement('div');
    fremd.textContent = 'Mit den eingegebenen Daten konnte keine passende Untersuchung gefunden werden';
    huelle.append(field, fremd);
    document.body.append(huelle);

    expect(findEzDateError(field)).toBeNull();
  });

  it('bevorzugt die Material-Klasse, wo es sie gibt', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010', 'Eingabe muss nach dem 1.5.1893 sein.');
    expect(findEzDateError(field)?.tagName.toLowerCase()).toBe('mat-error');
  });
});

describe('den Vorschlag lesen', () => {
  it('liest ihn aus dem Inhalt des Feldes', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    expect(readEzDateProposal(field, HEUTE)?.text).toBe('25.12.2010');
  });

  it('schweigt bei einem vierstelligen Jahr', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.2010');
    expect(readEzDateProposal(field, HEUTE)).toBeNull();
  });
});

describe('eintragen', () => {
  /** Was am Feld ankommt — Ereignisse, keine Methodenaufrufe. */
  function record(field: HTMLInputElement): string[] {
    const gesehen: string[] = [];
    for (const type of ['focus', 'input', 'change', 'blur']) {
      field.addEventListener(type, () => gesehen.push(type));
    }
    return gesehen;
  }

  it('schreibt den Wert und meldet Angular die Änderung', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    const gesehen = record(field);

    expect(applyEzDate(field, '25.12.2010')).toEqual({ ok: true });
    expect(field.value).toBe('25.12.2010');
    // `input` für den Wert, `blur` für die Neubewertung — und `focus` davor,
    // weil `blur()` ohne ihn gar kein Ereignis auslöst.
    expect(gesehen).toEqual(['focus', 'input', 'change', 'blur']);
  });

  /**
   * Der Befund vom 10.08.2026: der Knopf trug das Datum ein, das Formular hielt
   * das Feld aber weiter für leer — der Prüfer musste von Hand hinein und wieder
   * heraus. `blur()` ohne vorherigen Fokus ist ein Nichts.
   */
  it('holt den Fokus, sonst bleibt das Feld für Angular unberührt', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    const gesehen: string[] = [];
    field.addEventListener('blur', () => gesehen.push('blur'));

    applyEzDate(field, '25.12.2010');

    expect(gesehen).toEqual(['blur']);
    // Und hinterher hängt der Fokus nicht im Prüffeld fest.
    expect(document.activeElement).not.toBe(field);
  });

  it('lässt auch eine verworfene Eingabe nicht im Fokus stehen', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    field.addEventListener('input', () => {
      field.value = '25.12.0010';
    });

    applyEzDate(field, '25.12.2010');

    expect(document.activeElement).not.toBe(field);
  });

  it('meldet ein Feld, das nicht mehr im Dokument hängt', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    field.remove();
    const result = applyEzDate(field, '25.12.2010');
    expect(result).toEqual({ ok: false, message: 'Das Feld für die Erstzulassung ist nicht mehr da.' });
  });

  it('meldet ein gesperrtes Feld, statt still zu scheitern', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    field.disabled = true;
    const result = applyEzDate(field, '25.12.2010');
    expect(result.ok).toBe(false);
    expect(field.value).toBe('25.12.0010');
  });

  it('meldet es, wenn das Tool die Eingabe zurückschreibt', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    // Ein eigener Formatierer, der auf `input` hört — genau der Fall, in dem
    // eine Erfolgsmeldung vor einem unveränderten Feld stünde.
    field.addEventListener('input', () => {
      field.value = '25.12.0010';
    });
    const result = applyEzDate(field, '25.12.2010');
    expect(result).toEqual({
      ok: false,
      message: 'Das Produktionstool hat die Eingabe verworfen. Bitte erneut versuchen.',
    });
  });

  it('schreibt nichts, was nicht ins Feld passt', () => {
    const field = formField('fahrzeug-erstzulassung', '25.12.0010');
    field.maxLength = 8;
    const result = applyEzDate(field, '25.12.2010');
    expect(result).toEqual({ ok: false, message: '25.12.2010 passt nicht in das Feld.' });
    expect(field.value).toBe('25.12.0010');
  });
});
