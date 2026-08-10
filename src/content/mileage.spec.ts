// @vitest-environment jsdom

import { applyMileage, findAltStandLabel, readAltStand, resolveMileageField } from './mileage';

/**
 * Nachbau der beiden Stellen aus dem Produktionstool, mit den echten
 * Kennungen und Klassen aus dem gespeicherten DOM (`GTÜ+.html`, 2026-08-10).
 * Die Seite steht **vor** dem Dialog — genau die Reihenfolge, an der ein
 * Selektor mit Komma scheitern würde.
 */
function buildPage(options: { dialog?: boolean; dialogOffen?: boolean } = {}): void {
  document.body.replaceChildren();

  const seite = document.createElement('div');
  seite.className = 'fahrzeugdaten';
  seite.innerHTML = `
    <div class="feld">
      <input id="fahrzeug-laufleistung-input" type="text" maxlength="9">
      <mat-label class="laufleistung-alt fixed-size"> (Stand Erstbericht: 184731) </mat-label>
    </div>`;
  document.body.append(seite);

  if (options.dialog !== false) {
    const dialog = document.createElement('mat-dialog-container');
    dialog.id = 'gtue-fahrzeug-dialog-wegstreckenzaehler';
    dialog.className = `mat-mdc-dialog-container mdc-dialog${options.dialogOffen === false ? '' : ' mdc-dialog--open'}`;
    dialog.innerHTML = `
      <div class="feld">
        <input id="fahrzeug-dialog-laufleistung-input" type="text" maxlength="10">
        <mat-label class="laufleistung-alt">184731 - alter Stand</mat-label>
      </div>`;
    document.body.append(dialog);
  }
}

const dialogInput = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>('#fahrzeug-dialog-laufleistung-input') as HTMLInputElement;
const seitenInput = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>('#fahrzeug-laufleistung-input') as HTMLInputElement;

describe('resolveMileageField (Plan-Punkt 66)', () => {
  it('nimmt das Feld der Seite, solange kein Dialog offen ist', () => {
    buildPage({ dialog: false });

    expect(resolveMileageField(document)).toBe(seitenInput());
  });

  it('nimmt bei offenem Dialog dessen Feld — obwohl das der Seite früher im DOM steht', () => {
    buildPage();

    expect(resolveMileageField(document)).toBe(dialogInput());
  });

  it('kehrt zum Feld der Seite zurück, sobald der Dialog nicht mehr offen ist', () => {
    buildPage({ dialogOffen: false });

    expect(resolveMileageField(document)).toBe(seitenInput());
  });

  it('liefert null, wo kein Kilometerstand-Feld steht', () => {
    document.body.replaceChildren();

    expect(resolveMileageField(document)).toBeNull();
  });

  it('bietet nichts an, solange ein fremder Dialog offen steht', () => {
    buildPage({ dialog: false });
    const fremd = document.createElement('mat-dialog-container');
    fremd.className = 'mat-mdc-dialog-container mdc-dialog mdc-dialog--open';
    fremd.innerHTML = '<p>Ein ganz anderer Dialog</p>';
    document.body.append(fremd);

    // Der Dialog verdeckt das Feld der Seite — eine Leiste darüber wäre falsch.
    expect(resolveMileageField(document)).toBeNull();
  });
});

describe('findAltStandLabel (Plan-Punkt 66)', () => {
  it('findet die Beschriftung, die zum Feld gehört — nicht die der Seite dahinter', () => {
    buildPage();

    const label = findAltStandLabel(dialogInput());

    expect(label?.textContent).toBe('184731 - alter Stand');
  });

  it('findet die Beschriftung im Fahrzeug-Formular', () => {
    buildPage({ dialog: false });

    expect(findAltStandLabel(seitenInput())?.textContent).toContain('Stand Erstbericht');
  });

  it('liefert null, wenn die Zuordnung mehrdeutig wäre', () => {
    document.body.replaceChildren();
    // Feld ohne eigene Beschriftung, dafür zwei im Dokument: welche gemeint
    // ist, lässt sich nicht entscheiden.
    document.body.innerHTML = `
      <input id="fahrzeug-laufleistung-input" type="text">
      <mat-label class="laufleistung-alt">111 - alter Stand</mat-label>
      <mat-label class="laufleistung-alt">222 - alter Stand</mat-label>`;

    expect(findAltStandLabel(seitenInput())).toBeNull();
  });

  it('liefert null, wenn es gar keine Beschriftung gibt', () => {
    document.body.replaceChildren();
    document.body.innerHTML = '<input id="fahrzeug-laufleistung-input" type="text">';

    expect(findAltStandLabel(seitenInput())).toBeNull();
  });
});

describe('readAltStand', () => {
  it('liest den Wert aus der zugehörigen Beschriftung', () => {
    buildPage();

    expect(readAltStand(dialogInput())).toBe(184731);
    expect(readAltStand(seitenInput())).toBe(184731);
  });

  it('liefert null ohne Beschriftung', () => {
    document.body.replaceChildren();
    document.body.innerHTML = '<input id="fahrzeug-laufleistung-input" type="text">';

    expect(readAltStand(seitenInput())).toBeNull();
  });
});

describe('applyMileage (Plan-Punkt 67)', () => {
  it('schreibt den Wert und meldet ihn dem Formular', () => {
    buildPage();
    const field = dialogInput();
    const events: string[] = [];
    for (const type of ['focus', 'input', 'change', 'blur']) {
      field.addEventListener(type, () => events.push(type));
    }

    expect(applyMileage(field, 184736)).toEqual({ ok: true });

    expect(field.value).toBe('184736');
    // Der ganze Weg eines Menschen: hinein, schreiben, hinaus. Ohne den Fokus
    // vorne bliebe `blur()` wirkungslos und das Feld für Angular unberührt
    // (Befund vom 10.08.2026).
    expect(events).toEqual(['focus', 'input', 'change', 'blur']);
    expect(document.activeElement).not.toBe(field);
  });

  it('schreibt ohne Tausendertrenner', () => {
    buildPage();

    applyMileage(dialogInput(), 184736);

    expect(dialogInput().value).toBe('184736');
  });

  it('meldet einen Fehlschlag, wenn das Formular den Wert zurückschreibt', () => {
    buildPage();
    const field = dialogInput();
    field.addEventListener('input', () => {
      field.value = '';
    });

    const result = applyMileage(field, 184736);

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain('verworfen');
  });

  it('rührt ein gesperrtes Feld nicht an', () => {
    buildPage();
    const field = dialogInput();
    field.disabled = true;

    const result = applyMileage(field, 184736);

    expect(result).toMatchObject({ ok: false });
    expect(field.value).toBe('');
  });

  it('rührt ein schreibgeschütztes Feld nicht an', () => {
    buildPage();
    const field = dialogInput();
    field.readOnly = true;

    expect(applyMileage(field, 184736)).toMatchObject({ ok: false });
    expect(field.value).toBe('');
  });

  it('schreibt nichts, was das Feld gar nicht fassen kann', () => {
    buildPage();
    const field = dialogInput();
    field.maxLength = 4;

    const result = applyMileage(field, 184736);

    expect(result).toMatchObject({ ok: false });
    expect(field.value).toBe('');
  });

  it('meldet ein Feld, das nicht mehr im Dokument hängt', () => {
    buildPage();
    const field = dialogInput();
    field.remove();

    const result = applyMileage(field, 184736);

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain('nicht mehr da');
  });
});
