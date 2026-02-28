// ═══════════════════════════════════════════════════════════════════
// ScenarioGanttProvider – Context bridge that intercepts useGantt()
// so that GanttTable + GanttTimeline operate on scenario data.
// Master activities are passed as _masterActivities for ghost bars.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import { GanttContext, useGantt, type Action } from '../../store/GanttContext';
import { isoDate, parseDate, addDays, calWorkDays, fmtDate } from '../../utils/cpm';
import { strToPreds, predsToStr, computeOutlineNumbers } from '../../utils/helpers';
import type { Activity, VisibleRow, WhatIfScenario } from '../../types/gantt';

/* ── Simplified visRows builder (hierarchy + collapsed) ────────── */
function buildScenarioVisRows(activities: Activity[], collapsed: Set<string>): VisibleRow[] {
    const rows: VisibleRow[] = [];
    let skipLv = -999;
    activities.forEach((a, i) => {
        if (skipLv > -999) {
            if (a.lv > skipLv) return;
            else skipLv = -999;
        }
        if (collapsed.has(a.id) && a.type === 'summary') {
            rows.push({ ...a, _idx: i } as VisibleRow);
            skipLv = a.lv;
            return;
        }
        rows.push({ ...a, _idx: i } as VisibleRow);
    });
    return rows;
}

/* ── Parse a COMMIT_EDIT into a Partial<Activity> update ───────── */
function parseCommitEdit(
    act: Activity,
    key: string,
    value: string,
    defCal: any,
    statusDate: Date | null,
    cpmStatusDate: Date | null,
): { updates: Partial<Activity> & { _oldId?: string }; needRecalc: boolean } | null {
    // Early return: noop for project rows / summary dur/work/pct edits
    if (act._isProjRow) return null;
    if (act.type === 'summary' && (key === 'work' || key === 'pct' || key === 'dur')) return null;

    const val = value;
    const a = { ...act };
    let needRecalc = true;

    // Check if value actually changed
    const curVal = (() => {
        if (key === 'name') return a.name || '';
        if (key === 'id') return a.id || '';
        if (key === 'dur') return String((a as any)._spanDur != null ? (a as any)._spanDur : (a.dur || 0));
        if (key === 'remDur') return String(a.remDur != null ? a.remDur : '');
        if (key === 'pct') return String(a.pct || 0);
        if (key === 'work') return String(a.work || 0);
        if (key === 'weight') return a.weight != null ? String(a.weight) : '';
        if (key === 'predStr') return predsToStr(a.preds);
        if (key === 'startDate') return a.ES ? fmtDateISO(a.ES) : '';
        if (key === 'endDate') return a.EF ? fmtDateISO(a.type === 'milestone' ? a.EF : addDays(a.EF, -1)) : '';
        if (key === 'cal') return String(a.cal || defCal);
        if (key === 'notes') return a.notes || '';
        if (key === 'res') return a.res || '';
        if (key.startsWith('txt')) return (a as any)[key] || '';
        return '';
    })();
    if (val === curVal) return null;

    const updates: Record<string, any> = {};

    if (key === 'name') {
        updates.name = val;
    } else if (key === 'id') {
        // ID rename — also patch predecessors referencing old ID
        updates.id = val;
        updates._oldId = a.id; // signal for pred patching
    } else if (key === 'dur') {
        const n = parseInt(val);
        if (!isNaN(n)) {
            const newDur = Math.max(0, n);
            const visualDur = (a as any)._spanDur != null ? (a as any)._spanDur : (a.dur || 0);
            const delta = newDur - visualDur;
            let newRemDur = a.remDur;
            if ((a.pct || 0) > 0 && a.remDur != null) {
                newRemDur = Math.max(0, a.remDur + delta);
            } else if ((a.pct || 0) === 0) {
                // pct=0: remDur must always equal dur
                newRemDur = Math.max(0, (a.dur || 0) + delta);
            }
            updates.dur = Math.max(0, (a.dur || 0) + delta);
            updates.remDur = newRemDur;
            if (newDur === 0) updates.type = 'milestone';
            else if (a.type === 'milestone') updates.type = 'task';
        }
    } else if (key === 'remDur') {
        const n = parseInt(val);
        if (!isNaN(n)) {
            const newRemDur = Math.max(0, n);
            if ((a.pct || 0) > 0) {
                const oldRemDur = a.remDur != null ? a.remDur : Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100);
                const delta = newRemDur - oldRemDur;
                updates.dur = Math.max(0, (a.dur || 0) + delta);
            } else {
                updates.dur = newRemDur;
            }
            updates.remDur = newRemDur;
        }
    } else if (key === 'predStr') {
        updates.preds = strToPreds(val);
    } else if (key === 'startDate') {
        const d = parseDate(val);
        if (d) {
            updates.constraintDate = isoDate(d);
            updates.manual = true;
            if ((a.pct || 0) > 0) updates.actualStart = isoDate(d);
        } else {
            updates.constraintDate = '';
            updates.manual = false;
        }
    } else if (key === 'endDate') {
        const d = parseDate(val);
        if (d && a.ES) {
            const efDate = a.type === 'milestone' ? d : addDays(d, 1);
            updates.dur = Math.max(0, calWorkDays(a.ES, efDate, a.cal || defCal));
        }
    } else if (key === 'work') {
        const n = parseFloat(val);
        if (!isNaN(n)) updates.work = Math.max(0, n);
    } else if (key === 'weight') {
        const cleaned = String(val).replace('%', '').trim();
        const n = parseFloat(cleaned);
        if (!isNaN(n) && n > 0) updates.weight = n; else updates.weight = null;
    } else if (key === 'pct') {
        const oldPct = a.pct || 0;
        const newPct = Math.min(100, Math.max(0, parseInt(val) || 0));
        updates.pct = newPct;
        // actualStart logic
        if (oldPct === 0 && newPct > 0 && !a.actualStart) {
            const effectiveSD = cpmStatusDate || statusDate;
            const esOk = a.ES && effectiveSD ? a.ES.getTime() <= effectiveSD.getTime() : true;
            if (esOk) {
                if (a.ES) updates.actualStart = isoDate(a.ES);
                else if (a.constraintDate) updates.actualStart = a.constraintDate;
            }
        }
        if (newPct === 0) { updates.actualStart = null; updates.actualFinish = null; }
        if (newPct === 100 && !a.actualFinish && a.EF) updates.actualFinish = isoDate(addDays(a.EF, -1));
        if (newPct < 100) updates.actualFinish = null;
        // Recalculate remaining duration
        updates.remDur = Math.round((a.dur || 0) * (100 - newPct) / 100);
        needRecalc = false; // pct edits: only refresh, no CPM recalc
    } else if (key === 'cal') {
        const calVal = parseInt(val);
        if (calVal === 5 || calVal === 6 || calVal === 7) updates.cal = calVal;
        else updates.cal = val;
    } else if (key === 'notes') {
        updates.notes = val;
    } else if (key === 'res') {
        updates.res = val;
    } else if (key.startsWith('txt')) {
        updates[key] = val;
    }

    return Object.keys(updates).length > 0 ? { updates, needRecalc } : null;
}

/* fmtDate helper (ISO) */
function fmtDateISO(d: Date | null | undefined): string {
    if (!d) return '';
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${day}-${m}-${y}`;
}

/* ── Provider Component ────────────────────────────────────────── */
interface Props {
    scenario: WhatIfScenario;
    children: React.ReactNode;
}

export default function ScenarioGanttProvider({ scenario, children }: Props) {
    const { state: realState, dispatch: realDispatch } = useGantt();

    /* ── Auto-heal: recalc CPM if scenario dates look corrupted (strings) ── */
    const healedRef = useRef<string | null>(null);
    useEffect(() => {
        if (healedRef.current === scenario.id) return; // already healed this scenario
        // Check if any task-level activity has a date that's a string instead of Date
        const needsHeal = scenario.activities.some(a => {
            if (a._isProjRow || a.type === 'summary') return false;
            return (a.ES && !(a.ES instanceof Date)) || (a.EF && !(a.EF instanceof Date));
        });
        if (needsHeal) {
            console.warn('[ScenarioGanttProvider] Detected corrupted dates in scenario — auto-recalculating CPM');
            healedRef.current = scenario.id;
            realDispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id });
        }
    }, [scenario.id, scenario.activities, realDispatch]);

    /* ── Ensure scenario activities have proper Date objects ──────── */
    const safeActivities = useMemo(() => {
        const toDate = (v: any): Date | null => {
            if (!v) return null;
            if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
            const d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
        };
        return scenario.activities.map(a => ({
            ...a,
            ES: toDate(a.ES),
            EF: toDate(a.EF),
            LS: toDate(a.LS),
            LF: toDate(a.LF),
            blES: toDate(a.blES),
            blEF: toDate(a.blEF),
            _actualEnd: toDate((a as any)._actualEnd),
            _remES: toDate((a as any)._remES),
            _remEF: toDate((a as any)._remEF),
            preds: a.preds || [],
            resources: a.resources || [],
            baselines: a.baselines || [],
        }));
    }, [scenario.activities]);

    /* Compute visRows for scenario activities */
    const scenarioVisRows = useMemo(() => {
        const acts = safeActivities.map(a => ({ ...a }));
        computeOutlineNumbers(acts);
        return buildScenarioVisRows(acts, realState.collapsed);
    }, [safeActivities, realState.collapsed]);

    /* ── Compute diff maps: changedFields + diffs (master vs scenario) ── */
    const { changedFields, diffs } = useMemo(() => {
        const cf = new Map<string, Set<string>>();
        const df = new Map<string, Record<string, { master: string; scenario: string }>>();

        try {
            const masterById = new Map<string, Activity>();
            realState.activities.forEach(a => masterById.set(a.id, a));

            // Safely convert a value to Date (handles strings from serialised state)
            const toDate = (v: any): Date | null => {
                if (!v) return null;
                if (v instanceof Date) return v;
                const d = new Date(v);
                return isNaN(d.getTime()) ? null : d;
            };
            const safeFmtDate = (v: any): string => { const d = toDate(v); return d ? fmtDate(d) : ''; };

            // Fields we compare (matching table column keys)
            const COMPARE_FIELDS: { key: string; get: (a: Activity) => string }[] = [
                { key: 'name', get: a => a.name || '' },
                { key: 'dur', get: a => String((a as any)._spanDur ?? a.dur ?? 0) + 'd' },
                { key: 'remDur', get: a => a.remDur != null ? String(a.remDur) + 'd' : '' },
                { key: 'pct', get: a => String(a.pct || 0) + '%' },
                { key: 'startDate', get: a => safeFmtDate(a.ES) },
                { key: 'endDate', get: a => {
                    const ef = toDate(a.EF);
                    if (!ef) return '';
                    return fmtDate(a.type === 'milestone' ? ef : addDays(ef, -1));
                }},
                { key: 'predStr', get: a => predsToStr(a.preds) },
                { key: 'work', get: a => String(a.work || 0) },
                { key: 'TF', get: a => a.TF != null ? String(a.TF) + 'd' : '' },
                { key: 'crit', get: a => a.crit ? 'Sí' : 'No' },
                { key: 'cal', get: a => String(a.cal || '') },
                { key: 'res', get: a => a.res || '' },
                { key: 'weight', get: a => a.weight != null ? String(a.weight) : '' },
            ];

            safeActivities.forEach(sa => {
                if (sa._isProjRow || sa.type === 'summary') return;
                const ma = masterById.get(sa.id);
                if (!ma) return;

                const fieldChanges = new Set<string>();
                const fieldDiffs: Record<string, { master: string; scenario: string }> = {};

                for (const f of COMPARE_FIELDS) {
                    try {
                        const mVal = f.get(ma);
                        const sVal = f.get(sa);
                        if (mVal !== sVal) {
                            fieldChanges.add(f.key);
                            fieldDiffs[f.key] = { master: mVal || '—', scenario: sVal || '—' };
                        }
                    } catch { /* skip field on error */ }
                }

                if (fieldChanges.size > 0) {
                    cf.set(sa.id, fieldChanges);
                    df.set(sa.id, fieldDiffs);
                }
            });
        } catch (err) {
            console.warn('[ScenarioGanttProvider] diff computation error:', err);
        }

        return { changedFields: cf, diffs: df };
    }, [realState.activities, safeActivities]);

    /* Build scenario state — swaps activities + visRows, adds ghost data */
    // Override statusDate with scenario's simStatusDate so the timeline line moves
    const effectiveStatusDate = useMemo(() => {
        if (scenario.simStatusDate) {
            const d = new Date(scenario.simStatusDate + 'T00:00:00');
            return isNaN(d.getTime()) ? realState.statusDate : d;
        }
        return realState.statusDate;
    }, [scenario.simStatusDate, realState.statusDate]);

    const scenarioState = useMemo(() => ({
        ...realState,
        activities: safeActivities,
        visRows: scenarioVisRows,
        statusDate: effectiveStatusDate,
        _scenarioMode: true,
        _masterActivities: realState.activities,
        _scenarioChangedFields: changedFields,
        _scenarioDiffs: diffs,
    }), [realState, safeActivities, scenarioVisRows, effectiveStatusDate, changedFields, diffs]);

    /* Wrapped dispatch — intercepts edits and routes to scenario actions */
    const scenarioDispatch = useCallback((action: Action) => {
        switch (action.type) {
            case 'COMMIT_EDIT': {
                const { index, key, value } = action;
                const realIdx = scenarioVisRows[index]?._idx ?? index;
                const act = scenario.activities[realIdx];
                if (!act) return;

                const result = parseCommitEdit(
                    act, key, value,
                    realState.defCal,
                    realState.statusDate,
                    realState._cpmStatusDate,
                );
                if (!result) return; // no change

                // Handle ID rename: patch preds in other activities
                if (result.updates._oldId) {
                    const oldId = result.updates._oldId as string;
                    const newId = result.updates.id as string;
                    delete result.updates._oldId;
                    // Patch all predecessor references
                    scenario.activities.forEach((a, i) => {
                        if (!a.preds) return;
                        const patched = a.preds.map(p => p.id === oldId ? { ...p, id: newId } : p);
                        if (patched.some((p, j) => p !== a.preds![j])) {
                            realDispatch({ type: 'UPDATE_SCENARIO_ACTIVITY', scenarioId: scenario.id, activityIndex: i, updates: { preds: patched } });
                        }
                    });
                }

                realDispatch({
                    type: 'UPDATE_SCENARIO_ACTIVITY',
                    scenarioId: scenario.id,
                    activityIndex: realIdx,
                    updates: result.updates,
                });

                if (result.needRecalc) {
                    realDispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id });
                }
                return;
            }

            case 'PUSH_UNDO':
                // No-op for scenarios (scenarios track changes via changelog)
                return;

            case 'ADD_ACTIVITY':
            case 'DELETE_ACTIVITY':
            case 'CUT_ACTIVITY':
            case 'PASTE_ACTIVITY':
            case 'MOVE_ROW':
            case 'INDENT':
                // Block structural changes in scenario mode
                return;

            case 'UPDATE_ACTIVITY': {
                // Route to scenario update
                realDispatch({
                    type: 'UPDATE_SCENARIO_ACTIVITY',
                    scenarioId: scenario.id,
                    activityIndex: action.index,
                    updates: action.updates,
                });
                realDispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id });
                return;
            }

            default:
                // Pass through all other actions (SET_SELECTION, SET_COL_WIDTH, TOGGLE_COLLAPSE, etc.)
                realDispatch(action);
        }
    }, [scenarioVisRows, scenario, realState.defCal, realState.statusDate, realState._cpmStatusDate, realDispatch]);

    return (
        <GanttContext.Provider value={{ state: scenarioState as any, dispatch: scenarioDispatch }}>
            {children}
        </GanttContext.Provider>
    );
}
