/**
 * Zustandskern der FSD-Automatik — in beiden Fassungen, wie der Adapter
 * daneben. Die Datei stand bis 2026-08-13 unter `src/pro/` und hieß deshalb
 * lange „Pro-exklusiv"; das war eine Produktentscheidung, keine technische
 * Abhängigkeit, und sie ist zurückgenommen.
 *
 * Der Kern kennt weder DOM noch Chrome-APIs. Er nimmt Schnappschüsse der
 * sichtbaren Auftragsliste entgegen und gibt nur dann einen Kandidaten frei,
 * wenn die Liste eindeutig gewachsen ist. Ein Austausch bei gleicher Größe
 * (Filter, Navigation oder virtuelles Scrollen) bleibt damit fail-safe ohne
 * automatischen Klick.
 *
 * **Seit Slice 1.8 (2026-08-21) reicht „sichtbar" dafür nicht mehr.** Die
 * Auftragsliste ist virtualisiert: gemessen liegen 8 von 24 Zeilen im DOM. Ist
 * das Sichtfenster voll, verdrängt jeder neu eingefügte Auftrag eine andere
 * Zeile aus dem Renderfenster — `removals.length === 0` trifft dann nie mehr zu,
 * und die Automatik war bei mehr als acht Aufträgen **wirkungslos**. Genau das
 * hat Christian am 2026-08-21 gemeldet.
 *
 * Der Ausweg ist ein zweites Signal, das nicht am Renderfenster hängt: die
 * **Gesamthöhe der Liste** (`scrollHeight` des Sichtfensters). Sie beschreibt
 * alle Aufträge, auch die nie gerenderten. Wächst sie, ist die Liste länger
 * geworden — beim Scrollen bleibt sie konstant.
 *
 * **Was daran gemessen ist und was nicht.** Gemessen (2026-08-21, DEV-Fassung):
 * die Liste ist virtualisiert, 8 von 24 im DOM, `scrollHeight` 4176 px bei 24
 * Aufträgen — also 174 px je Zeile, glatt aufgehend. *Nicht* beobachtet ist ein
 * Auftrag, der während einer Aufnahme eingeht; dass `scrollHeight` in dem
 * Moment wächst, ist daraus abgeleitet, nicht gesehen. Deshalb ist das Signal
 * hier **zusätzlich** und nicht ersetzend: fehlt die Höhe, gilt die alte Regel
 * unverändert weiter, und ein Wachstum allein genügt nie — es müssen auch
 * wenige, bislang unbekannte Zeilen dazugekommen sein.
 */

/**
 * Wie viele bislang unbekannte Zeilen ein Wachstum höchstens mitbringen darf,
 * damit es als „ein Auftrag ist eingegangen" durchgeht.
 *
 * Aufträge kommen einzeln herein. Ein Filterwechsel, der die Liste verlängert,
 * bringt dagegen auf einen Schlag ein ganzes Sichtfenster unbekannter Zeilen —
 * und der darf keine Klickserie auslösen. Zwei statt eins, weil zwei Meldungen
 * dicht hintereinander in denselben Beobachtungstakt fallen können.
 */
export const FSD_MAX_NEUE_JE_TAKT = 2;

export const FSD_BASELINE_MS = 3_000;
export const FSD_OPEN_DELAY_MS = 30_000;
export const FSD_BETWEEN_OPENS_MS = 10_000;

export interface FsdOrderRow {
  id: string;
  label: string;
  eligible: boolean;
}

export interface FsdCandidate {
  id: string;
  label: string;
  detectedAt: number;
  dueAt: number;
}

export type FsdAutoMode = 'off' | 'baselining' | 'armed' | 'waiting';

export interface FsdAutoSnapshot {
  mode: FsdAutoMode;
  pendingCount: number;
  baselineUntil: number | null;
  next: FsdCandidate | null;
  nextWakeAt: number | null;
}

export interface FsdAutoCoreOptions {
  baselineMs?: number;
  openDelayMs?: number;
  betweenOpensMs?: number;
}

export class FsdAutoCore {
  private readonly baselineMs: number;
  private readonly openDelayMs: number;
  private readonly betweenOpensMs: number;
  private enabled = false;
  private baselineEndsAt: number | null = null;
  private visible = new Set<string>();
  private readonly known = new Set<string>();
  private readonly handled = new Set<string>();
  private readonly pending = new Map<string, FsdCandidate>();
  private lastOpenedAt: number | null = null;
  /** Die zuletzt gesehene Gesamthöhe der Liste; `null`, solange keine kam. */
  private letzteHoehe: number | null = null;

  constructor(options: FsdAutoCoreOptions = {}) {
    this.baselineMs = nonNegative(options.baselineMs ?? FSD_BASELINE_MS, 'baselineMs');
    this.openDelayMs = nonNegative(options.openDelayMs ?? FSD_OPEN_DELAY_MS, 'openDelayMs');
    this.betweenOpensMs = nonNegative(options.betweenOpensMs ?? FSD_BETWEEN_OPENS_MS, 'betweenOpensMs');
  }

  enable(rows: readonly FsdOrderRow[], now: number, listenHoehe: number | null = null): void {
    this.reset();
    this.enabled = true;
    this.baselineEndsAt = now + this.baselineMs;
    this.absorbBaseline(rows);
    this.letzteHoehe = listenHoehe;
  }

  disable(): void {
    this.reset();
  }

  /**
   * Nimmt den aktuellen DOM-Stand auf. Während der Baseline wird nur gelernt;
   * danach erzeugt ausschließlich ein monotones Mengenwachstum Kandidaten.
   */
  observe(rows: readonly FsdOrderRow[], now: number, listenHoehe: number | null = null): FsdCandidate[] {
    if (!this.enabled) return [];
    if (this.baselineEndsAt !== null) {
      this.absorbBaseline(rows);
      this.letzteHoehe = listenHoehe;
      return [];
    }

    const byId = uniqueRows(rows);
    const nextVisible = new Set(byId.keys());
    const additions = [...nextVisible].filter((id) => !this.visible.has(id));
    const removals = [...this.visible].filter((id) => !nextVisible.has(id));
    this.visible = nextVisible;

    const vorherigeHoehe = this.letzteHoehe;
    if (listenHoehe !== null) this.letzteHoehe = listenHoehe;

    const newCandidates: FsdCandidate[] = [];

    // Die Liste passt ganz ins Sichtfenster: dann ist „nichts verschwunden,
    // etwas dazugekommen" nach wie vor die klarste Aussage, die es gibt.
    const wachstumImSichtfenster = removals.length === 0 && additions.length > 0;

    // Oder: die Liste selbst ist länger geworden — das gilt auch für Aufträge,
    // die nie gerendert wurden. Nur mit wenigen unbekannten Zeilen zusammen,
    // sonst wäre ein Filterwechsel nicht davon zu unterscheiden.
    const neueUnbekannte = additions.filter((id) => !this.known.has(id));
    const listeGewachsen =
      vorherigeHoehe !== null &&
      listenHoehe !== null &&
      listenHoehe > vorherigeHoehe &&
      neueUnbekannte.length > 0 &&
      neueUnbekannte.length <= FSD_MAX_NEUE_JE_TAKT;

    const unambiguousGrowth = wachstumImSichtfenster || listeGewachsen;

    for (const id of additions) {
      const wasKnown = this.known.has(id);
      this.known.add(id);
      if (!unambiguousGrowth || wasKnown || this.handled.has(id) || this.pending.has(id)) continue;

      const row = byId.get(id);
      if (row?.eligible !== true) {
        this.handled.add(id);
        continue;
      }

      const candidate: FsdCandidate = {
        id,
        label: row.label,
        detectedAt: now,
        dueAt: now + this.openDelayMs,
      };
      this.pending.set(id, candidate);
      newCandidates.push(candidate);
    }

    return newCandidates;
  }

  /** Beendet die Baseline frühestens nach der konfigurierten Einlesezeit. */
  finishBaseline(rows: readonly FsdOrderRow[], now: number): boolean {
    if (!this.enabled || this.baselineEndsAt === null || now < this.baselineEndsAt) return false;
    this.absorbBaseline(rows);
    this.baselineEndsAt = null;
    return true;
  }

  /**
   * Reserviert den nächsten fälligen Kandidaten genau einmal. Ob sein DOM-Wirt
   * noch existiert und klickbar ist, entscheidet anschließend der Controller.
   */
  takeDue(now: number): FsdCandidate | null {
    if (!this.enabled || this.baselineEndsAt !== null) return null;
    const candidate = this.sortedPending()[0];
    if (candidate === undefined || this.effectiveDueAt(candidate) > now) return null;

    this.pending.delete(candidate.id);
    this.handled.add(candidate.id);
    return candidate;
  }

  recordOpened(now: number): void {
    if (this.enabled) this.lastOpenedAt = now;
  }

  snapshot(): FsdAutoSnapshot {
    const next = this.sortedPending()[0] ?? null;
    const mode: FsdAutoMode = !this.enabled
      ? 'off'
      : this.baselineEndsAt !== null
        ? 'baselining'
        : this.pending.size > 0
          ? 'waiting'
          : 'armed';

    return {
      mode,
      pendingCount: this.pending.size,
      baselineUntil: this.baselineEndsAt,
      next,
      nextWakeAt:
        this.baselineEndsAt ?? (next === null ? null : this.effectiveDueAt(next)),
    };
  }

  private absorbBaseline(rows: readonly FsdOrderRow[]): void {
    const byId = uniqueRows(rows);
    this.visible = new Set(byId.keys());
    for (const id of this.visible) this.known.add(id);
  }

  private sortedPending(): FsdCandidate[] {
    return [...this.pending.values()].sort((left, right) => {
      const due = this.effectiveDueAt(left) - this.effectiveDueAt(right);
      if (due !== 0) return due;
      const detected = left.detectedAt - right.detectedAt;
      return detected !== 0 ? detected : left.id.localeCompare(right.id);
    });
  }

  private effectiveDueAt(candidate: FsdCandidate): number {
    return Math.max(
      candidate.dueAt,
      this.lastOpenedAt === null ? candidate.dueAt : this.lastOpenedAt + this.betweenOpensMs,
    );
  }

  private reset(): void {
    this.enabled = false;
    this.baselineEndsAt = null;
    this.visible = new Set<string>();
    this.known.clear();
    this.handled.clear();
    this.pending.clear();
    this.lastOpenedAt = null;
    this.letzteHoehe = null;
  }
}

function uniqueRows(rows: readonly FsdOrderRow[]): Map<string, FsdOrderRow> {
  const byId = new Map<string, FsdOrderRow>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return byId;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} muss eine nichtnegative Zahl sein`);
  return value;
}
