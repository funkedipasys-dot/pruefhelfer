import { FsdAutoCore } from './fsd-auto-core';
import type { FsdOrderRow } from './fsd-auto-core';

const row = (id: string, eligible = true): FsdOrderRow => ({ id, label: id.toUpperCase(), eligible });

describe('FsdAutoCore', () => {
  it('startet aus und lernt vorhandene sowie während der Baseline erscheinende Aufträge nur ein', () => {
    const core = new FsdAutoCore({ baselineMs: 3_000 });
    expect(core.snapshot().mode).toBe('off');

    core.enable([row('alt-1')], 1_000);
    expect(core.snapshot()).toMatchObject({ mode: 'baselining', baselineUntil: 4_000, pendingCount: 0 });

    expect(core.observe([row('alt-1'), row('alt-2')], 2_000)).toEqual([]);
    expect(core.finishBaseline([row('alt-1'), row('alt-2')], 3_999)).toBe(false);
    expect(core.finishBaseline([row('alt-1'), row('alt-2')], 4_000)).toBe(true);
    expect(core.snapshot().mode).toBe('armed');
    expect(core.observe([row('alt-1'), row('alt-2')], 4_001)).toEqual([]);
  });

  it('plant nur eindeutiges Mengenwachstum ein', () => {
    const core = armed([row('alt')]);

    expect(core.observe([row('alt'), row('neu')], 10_000)).toEqual([
      { id: 'neu', label: 'NEU', detectedAt: 10_000, dueAt: 40_000 },
    ]);
    expect(core.snapshot()).toMatchObject({ mode: 'waiting', pendingCount: 1 });
  });

  it('ignoriert Austausch und Virtualisierung bei gleicher Listengröße', () => {
    const core = armed([row('alt-1'), row('alt-2')]);

    expect(core.observe([row('alt-2'), row('fremd')], 10_000)).toEqual([]);
    expect(core.snapshot()).toMatchObject({ mode: 'armed', pendingCount: 0 });

    // Auch das spätere Wiederauftauchen darf die zuvor uneindeutig gesehene ID
    // nicht nachträglich zu einem neuen Auftrag machen.
    expect(core.observe([row('alt-2'), row('fremd'), row('noch-einer')], 11_000)).toEqual([
      { id: 'noch-einer', label: 'NOCH-EINER', detectedAt: 11_000, dueAt: 41_000 },
    ]);
  });

  it('markiert einen neuen Auftrag ohne Pending-Marker sicher als behandelt', () => {
    const core = armed([row('alt')]);

    expect(core.observe([row('alt'), row('neu', false)], 10_000)).toEqual([]);
    core.observe([row('alt')], 11_000);
    expect(core.observe([row('alt'), row('neu')], 12_000)).toEqual([]);
  });

  it('öffnet nicht vor 30 Sekunden und reserviert eine ID nur einmal', () => {
    const core = armed([row('alt')]);
    core.observe([row('alt'), row('neu')], 10_000);

    expect(core.takeDue(39_999)).toBeNull();
    expect(core.takeDue(40_000)?.id).toBe('neu');
    expect(core.takeDue(40_000)).toBeNull();

    core.observe([row('alt')], 41_000);
    expect(core.observe([row('alt'), row('neu')], 42_000)).toEqual([]);
  });

  it('hält zwischen zwei fälligen Aufträgen zehn Sekunden Abstand', () => {
    const core = armed([row('alt')]);
    core.observe([row('alt'), row('neu-1'), row('neu-2')], 10_000);

    expect(core.takeDue(40_000)?.id).toBe('neu-1');
    core.recordOpened(40_000);
    expect(core.snapshot().nextWakeAt).toBe(50_000);
    expect(core.takeDue(49_999)).toBeNull();
    expect(core.takeDue(50_000)?.id).toBe('neu-2');
  });

  it('verwirft beim Ausschalten Baseline und Warteschlange vollständig', () => {
    const core = armed([row('alt')]);
    core.observe([row('alt'), row('neu')], 10_000);

    core.disable();

    expect(core.snapshot()).toEqual({
      mode: 'off',
      pendingCount: 0,
      baselineUntil: null,
      next: null,
      nextWakeAt: null,
    });
    expect(core.takeDue(100_000)).toBeNull();
  });
});

function armed(rows: FsdOrderRow[]): FsdAutoCore {
  const core = new FsdAutoCore();
  core.enable(rows, 0);
  expect(core.finishBaseline(rows, 3_000)).toBe(true);
  return core;
}
