/**
 * Eigene, nur auf diesem Gerät gespeicherte Textbausteine (Plan-Punkt 60, 62).
 *
 * **Bewusst getrennt von allem, was ein Server liefert.** Ein zentral
 * gepflegter Bestand gehört einer Backend-Identität: er wird ersetzt, gelöscht
 * und läuft ab. Was der Prüfer selbst getippt hat, hat all das nicht verdient.
 * Deshalb ein eigener Schlüssel, den kein Aufräumen der Kopplung anfasst.
 *
 * **Gespeichert wird nur, was der Mensch eingegeben hat** — `id`, `titel`,
 * `text`. Kategorie und Sortierung fallen beim Lesen aus der Reihenfolge ab;
 * sie mitzuschreiben hieße, eine zweite Wahrheit über dieselbe Liste zu führen.
 *
 * **Kein `chrome.*` hier**, wie im ganzen Kern: angesprochen wird nur
 * `StorageArea`, damit die Grenzfälle in Node prüfbar bleiben.
 */

import { TEXTBAUSTEIN_TARGET_MAX_LENGTH, describePlaceholderIssue, parseTextbausteinText } from './placeholders';
import type { CachedBaustein, StorageArea } from './baustein';

/** Der eine Schlüssel. Ohne Generationen — hier gibt es nichts zu verlieren, was nicht neu tippbar wäre. */
export const LOCAL_KEY = 'gtue.local.bausteine';

/**
 * Präfix aller eigenen Kennungen. Trennt sie eindeutig von Server-Kennungen,
 * damit die Oberfläche einen eigenen Baustein am Eintrag selbst erkennt und
 * nicht an einer zweiten Liste, die danebenherlaufen könnte.
 */
export const LOCAL_ID_PREFIX = 'local-';

/** Überschrift der eigenen Gruppe in der Liste. */
export const LOCAL_KATEGORIE = 'Eigene';

/** Genug für einen sprechenden Titel, kurz genug, dass die Liste lesbar bleibt. */
export const MAX_TITEL_LENGTH = 60;

/** Was aus der Oberfläche hereinkommt. Die Kennung vergibt der Service Worker, nicht der Nutzer. */
export interface LocalDraft {
  id: string;
  titel: string;
  text: string;
}

/** Nur die eingegebenen Felder — der Rest wird beim Lesen abgeleitet. */
interface LocalEntry {
  id: string;
  titel: string;
  text: string;
}

export type LocalSaveResult =
  | { ok: true; bausteine: CachedBaustein[] }
  | { ok: false; message: string };

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

/**
 * Liest die eigenen Bausteine.
 *
 * Ein einzelner unbrauchbarer Eintrag wird **übersprungen, nicht der ganze
 * Bestand verworfen** — anders als beim Cache-Umschlag. Der Umschlag ist
 * jederzeit neu holbar, diese Texte sind es nicht: wegen eines kaputten
 * Eintrags alle anderen zu löschen wäre der teurere Fehler.
 */
export async function readLocalBausteine(area: StorageArea): Promise<CachedBaustein[]> {
  return toBausteine(await readEntries(area));
}

/**
 * Legt einen eigenen Baustein an oder ersetzt einen vorhandenen.
 *
 * Angelegt und bearbeitet wird über denselben Weg: ist die Kennung schon da,
 * wird ersetzt, sonst angehängt. Ein getrennter Bearbeiten-Pfad bräuchte eine
 * eigene Fehlerbehandlung für „gibt es nicht mehr" — hier wird daraus stillschweigend
 * ein Neuanlegen, und der Prüfer verliert seinen gerade getippten Text nicht.
 */
export async function saveLocalBaustein(area: StorageArea, draft: LocalDraft): Promise<LocalSaveResult> {
  const validated = validateLocalDraft(draft);
  if (!validated.ok) return validated;

  const entries = await readEntries(area);
  const index = entries.findIndex((entry) => entry.id === validated.entry.id);
  if (index === -1) entries.push(validated.entry);
  else entries[index] = validated.entry;

  await area.set({ [LOCAL_KEY]: entries });
  return { ok: true, bausteine: toBausteine(entries) };
}

/** Löscht einen eigenen Baustein. Eine unbekannte Kennung ist kein Fehler — das Ergebnis stimmt bereits. */
export async function deleteLocalBaustein(area: StorageArea, id: string): Promise<CachedBaustein[]> {
  const entries = (await readEntries(area)).filter((entry) => entry.id !== id);
  await area.set({ [LOCAL_KEY]: entries });
  return toBausteine(entries);
}

export type ValidatedDraft =
  | { ok: true; entry: LocalEntry }
  | { ok: false; message: string };

/**
 * Prüft einen Entwurf, bevor er gespeichert wird.
 *
 * Die Grammatikprüfung ist dieselbe, an der auch das Backend seine Bausteine
 * misst — ein selbst getippter Text mit `{{Kennzeichen}}` darin würde sonst
 * anstandslos gespeichert und erst beim Einfügen scheitern, dann aber vor dem
 * Fahrzeug statt beim Anlegen.
 *
 * Ebenso die Längenprüfung: passt schon die kürzestmögliche Fassung nicht ins
 * Bemerkungsfeld, ist der Baustein unbenutzbar. Gemessen wird gegen die
 * Rückfall-Obergrenze — das tatsächliche `maxLength` des Feldes steht erst zur
 * Laufzeit fest und kann durch bereits vorhandenen Text nur kleiner sein.
 */
export function validateLocalDraft(draft: LocalDraft): ValidatedDraft {
  if (!isLocalId(draft.id)) return { ok: false, message: 'Ungültige Kennung für einen eigenen Textbaustein.' };

  const titel = draft.titel.trim();
  const text = draft.text.trim();

  if (titel === '') return { ok: false, message: 'Bitte einen Titel eintragen.' };
  if (titel.length > MAX_TITEL_LENGTH) {
    return { ok: false, message: `Der Titel darf höchstens ${MAX_TITEL_LENGTH} Zeichen haben.` };
  }
  if (text === '') return { ok: false, message: 'Bitte einen Text eintragen.' };

  const parsed = parseTextbausteinText(text);
  if (parsed.issues.length > 0) {
    return { ok: false, message: parsed.issues.map(describePlaceholderIssue).join(' ') };
  }
  if (parsed.minLength > TEXTBAUSTEIN_TARGET_MAX_LENGTH) {
    return {
      ok: false,
      message: `Der Text passt nicht ins Bemerkungsfeld — ${parsed.minLength} Zeichen bei höchstens ${TEXTBAUSTEIN_TARGET_MAX_LENGTH}.`,
    };
  }

  return { ok: true, entry: { id: draft.id, titel, text } };
}

async function readEntries(area: StorageArea): Promise<LocalEntry[]> {
  const stored = await area.get([LOCAL_KEY]);
  const raw = stored[LOCAL_KEY];
  if (!Array.isArray(raw)) return [];

  const entries: LocalEntry[] = [];
  for (const value of raw) {
    const entry = asEntry(value);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/** Die Reihenfolge im Speicher **ist** die Anzeigereihenfolge; `sortierung` schreibt sie nur fort. */
function toBausteine(entries: LocalEntry[]): CachedBaustein[] {
  return entries.map((entry, index) => ({
    ...entry,
    kategorie: LOCAL_KATEGORIE,
    sortierung: index + 1,
  }));
}

function asEntry(value: unknown): LocalEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = asNonEmptyString(record['id']);
  const titel = asNonEmptyString(record['titel']);
  const text = asNonEmptyString(record['text']);
  if (id === null || titel === null || text === null || !isLocalId(id)) return null;
  return { id, titel, text };
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
