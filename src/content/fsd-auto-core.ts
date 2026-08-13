/**
 * Zustandskern der Pro-exklusiven FSD-Automatik.
 *
 * Der Kern kennt weder DOM noch Chrome-APIs. Er nimmt Schnappschüsse der
 * sichtbaren Auftragsliste entgegen und gibt nur dann einen Kandidaten frei,
 * wenn die Liste eindeutig gewachsen ist. Ein Austausch bei gleicher Größe
 * (Filter, Navigation oder virtuelles Scrollen) bleibt damit fail-safe ohne
 * automatischen Klick.
 */

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

  constructor(options: FsdAutoCoreOptions = {}) {
    this.baselineMs = nonNegative(options.baselineMs ?? FSD_BASELINE_MS, 'baselineMs');
    this.openDelayMs = nonNegative(options.openDelayMs ?? FSD_OPEN_DELAY_MS, 'openDelayMs');
    this.betweenOpensMs = nonNegative(options.betweenOpensMs ?? FSD_BETWEEN_OPENS_MS, 'betweenOpensMs');
  }

  enable(rows: readonly FsdOrderRow[], now: number): void {
    this.reset();
    this.enabled = true;
    this.baselineEndsAt = now + this.baselineMs;
    this.absorbBaseline(rows);
  }

  disable(): void {
    this.reset();
  }

  /**
   * Nimmt den aktuellen DOM-Stand auf. Während der Baseline wird nur gelernt;
   * danach erzeugt ausschließlich ein monotones Mengenwachstum Kandidaten.
   */
  observe(rows: readonly FsdOrderRow[], now: number): FsdCandidate[] {
    if (!this.enabled) return [];
    if (this.baselineEndsAt !== null) {
      this.absorbBaseline(rows);
      return [];
    }

    const byId = uniqueRows(rows);
    const nextVisible = new Set(byId.keys());
    const additions = [...nextVisible].filter((id) => !this.visible.has(id));
    const removals = [...this.visible].filter((id) => !nextVisible.has(id));
    this.visible = nextVisible;

    const newCandidates: FsdCandidate[] = [];
    const unambiguousGrowth = removals.length === 0 && additions.length > 0;

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
