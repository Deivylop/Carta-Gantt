// ═══════════════════════════════════════════════════════════════════
// CPM Engine – Pure TypeScript (no React dependency)
// Ported 1:1 from the calcCPM() function in Carta Gantt CPM.html
// ═══════════════════════════════════════════════════════════════════
import type { Activity, CalendarType } from '../types/gantt';

/** Calendar conversion factors: work days → calendar days */
const CAL_F: Record<number, number> = { 5: 7 / 5, 6: 7 / 6, 7: 1 };

// ─── Date Utilities ─────────────────────────────────────────────

export function addWorkDays(d: Date, wd: number, cal: CalendarType): Date {
    const f = CAL_F[cal] || CAL_F[6];
    const c = Math.round(wd * f);
    const r = new Date(d);
    r.setDate(r.getDate() + c);
    return r;
}

export function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

export function dayDiff(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 864e5);
}

export function calWorkDays(a: Date, b: Date, cal: CalendarType): number {
    const cd = dayDiff(a, b);
    const f = CAL_F[cal] || CAL_F[6];
    return Math.max(0, Math.round(cd / f));
}

export function getExactWorkDays(start: Date, end: Date, cal: number): number {
    let count = 0;
    let cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endD = new Date(end);
    endD.setHours(0, 0, 0, 0);

    while (cur < endD) {
        const wd = cur.getDay();
        const isWork = cal === 5 ? (wd >= 1 && wd <= 5) : cal === 6 ? (wd !== 0) : true;
        if (isWork) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

export function getExactElapsedRatio(start: Date, end: Date, target: Date, cal: number): number {
    const stObj = new Date(start); stObj.setHours(0, 0, 0, 0);
    const endObj = new Date(end); endObj.setHours(0, 0, 0, 0);
    const tgtObj = new Date(target); tgtObj.setHours(0, 0, 0, 0);

    if (tgtObj <= stObj) return 0;
    if (tgtObj >= endObj) return 1;

    const totalWd = getExactWorkDays(stObj, endObj, cal);
    if (totalWd === 0) {
        // Fallback to linear ms ratio if no work days found
        return (tgtObj.getTime() - stObj.getTime()) / (endObj.getTime() - stObj.getTime());
    }
    const elapsedWd = getExactWorkDays(stObj, tgtObj, cal);
    return elapsedWd / totalWd;
}

export function fmtDate(d: Date | null): string {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
}

export function isoDate(d: Date | null): string {
    if (!d) return '';
    return d.toISOString().slice(0, 10);
}

export function parseDate(s: string | null | undefined): Date | null {
    if (!s) return null;
    // dd-mm-yy format
    const m = String(s).match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
    if (m) {
        const yr = parseInt(m[3]) + (parseInt(m[3]) > 50 ? 1900 : 2000);
        const d = new Date(yr, parseInt(m[2]) - 1, parseInt(m[1]));
        return isNaN(d.getTime()) ? null : d;
    }
    // ISO yyyy-mm-dd
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
}

// ─── New Activity Factory ───────────────────────────────────────

export function newActivity(id?: string, defCal: CalendarType = 6): Activity {
    return {
        id: id || '',
        name: '',
        type: 'task',
        dur: 5,
        remDur: null,
        cal: defCal,
        pct: 0,
        preds: [],
        notes: '',
        res: '',
        work: 0,
        weight: null,
        resources: [],
        lv: 0,
        constraint: 'MSO',
        constraintDate: isoDate(new Date()),
        manual: true,
        ES: null, EF: null, LS: null, LF: null, TF: null,
        crit: false,
        blDur: null, blES: null, blEF: null, blCal: null,
        txt1: '', txt2: '', txt3: '', txt4: '', txt5: '',
    };
}

// ─── CPM Calculation ────────────────────────────────────────────

export interface CPMResult {
    activities: Activity[];
    totalDays: number;
}

export function calcCPM(
    activities: Activity[],
    projStart: Date,
    defCal: CalendarType,
    statusDate: Date | null,
    projName: string
): CPMResult {
    if (!activities.length) {
        return { activities: [], totalDays: 90 };
    }

    // Build lookup by ID
    const byId: Record<string, Activity> = {};
    activities.forEach(a => {
        byId[a.id] = a;
        a.ES = null; a.EF = null; a.LS = null; a.LF = null;
        a.TF = null; a.crit = false;
        a._remStart = null; a._remDur = null; a._doneDur = null;
        a._origDur = null; a._actualEnd = null;
    });

    // Update project summary row name
    if (activities.length && activities[0]._isProjRow) {
        activities[0].name = projName || 'Mi Proyecto';
    }

    // ═══ FORWARD PASS ═══
    function getES(a: Activity): Date {
        if (a.ES !== null) return a.ES;
        let es = new Date(projStart);
        let forced = false;

        if ((a.manual || a.constraint === 'MSO') && a.constraintDate) {
            const cd = parseDate(a.constraintDate);
            if (cd) { es = new Date(cd); forced = true; }
        } else if (a.constraint === 'SNET') {
            const cd = parseDate(a.constraintDate);
            if (cd) es = new Date(Math.max(es.getTime(), cd.getTime()));
        }

        if (!forced && a.preds && a.preds.length) {
            a.preds.forEach(p => {
                const pred = byId[p.id]; if (!pred) return;
                if (pred.type === 'summary' || a.type === 'summary') return;
                getES(pred);
                const pEF = pred.EF || addWorkDays(pred.ES || projStart, pred.type === 'milestone' ? 0 : (pred.dur || 0), pred.cal || defCal);
                const pES = pred.ES || projStart;
                let t: Date;
                const lag = p.lag || 0;

                if (p.type === 'FS') t = addWorkDays(pEF, lag, a.cal || defCal);
                else if (p.type === 'SS') t = addWorkDays(pES, lag, a.cal || defCal);
                else if (p.type === 'FF') {
                    t = addDays(addWorkDays(pEF, lag, a.cal || defCal), -Math.round((a.type === 'milestone' ? 0 : (a.dur || 0)) * (CAL_F[a.cal || defCal] || 1)));
                } else if (p.type === 'SF') {
                    t = addDays(addWorkDays(pES, lag, a.cal || defCal), -Math.round((a.type === 'milestone' ? 0 : (a.dur || 0)) * (CAL_F[a.cal || defCal] || 1)));
                } else {
                    t = addWorkDays(pEF, lag, a.cal || defCal);
                }

                if (t > es) es = new Date(t);
            });
        }

        a.ES = es;
        a.EF = addWorkDays(es, a.type === 'milestone' ? 0 : (a.dur || 0), a.cal || defCal);
        return a.ES;
    }

    activities.forEach(a => getES(a));

    // ═══ RETAINED LOGIC (Status Date reprogramming) ═══
    if (statusDate) {
        const sd = new Date(statusDate);

        // Step 1: Compute retained dates for individual activities
        activities.forEach(a => {
            if (a.type === 'summary' || a.type === 'milestone') return;
            const pct = a.pct || 0;
            if (pct >= 100) return;

            if (pct > 0 && pct < 100) {
                const origDur = a.dur || 0;
                const doneDur = Math.round(origDur * pct / 100);
                const remDur = a.remDur != null ? a.remDur : (origDur - doneDur);
                const origES = new Date(a.ES!);
                a._actualEnd = addWorkDays(origES, doneDur, a.cal || defCal);
                a._doneDur = doneDur;
                a._remDur = remDur;
                a._origDur = origDur;
                a._remStart = new Date(sd);
            } else if (pct === 0) {
                a._origDur = a.dur || 0;
            }
        });

        // Step 2: Recalculate forward pass respecting relationships
        activities.forEach(a => { a._retES = null; a._retEF = null; });

        const getRetES = (a: Activity): Date | null => {
            if (a._retES !== undefined && a._retES !== null) return a._retES;
            const pct = a.pct || 0; // Define pct here
            if (a.type === 'summary' || pct >= 100) {
                a._retES = a.ES; a._retEF = a.EF;
                return a._retES;
            }

            let newES = new Date(a.type === 'milestone' ? a.ES! : sd);
            if (pct > 0) newES = new Date(sd);

            if (a.preds && a.preds.length) {
                a.preds.forEach(p => {
                    const pred = byId[p.id]; if (!pred) return;
                    if (pred.type === 'summary') return;
                    getRetES(pred);
                    const pEF = pred._retEF || pred.EF;
                    const pES = pred._retES || pred.ES;
                    let t: Date; const lag = p.lag || 0;

                    if (p.type === 'FS') t = addWorkDays(pEF!, lag, a.cal || defCal);
                    else if (p.type === 'SS') t = addWorkDays(pES!, lag, a.cal || defCal);
                    else if (p.type === 'FF') {
                        t = addDays(addWorkDays(pEF!, lag, a.cal || defCal), -Math.round((a.type === 'milestone' ? 0 : (a._remDur || a.dur || 0)) * (CAL_F[a.cal || defCal] || 1)));
                    } else if (p.type === 'SF') {
                        t = addDays(addWorkDays(pES!, lag, a.cal || defCal), -Math.round((a.type === 'milestone' ? 0 : (a._remDur || a.dur || 0)) * (CAL_F[a.cal || defCal] || 1)));
                    } else {
                        t = addWorkDays(pEF!, lag, a.cal || defCal);
                    }
                    if (t > newES) newES = new Date(t);
                });
            }

            if (pct > 0 && pct < 100 && a.type !== 'milestone') {
                a._remStart = newES;
                const newEF = addWorkDays(newES, a._remDur!, a.cal || defCal);
                a._retES = a.ES;
                a._retEF = newEF;
                a.EF = newEF;
            } else {
                if (newES > a.ES!) {
                    a.ES = newES;
                    const effDur = a.type === 'milestone' ? 0 : (a.remDur != null ? a.remDur : (a.dur || 0));
                    a.EF = addWorkDays(newES, effDur, a.cal || defCal);
                }
                a._retES = a.ES;
                a._retEF = a.EF;
            }
            return a._retES;
        }

        activities.forEach(a => getRetES(a));

        // Recalculate duration as work days between ES and EF
        activities.forEach(a => {
            if (a.type === 'summary' || a.type === 'milestone') return;
            if (a.ES && a.EF) {
                a.dur = calWorkDays(a.ES, a.EF, a.cal || defCal);
            }
        });
    }

    // ═══ Summary Tasks: compute ES/EF from children ═══
    for (let i = 0; i < activities.length; i++) {
        const a = activities[i];
        if (a.type !== 'summary') continue;
        let minES: Date | null = null, maxEF: Date | null = null;

        if (a._isProjRow) {
            for (let j = 1; j < activities.length; j++) {
                const ch = activities[j];
                if (ch.ES && (!minES || ch.ES < minES)) minES = new Date(ch.ES);
                if (ch.EF && (!maxEF || ch.EF > maxEF)) maxEF = new Date(ch.EF);
            }
        } else {
            for (let j = i + 1; j < activities.length; j++) {
                if (activities[j].lv <= a.lv) break;
                const ch = activities[j];
                if (ch.ES && (!minES || ch.ES < minES)) minES = new Date(ch.ES);
                if (ch.EF && (!maxEF || ch.EF > maxEF)) maxEF = new Date(ch.EF);
            }
        }
        if (minES) a.ES = minES;
        if (maxEF) a.EF = maxEF;
        if (minES && maxEF) {
            const calDays = dayDiff(minES, maxEF);
            const factor = CAL_F[a.cal || defCal] || 1;
            a.dur = Math.max(1, Math.round(calDays / factor));
        }
    }

    const sDateObj = statusDate ? new Date(statusDate) : new Date();
    sDateObj.setHours(0, 0, 0, 0);

    const sDateEnd = new Date(sDateObj);
    sDateEnd.setDate(sDateEnd.getDate() + 1); // target is start of next day (so strictly inclusive of status date)

    activities.forEach(a => {
        if (a.type === 'summary') return;
        const start = a.blES || a.ES;
        const end = a.blEF || a.EF;
        if (!start || !end) {
            a._plannedPct = 0;
            return;
        }

        a._plannedPct = getExactElapsedRatio(start, end, sDateEnd, a.cal || defCal) * 100;
    });

    // ═══ Summary Tasks: work + weighted pct (bottom-up) ═══
    for (let i = activities.length - 1; i >= 0; i--) {
        const a = activities[i];
        if (a.type !== 'summary') continue;
        let sumWork = 0, sumWeightedPct = 0, sumWeightedPlannedPct = 0, sumWeight = 0, sumDurOr1 = 0, sumWeightedPctBackup = 0, sumWeightedPlannedPctBackup = 0;

        const processChild = (ch: Activity) => {
            const cw = ch.work || 0;
            const w = (ch.weight != null && ch.weight > 0) ? ch.weight : cw;
            sumWork += cw;
            sumWeight += w;
            sumWeightedPct += w * (ch.pct || 0);
            sumWeightedPlannedPct += w * (ch._plannedPct || 0);

            const wBackup = ch.dur || 1;
            sumDurOr1 += wBackup;
            sumWeightedPctBackup += wBackup * (ch.pct || 0);
            sumWeightedPlannedPctBackup += wBackup * (ch._plannedPct || 0);
        };

        if (a._isProjRow) {
            for (let j = 1; j < activities.length; j++) {
                if (activities[j].lv !== 0) continue;
                processChild(activities[j]);
            }
        } else {
            for (let j = i + 1; j < activities.length; j++) {
                if (activities[j].lv <= a.lv) break;
                if (activities[j].lv !== a.lv + 1) continue;
                processChild(activities[j]);
            }
        }
        a.work = Math.round(sumWork * 100) / 100;

        if (sumWeight > 0) {
            a.pct = Math.round(sumWeightedPct / sumWeight * 10) / 10;
            a._plannedPct = Math.round(sumWeightedPlannedPct / sumWeight * 10) / 10;
        } else if (sumDurOr1 > 0) {
            a.pct = Math.round(sumWeightedPctBackup / sumDurOr1 * 10) / 10;
            a._plannedPct = Math.round(sumWeightedPlannedPctBackup / sumDurOr1 * 10) / 10;
        } else {
            a.pct = 0;
            a._plannedPct = 0;
        }
    }

    // ═══ BACKWARD PASS ═══
    let projEnd = new Date(projStart);
    activities.forEach(a => {
        if (a.EF && a.EF > projEnd) projEnd = new Date(a.EF);
    });
    // Add buffer: 30 days before projStart and 90 days after projEnd for visual context
    const totalDays = Math.max(120, dayDiff(projStart, projEnd) + 30 + 90);

    activities.forEach(a => { a.LF = new Date(projEnd); });
    const sorted = [...activities].sort((a, b) => (b.EF || projEnd).getTime() - (a.EF || projEnd).getTime());

    sorted.forEach(a => {
        a.LS = addDays(a.LF!, -Math.round((a.type === 'milestone' ? 0 : (a.dur || 0)) * (CAL_F[a.cal || defCal] || 1)));
        if (a.preds) {
            a.preds.forEach(p => {
                const pred = byId[p.id]; if (!pred) return;
                let newLF: Date; const lag = p.lag || 0;
                if (p.type === 'FS') newLF = addWorkDays(a.LS!, -lag, pred.cal || defCal);
                else if (p.type === 'SS') newLF = addDays(addWorkDays(a.LS!, -lag, pred.cal || defCal), Math.round((pred.type === 'milestone' ? 0 : (pred.dur || 0)) * (CAL_F[pred.cal || defCal] || 1)));
                else if (p.type === 'FF') newLF = addWorkDays(a.LF!, -lag, pred.cal || defCal);
                else newLF = addWorkDays(a.LS!, -lag, pred.cal || defCal);
                if (!pred.LF || newLF < pred.LF) pred.LF = new Date(newLF);
            });
        }
    });

    activities.forEach(a => {
        if (!a.LF) a.LF = new Date(projEnd);
        a.LS = addDays(a.LF, -Math.round((a.type === 'milestone' ? 0 : (a.dur || 0)) * (CAL_F[a.cal || defCal] || 1)));
        const tf = dayDiff(a.ES || projStart, a.LS || projStart);
        a.TF = Math.max(0, tf);
        a.crit = a.TF <= 1;
        if (a.remDur === null || a.remDur === undefined) {
            a.remDur = Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100);
        }
    });

    return { activities, totalDays };
}

// ─── Usage Distribution Helper ──────────────────────────────────

export function getUsageDailyValues(a: Activity, mode: 'Trabajo' | 'Trabajo real' | 'Trabajo acumulado' | 'Trabajo previsto', calcTotalAccumulated = false, defCal: number = 6): Map<number, number> {
    const map = new Map<number, number>();
    if (a.type === 'summary' || a._isProjRow) return map; // Summaries are aggregated bottom-up by the UI
    const work = a.work || 0;
    if (work === 0) return map;

    const ES = (mode === 'Trabajo previsto' ? a.blES : a.ES) || a.ES;
    const EF = (mode === 'Trabajo previsto' ? a.blEF : a.EF) || a.EF;
    if (!ES || !EF) return map;

    // Zero out hours
    const start = new Date(ES); start.setHours(0, 0, 0, 0);
    const end = new Date(EF); end.setHours(0, 0, 0, 0);

    const cal = (mode === 'Trabajo previsto' ? a.blCal : a.cal) || a.cal || defCal;
    const isWorkDay = (d: Date) => {
        const wd = d.getDay();
        if (cal === 5) return wd >= 1 && wd <= 5;
        if (cal === 6) return wd !== 0;
        return true;
    };

    let workDaysCount = 0;
    const dates = [];
    let cur = new Date(start);
    while (cur < end) {
        if (isWorkDay(cur)) {
            workDaysCount++;
            dates.push(new Date(cur));
        }
        cur.setDate(cur.getDate() + 1);
    }
    // Fallback to 1 day if starting and ending on the same day/weekend
    if (workDaysCount === 0) {
        workDaysCount = 1;
        dates.push(new Date(start));
    }

    let daily = work / workDaysCount;
    let limitDays = workDaysCount;

    if (mode === 'Trabajo real') {
        const pct = Math.min(100, Math.max(0, a.pct || 0));
        if (pct === 0) return map;
        const actualWork = work * (pct / 100);
        // Distribute the actual work over the proportionally elapsed duration
        limitDays = Math.max(1, Math.round(workDaysCount * (pct / 100)));
        daily = actualWork / limitDays;
    }

    let acc = 0;
    for (let i = 0; i < dates.length; i++) {
        const t = dates[i].getTime();
        const isActiveDay = i < limitDays;
        const valToSet = isActiveDay ? daily : 0;

        if (mode === 'Trabajo acumulado' && !calcTotalAccumulated) {
            acc += valToSet;
            map.set(t, acc);
        } else {
            if (valToSet > 0) map.set(t, valToSet);
        }
    }
    return map;
}
