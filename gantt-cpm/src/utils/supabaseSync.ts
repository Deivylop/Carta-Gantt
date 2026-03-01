import { supabase } from '../lib/supabase';
import type { GanttState } from '../store/GanttContext';
import { BUILTIN_FILTERS } from '../store/GanttContext';
import { newActivity, isoDate, parseDate } from './cpm';
import { deriveResString } from './helpers';
import type { RiskAnalysisState, RiskScoringConfig, SimulationResult, DurationDistribution, RiskEvent, RiskTaskImpact, SimulationParams } from '../types/risk';
import { DEFAULT_RISK_STATE } from '../types/risk';

// Maps Calendar factors directly as in original HTML
let isSaving = false;
let pendingSave: { state: GanttState; projectId: string | null } | null = null;

export async function saveToSupabase(state: GanttState, projectId: string | null): Promise<string | null> {
    if (isSaving) {
        // Queue latest state so it gets saved once the current save finishes
        pendingSave = { state, projectId };
        console.warn('Supabase save already in progress — queued for retry.');
        return null;
    }
    isSaving = true;

    try {
        const projName = state.projName || 'Mi Proyecto';
        const _projStart = isoDate(state.projStart) || null;
        const _statusDate = isoDate(state.statusDate) || null;
        const defCal = state.defCal || 6;
        let currentId = projectId;

        // 1. Upsert Project
        if (currentId) {
            const { data, error } = await supabase.from('gantt_projects').update({
                projname: projName, projstart: _projStart, defcal: defCal, statusdate: _statusDate
            }).eq('id', currentId).select();
            if (error) throw error;
            // If no rows were returned, the project was deleted from the database
            if (!data || data.length === 0) {
                console.warn('Project ID exists in local storage but not in database. Creating a new project...');
                currentId = null;
            }
        }

        if (!currentId) {
            const { data, error } = await supabase.from('gantt_projects').insert({
                projname: projName, projstart: _projStart, defcal: defCal, statusdate: _statusDate
            }).select().single();
            if (error) throw error;
            currentId = data.id;
        }

        if (!currentId) throw new Error('Failed to get project ID');

        // 2. Clear old data (cascade-safe order)
        const d1 = await supabase.from('gantt_activity_resources').delete().eq('project_id', currentId);
        if (d1.error) throw d1.error;
        const d2 = await supabase.from('gantt_dependencies').delete().eq('project_id', currentId);
        if (d2.error) throw d2.error;
        const d3 = await supabase.from('gantt_activities').delete().eq('project_id', currentId);
        if (d3.error) throw d3.error;
        const d4 = await supabase.from('gantt_resources').delete().eq('project_id', currentId);
        if (d4.error) throw d4.error;

        // 3. Insert Resources
        const ridMap: Record<number, string> = {};
        if (state.resourcePool.length) {
            const resRows = state.resourcePool.map(r => ({
                project_id: currentId, rid: r.rid, name: r.name, type: r.type, materiallabel: r.materialLabel,
                initials: r.initials, resource_group: r.group, maxcapacity: r.maxCapacity, stdrate: r.stdRate,
                overtimerate: r.overtimeRate, costperuse: r.costPerUse, accrual: r.accrual, calendar: r.calendar, code: r.code
            }));
            const { data: resData, error: resErr } = await supabase.from('gantt_resources').insert(resRows).select();
            if (resErr) throw resErr;
            (resData as any[]).forEach(r => { ridMap[r.rid] = r.id; });
        }

        // 4. Insert Activities
        // Extract project-row metadata BEFORE filtering it out
        const projRow = state.activities.find(a => a._isProjRow);
        const acts = [...state.activities.filter(a => !a._isProjRow)];
        // Inject progress history + project-row metadata as a hidden activity
        {
            const latestEF = state.activities.filter(a => (a.type === 'task' || a.type === 'milestone') && !a._isProjRow)
                .reduce<string | null>((max, a) => {
                    const ef = a.EF ? a.EF.toISOString() : null;
                    if (ef && (!max || ef > max)) return ef;
                    return max;
                }, null);
            // EF is exclusive (day after last work day), subtract 1 day for display endDate
            const endDateISO = latestEF ? new Date(new Date(latestEF).getTime() - 86400000).toISOString() : null;
            const historyPayload: any = {
                history: state.progressHistory || [],
                projMeta: {
                    plannedPct: projRow?._plannedPct || 0,
                    dur: projRow?.dur || 0,
                    remDur: projRow?.remDur ?? null,
                    work: projRow?.work || 0,
                    pct: projRow?.pct || 0,
                    startDate: state.projStart ? state.projStart.toISOString() : null,
                    endDate: endDateISO,
                    statusDate: state.statusDate ? state.statusDate.toISOString() : null,
                },
            };
            acts.push({
                ...newActivity('__HISTORY__', defCal),
                name: '__PROGRESS_HISTORY__',
                type: 'milestone',
                notes: JSON.stringify(historyPayload),
                lv: -1,
            } as any);
        }
        // Inject custom filters as a hidden activity
        const userFilters = state.customFilters ? state.customFilters.filter((f: any) => !f.builtin) : [];
        const builtinActive = state.customFilters ? state.customFilters.filter((f: any) => f.builtin && f.active).map((f: any) => f.id) : [];
        if (userFilters.length > 0 || builtinActive.length > 0) {
            acts.push({
                ...newActivity('__FILTERS__', defCal),
                name: '__CUSTOM_FILTERS__',
                type: 'milestone',
                notes: JSON.stringify({ customFilters: userFilters, builtinActive, filtersMatchAll: state.filtersMatchAll }),
                lv: -1,
            } as any);
        }
        // Inject PPC history (weekly PPC records + CNC entries) as a hidden activity
        if (state.ppcHistory && state.ppcHistory.length > 0) {
            acts.push({
                ...newActivity('__PPC__', defCal),
                name: '__PPC_HISTORY__',
                type: 'milestone',
                notes: JSON.stringify(state.ppcHistory),
                lv: -1,
            } as any);
        }
        // Inject Lean restrictions as a hidden activity
        if (state.leanRestrictions && state.leanRestrictions.length > 0) {
            acts.push({
                ...newActivity('__RESTRICTIONS__', defCal),
                name: '__LEAN_RESTRICTIONS__',
                type: 'milestone',
                notes: JSON.stringify(state.leanRestrictions),
                lv: -1,
            } as any);
        }
        // Inject What-If scenarios as a hidden activity
        if (state.scenarios && state.scenarios.length > 0) {
            // Serialize scenarios – strip Date objects, keep ISO strings
            const safeISO = (v: any): string | null => {
                if (!v) return null;
                if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
                if (typeof v === 'string') return v; // already an ISO string
                return null;
            };
            const scenariosData = state.scenarios.map(sc => ({
                ...sc,
                activities: sc.activities.map(a => ({
                    ...a,
                    ES: safeISO(a.ES),
                    EF: safeISO(a.EF),
                    LS: safeISO(a.LS),
                    LF: safeISO(a.LF),
                    blES: safeISO(a.blES),
                    blEF: safeISO(a.blEF),
                })),
            }));
            acts.push({
                ...newActivity('__SCENARIOS__', defCal),
                name: '__WHATIF_SCENARIOS__',
                type: 'milestone',
                notes: JSON.stringify(scenariosData),
                lv: -1,
            } as any);
        }
        // Build & inject deps backup as hidden activity (safeguard against dep-insert failures)
        const depsBackup: Record<string, { id: string; type: string; lag: number }[]> = {};
        state.activities.forEach(a => {
            if (a._isProjRow || !a.preds || a.preds.length === 0) return;
            depsBackup[a.id] = a.preds.map(p => ({ id: p.id, type: p.type || 'FS', lag: p.lag || 0 }));
        });
        if (Object.keys(depsBackup).length > 0) {
            acts.push({
                ...newActivity('__DEPS__', defCal),
                name: '__DEPS_BACKUP__',
                type: 'milestone',
                notes: JSON.stringify(depsBackup),
                lv: -1,
            } as any);
        }
        const localIdMap: Record<string, string> = {};
        if (acts.length) {
            const actRows = acts.map((a, i) => {
                const cd = a.constraintDate && a.constraintDate.trim ? a.constraintDate.trim() : '';
                return {
                    project_id: currentId, local_id: a.id, sort_order: i, name: a.name || '', type: a.type || 'task',
                    dur: a.dur != null ? a.dur : 0, remdur: a.remDur != null ? a.remDur : null, cal: a.cal || defCal,
                    pct: a.pct || 0, notes: a.notes || '', res: a.res || '', work: a.work || 0, weight: a.weight != null ? a.weight : null,
                    lv: a.lv || 0, constraint_type: a.constraint || null, constraintdate: cd ? cd : null,
                    manual: !!a.manual, ES: a.ES ? a.ES.toISOString() : null, EF: a.EF ? a.EF.toISOString() : null,
                    LS: a.LS ? a.LS.toISOString() : null, LF: a.LF ? a.LF.toISOString() : null,
                    TF: a.TF != null ? a.TF : null, crit: !!a.crit,
                    bldur: a.blDur != null ? a.blDur : null, bles: a.blES ? a.blES.toISOString() : null,
                    blef: a.blEF ? a.blEF.toISOString() : null,
                    encargado: a.encargado || '',
                    txt1: a.txt1 || '', txt2: a.txt2 || '', txt3: a.txt3 || '',
                    txt4: (a.actualStart || a.actualFinish || a.suspendDate || a.resumeDate) ? ('__AS__' + (a.actualStart || '') + '|' + (a.actualFinish || '') + '|' + (a.suspendDate || '') + '|' + (a.resumeDate || '')) : (a.txt4 || ''),
                    txt5: (a.baselines && a.baselines.some((b: any) => b))
                        ? '__BL__' + JSON.stringify(a.baselines.map((bl: any) => bl ? { d: bl.dur, s: bl.ES ? bl.ES.toISOString() : null, e: bl.EF ? bl.EF.toISOString() : null, c: bl.cal, t: bl.savedAt, n: bl.name || '', desc: bl.description || '', p: bl.pct || 0, w: bl.work || 0, wt: bl.weight, sd: bl.statusDate || '' } : null))
                        : (a.txt5 || '')
                };
            });
            const { data: actData, error: actErr } = await supabase.from('gantt_activities').insert(actRows).select();
            if (actErr) throw actErr;
            (actData as any[]).forEach(a => { localIdMap[a.local_id] = a.id; });

            // 5. Dependencies — with retry for resilience
            const depRows: any[] = [];
            acts.forEach(a => {
                if (!a.preds) return;
                const toUuid = localIdMap[a.id]; if (!toUuid) return;
                a.preds.forEach(p => {
                    const fromUuid = localIdMap[p.id];
                    if (fromUuid) depRows.push({ project_id: currentId, from_activity_id: fromUuid, to_activity_id: toUuid, type: p.type || 'FS', lag: p.lag || 0 });
                });
            });
            if (depRows.length) {
                const { error: de } = await supabase.from('gantt_dependencies').insert(depRows);
                if (de) {
                    console.warn('Dependency insert failed, retrying…', de);
                    // Retry once after a short delay
                    await new Promise(r => setTimeout(r, 500));
                    const { error: de2 } = await supabase.from('gantt_dependencies').insert(depRows);
                    if (de2) console.error('Dependency insert retry also failed — deps backed up in hidden activity __DEPS_BACKUP__', de2);
                }
            }

            // 6. Activity-resources
            const arRows: any[] = [];
            acts.forEach(a => {
                if (!a.resources) return;
                const actUuid = localIdMap[a.id]; if (!actUuid) return;
                a.resources.forEach(r => {
                    const resUuid = ridMap[r.rid];
                    if (resUuid) arRows.push({ project_id: currentId, activity_id: actUuid, resource_id: resUuid, units: String(r.units || 100), work: r.work || 0 });
                });
            });
            if (arRows.length) { const { error: ae } = await supabase.from('gantt_activity_resources').insert(arRows); if (ae) throw ae; }
        }

        // ═══ 7. RISK DATA ═══
        await saveRiskDataToSupabase(currentId as string, state.riskState);

        return currentId as string;
    } finally {
        isSaving = false;
        // Process queued save (latest state wins)
        if (pendingSave) {
            const { state: ps, projectId: pp } = pendingSave;
            pendingSave = null;
            console.log('[Supabase] Processing queued save…');
            setTimeout(() => saveToSupabase(ps, pp).catch(e => console.error('Queued save failed:', e)), 150);
        }
    }
}

/** Save all risk analysis data for a project */
async function saveRiskDataToSupabase(projectId: string, riskState: RiskAnalysisState | undefined): Promise<void> {
    if (!riskState) return;

    // Helper to check Supabase errors
    const chk = (res: { error: any }, label: string) => {
        if (res.error) { console.error(`[RiskSync] ${label}:`, res.error); throw res.error; }
    };

    // 7a. Clear old risk data (cascade-safe order — children before parents)
    // risk_simulation_runs CASCADE → percentiles, histogram, activity stats, criticality, sensitivity, snapshots
    chk(await supabase.from('risk_simulation_runs').delete().eq('project_id', projectId), 'del sim_runs');
    chk(await supabase.from('risk_sim_params').delete().eq('project_id', projectId), 'del sim_params');
    chk(await supabase.from('risk_distributions').delete().eq('project_id', projectId), 'del distributions');
    // risk_events CASCADE → risk_task_impacts
    chk(await supabase.from('risk_events').delete().eq('project_id', projectId), 'del events');
    // risk_scoring_config CASCADE → probability_scale, impact_scale, impact_types, tolerance_levels
    chk(await supabase.from('risk_scoring_config').delete().eq('project_id', projectId), 'del scoring_config');

    // 7b. Risk Scoring Config
    const scoring = riskState.riskScoring;
    if (scoring) {
        const { data: cfgData, error: cfgErr } = await supabase
            .from('risk_scoring_config')
            .insert({ project_id: projectId, pid_score_mode: scoring.pidScoreMode || 'highest' })
            .select().single();
        if (cfgErr) throw cfgErr;
        const configId = cfgData.id;

        // Probability scale
        if (scoring.probabilityScale?.length) {
            const rows = scoring.probabilityScale.map((s, i) => ({
                config_id: configId, level_key: s.key, label: s.label,
                weight: s.weight, threshold: s.threshold || '', sort_order: i,
            }));
            const { error } = await supabase.from('risk_probability_scale').insert(rows);
            if (error) throw error;
        }

        // Impact scale
        if (scoring.impactScale?.length) {
            const rows = scoring.impactScale.map((s, i) => ({
                config_id: configId, level_key: s.key, label: s.label,
                weight: s.weight, threshold: s.threshold || '', sort_order: i,
            }));
            const { error } = await supabase.from('risk_impact_scale').insert(rows);
            if (error) throw error;
        }

        // Impact types
        if (scoring.impactTypes?.length) {
            const rows = scoring.impactTypes.map((t, i) => ({
                config_id: configId, type_id: t.id, label: t.label, scored: t.scored,
                threshold_vl: t.levels?.VL || '', threshold_l: t.levels?.L || '',
                threshold_m: t.levels?.M || '', threshold_h: t.levels?.H || '',
                threshold_vh: t.levels?.VH || '', sort_order: i,
            }));
            const { error } = await supabase.from('risk_impact_types').insert(rows);
            if (error) throw error;
        }

        // Tolerance levels
        if (scoring.toleranceLevels?.length) {
            const rows = scoring.toleranceLevels.map((t, i) => ({
                config_id: configId, label: t.label, color: t.color,
                min_score: t.minScore, sort_order: i,
            }));
            const { error } = await supabase.from('risk_tolerance_levels').insert(rows);
            if (error) throw error;
        }
    }

    // 7c. Risk Events
    const eventUuidMap: Record<string, string> = {};
    if (riskState.riskEvents?.length) {
        const rows = riskState.riskEvents.map((ev, i) => ({
            project_id: projectId, local_id: ev.id, code: ev.code || '',
            name: ev.name || '', description: ev.description || '',
            cause: ev.cause || '', effect: ev.effect || '',
            threat_or_opportunity: ev.threatOrOpportunity || 'threat',
            status: ev.status || 'proposed', category: ev.category || 'Otro',
            owner: ev.owner || '', notes: ev.notes || '', rbs: ev.rbs || '',
            pre_probability: ev.preMitigation?.probability || 'M',
            pre_schedule: ev.preMitigation?.schedule || 'M',
            pre_cost: ev.preMitigation?.cost || 'M',
            pre_performance: ev.preMitigation?.performance || 'M',
            post_probability: ev.postMitigation?.probability || 'M',
            post_schedule: ev.postMitigation?.schedule || 'M',
            post_cost: ev.postMitigation?.cost || 'M',
            post_performance: ev.postMitigation?.performance || 'M',
            mitigation_response: ev.mitigationResponse || 'accept',
            mitigation_title: ev.mitigationTitle || '',
            mitigation_cost: ev.mitigationCost || 0,
            quantified: !!ev.quantified, probability: ev.probability ?? 50,
            impact_type: ev.impactType || 'addDays', impact_value: ev.impactValue ?? 5,
            mitigated: !!ev.mitigated,
            mitigated_probability: ev.mitigatedProbability ?? null,
            mitigated_impact_value: ev.mitigatedImpactValue ?? null,
            start_date: ev.startDate || null, end_date: ev.endDate || null,
            sort_order: i,
        }));
        const { data: evData, error: evErr } = await supabase.from('risk_events').insert(rows).select();
        if (evErr) throw evErr;
        (evData as any[]).forEach(e => { eventUuidMap[e.local_id] = e.id; });

        // 7d. Risk Task Impacts
        const tiRows: any[] = [];
        riskState.riskEvents.forEach(ev => {
            const evUuid = eventUuidMap[ev.id];
            if (!evUuid || !ev.taskImpacts?.length) return;
            ev.taskImpacts.forEach((ti, i) => {
                tiRows.push({
                    risk_event_id: evUuid, project_id: projectId,
                    task_local_id: ti.taskId,
                    schedule_shape: ti.scheduleShape || 'none',
                    schedule_min: ti.scheduleMin ?? null,
                    schedule_likely: ti.scheduleLikely ?? null,
                    schedule_max: ti.scheduleMax ?? null,
                    cost_shape: ti.costShape || 'none',
                    cost_min: ti.costMin ?? null,
                    cost_likely: ti.costLikely ?? null,
                    cost_max: ti.costMax ?? null,
                    correlate: !!ti.correlate,
                    impact_ranges: !!ti.impactRanges,
                    event_existence: !!ti.eventExistence,
                    sort_order: i,
                });
            });
        });
        if (tiRows.length) {
            const { error } = await supabase.from('risk_task_impacts').insert(tiRows);
            if (error) throw error;
        }
    }

    // 7e. Distributions
    const distEntries = Object.entries(riskState.distributions || {});
    if (distEntries.length) {
        const rows = distEntries.map(([actId, d]) => ({
            project_id: projectId, activity_local_id: actId,
            dist_type: d.type || 'none',
            dist_min: d.min ?? null, most_likely: d.mostLikely ?? null, dist_max: d.max ?? null,
        }));
        const { error } = await supabase.from('risk_distributions').insert(rows);
        if (error) throw error;
    }

    // 7f. Simulation Parameters
    if (riskState.params) {
        const p = riskState.params;
        const { error } = await supabase.from('risk_sim_params').insert({
            project_id: projectId, iterations: p.iterations || 1000,
            seed: p.seed ?? null, use_mitigated: !!p.useMitigated,
            confidence_levels: p.confidenceLevels || [10, 25, 50, 75, 80, 90],
        });
        if (error) throw error;
    }

    // 7g. Simulation Runs + child tables
    if (riskState.simulationRuns?.length) {
        for (const run of riskState.simulationRuns) {
            const { data: runData, error: runErr } = await supabase
                .from('risk_simulation_runs')
                .insert({
                    project_id: projectId, local_id: run.id, name: run.name || '',
                    run_at: run.runAt,
                    param_iterations: run.params?.iterations || 1000,
                    param_seed: run.params?.seed ?? null,
                    param_use_mitigated: !!run.params?.useMitigated,
                    param_confidence_levels: run.params?.confidenceLevels || [10, 25, 50, 75, 80, 90],
                    completed_iterations: run.completedIterations,
                    deterministic_duration: run.deterministicDuration,
                    deterministic_finish: run.deterministicFinish,
                    mean_duration: run.meanDuration,
                    std_dev_duration: run.stdDevDuration,
                    is_active: run.id === riskState.activeRunId,
                }).select().single();
            if (runErr) throw runErr;
            const runUuid = runData.id;

            // Duration percentiles
            const pctlEntries = Object.entries(run.durationPercentiles || {});
            if (pctlEntries.length) {
                chk(await supabase.from('risk_run_percentiles').insert(
                    pctlEntries.map(([p, d]) => ({ run_id: runUuid, percentile: Number(p), duration: d }))
                ), 'ins run_percentiles');
            }

            // Date percentiles
            const datePctlEntries = Object.entries(run.datePercentiles || {});
            if (datePctlEntries.length) {
                chk(await supabase.from('risk_run_date_percentiles').insert(
                    datePctlEntries.map(([p, d]) => ({ run_id: runUuid, percentile: Number(p), finish_date: d }))
                ), 'ins run_date_percentiles');
            }

            // Histogram
            if (run.histogram?.length) {
                chk(await supabase.from('risk_run_histogram').insert(
                    run.histogram.map((h, i) => ({
                        run_id: runUuid, bin_start: h.binStart, bin_end: h.binEnd,
                        count: h.count, cum_pct: h.cumPct, sort_order: i,
                    }))
                ), 'ins run_histogram');
            }

            // Activity stats + per-activity percentiles
            const actPctlEntries = Object.entries(run.activityPercentiles || {});
            if (actPctlEntries.length) {
                // Deterministic stats
                chk(await supabase.from('risk_run_activity_stats').insert(
                    actPctlEntries.map(([actId, s]) => ({
                        run_id: runUuid, activity_local_id: actId,
                        deterministic_start: s.deterministicStart || null,
                        deterministic_finish: s.deterministicFinish || null,
                        deterministic_duration: s.deterministicDuration ?? null,
                    }))
                ), 'ins run_activity_stats');

                // Activity finish date percentiles
                const adpRows: any[] = [];
                actPctlEntries.forEach(([actId, s]) => {
                    Object.entries(s.datePercentiles || {}).forEach(([p, d]) => {
                        adpRows.push({ run_id: runUuid, activity_local_id: actId, percentile: Number(p), finish_date: d });
                    });
                });
                if (adpRows.length) chk(await supabase.from('risk_run_act_date_pctls').insert(adpRows), 'ins act_date_pctls');

                // Activity start date percentiles
                const aspRows: any[] = [];
                actPctlEntries.forEach(([actId, s]) => {
                    Object.entries(s.startDatePercentiles || {}).forEach(([p, d]) => {
                        aspRows.push({ run_id: runUuid, activity_local_id: actId, percentile: Number(p), start_date: d });
                    });
                });
                if (aspRows.length) chk(await supabase.from('risk_run_act_start_pctls').insert(aspRows), 'ins act_start_pctls');

                // Activity duration percentiles
                const adurRows: any[] = [];
                actPctlEntries.forEach(([actId, s]) => {
                    Object.entries(s.durationPercentiles || {}).forEach(([p, d]) => {
                        adurRows.push({ run_id: runUuid, activity_local_id: actId, percentile: Number(p), duration: d });
                    });
                });
                if (adurRows.length) chk(await supabase.from('risk_run_act_dur_pctls').insert(adurRows), 'ins act_dur_pctls');
            }

            // Criticality index
            const critEntries = Object.entries(run.criticalityIndex || {});
            if (critEntries.length) {
                chk(await supabase.from('risk_run_criticality').insert(
                    critEntries.map(([actId, ci]) => ({ run_id: runUuid, activity_local_id: actId, criticality_index: ci }))
                ), 'ins criticality');
            }

            // Sensitivity index
            const sensEntries = Object.entries(run.sensitivityIndex || {});
            if (sensEntries.length) {
                chk(await supabase.from('risk_run_sensitivity').insert(
                    sensEntries.map(([actId, si]) => ({ run_id: runUuid, activity_local_id: actId, sensitivity_index: si }))
                ), 'ins sensitivity');
            }

            // Distribution snapshot
            const dSnapEntries = Object.entries(run.distributionsSnapshot || {});
            if (dSnapEntries.length) {
                chk(await supabase.from('risk_run_dist_snapshot').insert(
                    dSnapEntries.map(([actId, d]) => ({
                        run_id: runUuid, activity_local_id: actId,
                        dist_type: d.type, dist_min: d.min ?? null,
                        most_likely: d.mostLikely ?? null, dist_max: d.max ?? null,
                    }))
                ), 'ins dist_snapshot');
            }

            // Events snapshot (JSONB)
            if (run.riskEventsSnapshot?.length) {
                chk(await supabase.from('risk_run_events_snapshot').insert(
                    run.riskEventsSnapshot.map((ev, i) => ({ run_id: runUuid, event_data: ev, sort_order: i }))
                ), 'ins events_snapshot');
            }
        }
    }
}

export async function loadFromSupabase(projectId: string): Promise<Partial<GanttState>> {
    const { data: proj, error: pe } = await supabase.from('gantt_projects').select('*').eq('id', projectId).single();
    if (pe) throw pe;

    const projName = proj.projname || 'Mi Proyecto';
    const projStart = proj.projstart ? (parseDate(proj.projstart) || new Date()) : new Date();
    const defCal = proj.defcal || 6;
    const statusDate = proj.statusdate ? (parseDate(proj.statusdate) || new Date()) : new Date();

    // Resources
    const { data: resData, error: re } = await supabase.from('gantt_resources').select('*').eq('project_id', projectId).order('rid');
    if (re) throw re;
    const resourcePool = (resData as any[]).map(r => ({
        rid: r.rid, name: r.name || '', type: r.type || 'Trabajo', materialLabel: r.materiallabel || '',
        initials: r.initials || '', group: r.resource_group || '', maxCapacity: r.maxcapacity || '100%',
        stdRate: r.stdrate || '0', overtimeRate: r.overtimerate || '0', costPerUse: r.costperuse || '0',
        accrual: r.accrual || 'Prorrateo', calendar: r.calendar || '7d', code: r.code || ''
    }));
    const uuidToRid: Record<string, number> = {};
    (resData as any[]).forEach(r => { uuidToRid[r.id] = r.rid; });

    // Activities
    const { data: actData, error: ae } = await supabase.from('gantt_activities').select('*').eq('project_id', projectId).order('sort_order');
    if (ae) throw ae;
    const uuidToLocalId: Record<string, string> = {};
    (actData as any[]).forEach(a => { uuidToLocalId[a.id] = a.local_id; });

    // Dependencies
    const { data: depData, error: de } = await supabase.from('gantt_dependencies').select('*').eq('project_id', projectId);
    if (de) throw de;
    const depMap: Record<string, any[]> = {};
    const depHasData = (depData as any[]).length > 0;
    (depData as any[]).forEach(d => {
        const toL = uuidToLocalId[d.to_activity_id];
        const fromL = uuidToLocalId[d.from_activity_id];
        if (!toL || !fromL) return;
        if (!depMap[toL]) depMap[toL] = [];
        depMap[toL].push({ id: fromL, type: d.type || 'FS', lag: d.lag || 0 });
    });

    // Activity resources
    const { data: arData, error: arE } = await supabase.from('gantt_activity_resources').select('*').eq('project_id', projectId);
    if (arE) throw arE;
    const arMap: Record<string, any[]> = {};
    (arData as any[]).forEach(ar => {
        if (!arMap[ar.activity_id]) arMap[ar.activity_id] = [];
        const rid = uuidToRid[ar.resource_id];
        if (rid != null) arMap[ar.activity_id].push({ rid, units: parseInt(ar.units) || 100, work: ar.work || 0, name: '' });
    });

    const getPoolResource = (rid: number) => resourcePool.find(r => r.rid === rid);

    let progressHistory: any[] = [];
    let customFilters: any[] = [];
    let filtersMatchAll = true;
    let ppcHistory: any[] = [];
    let leanRestrictions: any[] = [];
    let depsBackup: Record<string, { id: string; type: string; lag: number }[]> = {};
    let scenarios: any[] = [];

    // Build activities
    const activities = (actData as any[]).map(a => {
        const na = { ...newActivity() };
        na.id = a.local_id; na.name = a.name || ''; na.type = a.type || 'task';
        na.dur = parseFloat(a.dur) || 0; na.remDur = a.remdur != null ? parseFloat(a.remdur) : null;
        na.cal = a.cal as 5 | 6 | 7 || defCal; na.pct = parseFloat(a.pct) || 0;
        na.notes = a.notes || ''; na.res = a.res || ''; na.work = parseFloat(a.work) || 0;
        na.weight = a.weight != null ? parseFloat(a.weight) : null; na.lv = a.lv || 0;
        na.constraint = (a.constraint_type as any) || ''; na.constraintDate = a.constraintdate || '';
        na.encargado = a.encargado || '';
        na.manual = !!a.manual;
        na.blDur = a.bldur != null ? parseFloat(a.bldur) : null;
        na.blES = a.bles ? new Date(a.bles) : null; na.blEF = a.blef ? new Date(a.blef) : null;
        na.txt1 = a.txt1 || ''; na.txt2 = a.txt2 || ''; na.txt3 = a.txt3 || '';
        // Restore actualStart and actualFinish from txt4 if encoded
        const rawTxt4 = a.txt4 || '';
        if (rawTxt4.startsWith('__AS__')) {
            const parts = rawTxt4.slice(6).split('|');
            na.actualStart = parts[0] || null;
            na.actualFinish = parts[1] || null;
            na.suspendDate = parts[2] || null;
            na.resumeDate = parts[3] || null;
            na.txt4 = '';
        } else {
            na.txt4 = rawTxt4;
            na.actualStart = null;
            na.actualFinish = null;
            na.suspendDate = null;
            na.resumeDate = null;
        }
        // Restore multiple baselines from txt5 if encoded
        const rawTxt5 = a.txt5 || '';
        if (rawTxt5.startsWith('__BL__')) {
            try {
                const blArr = JSON.parse(rawTxt5.slice(6));
                na.baselines = (blArr as any[]).map((bl: any) => bl ? { dur: bl.d, ES: bl.s ? new Date(bl.s) : null, EF: bl.e ? new Date(bl.e) : null, cal: bl.c, savedAt: bl.t || '', name: bl.n || '', description: bl.desc || '', pct: bl.p || 0, work: bl.w || 0, weight: bl.wt != null ? bl.wt : null, statusDate: bl.sd || '' } : null);
            } catch { na.baselines = []; }
            na.txt5 = '';
        } else {
            na.txt5 = rawTxt5;
            na.baselines = [];
        }
        na.preds = depMap[a.local_id] || [];
        const actRes = arMap[a.id] || [];
        actRes.forEach(ar => { const pr = getPoolResource(ar.rid); if (pr) ar.name = pr.name; });
        na.resources = actRes;
        if (actRes.length) deriveResString(na, resourcePool);
        return na;
    }).filter(na => {
        // Extract hidden progress history if found (backward compat: old format is plain array, new format is { history, projMeta })
        if (na.id === '__HISTORY__') {
            try {
                const parsed = JSON.parse(na.notes);
                progressHistory = Array.isArray(parsed) ? parsed : (parsed.history || []);
            } catch (e) { }
            return false;
        }
        // Extract hidden custom filters if found
        if (na.id === '__FILTERS__') {
            try {
                const filterData = JSON.parse(na.notes);
                const userFilters = filterData.customFilters || [];
                const builtinActive: string[] = filterData.builtinActive || [];
                // Re-inject builtins with saved active states
                const builtins = BUILTIN_FILTERS.map(bf => ({ ...bf, active: builtinActive.includes(bf.id) }));
                customFilters = [...builtins, ...userFilters];
                if (filterData.filtersMatchAll !== undefined) filtersMatchAll = filterData.filtersMatchAll;
            } catch (e) { }
            return false;
        }
        // Extract hidden PPC history if found
        if (na.id === '__PPC__') {
            try { ppcHistory = JSON.parse(na.notes); } catch (e) { }
            return false;
        }
        // Extract hidden Lean restrictions if found
        if (na.id === '__RESTRICTIONS__') {
            try { leanRestrictions = JSON.parse(na.notes); } catch (e) { }
            return false;
        }
        // Extract hidden What-If scenarios if found
        if (na.id === '__SCENARIOS__') {
            try {
                const raw = JSON.parse(na.notes);
                scenarios = (raw as any[]).map((sc: any) => ({
                    ...sc,
                    activities: (sc.activities || []).map((a: any) => ({
                        ...a,
                        ES: a.ES ? new Date(a.ES) : null,
                        EF: a.EF ? new Date(a.EF) : null,
                        LS: a.LS ? new Date(a.LS) : null,
                        LF: a.LF ? new Date(a.LF) : null,
                        blES: a.blES ? new Date(a.blES) : null,
                        blEF: a.blEF ? new Date(a.blEF) : null,
                        preds: a.preds || [],
                        resources: a.resources || [],
                        baselines: a.baselines || [],
                    })),
                    changes: sc.changes || [],
                }));
            } catch (e) { }
            return false;
        }
        // Extract hidden deps backup if found
        if (na.id === '__DEPS__') {
            try { depsBackup = JSON.parse(na.notes); } catch (e) { }
            return false;
        }
        return true;
    });

    // Post-processing: restore deps from backup if dep table was empty
    if (!depHasData && Object.keys(depsBackup).length > 0) {
        console.warn('[Supabase] Dependencies table empty — restoring from backup');
        activities.forEach(a => {
            if ((!a.preds || a.preds.length === 0) && depsBackup[a.id]) {
                a.preds = depsBackup[a.id];
            }
        });
    }

    return {
        projName,
        projStart,
        defCal,
        statusDate,
        resourcePool,
        activities,
        progressHistory,
        customFilters,
        filtersMatchAll,
        ppcHistory,
        leanRestrictions,
        scenarios,
        riskState: await loadRiskStateFromSupabase(projectId),
    };
}

/** Load risk analysis state from Supabase for a project */
async function loadRiskStateFromSupabase(projectId: string): Promise<Partial<RiskAnalysisState>> {
    const result: Partial<RiskAnalysisState> = {};

    // ── Risk Scoring Config ──
    const { data: cfgRow } = await supabase
        .from('risk_scoring_config').select('*').eq('project_id', projectId).maybeSingle();

    if (cfgRow) {
        const configId = cfgRow.id;

        // Probability scale
        const { data: probRows } = await supabase
            .from('risk_probability_scale').select('*').eq('config_id', configId).order('sort_order');
        const probabilityScale = (probRows || []).map((r: any) => ({
            key: r.level_key, label: r.label, weight: Number(r.weight), threshold: r.threshold || '',
        }));

        // Impact scale
        const { data: impRows } = await supabase
            .from('risk_impact_scale').select('*').eq('config_id', configId).order('sort_order');
        const impactScale = (impRows || []).map((r: any) => ({
            key: r.level_key, label: r.label, weight: Number(r.weight), threshold: r.threshold || '',
        }));

        // Impact types
        const { data: typeRows } = await supabase
            .from('risk_impact_types').select('*').eq('config_id', configId).order('sort_order');
        const impactTypes = (typeRows || []).map((r: any) => ({
            id: r.type_id, label: r.label, scored: !!r.scored,
            levels: {
                VL: r.threshold_vl || '', L: r.threshold_l || '',
                ML: '', M: r.threshold_m || '', MH: '',
                H: r.threshold_h || '', VH: r.threshold_vh || '',
            },
        }));

        // Tolerance levels
        const { data: tolRows } = await supabase
            .from('risk_tolerance_levels').select('*').eq('config_id', configId).order('sort_order');
        const toleranceLevels = (tolRows || []).map((r: any) => ({
            label: r.label, color: r.color, minScore: Number(r.min_score),
        }));

        result.riskScoring = {
            probabilityScale,
            impactScale,
            impactTypes,
            toleranceLevels,
            pidScoreMode: cfgRow.pid_score_mode || 'highest',
        } as RiskScoringConfig;
    }

    // ── Risk Events ──
    const { data: evRows } = await supabase
        .from('risk_events').select('*').eq('project_id', projectId).order('sort_order');

    if (evRows && evRows.length) {
        // Pre-fetch all task impacts for this project in one query
        const { data: allTiRows } = await supabase
            .from('risk_task_impacts').select('*').eq('project_id', projectId).order('sort_order');
        const tiByEvent: Record<string, any[]> = {};
        (allTiRows || []).forEach((ti: any) => {
            if (!tiByEvent[ti.risk_event_id]) tiByEvent[ti.risk_event_id] = [];
            tiByEvent[ti.risk_event_id].push(ti);
        });

        result.riskEvents = evRows.map((r: any) => {
            const taskImpacts: RiskTaskImpact[] = (tiByEvent[r.id] || []).map((ti: any) => ({
                taskId: ti.task_local_id,
                scheduleShape: ti.schedule_shape || 'none',
                scheduleMin: ti.schedule_min != null ? Number(ti.schedule_min) : undefined,
                scheduleLikely: ti.schedule_likely != null ? Number(ti.schedule_likely) : undefined,
                scheduleMax: ti.schedule_max != null ? Number(ti.schedule_max) : undefined,
                costShape: ti.cost_shape || 'none',
                costMin: ti.cost_min != null ? Number(ti.cost_min) : undefined,
                costLikely: ti.cost_likely != null ? Number(ti.cost_likely) : undefined,
                costMax: ti.cost_max != null ? Number(ti.cost_max) : undefined,
                correlate: !!ti.correlate,
                impactRanges: !!ti.impact_ranges,
                eventExistence: !!ti.event_existence,
            }));

            return {
                id: r.local_id,
                code: r.code || '',
                name: r.name || '',
                description: r.description || '',
                cause: r.cause || '',
                effect: r.effect || '',
                threatOrOpportunity: r.threat_or_opportunity || 'threat',
                status: r.status || 'proposed',
                category: r.category || 'Otro',
                owner: r.owner || '',
                notes: r.notes || '',
                rbs: r.rbs || '',
                preMitigation: {
                    probability: r.pre_probability || 'M',
                    schedule: r.pre_schedule || 'M',
                    cost: r.pre_cost || 'M',
                    performance: r.pre_performance || 'M',
                },
                postMitigation: {
                    probability: r.post_probability || 'M',
                    schedule: r.post_schedule || 'M',
                    cost: r.post_cost || 'M',
                    performance: r.post_performance || 'M',
                },
                mitigationResponse: r.mitigation_response || 'accept',
                mitigationTitle: r.mitigation_title || '',
                mitigationCost: Number(r.mitigation_cost) || 0,
                quantified: !!r.quantified,
                probability: Number(r.probability) ?? 50,
                taskImpacts,
                affectedActivityIds: taskImpacts.map(ti => ti.taskId),
                impactType: r.impact_type || 'addDays',
                impactValue: Number(r.impact_value) ?? 5,
                mitigated: !!r.mitigated,
                mitigatedProbability: r.mitigated_probability != null ? Number(r.mitigated_probability) : undefined,
                mitigatedImpactValue: r.mitigated_impact_value != null ? Number(r.mitigated_impact_value) : undefined,
                startDate: r.start_date || undefined,
                endDate: r.end_date || undefined,
            } as RiskEvent;
        });
    }

    // ── Distributions ──
    const { data: distRows } = await supabase
        .from('risk_distributions').select('*').eq('project_id', projectId);
    if (distRows && distRows.length) {
        const distributions: Record<string, DurationDistribution> = {};
        distRows.forEach((r: any) => {
            distributions[r.activity_local_id] = {
                type: r.dist_type || 'none',
                min: r.dist_min != null ? Number(r.dist_min) : undefined,
                mostLikely: r.most_likely != null ? Number(r.most_likely) : undefined,
                max: r.dist_max != null ? Number(r.dist_max) : undefined,
            };
        });
        result.distributions = distributions;
    }

    // ── Simulation Parameters ──
    const { data: paramsRow } = await supabase
        .from('risk_sim_params').select('*').eq('project_id', projectId).maybeSingle();
    if (paramsRow) {
        result.params = {
            iterations: paramsRow.iterations || 1000,
            seed: paramsRow.seed ?? null,
            useMitigated: !!paramsRow.use_mitigated,
            confidenceLevels: paramsRow.confidence_levels || [10, 25, 50, 75, 80, 90],
        } as SimulationParams;
    }

    // ── Simulation Runs ──
    const { data: runRows } = await supabase
        .from('risk_simulation_runs').select('*').eq('project_id', projectId).order('run_at', { ascending: false });

    if (runRows && runRows.length) {
        const runs: SimulationResult[] = [];
        let activeRunId: string | null = null;

        for (const rr of runRows) {
            const runUuid = rr.id;
            const localId = rr.local_id;
            if (rr.is_active) activeRunId = localId;

            // Fetch all child tables for this run in parallel
            const [pctlRes, datePctlRes, histRes, statsRes, adpRes, aspRes, adurRes, critRes, sensRes, dsnapRes, esnapRes] = await Promise.all([
                supabase.from('risk_run_percentiles').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_date_percentiles').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_histogram').select('*').eq('run_id', runUuid).order('sort_order'),
                supabase.from('risk_run_activity_stats').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_act_date_pctls').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_act_start_pctls').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_act_dur_pctls').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_criticality').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_sensitivity').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_dist_snapshot').select('*').eq('run_id', runUuid),
                supabase.from('risk_run_events_snapshot').select('*').eq('run_id', runUuid).order('sort_order'),
            ]);

            // Duration percentiles
            const durationPercentiles: Record<number, number> = {};
            (pctlRes.data || []).forEach((r: any) => { durationPercentiles[r.percentile] = Number(r.duration); });

            // Date percentiles
            const datePercentiles: Record<number, string> = {};
            (datePctlRes.data || []).forEach((r: any) => { datePercentiles[r.percentile] = r.finish_date; });

            // Histogram
            const histogram = (histRes.data || []).map((r: any) => ({
                binStart: Number(r.bin_start), binEnd: Number(r.bin_end),
                count: r.count, cumPct: Number(r.cum_pct),
            }));

            // Activity percentiles
            const activityPercentiles: Record<string, any> = {};
            // Deterministic stats
            (statsRes.data || []).forEach((r: any) => {
                activityPercentiles[r.activity_local_id] = {
                    deterministicStart: r.deterministic_start || '',
                    deterministicFinish: r.deterministic_finish || '',
                    deterministicDuration: r.deterministic_duration != null ? Number(r.deterministic_duration) : 0,
                    datePercentiles: {},
                    startDatePercentiles: {},
                    durationPercentiles: {},
                };
            });
            // Finish date percentiles
            (adpRes.data || []).forEach((r: any) => {
                if (activityPercentiles[r.activity_local_id])
                    activityPercentiles[r.activity_local_id].datePercentiles[r.percentile] = r.finish_date;
            });
            // Start date percentiles
            (aspRes.data || []).forEach((r: any) => {
                if (activityPercentiles[r.activity_local_id])
                    activityPercentiles[r.activity_local_id].startDatePercentiles[r.percentile] = r.start_date;
            });
            // Duration percentiles
            (adurRes.data || []).forEach((r: any) => {
                if (activityPercentiles[r.activity_local_id])
                    activityPercentiles[r.activity_local_id].durationPercentiles[r.percentile] = Number(r.duration);
            });

            // Criticality index
            const criticalityIndex: Record<string, number> = {};
            (critRes.data || []).forEach((r: any) => { criticalityIndex[r.activity_local_id] = Number(r.criticality_index); });

            // Sensitivity index
            const sensitivityIndex: Record<string, number> = {};
            (sensRes.data || []).forEach((r: any) => { sensitivityIndex[r.activity_local_id] = Number(r.sensitivity_index); });

            // Distribution snapshot
            const distributionsSnapshot: Record<string, DurationDistribution> = {};
            (dsnapRes.data || []).forEach((r: any) => {
                distributionsSnapshot[r.activity_local_id] = {
                    type: r.dist_type || 'none',
                    min: r.dist_min != null ? Number(r.dist_min) : undefined,
                    mostLikely: r.most_likely != null ? Number(r.most_likely) : undefined,
                    max: r.dist_max != null ? Number(r.dist_max) : undefined,
                };
            });

            // Events snapshot
            const riskEventsSnapshot = (esnapRes.data || []).map((r: any) => r.event_data as RiskEvent);

            runs.push({
                id: localId,
                name: rr.name || '',
                runAt: rr.run_at,
                params: {
                    iterations: rr.param_iterations || 1000,
                    seed: rr.param_seed ?? null,
                    useMitigated: !!rr.param_use_mitigated,
                    confidenceLevels: rr.param_confidence_levels || [10, 25, 50, 75, 80, 90],
                },
                completedIterations: rr.completed_iterations,
                durationPercentiles,
                datePercentiles,
                deterministicDuration: Number(rr.deterministic_duration),
                deterministicFinish: rr.deterministic_finish,
                meanDuration: Number(rr.mean_duration),
                stdDevDuration: Number(rr.std_dev_duration),
                criticalityIndex,
                sensitivityIndex,
                histogram,
                activityPercentiles,
                distributionsSnapshot,
                riskEventsSnapshot,
            });
        }

        result.simulationRuns = runs;
        result.activeRunId = activeRunId;
    }

    result.running = false;
    result.progress = 0;

    return result;
}

/** Delete a project from Supabase (cascades to activities, deps, resources, risk, etc.) */
export async function deleteProjectFromSupabase(supabaseId: string): Promise<void> {
    // Delete in cascade-safe order (child tables first)
    // Risk simulation runs → cascades to all risk_run_* child tables
    await supabase.from('risk_simulation_runs').delete().eq('project_id', supabaseId);
    await supabase.from('risk_sim_params').delete().eq('project_id', supabaseId);
    await supabase.from('risk_distributions').delete().eq('project_id', supabaseId);
    await supabase.from('risk_task_impacts').delete().eq('project_id', supabaseId);
    await supabase.from('risk_events').delete().eq('project_id', supabaseId);
    // risk_scoring_config → cascades to probability/impact scale, impact_types, tolerance
    await supabase.from('risk_scoring_config').delete().eq('project_id', supabaseId);
    // Original gantt tables
    await supabase.from('gantt_activity_resources').delete().eq('project_id', supabaseId);
    await supabase.from('gantt_dependencies').delete().eq('project_id', supabaseId);
    await supabase.from('gantt_activities').delete().eq('project_id', supabaseId);
    await supabase.from('gantt_resources').delete().eq('project_id', supabaseId);
    const { error } = await supabase.from('gantt_projects').delete().eq('id', supabaseId);
    if (error) throw error;
}

/** List all projects from Supabase (lightweight — only project metadata) */
export async function listSupabaseProjects(): Promise<{ id: string; projName: string; projStart: string | null; statusDate: string | null; defCal: number }[]> {
    const { data, error } = await supabase
        .from('gantt_projects')
        .select('id, projname, projstart, statusdate, defcal')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((r: any) => ({
        id: r.id,
        projName: r.projname || 'Sin nombre',
        projStart: r.projstart || null,
        statusDate: r.statusdate || null,
        defCal: r.defcal || 6,
    }));
}

/** Save portfolio state (EPS tree + project metadata) to Supabase */
export async function savePortfolioToSupabase(portfolio: {
    epsNodes: any[];
    projects: any[];
    expandedIds: string[];
    activeProjectId: string | null;
}): Promise<void> {
    const { error } = await supabase
        .from('portfolio_state')
        .upsert({
            id: 'default',
            eps_nodes: portfolio.epsNodes,
            projects: portfolio.projects,
            expanded_ids: portfolio.expandedIds,
            active_project_id: portfolio.activeProjectId,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    if (error) throw error;
}

/** Load portfolio state from Supabase (returns null if table doesn't exist or no data) */
export async function loadPortfolioFromSupabase(): Promise<{
    epsNodes: any[];
    projects: any[];
    expandedIds: string[];
    activeProjectId: string | null;
} | null> {
    const { data, error } = await supabase
        .from('portfolio_state')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
    if (error) {
        // Table may not exist yet — gracefully return null
        if (error.code === '42P01' || error.message?.includes('does not exist')) return null;
        throw error;
    }
    if (!data) return null;
    return {
        epsNodes: data.eps_nodes || [],
        projects: data.projects || [],
        expandedIds: data.expanded_ids || [],
        activeProjectId: data.active_project_id || null,
    };
}

/** Fetch lightweight summaries for multiple projects from gantt_activities.
 *  Uses stored project-row metadata from __HISTORY__ for accuracy. */
export async function fetchProjectSummaries(
    supabaseProjectIds: string[]
): Promise<Record<string, {
    activityCount: number;
    duration: number;
    remainingDur: number;
    work: number;
    actualWork: number;
    remainingWork: number;
    globalPct: number;
    pctProg: number;
    resources: string;
    startDate?: string | null;
    endDate?: string | null;
    statusDate?: string | null;
    plannedPct?: number;
}>> {
    if (!supabaseProjectIds.length) return {};

    // Fetch activities (only lightweight columns + notes for __HISTORY__)
    const { data: allActs, error } = await supabase
        .from('gantt_activities')
        .select('project_id, local_id, type, dur, remdur, pct, work, notes, res, sort_order, lv')
        .in('project_id', supabaseProjectIds)
        .order('sort_order', { ascending: true });
    if (error) throw error;

    // Group activities by project_id
    const byProject = new Map<string, any[]>();
    (allActs || []).forEach(a => {
        if (!byProject.has(a.project_id)) byProject.set(a.project_id, []);
        byProject.get(a.project_id)!.push(a);
    });

    const result: Record<string, any> = {};

    for (const [projectId, acts] of byProject) {
        // Filter real tasks (not hidden meta-activities)
        const tasks = acts.filter((a: any) => a.type === 'task' && !a.local_id.startsWith('__'));
        // First summary row (WBS 0 equivalent)
        const summaryRow = acts.find((a: any) => a.sort_order === 0 && a.type === 'summary');
        // Hidden history + project metadata
        const historyRow = acts.find((a: any) => a.local_id === '__HISTORY__');

        const activityCount = tasks.length;

        // Parse stored project-row metadata from __HISTORY__ (new format)
        let projMeta: any = null;
        let historyEntries: any[] = [];
        if (historyRow?.notes) {
            try {
                const parsed = JSON.parse(historyRow.notes);
                if (Array.isArray(parsed)) {
                    historyEntries = parsed; // old format: plain array
                } else {
                    historyEntries = parsed.history || [];
                    projMeta = parsed.projMeta || null;
                }
            } catch { /* ignore */ }
        }

        // Use projMeta (from CPM engine save) when available, otherwise fallback to activity data
        const duration = projMeta?.dur ?? (summaryRow ? parseFloat(summaryRow.dur) || 0 : 0);
        const remainingDur = projMeta?.remDur ?? (summaryRow ? (summaryRow.remdur != null ? parseFloat(summaryRow.remdur) : duration) : 0);
        const totalWork = projMeta?.work ?? tasks.reduce((sum: number, a: any) => sum + (parseFloat(a.work) || 0), 0);

        // Calculate actualWork: per-task (work * pct/100)
        const actualWorkCalc = tasks.reduce((sum: number, a: any) => {
            const w = parseFloat(a.work) || 0;
            const p = parseFloat(a.pct) || 0;
            return sum + (w * p / 100);
        }, 0);
        const actualWork = Math.round(actualWorkCalc * 100) / 100;
        const remainingWork = totalWork - actualWork;

        // Aggregate unique resources
        const resSet = new Set<string>();
        tasks.forEach((a: any) => {
            if (a.res) a.res.split(';').map((r: string) => r.trim()).filter(Boolean).forEach((r: string) => resSet.add(r));
        });

        // Extract global % from last progress history entry, fallback to projMeta.pct
        let globalPct = 0;
        if (historyEntries.length > 0) {
            const last = historyEntries[historyEntries.length - 1];
            if (last) globalPct = last.actualPct || 0;
        } else if (projMeta?.pct) {
            // No progress history saved yet — use the CPM-computed project row %
            globalPct = Math.round((projMeta.pct || 0) * 10) / 10;
        }

        // Planned % (from CPM engine) — stored in projMeta
        const plannedPct = projMeta?.plannedPct ?? 0;

        // Dates from projMeta (accurate from CPM engine save)
        const startDate = projMeta?.startDate || null;
        const endDate = projMeta?.endDate || null;
        const statusDate = projMeta?.statusDate || null;

        result[projectId] = {
            activityCount,
            duration,
            remainingDur,
            work: totalWork,
            actualWork,
            remainingWork,
            globalPct,
            pctProg: plannedPct,
            resources: Array.from(resSet).join('; '),
            startDate,
            endDate,
            statusDate,
            plannedPct,
        };
    }

    return result;
}

/** Create a new project in gantt_projects and return its Supabase UUID */
export async function createSupabaseProject(
    name: string,
    projStart?: string | null,
    defCal?: number,
    statusDate?: string | null
): Promise<string> {
    const { data, error } = await supabase
        .from('gantt_projects')
        .insert({
            projname: name,
            projstart: projStart || null,
            defcal: defCal || 6,
            statusdate: statusDate || null,
        })
        .select()
        .single();
    if (error) throw error;
    return data.id;
}
