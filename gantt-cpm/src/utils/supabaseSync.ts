import { supabase } from '../lib/supabase';
import type { GanttState } from '../store/GanttContext';
import { BUILTIN_FILTERS } from '../store/GanttContext';
import { newActivity, isoDate, parseDate } from './cpm';
import { deriveResString } from './helpers';

// Maps Calendar factors directly as in original HTML
let isSaving = false;

export async function saveToSupabase(state: GanttState, projectId: string | null): Promise<string | null> {
    if (isSaving) {
        console.warn('Supabase save already in progress, skipping concurrent save.');
        return null; // Skip this save attempt
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
            const historyPayload: any = {
                history: state.progressHistory || [],
                projMeta: {
                    plannedPct: projRow?._plannedPct || 0,
                    dur: projRow?.dur || 0,
                    remDur: projRow?.remDur ?? null,
                    work: projRow?.work || 0,
                    pct: projRow?.pct || 0,
                    startDate: state.projStart ? state.projStart.toISOString() : null,
                    endDate: latestEF,
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
        return currentId as string;
    } finally {
        isSaving = false;
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
        scenarios
    };
}

/** Delete a project from Supabase (cascades to activities, deps, resources, etc.) */
export async function deleteProjectFromSupabase(supabaseId: string): Promise<void> {
    // Delete in cascade-safe order (child tables first)
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

        // Extract global % from last progress history entry
        let globalPct = 0;
        if (historyEntries.length > 0) {
            const last = historyEntries[historyEntries.length - 1];
            if (last) globalPct = last.actualPct || 0;
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
