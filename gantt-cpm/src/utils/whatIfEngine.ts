// ═══════════════════════════════════════════════════════════════════
// What-If Scenarios Engine – Pure utility functions
// Creates snapshots, runs CPM on isolated copies, compares results
// ═══════════════════════════════════════════════════════════════════
import type { Activity, WhatIfScenario, ScenarioChange, ScenarioComparisonResult, CalendarType, CustomCalendar } from '../types/gantt';
import { calcCPM } from './cpm';
import { computeOutlineNumbers } from './helpers';

// ─── Colors palette for scenarios ───────────────────────────────
const SCENARIO_COLORS = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
];

let _colorIdx = 0;
export function nextScenarioColor(): string {
  const c = SCENARIO_COLORS[_colorIdx % SCENARIO_COLORS.length];
  _colorIdx++;
  return c;
}

// ─── Deep clone an activity array (breaks all object references) ──
export function deepCloneActivities(activities: Activity[]): Activity[] {
  return activities.map(a => ({
    ...a,
    preds: a.preds ? a.preds.map(p => ({ ...p })) : [],
    resources: a.resources ? a.resources.map(r => ({ ...r })) : [],
    baselines: a.baselines ? a.baselines.map(b => ({ ...b })) : [],
    // Clone Date objects
    ES: a.ES ? new Date(a.ES) : null,
    EF: a.EF ? new Date(a.EF) : null,
    LS: a.LS ? new Date(a.LS) : null,
    LF: a.LF ? new Date(a.LF) : null,
    blES: a.blES ? new Date(a.blES) : null,
    blEF: a.blEF ? new Date(a.blEF) : null,
  }));
}

// ─── Create a new scenario from current master activities ───────
export function createScenario(
  name: string,
  description: string,
  masterActivities: Activity[]
): WhatIfScenario {
  return {
    id: 'sc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    name,
    description,
    createdAt: new Date().toISOString(),
    baseSnapshotDate: new Date().toISOString(),
    activities: deepCloneActivities(masterActivities),
    changes: [],
    color: nextScenarioColor(),
  };
}

// ─── Run CPM on a scenario's activities (mutates in-place) ──────
export function recalcScenarioCPM(
  scenario: WhatIfScenario,
  projStart: Date,
  defCal: CalendarType,
  statusDate: Date | null,
  projName: string,
  activeBaselineIdx: number,
  customCalendars: CustomCalendar[]
): WhatIfScenario {
  const acts = deepCloneActivities(scenario.activities);
  const result = calcCPM(acts, projStart, defCal, statusDate, projName, activeBaselineIdx, customCalendars);
  computeOutlineNumbers(result.activities);
  return {
    ...scenario,
    activities: result.activities,
  };
}

// ─── Record a change in the scenario log ────────────────────────
export function recordChange(
  scenario: WhatIfScenario,
  activityId: string,
  field: string,
  oldValue: any,
  newValue: any
): ScenarioChange {
  const change: ScenarioChange = {
    id: 'ch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    activityId,
    field,
    oldValue,
    newValue,
    timestamp: new Date().toISOString(),
  };
  scenario.changes.push(change);
  return change;
}

// ─── Rebase a scenario onto fresh master activities ─────────────
// Takes the latest master activities, applies the scenario's recorded
// changes on top, so the scenario always works from up-to-date data.
export function rebaseScenario(
  scenario: WhatIfScenario,
  masterActivities: Activity[]
): WhatIfScenario {
  const acts = deepCloneActivities(masterActivities);
  const byId = new Map<string, number>();
  acts.forEach((a, i) => byId.set(a.id, i));

  // Build a map of latest value per (activityId, field) from the changes log
  // (last write wins — only apply the most recent change for each field)
  const latestChanges = new Map<string, Map<string, any>>();
  for (const ch of scenario.changes) {
    if (!latestChanges.has(ch.activityId)) latestChanges.set(ch.activityId, new Map());
    latestChanges.get(ch.activityId)!.set(ch.field, ch.newValue);
  }

  // Apply changes onto the fresh master clone
  for (const [actId, fields] of latestChanges) {
    const idx = byId.get(actId);
    if (idx === undefined) continue;
    const a = acts[idx];
    for (const [field, value] of fields) {
      (a as any)[field] = value;
    }
  }

  return {
    ...scenario,
    activities: acts,
    baseSnapshotDate: new Date().toISOString(),
  };
}

// ─── Compare master vs scenario activities ──────────────────────
export function compareScenario(
  master: Activity[],
  scenario: Activity[]
): ScenarioComparisonResult[] {
  const masterMap = new Map<string, Activity>();
  master.forEach(a => masterMap.set(a.id, a));

  const results: ScenarioComparisonResult[] = [];

  scenario.forEach(a => {
    if (a._isProjRow || a.type === 'summary') return;
    const m = masterMap.get(a.id);
    if (!m) return;

    const mES = m.ES ? new Date(m.ES as any).getTime() : null;
    const mEF = m.EF ? new Date(m.EF as any).getTime() : null;
    const sES = a.ES ? new Date(a.ES as any).getTime() : null;
    const sEF = a.EF ? new Date(a.EF as any).getTime() : null;

    const deltaStart = (mES !== null && sES !== null)
      ? Math.round((sES - mES) / 864e5)
      : 0;
    const deltaFinish = (mEF !== null && sEF !== null)
      ? Math.round((sEF - mEF) / 864e5)
      : 0;

    // Only include if there is actually a difference
    if (deltaStart !== 0 || deltaFinish !== 0 || m.crit !== a.crit || m.TF !== a.TF) {
      results.push({
        activityId: a.id,
        activityName: a.name,
        masterES: m.ES,
        masterEF: m.EF,
        scenarioES: a.ES,
        scenarioEF: a.EF,
        deltaStart,
        deltaFinish,
        masterCrit: m.crit,
        scenarioCrit: a.crit,
        masterTF: m.TF,
        scenarioTF: a.TF,
      });
    }
  });

  return results;
}

// ─── Impact summary ─────────────────────────────────────────────
export interface ScenarioImpactSummary {
  projectEndDelta: number;          // days difference on project end
  masterProjectEnd: Date | null;
  scenarioProjectEnd: Date | null;
  newCriticalActivities: string[];   // IDs that became critical
  removedCriticalActivities: string[]; // IDs that lost criticality
  avgFloatChange: number;
  totalActivitiesAffected: number;
}

export function scenarioImpactSummary(
  master: Activity[],
  scenario: Activity[]
): ScenarioImpactSummary {
  // Find project end (max EF across all tasks)
  const maxEF = (acts: Activity[]): Date | null => {
    let max: Date | null = null;
    acts.forEach(a => {
      if (a._isProjRow || a.type === 'summary') return;
      if (a.EF) {
        const efDate = a.EF instanceof Date ? a.EF : new Date(a.EF as any);
        if (!max || efDate.getTime() > max.getTime()) max = new Date(efDate);
      }
    });
    return max;
  };

  const masterEnd = maxEF(master);
  const scenarioEnd = maxEF(scenario);
  const projectEndDelta = (masterEnd && scenarioEnd)
    ? Math.round((scenarioEnd.getTime() - masterEnd.getTime()) / 864e5)
    : 0;

  const comparison = compareScenario(master, scenario);

  const newCrit: string[] = [];
  const removedCrit: string[] = [];
  let tfDiffSum = 0;
  let tfCount = 0;

  const masterMap = new Map<string, Activity>();
  master.forEach(a => masterMap.set(a.id, a));

  scenario.forEach(a => {
    if (a._isProjRow || a.type === 'summary') return;
    const m = masterMap.get(a.id);
    if (!m) return;

    if (!m.crit && a.crit) newCrit.push(a.id);
    if (m.crit && !a.crit) removedCrit.push(a.id);

    if (m.TF !== null && a.TF !== null) {
      tfDiffSum += (a.TF - m.TF);
      tfCount++;
    }
  });

  return {
    projectEndDelta,
    masterProjectEnd: masterEnd,
    scenarioProjectEnd: scenarioEnd,
    newCriticalActivities: newCrit,
    removedCriticalActivities: removedCrit,
    avgFloatChange: tfCount > 0 ? Math.round(tfDiffSum / tfCount * 10) / 10 : 0,
    totalActivitiesAffected: comparison.length,
  };
}
