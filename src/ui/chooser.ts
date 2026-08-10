/**
 * Die Bedienung, die Overlay und Popup teilen (Plan-Punkt 46, 47, 51).
 *
 * Beide zeigen dieselbe Liste, fragen dieselben Platzhalterwerte ab und lösen
 * am Ende **eine** Aktion aus — im Overlay das Einfügen ins Feld, im Popup das
 * Kopieren in die Zwischenablage. Nur die Aktion unterscheidet sich; alles
 * davor ist identisch.
 *
 * Das ist nicht bloß Sparsamkeit. Plan-Punkt 47 verlangt, dass beide Wege
 * dasselbe Ergebnis liefern; zwei getrennte Oberflächen würden früher oder
 * später auseinanderlaufen — eine sammelt Leerraum anders ein, die andere
 * übergeht einen Platzhalter, und der Prüfer bekommt über den einen Weg einen
 * Text, den der andere abgelehnt hätte.
 *
 * **Der `isTrusted`-Riegel sitzt hier** (Plan-Punkt 51), also genau einmal für
 * beide Wege. Im Overlay hält er die GTÜ-Seite davon ab, per Skript ins
 * Prüffeld zu schreiben; im Popup ist er zusätzlich die Voraussetzung dafür,
 * dass `navigator.clipboard.writeText` überhaupt arbeitet — das verlangt eine
 * frische Nutzeraktivierung.
 *
 * **Jeder Text ausschließlich über `textContent`.** Kein `innerHTML`, nirgends.
 * Bausteintitel werden von Menschen getippt; im Kontext der GTÜ-Seite darf ein
 * `<img onerror=…>` darin nichts auslösen können.
 */

import type { CachedBaustein } from '../core/baustein';
import { MAX_TITEL_LENGTH, isLocalId } from '../core/local';
import { parseTextbausteinText } from '../core/placeholders';

export interface PanelContents {
  bausteine: CachedBaustein[];
  /** Hinweis über der Liste, etwa „Bestand könnte veraltet sein". `null` = nichts zu melden. */
  hint: string | null;
}

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Verwaltung eigener Bausteine (Plan-Punkt 61). **Optional** — wo sie fehlt,
 * bleibt der Chooser eine reine Auswahl. Das Overlay reicht sie herein, das
 * Popup nicht: dort ist die Liste Rückfallebene und Diagnose, kein Editor.
 */
export interface ChooserManagement {
  /** `id: null` heißt anlegen, sonst bearbeiten. */
  save: (draft: { id: string | null; titel: string; text: string }) => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
  /**
   * Vorlage für einen neuen Baustein — im Overlay der aktuelle Feldinhalt.
   * `null` heißt: gerade nichts anzubieten, der Knopf bleibt weg.
   */
  template?: () => string | null;
}

export interface ChooserDeps {
  /** Wird bei jedem `refresh()` neu abgefragt — der Bestand kann sich geändert haben. */
  loadPanel: () => Promise<PanelContents>;
  /** Beschriftung des Bestätigungsknopfes, etwa „Einfügen" oder „Kopieren". */
  actionLabel: string;
  /** Was passiert, wenn ein Mensch den Knopf drückt. */
  run: (baustein: CachedBaustein, values: Record<string, string>) => ActionResult | Promise<ActionResult>;
  /** Text, wenn noch kein Bestand da ist. */
  emptyText: string;
  manage?: ChooserManagement;
}

export interface Chooser {
  /** Bestand und Hinweis neu laden und die Liste zeichnen. */
  refresh: () => Promise<void>;
  /** Zurück zur Liste, Auswahl und Meldung verwerfen. */
  reset: () => void;
  /** Zusätzlich das Suchfeld leeren — für das vollständige Schließen. */
  clear: () => void;
  setMessage: (text: string) => void;
  focusSearch: () => void;
}

/**
 * Gemeinsame Stile. Overlay und Popup rahmen sie unterschiedlich ein.
 *
 * Farben aus dem GTÜ-Tool abgenommen (Screenshot-Pixelprobe 2026-08-10):
 * Markenrot #da1f3d, Flächen #f2f2f2, Beschriftungen #565656, Ränder #cbcdcf.
 * Knöpfe sind dort Pillen — unsere ziehen nach, damit das Panel nicht wie ein
 * Fremdkörper auf der Seite steht.
 */
export const CHOOSER_STYLE = `
/*
 * **Verborgen heißt unsichtbar — ausnahmslos** (Befund 10.08.2026).
 *
 * Die Regel des Browsers dafür lautet [hidden] { display: none } und steht in
 * dessen eigenem Stylesheet — dem schwächsten von allen. Jede Regel von uns, die
 * display setzt, schlägt sie. .footer und .form-footer stehen beide auf
 * display: flex; „Speichern / Abbrechen" waren dadurch schon in der Liste zu
 * sehen, obwohl setView() sie längst verborgen hatte.
 *
 * Deshalb hier einmal generisch statt einzeln pro Klasse: eine Ausnahmeliste
 * müsste bei jeder neuen display-Regel mitwachsen, und dass sie es nicht tut,
 * merkt man erst an der Oberfläche.
 */
[hidden] { display: none !important; }
.search, .values { padding: 8px; border-bottom: 1px solid #e0e0e0; }
.search input, .values input {
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 5px 10px;
  border: 1px solid #cbcdcf;
  border-radius: 4px;
  background: #f2f2f2;
}
.search input:focus, .values input:focus { outline: none; border-color: #da1f3d; background: #fff; }
.list { overflow-y: auto; padding: 4px 0; }
.category { padding: 6px 8px 2px; font-weight: 600; color: #565656; }
.item {
  font: inherit;
  display: block;
  width: 100%;
  text-align: left;
  padding: 5px 12px;
  border: 0;
  background: none;
  cursor: pointer;
  color: inherit;
}
.item:hover, .item:focus { background: #f2f2f2; }
.row { display: flex; align-items: center; }
.row .item { flex: 1; min-width: 0; }
.row .edit {
  font: inherit;
  flex: none;
  padding: 5px 10px;
  border: 0;
  background: none;
  color: #565656;
  cursor: pointer;
}
.row .edit:hover, .row .edit:focus { color: #da1f3d; }
.manage { padding: 6px 8px; border-top: 1px solid #e0e0e0; }
.manage button {
  font: inherit;
  padding: 3px 12px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  cursor: pointer;
}
.manage button:hover { border-color: #da1f3d; color: #da1f3d; }
.form { padding: 8px; border-bottom: 1px solid #e0e0e0; overflow-y: auto; }
.form label { display: block; margin-bottom: 8px; }
.form .name { display: block; margin-bottom: 2px; color: #565656; }
.form input, .form textarea {
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 5px 10px;
  border: 1px solid #cbcdcf;
  border-radius: 4px;
  background: #f2f2f2;
}
.form textarea { min-height: 96px; resize: vertical; }
.form input:focus, .form textarea:focus { outline: none; border-color: #da1f3d; background: #fff; }
.form .template {
  font: inherit;
  padding: 3px 12px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  cursor: pointer;
}
.form .template:hover { border-color: #da1f3d; color: #da1f3d; }
.form-footer { display: flex; gap: 8px; align-items: center; padding: 8px; }
.form-footer button {
  font: inherit;
  padding: 4px 16px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  cursor: pointer;
}
.form-footer button:hover { background: #f2f2f2; }
.form-footer .save { background: #da1f3d; border-color: #da1f3d; color: #fff; }
.form-footer .save:hover { background: #b81a34; border-color: #b81a34; }
.form-footer .remove { margin-left: auto; border-color: transparent; color: #da1f3d; }
.empty { padding: 10px 12px; color: #565656; }
.preview { padding: 8px; border-bottom: 1px solid #e0e0e0; }
.preview .titel { display: block; margin-bottom: 4px; font-weight: 600; color: #565656; }
.preview .text {
  display: block;
  max-height: 180px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 4px;
  background: #f2f2f2;
  border-left: 3px solid #da1f3d;
  /* Der Wortlaut steht hier wie im Bemerkungsfeld — Zeilenumbrüche inklusive. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.values label { display: block; margin-bottom: 6px; }
.values .name { display: block; margin-bottom: 2px; color: #565656; }
.footer { display: flex; gap: 8px; align-items: center; padding: 8px; }
.footer button {
  font: inherit;
  padding: 4px 16px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  cursor: pointer;
}
.footer button:hover { background: #f2f2f2; }
.footer .primary { background: #da1f3d; border-color: #da1f3d; color: #fff; }
.footer .primary:hover { background: #b81a34; border-color: #b81a34; }
.message { padding: 0 8px 8px; color: #da1f3d; }
.message:empty { display: none; }
.message.ok { color: #0b6a0b; }
.hint { padding: 6px 8px; background: #f2f2f2; border-left: 3px solid #da1f3d; border-bottom: 1px solid #e0e0e0; color: #565656; }
.hint:empty { display: none; }
`;

export function createChooser(container: ParentNode, deps: ChooserDeps): Chooser {
  const hint = element('div', 'hint');

  const search = element('div', 'search');
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Suchen …';
  searchInput.setAttribute('aria-label', 'Textbausteine durchsuchen');
  search.append(searchInput);

  const list = element('div', 'list');

  /**
   * Der vollständige Wortlaut, bevor er im Prüffeld steht (Befund 10.08.2026).
   *
   * Vorher führte der Klick auf einen Titel direkt zum Knopf „Einfügen" — was
   * eingefügt würde, war bis dahin nirgends zu sehen. Bei einem Titel wie
   * „Bremswerte manuell (BBKP)" heißt das: zwei Sätze Amtsdeutsch ungelesen ins
   * Gutachten. Die Vorschau steht auf **derselben** Seite wie die
   * Platzhalterfelder und nicht als eigener Schritt davor: ein Klick weniger,
   * und beim Ausfüllen ist der Text weiter zu sehen.
   */
  const preview = element('div', 'preview');
  const previewTitel = element('span', 'titel');
  const previewText = element('span', 'text');
  preview.append(previewTitel, previewText);
  preview.hidden = true;

  const valuesBox = element('div', 'values');
  valuesBox.hidden = true;

  const footer = element('div', 'footer');
  footer.hidden = true;
  const actionButton = element('button', 'primary');
  actionButton.type = 'button';
  actionButton.textContent = deps.actionLabel;
  const backButton = element('button', '');
  backButton.type = 'button';
  backButton.textContent = 'Zurück';
  footer.append(actionButton, backButton);

  const message = element('div', 'message');

  // -- Verwaltung eigener Bausteine (Plan-Punkt 61) --------------------------
  // Wird komplett angelegt, aber nur eingeblendet, wenn `deps.manage` da ist.
  // Die Alternative — die Knoten bedingt erzeugen — hieße, überall danach zu
  // fragen, ob es sie gibt.

  const manageBar = element('div', 'manage');
  const newButton = element('button', '');
  newButton.type = 'button';
  newButton.textContent = '+ Eigener Text';
  manageBar.append(newButton);

  const form = element('div', 'form');
  const titelInput = document.createElement('input');
  titelInput.type = 'text';
  // Spiegelt die Grenze des Kerns, damit sie beim Tippen auffällt und nicht
  // erst beim Speichern. Maßgeblich bleibt `validateLocalDraft()`.
  titelInput.maxLength = MAX_TITEL_LENGTH;
  const textInput = document.createElement('textarea');
  const templateButton = element('button', 'template');
  templateButton.type = 'button';
  templateButton.textContent = 'Feldinhalt übernehmen';
  form.append(labelled('Titel', titelInput), labelled('Text', textInput), templateButton);

  const formFooter = element('div', 'form-footer');
  const saveButton = element('button', 'save');
  saveButton.type = 'button';
  saveButton.textContent = 'Speichern';
  const cancelButton = element('button', '');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Abbrechen';
  const removeButton = element('button', 'remove');
  removeButton.type = 'button';
  formFooter.append(saveButton, cancelButton, removeButton);

  container.append(hint, search, list, manageBar, preview, valuesBox, footer, form, formFooter, message);

  let bausteine: CachedBaustein[] = [];
  let selected: CachedBaustein | null = null;
  /** Was das Formular gerade bearbeitet: `null` = neu, sonst die Kennung. */
  let editing: string | null = null;

  const setMessage = (text: string, ok = false): void => {
    message.textContent = text;
    message.classList.toggle('ok', ok);
  };

  /**
   * Die drei Ansichten schließen einander aus. Eine Funktion statt verstreuter
   * `hidden`-Zuweisungen: sonst bliebe früher oder später ein Knoten aus der
   * vorigen Ansicht stehen, weil eine Stelle nicht mitgezogen wurde.
   */
  const setView = (view: 'list' | 'values' | 'form'): void => {
    search.hidden = view !== 'list';
    list.hidden = view !== 'list';
    manageBar.hidden = view !== 'list' || deps.manage === undefined;
    // Die Vorschau anders als der Werte-Kasten **ohne** Bedingung: sie ist der
    // Grund, warum es diese Ansicht gibt.
    preview.hidden = view !== 'values';
    // Ein Baustein ohne Platzhalter hat nichts abzufragen — dann bleibt der
    // Kasten leer und würde nur als Lücke über dem Knopf erscheinen.
    valuesBox.hidden = view !== 'values' || valuesBox.childElementCount === 0;
    footer.hidden = view !== 'values';
    form.hidden = view !== 'form';
    formFooter.hidden = view !== 'form';
  };

  const renderList = (): void => {
    list.replaceChildren();
    const needle = searchInput.value.trim().toLowerCase();
    const matching = bausteine.filter((item) => matches(item, needle));

    if (matching.length === 0) {
      const empty = element('div', 'empty');
      empty.textContent = bausteine.length === 0 ? deps.emptyText : 'Kein Treffer.';
      list.append(empty);
      return;
    }

    for (const [kategorie, group] of groupByKategorie(matching)) {
      const heading = element('div', 'category');
      heading.textContent = kategorie;
      list.append(heading);
      for (const item of group) {
        const button = element('button', 'item');
        button.type = 'button';
        button.textContent = item.titel;
        button.addEventListener('click', () => select(item));

        // Nur eigene Bausteine sind bearbeitbar — ein zentral gepflegter
        // Bestand gehört dem Büro und wird dort verwaltet. Der Stift steht
        // in der Zeile, weil
        // der Weg über „auswählen, dann bearbeiten" bei einem Baustein ohne
        // Platzhalter durch eine leere Zwischenansicht führen würde.
        if (deps.manage !== undefined && isLocalId(item.id)) {
          const row = element('div', 'row');
          const edit = element('button', 'edit');
          edit.type = 'button';
          edit.textContent = '✎';
          edit.title = `„${item.titel}" bearbeiten`;
          edit.setAttribute('aria-label', `„${item.titel}" bearbeiten`);
          edit.addEventListener('click', () => openForm(item));
          row.append(button, edit);
          list.append(row);
          continue;
        }

        list.append(button);
      }
    }
  };

  const select = (item: CachedBaustein): void => {
    selected = item;
    setMessage('');

    // Beides über `textContent`: Titel und Text sind getippt, und die Vorschau
    // ist die erste Stelle, an der ein ganzer Fließtext gerendert wird.
    previewTitel.textContent = item.titel;
    previewText.textContent = item.text;

    valuesBox.replaceChildren();

    for (const name of parseTextbausteinText(item.text).names) {
      const label = document.createElement('label');
      const caption = element('span', 'name');
      caption.textContent = name;
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset['platzhalter'] = name;
      label.append(caption, input);
      valuesBox.append(label);
    }

    setView('values');
    (valuesBox.querySelector('input') ?? actionButton).focus();
  };

  const reset = (): void => {
    selected = null;
    editing = null;
    setMessage('');
    previewTitel.textContent = '';
    previewText.textContent = '';
    valuesBox.replaceChildren();
    setView('list');
  };

  /** `item === null` heißt anlegen. */
  const openForm = (item: CachedBaustein | null): void => {
    editing = item?.id ?? null;
    setMessage('');
    titelInput.value = item?.titel ?? '';
    textInput.value = item?.text ?? '';
    armRemove(false);
    removeButton.hidden = item === null;
    // Beim Bearbeiten wäre der Feldinhalt die falsche Vorlage — er würde den
    // Text ersetzen, den der Prüfer gerade ändern will.
    templateButton.hidden = item !== null || (deps.manage?.template?.() ?? null) === null;
    setView('form');
    titelInput.focus();
  };

  /**
   * Löschen in zwei Klicks statt per `confirm()`: ein Dialog würde im
   * Content-Script die Seite blockieren, und im Overlay säße er außerhalb
   * unseres Schattens mitten im GTÜ-Tool.
   */
  const armRemove = (armed: boolean): void => {
    removeButton.dataset['armed'] = armed ? 'yes' : 'no';
    removeButton.textContent = armed ? 'Wirklich löschen?' : 'Löschen';
  };

  searchInput.addEventListener('input', renderList);
  backButton.addEventListener('click', reset);

  /**
   * Der finale Handler. `isTrusted` ist bei einem per Skript ausgelösten Klick
   * `false` und lässt sich nicht fälschen — damit ist „genau ein menschlicher
   * Klick" technisch erzwungen, nicht bloß erhofft.
   */
  actionButton.addEventListener('click', (event) => {
    if (!event.isTrusted) {
      setMessage(`${deps.actionLabel} ist nur per Klick möglich.`);
      return;
    }
    const item = selected;
    if (item === null) return;

    void Promise.resolve(deps.run(item, collectValues(valuesBox))).then((result) => {
      if (result.ok) reset();
      else setMessage(result.message);
    });
  });

  const refresh = async (): Promise<void> => {
    const contents = await deps.loadPanel();
    bausteine = contents.bausteine;
    hint.textContent = contents.hint ?? '';
    renderList();
  };

  // -- Formular-Handler ------------------------------------------------------

  newButton.addEventListener('click', () => openForm(null));
  cancelButton.addEventListener('click', reset);

  templateButton.addEventListener('click', () => {
    const template = deps.manage?.template?.() ?? null;
    if (template === null) return;
    textInput.value = template;
    textInput.focus();
  });

  // Weitertippen entschärft den Löschknopf wieder — sonst genügte ein
  // versehentlicher zweiter Klick Minuten später.
  for (const input of [titelInput, textInput]) {
    input.addEventListener('input', () => armRemove(false));
  }

  /** Derselbe `isTrusted`-Riegel wie bei der Aktion: unser Schatten ist offen,
   * die GTÜ-Seite käme sonst an diese Knöpfe und könnte einen eigenen Baustein
   * unterschieben, den der Prüfer später arglos einfügt. */
  saveButton.addEventListener('click', (event) => {
    if (!event.isTrusted) {
      setMessage('Speichern ist nur per Klick möglich.');
      return;
    }
    const manage = deps.manage;
    if (manage === undefined) return;

    void manage.save({ id: editing, titel: titelInput.value, text: textInput.value }).then(async (result) => {
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await refresh();
      reset();
      setMessage('Gespeichert.', true);
    });
  });

  removeButton.addEventListener('click', (event) => {
    if (!event.isTrusted) {
      setMessage('Löschen ist nur per Klick möglich.');
      return;
    }
    const manage = deps.manage;
    const id = editing;
    if (manage === undefined || id === null) return;

    if (removeButton.dataset['armed'] !== 'yes') {
      armRemove(true);
      return;
    }

    void manage.remove(id).then(async (result) => {
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await refresh();
      reset();
      setMessage('Gelöscht.', true);
    });
  });

  reset();

  return {
    refresh,
    reset,
    clear() {
      searchInput.value = '';
      reset();
    },
    setMessage(text) {
      setMessage(text);
    },
    focusSearch() {
      searchInput.focus();
    },
  };
}

function element<K extends 'div' | 'button' | 'span'>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  return node;
}

/** Beschriftetes Eingabefeld fürs Formular — die Beschriftung immer über `textContent`. */
function labelled(caption: string, input: HTMLInputElement | HTMLTextAreaElement): HTMLLabelElement {
  const label = document.createElement('label');
  const name = element('span', 'name');
  name.textContent = caption;
  label.append(name, input);
  return label;
}

function matches(item: CachedBaustein, needle: string): boolean {
  if (needle === '') return true;
  return (
    item.titel.toLowerCase().includes(needle) ||
    item.kategorie.toLowerCase().includes(needle) ||
    item.text.toLowerCase().includes(needle)
  );
}

/**
 * Gruppierung nach Kategorie in der Reihenfolge des ersten Vorkommens. Der
 * Bestand kommt bereits sortiert aus dem Backend (`sortierung, titel, id`); ihn
 * hier neu zu sortieren würde die Anzeigereihenfolge zerstören, die der Admin
 * eingestellt hat.
 */
function groupByKategorie(items: CachedBaustein[]): Map<string, CachedBaustein[]> {
  const groups = new Map<string, CachedBaustein[]>();
  for (const item of items) {
    const group = groups.get(item.kategorie);
    if (group === undefined) groups.set(item.kategorie, [item]);
    else group.push(item);
  }
  return groups;
}

function collectValues(container: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const input of container.querySelectorAll('input')) {
    const name = input.dataset['platzhalter'];
    if (name !== undefined) values[name] = input.value;
  }
  return values;
}
