
// ═══════════════════════════════════════════════════════════════════
// Import / Export utilities – JSON and CSV
// ═══════════════════════════════════════════════════════════════════
import type { Activity, CalendarType, PoolResource, ActivityResource, CustomFilter, MFPConfig } from '../types/gantt';
import { newActivity, isoDate, parseDate } from './cpm';

// ─── Predecessor Formatting ─────────────────────────────────────
export function predsToStr(preds: Activity['preds']): string {
    if (!preds || !preds.length) return '';
    return preds.map(p => {
        const lag = p.lag > 0 ? '+' + p.lag : p.lag < 0 ? '' + p.lag : '';
        return p.id + (p.type !== 'FS' ? ' ' + p.type : '') + lag;
    }).join('; ');
}

export function strToPreds(s: string): Activity['preds'] {
    if (!s || !s.trim()) return [];
    return s.split(/[;,]/).map(t => {
        t = t.trim(); if (!t) return null;
        const m = t.match(/^(\S+?)(?:\s+(FS|SS|FF|SF))?([+-]\d+)?$/i);
        if (!m) return null;
        return { id: m[1], type: (m[2] || 'FS').toUpperCase() as any, lag: parseInt(m[3] || '0') };
    }).filter(Boolean) as Activity['preds'];
}

// ─── Auto ID ────────────────────────────────────────────────────
export function autoId(activities: Activity[]): string {
    let max = 0;
    activities.forEach(a => {
        const m = a.id.match(/\d+/);
        if (m) max = Math.max(max, parseInt(m[0]));
    });
    return 'A' + (Math.ceil((max + 10) / 10) * 10);
}

// ─── Resource helpers ───────────────────────────────────────────
let _rsNextId = 1;
export function newPoolResource(): PoolResource {
    return {
        rid: _rsNextId++,
        name: '', type: 'Trabajo', materialLabel: '', initials: '', group: '',
        maxCapacity: '100%', stdRate: '0', overtimeRate: '0', costPerUse: '0',
        accrual: 'Prorrateo', calendar: '7d', code: '',
    };
}
export function getPoolResource(pool: PoolResource[], rid: number): PoolResource | undefined {
    return pool.find(r => r.rid === rid);
}
export function deriveResString(a: Activity, pool: PoolResource[]): void {
    if (!a.resources || !a.resources.length) { a.res = ''; return; }
    a.res = a.resources.map(r => {
        const pr = getPoolResource(pool, r.rid);
        return pr ? pr.name : (r.name || '?');
    }).join('; ');
}
export function distributeWork(a: Activity): void {
    if (!a.resources || !a.resources.length || !a.work) return;
    const totalUnits = a.resources.reduce((s, r) => s + (parseInt(String(r.units)) || 0), 0);
    if (totalUnits <= 0) return;
    let distributed = 0;
    a.resources.forEach((r, i) => {
        if (i === a.resources.length - 1) {
            r.work = Math.round((a.work - distributed) * 100) / 100;
        } else {
            r.work = Math.round(a.work * (parseInt(String(r.units)) || 0) / totalUnits * 100) / 100;
            distributed += r.work;
        }
    });
}
export function syncResFromString(a: Activity, pool: PoolResource[]): void {
    const raw = a.res || '';
    const names = raw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    if (!names.length) { a.resources = []; a.work = 0; return; }
    const prevWork = a.work || 0;
    const newRes: Activity['resources'] = [];
    names.forEach(name => {
        let poolR = pool.find(r => r.name.toLowerCase() === name.toLowerCase());
        if (!poolR) {
            poolR = newPoolResource();
            poolR.name = name;
            poolR.initials = name.split(' ').map(w => w[0] || '').join('').toUpperCase().substring(0, 3);
            pool.push(poolR);
        }
        const existing = a.resources ? a.resources.find(r => r.rid === poolR!.rid) : null;
        newRes.push({ rid: poolR.rid, name: poolR.name, units: existing ? existing.units : '100%', work: existing ? existing.work : 0 });
    });
    a.resources = newRes;
    const resWorkSum = a.resources.reduce((s, r) => s + (r.work || 0), 0);
    if (prevWork > 0 && resWorkSum === 0) {
        a.work = prevWork;
        distributeWork(a);
    } else {
        a.work = a.resources.reduce((s, r) => s + (r.work || 0), 0);
    }
    deriveResString(a, pool);
}

// ─── Export JSON ────────────────────────────────────────────────
export function exportJSON(
    activities: Activity[], projStart: Date, projName: string,
    defCal: CalendarType, statusDate: Date, resourcePool: PoolResource[],
    customFilters: CustomFilter[] = [], filtersMatchAll: boolean = true,
    mfpConfig?: MFPConfig
): void {
    const data = {
        projStart: isoDate(projStart), projName, defCal,
        statusDate: isoDate(statusDate),
        customFilters, filtersMatchAll,
        mfpConfig: mfpConfig || undefined,
        resourcePool: JSON.parse(JSON.stringify(resourcePool)),
        activities: activities.filter(a => !a._isProjRow).map(a => ({
            id: a.id, name: a.name, type: a.type, dur: a.dur, remDur: a.remDur, cal: a.cal,
            pct: a.pct, preds: a.preds, lv: a.lv, constraint: a.constraint,
            constraintDate: a.constraintDate, manual: a.manual, actualStart: a.actualStart || null, actualFinish: a.actualFinish || null,
            res: a.res, work: a.work || 0,
            weight: a.weight, resources: a.resources || [], notes: a.notes,
            blDur: a.blDur, blES: a.blES ? isoDate(a.blES) : null, blEF: a.blEF ? isoDate(a.blEF) : null,
            baselines: (a.baselines || []).map(bl => bl ? { dur: bl.dur, ES: bl.ES ? isoDate(bl.ES) : null, EF: bl.EF ? isoDate(bl.EF) : null, cal: bl.cal, savedAt: bl.savedAt, name: bl.name || '', description: bl.description || '', pct: bl.pct || 0, work: bl.work || 0, weight: bl.weight, statusDate: bl.statusDate || '' } : null),
            txt1: a.txt1 || '', txt2: a.txt2 || '', txt3: a.txt3 || '', txt4: a.txt4 || '', txt5: a.txt5 || '',
        })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gantt_' + projName.replace(/\s+/g, '_') + '.json';
    link.click();
}

// ─── Import JSON ────────────────────────────────────────────────
export function importJSONData(
    text: string,
    defCalDefault: CalendarType
): { projStart: Date; projName: string; defCal: CalendarType; statusDate: Date; activities: Activity[]; resourcePool: PoolResource[]; customFilters: CustomFilter[]; filtersMatchAll: boolean; mfpConfig?: MFPConfig } | null {
    try {
        const d = JSON.parse(text);
        const projStart = d.projStart ? (parseDate(d.projStart) || new Date()) : new Date();
        const projName = d.projName || 'Mi Proyecto';
        const defCal = d.defCal || defCalDefault;
        const statusDate = d.statusDate ? (parseDate(d.statusDate) || new Date()) : new Date();
        const customFilters = d.customFilters || [];
        const filtersMatchAll = d.filtersMatchAll !== undefined ? d.filtersMatchAll : true;
        const mfpConfig: MFPConfig | undefined = d.mfpConfig || undefined;
        const resourcePool = Array.isArray(d.resourcePool) ? d.resourcePool : [];
        if (resourcePool.length) {
            _rsNextId = resourcePool.reduce((mx: number, r: PoolResource) => Math.max(mx, r.rid || 0), 0) + 1;
        }
        const activities = (d.activities || []).map((a: any) => {
            const na = { ...newActivity(), ...a };
            if (a.blES) na.blES = parseDate(a.blES);
            if (a.blEF) na.blEF = parseDate(a.blEF);
            // Restore multiple baselines
            if (Array.isArray(a.baselines)) {
                na.baselines = a.baselines.map((bl: any) => {
                    if (!bl) return null;
                    return { dur: bl.dur, ES: bl.ES ? parseDate(bl.ES) : null, EF: bl.EF ? parseDate(bl.EF) : null, cal: bl.cal, savedAt: bl.savedAt || '', name: bl.name || '', description: bl.description || '', pct: bl.pct || 0, work: bl.work || 0, weight: bl.weight != null ? bl.weight : null, statusDate: bl.statusDate || '' };
                });
            } else {
                na.baselines = [];
            }
            return na;
        });
        activities.forEach((a: Activity) => {
            if (a.resources && a.resources.length) deriveResString(a, resourcePool);
        });
        return { projStart, projName, defCal, statusDate, activities, resourcePool, customFilters, filtersMatchAll, mfpConfig };
    } catch (err) {
        alert('Error JSON: ' + (err as Error).message);
        return null;
    }
}

// ─── Export CSV ──────────────────────────────────────────────────
export function exportCSV(
    activities: Activity[], projName: string,
    defCal: CalendarType
): void {
    const h = 'ID,Nombre,Tipo,Duracion,DurRestante,Calendario,Avance%,Predecesoras,Nivel,Restriccion,FechaRestriccion,Recursos,Trabajo,Peso,Manual,Notas,DurLB,InicioLB,FinLB,Recursos_JSON,Texto1,Texto2,Texto3,Texto4,Texto5';
    const q = (v: any) => '"' + String(v || '').replace(/"/g, '""') + '"';
    const rows = activities.filter(a => !a._isProjRow).map(a => [
        a.id, q(a.name), a.type, a.dur, a.remDur != null ? a.remDur : '', a.cal || defCal, a.pct || 0,
        q(predsToStr(a.preds)), a.lv, a.constraint || '', a.constraintDate || '',
        q(a.res), a.work || 0, a.weight != null ? a.weight : '', a.manual ? 1 : 0, q(a.notes),
        a.blDur != null ? a.blDur : '', a.blES ? isoDate(a.blES) : '', a.blEF ? isoDate(a.blEF) : '',
        q(JSON.stringify(a.resources || [])), q(a.txt1 || ''), q(a.txt2 || ''), q(a.txt3 || ''), q(a.txt4 || ''), q(a.txt5 || ''),
    ].join(','));
    const csv = [h, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gantt_' + projName.replace(/\s+/g, '_') + '.csv';
    link.click();
}

// ─── Import CSV ─────────────────────────────────────────────────
export function importCSVData(text: string, defCal: CalendarType, pool: PoolResource[]): Activity[] | null {
    try {
        const rows: string[][] = []; let cur: string[] = []; let field = ''; let inQ = false;
        for (let ci = 0; ci < text.length; ci++) {
            const ch = text[ci];
            if (inQ) {
                if (ch === '"') { if (ci + 1 < text.length && text[ci + 1] === '"') { field += '"'; ci++; } else { inQ = false; } }
                else { field += ch; }
            } else {
                if (ch === '"') { inQ = true; }
                else if (ch === ',') { cur.push(field); field = ''; }
                else if (ch === '\n' || ch === '\r') {
                    if (ch === '\r' && ci + 1 < text.length && text[ci + 1] === '\n') ci++;
                    cur.push(field); if (cur.some(c => c.trim())) rows.push(cur); cur = []; field = '';
                }
                else { field += ch; }
            }
        }
        if (cur.length || field) { cur.push(field); if (cur.some(c => c.trim())) rows.push(cur); }
        if (rows.length < 2) { alert('CSV vacío'); return null; }
        const hdr = rows[0].map(h => h.trim());
        const col = (name: string) => hdr.indexOf(name);
        const na: Activity[] = [];
        for (let i = 1; i < rows.length; i++) {
            const c = rows[i];
            const g = (idx: number) => idx >= 0 && idx < c.length ? c[idx].trim() : '';
            const id = g(col('ID')); if (!id) continue;
            const a = newActivity(id, defCal);
            a.name = g(col('Nombre')); a.type = (g(col('Tipo')) || 'task') as any;
            a.dur = parseInt(g(col('Duracion'))) || 0;
            const rd = g(col('DurRestante')); a.remDur = rd !== '' ? parseInt(rd) : null;
            a.cal = (parseInt(g(col('Calendario'))) || defCal) as any;
            a.pct = parseInt(g(col('Avance%'))) || 0;
            a.preds = strToPreds(g(col('Predecesoras'))); a.lv = parseInt(g(col('Nivel'))) || 0;
            a.constraint = g(col('Restriccion')) as any; a.constraintDate = g(col('FechaRestriccion'));
            a.res = g(col('Recursos')); a.work = parseFloat(g(col('Trabajo'))) || 0;
            const wt = g(col('Peso')); a.weight = wt !== '' ? parseFloat(wt) : null;
            a.manual = g(col('Manual')) === '1'; a.notes = g(col('Notas'));
            const bld = g(col('DurLB')); a.blDur = bld !== '' ? parseInt(bld) : null;
            const bls = g(col('InicioLB')); a.blES = bls ? parseDate(bls) : null;
            const ble = g(col('FinLB')); a.blEF = ble ? parseDate(ble) : null;
            const rj = g(col('Recursos_JSON'));
            if (rj) { try { a.resources = JSON.parse(rj); } catch { a.resources = []; } }
            if (!a.resources || !a.resources.length) syncResFromString(a, pool);
            a.txt1 = g(col('Texto1')); a.txt2 = g(col('Texto2')); a.txt3 = g(col('Texto3'));
            a.txt4 = g(col('Texto4')); a.txt5 = g(col('Texto5'));
            na.push(a);
        }
        return na;
    } catch (err) {
        alert('Error CSV: ' + (err as Error).message);
        return null;
    }
}

// ─── Outline Numbers ────────────────────────────────────────────
export function computeOutlineNumbers(activities: Activity[]): void {
    const counters: number[] = [];
    activities.forEach(a => {
        if (a._isProjRow) { a.outlineNum = '0'; return; }
        const lv = a.lv || 0;
        while (counters.length <= lv) counters.push(0);
        for (let i = lv + 1; i < counters.length; i++) counters[i] = 0;
        counters[lv]++;
        a.outlineNum = counters.slice(0, lv + 1).join('.');
    });
}

// ─── Weight Percentage ──────────────────────────────────────────
export function getWeightPct(a: Activity, activities: Activity[]): string {
    if (a._isProjRow) return '100%';
    const idx = activities.indexOf(a);
    if (idx < 0) return '0%';
    let parentIdx = -1;
    for (let j = idx - 1; j >= 0; j--) {
        if (activities[j].lv < a.lv) { parentIdx = j; break; }
    }
    let totalW = 0;
    const start = parentIdx >= 0 ? parentIdx + 1 : 0;
    for (let j = start; j < activities.length; j++) {
        if (j !== start && parentIdx >= 0 && activities[j].lv <= activities[parentIdx].lv) break;
        if (activities[j].lv !== a.lv) continue;
        if (activities[j]._isProjRow) continue;
        const ch = activities[j];
        totalW += (ch.weight != null && ch.weight > 0) ? ch.weight : (ch.work || 0);
    }
    const myW = (a.weight != null && a.weight > 0) ? a.weight : (a.work || 0);
    if (totalW <= 0) return '0%';
    return (Math.round(myW / totalW * 1000) / 10) + '%';
}
