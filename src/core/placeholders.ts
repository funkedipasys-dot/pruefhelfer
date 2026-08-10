/**
 * Platzhalter-Grammatik der Textbausteine — Spiegel des Backends.
 *
 * Die Zerlegung ist zeichengleich zu
 * `egub-lexoffice-backend/src/application/utils/textbaustein-placeholder.util.ts`
 * portiert. Das ist kein Zufall und keine Bequemlichkeit: das Backend lehnt
 * einen Baustein beim Speichern ab, wenn er der Grammatik nicht entspricht.
 * Würde die Extension anders zerlegen, entstünde genau der Fall, den Plan-Punkt
 * 47 ausschließt — ein Text, den der eine Weg akzeptiert und der andere nicht.
 *
 * Neu gegenüber dem Backend ist nur die **Substitution**: das Backend validiert
 * bloß, einsetzen muss die Extension. Damit beide Wege — Overlay-Einfügen und
 * Popup-Kopieren — nicht auseinanderlaufen können, teilen sie sich denselben
 * Scanner (`scanTextbaustein`); `parseTextbausteinText` und
 * `substituteTextbaustein` sind beide daraus abgeleitet.
 *
 * Gezählt wird in UTF-16-Code-Units (`String.length`) — dieselbe Einheit, die
 * das HTML-`maxlength` des Zielfeldes verwendet.
 */

/** Zulässiger Platzhaltername: `[a-z][a-z0-9_]{0,31}`. */
export const PLACEHOLDER_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * Rückfall-Obergrenze des GTÜ-Bemerkungsfeldes
 * (`#inspectmobility-ergebnis-bemerkung-input-textarea`, `maxlength=500`).
 *
 * Zur Laufzeit gilt das tatsächlich am Feld gelesene `maxLength` (Plan-Punkt 48);
 * dieser Wert greift nur, wenn das Feld keines meldet.
 */
export const TEXTBAUSTEIN_TARGET_MAX_LENGTH = 500;

/** Warum ein Text die Grammatik verletzt. */
export type PlaceholderIssue =
  /** `{{` ohne zugehöriges `}}`. */
  | { kind: 'unclosed'; index: number }
  /** `{{…}}` mit einem Inhalt, der kein gültiger Name ist. */
  | { kind: 'invalid_name'; index: number; raw: string }
  /** `}}` außerhalb eines Platzhalters. */
  | { kind: 'stray_close'; index: number };

/** Ein Textabschnitt: entweder wörtlich oder ein Platzhalter. */
export type TextbausteinSegment =
  | { kind: 'literal'; text: string }
  | { kind: 'placeholder'; name: string };

export interface ScannedTextbausteinText {
  /** Abschnitte in Textreihenfolge. Nur aussagekräftig, wenn `issues` leer ist. */
  segments: TextbausteinSegment[];
  /** Leer, wenn der Text der Grammatik entspricht. */
  issues: PlaceholderIssue[];
}

export interface ParsedTextbausteinText extends ScannedTextbausteinText {
  /** Platzhalternamen in Reihenfolge des ersten Vorkommens, dedupliziert. */
  names: string[];
  /** Anzahl **aller** Vorkommen, Mehrfachnennung eingeschlossen. */
  occurrences: number;
  /** Länge des Textes ohne die Platzhalter selbst, in Code-Units. */
  literalLength: number;
  /**
   * Kürzestmögliche Länge nach der Substitution: Literalanteil plus ein Zeichen
   * je Vorkommen (leere Werte sind unzulässig).
   */
  minLength: number;
}

/**
 * Zerlegt einen Bausteintext in Literalabschnitte und Platzhalter.
 *
 * Meldet **alle** Verstöße, nicht nur den ersten. Nach einem `unclosed` bricht
 * die Analyse ab: ab dort ist nicht mehr entscheidbar, was Literal und was
 * Platzhalter sein sollte.
 */
export function scanTextbaustein(text: string): ScannedTextbausteinText {
  const segments: TextbausteinSegment[] = [];
  const issues: PlaceholderIssue[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf('{{', cursor);
    if (open === -1) break;

    const literal = text.slice(cursor, open);
    if (literal) segments.push({ kind: 'literal', text: literal });
    collectStrayCloses(literal, cursor, issues);

    const close = text.indexOf('}}', open + 2);
    if (close === -1) {
      issues.push({ kind: 'unclosed', index: open });
      return { segments, issues };
    }

    const raw = text.slice(open + 2, close);
    if (PLACEHOLDER_NAME_PATTERN.test(raw)) {
      segments.push({ kind: 'placeholder', name: raw });
    } else {
      issues.push({ kind: 'invalid_name', index: open, raw });
    }

    cursor = close + 2;
  }

  const tail = text.slice(cursor);
  if (tail) segments.push({ kind: 'literal', text: tail });
  collectStrayCloses(tail, cursor, issues);

  return { segments, issues };
}

/**
 * Zerlegung plus die Kennzahlen, die das Backend beim Speichern prüft.
 *
 * Die Mindestlänge zählt **je Vorkommen, nicht je eindeutigem Namen**:
 * `{{mm}}` zehnmal verwendet kostet nach der Substitution mindestens zehn
 * Zeichen — abgefragt wird der Wert trotzdem nur einmal.
 */
export function parseTextbausteinText(text: string): ParsedTextbausteinText {
  const scanned = scanTextbaustein(text);

  const names: string[] = [];
  const seen = new Set<string>();
  let occurrences = 0;
  let literalLength = 0;

  for (const segment of scanned.segments) {
    if (segment.kind === 'literal') {
      literalLength += segment.text.length;
      continue;
    }
    occurrences += 1;
    if (!seen.has(segment.name)) {
      seen.add(segment.name);
      names.push(segment.name);
    }
  }

  return {
    ...scanned,
    names,
    occurrences,
    literalLength,
    minLength: literalLength + occurrences,
  };
}

/** Warum eine Substitution nicht durchgeführt werden konnte. */
export type SubstitutionFailure =
  /** Der Bausteintext selbst verletzt die Grammatik. */
  | { reason: 'invalid_text'; issues: PlaceholderIssue[] }
  /** Für mindestens einen Platzhalter fehlt ein nicht-leerer Wert. */
  | { reason: 'missing_values'; names: string[] }
  /** Das Ergebnis überschreitet die wirksame Obergrenze des Zielfeldes. */
  | { reason: 'too_long'; length: number; limit: number; excess: number };

export type SubstitutionResult =
  | { ok: true; text: string }
  | ({ ok: false } & SubstitutionFailure);

/**
 * Setzt die Platzhalterwerte ein und prüft das Ergebnis gegen die Obergrenze.
 *
 * **Reihenfolge ist Absicht** (Plan-Punkt 50): erst einsetzen, dann messen.
 * Gegen den Rohtext zu prüfen würde einen Baustein durchlassen, der nach dem
 * Einsetzen zu lang ist — und abgeschnittener Text in einem amtlichen
 * Prüfbericht ist der schlimmere Fehler.
 *
 * Ein Wert, der nur aus Leerraum besteht, zählt als leer: er sähe im Feld aus
 * wie eine vergessene Eingabe.
 */
export function substituteTextbaustein(
  text: string,
  values: Readonly<Record<string, string>>,
  limit: number = TEXTBAUSTEIN_TARGET_MAX_LENGTH,
): SubstitutionResult {
  const parsed = parseTextbausteinText(text);
  if (parsed.issues.length > 0) {
    return { ok: false, reason: 'invalid_text', issues: parsed.issues };
  }

  const missing = parsed.names.filter((name) => (values[name] ?? '').trim() === '');
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_values', names: missing };
  }

  let out = '';
  for (const segment of parsed.segments) {
    out += segment.kind === 'literal' ? segment.text : (values[segment.name] as string);
  }

  if (out.length > limit) {
    return { ok: false, reason: 'too_long', length: out.length, limit, excess: out.length - limit };
  }

  return { ok: true, text: out };
}

/** `}}` in einem Literalabschnitt — ohne Escaping nie beabsichtigt. */
function collectStrayCloses(segment: string, offset: number, issues: PlaceholderIssue[]): void {
  let at = segment.indexOf('}}');
  while (at !== -1) {
    issues.push({ kind: 'stray_close', index: offset + at });
    at = segment.indexOf('}}', at + 2);
  }
}

/** Deutsche, für den Nutzer lesbare Fassung eines Verstoßes. */
export function describePlaceholderIssue(issue: PlaceholderIssue): string {
  switch (issue.kind) {
    case 'unclosed':
      return `Platzhalter ab Position ${issue.index} wird nicht mit }} geschlossen.`;
    case 'invalid_name':
      return (
        `„{{${issue.raw}}}" an Position ${issue.index} ist kein gültiger Platzhalter. ` +
        'Erlaubt sind Kleinbuchstaben, Ziffern und Unterstriche, beginnend mit einem ' +
        'Buchstaben, höchstens 32 Zeichen, ohne Leerzeichen.'
      );
    case 'stray_close':
      return `„}}" an Position ${issue.index} gehört zu keinem Platzhalter.`;
  }
}

/** Deutsche Fassung eines Substitutions-Fehlschlags, für Overlay und Popup. */
export function describeSubstitutionFailure(failure: SubstitutionFailure): string {
  switch (failure.reason) {
    case 'invalid_text':
      return failure.issues.map(describePlaceholderIssue).join(' ');
    case 'missing_values':
      return failure.names.length === 1
        ? `Bitte einen Wert für „${failure.names[0]}" eintragen.`
        : `Bitte Werte für ${failure.names.map((n) => `„${n}"`).join(', ')} eintragen.`;
    case 'too_long':
      return `passt nicht — ${failure.excess} Zeichen zu viel.`;
  }
}
