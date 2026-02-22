import { supabase } from '../lib/supabase';
import type { GanttState } from '../store/GanttContext';
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
        const acts = [...state.activities.filter(a => !a._isProjRow)];
        // Inject progress history as a hidden activity to avoid schema changes
        if (state.progressHistory && state.progressHistory.length > 0) {
            acts.push({
                ...newActivity('__HISTORY__', defCal),
                name: '__PROGRESS_HISTORY__',
                type: 'milestone',
                notes: JSON.stringify(state.progressHistory),
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
                    txt1: a.txt1 || '', txt2: a.txt2 || '', txt3: a.txt3 || '', txt4: a.txt4 || '', txt5: a.txt5 || ''
                };
            });
            const { data: actData, error: actErr } = await supabase.from('gantt_activities').insert(actRows).select();
            if (actErr) throw actErr;
            (actData as any[]).forEach(a => { localIdMap[a.local_id] = a.id; });

            // 5. Dependencies
            const depRows: any[] = [];
            acts.forEach(a => {
                if (!a.preds) return;
                const toUuid = localIdMap[a.id]; if (!toUuid) return;
                a.preds.forEach(p => {
                    const fromUuid = localIdMap[p.id];
                    if (fromUuid) depRows.push({ project_id: currentId, from_activity_id: fromUuid, to_activity_id: toUuid, type: p.type || 'FS', lag: p.lag || 0 });
                });
            });
            if (depRows.length) { const { error: de } = await supabase.from('gantt_dependencies').insert(depRows); if (de) throw de; }

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

    // Build activities
    const activities = (actData as any[]).map(a => {
        const na = { ...newActivity() };
        na.id = a.local_id; na.name = a.name || ''; na.type = a.type || 'task';
        na.dur = parseFloat(a.dur) || 0; na.remDur = a.remdur != null ? parseFloat(a.remdur) : null;
        na.cal = a.cal as 5 | 6 | 7 || defCal; na.pct = parseFloat(a.pct) || 0;
        na.notes = a.notes || ''; na.res = a.res || ''; na.work = parseFloat(a.work) || 0;
        na.weight = a.weight != null ? parseFloat(a.weight) : null; na.lv = a.lv || 0;
        na.constraint = (a.constraint_type as any) || 'MSO'; na.constraintDate = a.constraintdate || '';
        na.manual = !!a.manual;
        na.blDur = a.bldur != null ? parseFloat(a.bldur) : null;
        na.blES = a.bles ? new Date(a.bles) : null; na.blEF = a.blef ? new Date(a.blef) : null;
        na.txt1 = a.txt1 || ''; na.txt2 = a.txt2 || ''; na.txt3 = a.txt3 || ''; na.txt4 = a.txt4 || ''; na.txt5 = a.txt5 || '';
        na.preds = depMap[a.local_id] || [];
        const actRes = arMap[a.id] || [];
        actRes.forEach(ar => { const pr = getPoolResource(ar.rid); if (pr) ar.name = pr.name; });
        na.resources = actRes;
        if (actRes.length) deriveResString(na, resourcePool);
        return na;
    }).filter(na => {
        // Extract hidden progress history if found
        if (na.id === '__HISTORY__') {
            try { progressHistory = JSON.parse(na.notes); } catch (e) { }
            return false;
        }
        return true;
    });

    return {
        projName,
        projStart,
        defCal,
        statusDate,
        resourcePool,
        activities,
        progressHistory
    };
}
