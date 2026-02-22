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
        baselines: [],
        txt1: '', txt2: '', txt3: '', txt4: '', txt5: '',
    };
}

// ─── CPM Calculation ────────────────────────────────────────────

export interface CPMResult {
    activities: Activity[];
    totalDays: number;
    projectDays: number;
}

export function calcCPM(
    activities: Activity[],
    projStart: Date,
    defCal: CalendarType,
    statusDate: Date | null,
    projName: string,
    activeBaselineIdx: number = 0
): CPMResult {
    if (!activities.length) {
        return { activities: [], totalDays: 90, projectDays: 90 };
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
        // Use active baseline data if available
        const activeBl = (a.baselines || [])[activeBaselineIdx] || null;
        const start = a.blES || a.ES;
        const end = a.blEF || a.EF;
        if (!start || !end) {
            a._plannedPct = 0;
            return;
        }

        // If the baseline has a saved pct and statusDate, interpolate:
        // Before baseline statusDate: use time ratio scaled to baseline pct
        // At baseline statusDate: use baseline pct exactly
        // After baseline statusDate: interpolate from baseline pct to 100% over remaining time
        if (activeBl && activeBl.pct != null && activeBl.statusDate) {
            const blStatusEnd = new Date(activeBl.statusDate);
            blStatusEnd.setHours(0, 0, 0, 0);
            blStatusEnd.setDate(blStatusEnd.getDate() + 1);
            const blPct = activeBl.pct;

            const stObj = new Date(start); stObj.setHours(0, 0, 0, 0);
            const endObj = new Date(end); endObj.setHours(0, 0, 0, 0);

            if (sDateEnd <= stObj) {
                a._plannedPct = 0;
            } else if (sDateEnd >= endObj) {
                a._plannedPct = 100;
            } else if (blPct === 0) {
                // No progress at baseline time → pure time ratio
                a._plannedPct = getExactElapsedRatio(start, end, sDateEnd, a.cal || defCal) * 100;
            } else {
                // Two-segment interpolation:
                // Segment 1: from start to blStatusDate → 0% to blPct
                // Segment 2: from blStatusDate to end → blPct to 100%
                if (sDateEnd <= blStatusEnd) {
                    // Before or at baseline status date
                    const totalWdSeg1 = getExactWorkDays(stObj, blStatusEnd, a.cal || defCal);
                    const elapsedWd = getExactWorkDays(stObj, sDateEnd <= stObj ? stObj : new Date(sDateEnd), a.cal || defCal);
                    const ratioSeg1 = totalWdSeg1 > 0 ? elapsedWd / totalWdSeg1 : 1;
                    a._plannedPct = ratioSeg1 * blPct;
                } else {
                    // After baseline status date
                    const totalWdSeg2 = getExactWorkDays(blStatusEnd, endObj, a.cal || defCal);
                    const elapsedWd = getExactWorkDays(blStatusEnd, new Date(sDateEnd), a.cal || defCal);
                    const ratioSeg2 = totalWdSeg2 > 0 ? elapsedWd / totalWdSeg2 : 1;
                    a._plannedPct = blPct + ratioSeg2 * (100 - blPct);
                }
            }
        } else {
            a._plannedPct = getExactElapsedRatio(start, end, sDateEnd, a.cal || defCal) * 100;
        }
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
    // projectDays = actual project span (for auto-fit zoom)
    // totalDays = project + buffer months (for scrollable timeline)
    const projectDays = Math.max(30, dayDiff(projStart, projEnd) + 3);
    const totalDays = Math.max(projectDays, dayDiff(projStart, projEnd) + 30 + 60);

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

    return { activities, totalDays, projectDays };
}

// ─── Usage Distribution Helper ──────────────────────────────────

export function getUsageDailyValues(
    a: Activity,
    mode: 'Trabajo' | 'Trabajo real' | 'Trabajo acumulado' | 'Trabajo previsto',
    calcTotalAccumulated = false,
    defCal: number = 6,
    resId?: string,
    activeBaselineIdx: number = 0,
    statusDate?: Date | null
): Map<number, number> {
    const map = new Map<number, number>();
    if (a.type === 'summary' || a._isProjRow) return map;
    const work = resId ? (a.resources?.find(r => String(r.rid) === String(resId))?.work || 0) : (a.work || 0);
    if (work === 0) return map;

    // ─── Helper: build array of work-day dates between two dates ───
    const buildWorkDays = (s: Date, e: Date, calN: number): Date[] => {
        const arr: Date[] = [];
        const c = new Date(s); c.setHours(0, 0, 0, 0);
        const ed = new Date(e); ed.setHours(0, 0, 0, 0);
        while (c < ed) {
            const wd = c.getDay();
            const isWork = calN === 5 ? (wd >= 1 && wd <= 5) : calN === 6 ? (wd !== 0) : true;
            if (isWork) arr.push(new Date(c));
            c.setDate(c.getDate() + 1);
        }
        if (arr.length === 0) arr.push(new Date(s));
        return arr;
    };

    // ─── "Trabajo previsto" with two-segment baseline interpolation ───
    if (mode === 'Trabajo previsto') {
        const blStart = a.blES || a.ES;
        const blEnd = a.blEF || a.EF;
        if (!blStart || !blEnd) return map;

        const start = new Date(blStart); start.setHours(0, 0, 0, 0);
        const end = new Date(blEnd); end.setHours(0, 0, 0, 0);
        const cal = a.blCal || a.cal || defCal;

        const activeBl = (a.baselines || [])[activeBaselineIdx] || null;

        // Check if we have baseline pct + statusDate for two-segment interpolation
        if (activeBl && activeBl.pct != null && activeBl.pct > 0 && activeBl.statusDate) {
            const blStatusEnd = new Date(activeBl.statusDate);
            blStatusEnd.setHours(0, 0, 0, 0);
            blStatusEnd.setDate(blStatusEnd.getDate() + 1); // inclusive
            const blPct = activeBl.pct;

            // Work for each segment
            const workSeg1 = work * (blPct / 100);
            const workSeg2 = work * ((100 - blPct) / 100);

            // Segment 1: start → blStatusDate
            const datesSeg1 = buildWorkDays(start, blStatusEnd < end ? blStatusEnd : end, cal);
            const dailySeg1 = datesSeg1.length > 0 ? workSeg1 / datesSeg1.length : 0;

            // Segment 2: blStatusDate → end
            const seg2Start = blStatusEnd < end ? blStatusEnd : end;
            const datesSeg2 = buildWorkDays(seg2Start, end, cal);
            const dailySeg2 = datesSeg2.length > 0 ? workSeg2 / datesSeg2.length : 0;

            let acc = 0;
            for (const d of datesSeg1) {
                const t = d.getTime();
                if (calcTotalAccumulated || mode !== 'Trabajo acumulado') {
                    if (dailySeg1 > 0) map.set(t, dailySeg1);
                } else {
                    acc += dailySeg1;
                    map.set(t, acc);
                }
            }
            for (const d of datesSeg2) {
                const t = d.getTime();
                if (calcTotalAccumulated || mode !== 'Trabajo acumulado') {
                    if (dailySeg2 > 0) map.set(t, dailySeg2);
                } else {
                    acc += dailySeg2;
                    map.set(t, acc);
                }
            }
        } else {
            // Fallback: uniform distribution
            const dates = buildWorkDays(start, end, cal);
            const daily = work / dates.length;
            for (const d of dates) {
                if (daily > 0) map.set(d.getTime(), daily);
            }
        }
        return map;
    }

    // ─── "Trabajo real": previsto up to statusDate, remainder over remDur ───
    if (mode === 'Trabajo real') {
        const pct = Math.min(100, Math.max(0, a.pct || 0));
        if (pct === 0) return map;

        const actualWork = work * (pct / 100);
        const remainingWork = work - actualWork;

        // Use baseline dates for the "planned" portion
        const blStart = a.blES || a.ES;
        const blEnd = a.blEF || a.EF;
        if (!blStart || !blEnd) return map;

        const startBl = new Date(blStart); startBl.setHours(0, 0, 0, 0);
        const endBl = new Date(blEnd); endBl.setHours(0, 0, 0, 0);
        const cal = a.blCal || a.cal || defCal;
        const calReal = a.cal || defCal;

        // Determine the cutoff: status date
        const sDate = statusDate ? new Date(statusDate) : new Date();
        sDate.setHours(0, 0, 0, 0);
        const sDateEnd = new Date(sDate);
        sDateEnd.setDate(sDateEnd.getDate() + 1); // inclusive

        const activeBl = (a.baselines || [])[activeBaselineIdx] || null;

        // ── Part A: Actual work distributed from blStart to statusDate ──
        // Use two-segment baseline curve up to statusDate
        const cutoff = sDateEnd < endBl ? sDateEnd : endBl;

        if (activeBl && activeBl.pct != null && activeBl.pct > 0 && activeBl.statusDate) {
            const blStatusEnd = new Date(activeBl.statusDate);
            blStatusEnd.setHours(0, 0, 0, 0);
            blStatusEnd.setDate(blStatusEnd.getDate() + 1);
            const blPct = activeBl.pct;
            const workSeg1 = work * (blPct / 100);
            const workSeg2 = work * ((100 - blPct) / 100);

            // Segment 1 dates within [blStart, min(blStatusDate, cutoff)]
            const seg1End = blStatusEnd < cutoff ? blStatusEnd : cutoff;
            const datesSeg1 = buildWorkDays(startBl, seg1End, cal);
            // Full segment 1 days count for the rate
            const fullSeg1 = buildWorkDays(startBl, blStatusEnd < endBl ? blStatusEnd : endBl, cal);
            const dailySeg1 = fullSeg1.length > 0 ? workSeg1 / fullSeg1.length : 0;

            for (const d of datesSeg1) {
                if (dailySeg1 > 0) map.set(d.getTime(), dailySeg1);
            }

            // Segment 2 dates within [blStatusDate, cutoff] only if cutoff > blStatusDate
            if (cutoff > blStatusEnd) {
                const datesSeg2 = buildWorkDays(blStatusEnd, cutoff, cal);
                const fullSeg2 = buildWorkDays(blStatusEnd, endBl, cal);
                const dailySeg2 = fullSeg2.length > 0 ? workSeg2 / fullSeg2.length : 0;

                for (const d of datesSeg2) {
                    if (dailySeg2 > 0) map.set(d.getTime(), dailySeg2);
                }
            }
        } else {
            // Fallback: uniform distribution up to statusDate
            const allDates = buildWorkDays(startBl, endBl, cal);
            const daily = work / allDates.length;
            for (const d of allDates) {
                if (d.getTime() < cutoff.getTime()) {
                    if (daily > 0) map.set(d.getTime(), daily);
                }
            }
        }

        // Scale actual portion: the sum of values in map is "planned work up to statusDate"
        // but we want the actual total to be actualWork, so scale proportionally
        let plannedSum = 0;
        for (const v of map.values()) plannedSum += v;
        if (plannedSum > 0 && Math.abs(plannedSum - actualWork) > 0.01) {
            const scale = actualWork / plannedSum;
            for (const [k, v] of map) map.set(k, v * scale);
        }

        // ── Part B: Remaining work distributed from statusDate to actual EF ──
        if (remainingWork > 0 && pct < 100) {
            const realEF = a.EF;
            if (realEF) {
                const endReal = new Date(realEF); endReal.setHours(0, 0, 0, 0);
                const remStart = sDateEnd > startBl ? sDateEnd : startBl;
                if (endReal > remStart) {
                    const remDates = buildWorkDays(remStart, endReal, calReal);
                    if (remDates.length > 0) {
                        const dailyRem = remainingWork / remDates.length;
                        for (const d of remDates) {
                            const t = d.getTime();
                            map.set(t, (map.get(t) || 0) + dailyRem);
                        }
                    }
                }
            }
        }
        return map;
    }

    // ─── "Trabajo" and "Trabajo acumulado": standard uniform distribution ───
    const ES = a.ES;
    const EF = a.EF;
    if (!ES || !EF) return map;

    const start = new Date(ES); start.setHours(0, 0, 0, 0);
    const end = new Date(EF); end.setHours(0, 0, 0, 0);
    const cal = a.cal || defCal;

    const dates = buildWorkDays(start, end, cal);
    const daily = work / dates.length;

    let acc = 0;
    for (let i = 0; i < dates.length; i++) {
        const t = dates[i].getTime();
        if (mode === 'Trabajo acumulado' && !calcTotalAccumulated) {
            acc += daily;
            map.set(t, acc);
        } else {
            if (daily > 0) map.set(t, daily);
        }
    }
    return map;
}
