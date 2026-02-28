// ═══════════════════════════════════════════════════════════════════
// CPM Engine – Pure TypeScript (no React dependency)
// Ported 1:1 from the calcCPM() function in Carta Gantt CPM.html
// ═══════════════════════════════════════════════════════════════════
import type { Activity, CalendarType, ProgressHistoryEntry, CustomCalendar, PredecessorLink } from '../types/gantt';

/** Calendar conversion factors: work days → calendar days */
const CAL_F: Record<number, number> = { 5: 7 / 5, 6: 7 / 6, 7: 1 };

/** Registry for custom calendars – set before calcCPM via setCalendarRegistry */
let _calRegistry: CustomCalendar[] = [];
export function setCalendarRegistry(cals: CustomCalendar[]) { _calRegistry = cals; }
function findCustomCal(cal: CalendarType): CustomCalendar | undefined {
    if (typeof cal === 'number') return undefined;
    return _calRegistry.find(c => c.id === cal);
}

/** Check if a given date is a work day for a calendar */
function isWorkDayForCal(d: Date, cal: CalendarType): boolean {
    const cc = findCustomCal(cal);
    if (cc) {
        const iso = d.toISOString().slice(0, 10);
        // Check exceptions first (non-work days override)
        if (cc.exceptions.includes(iso)) return false;
        const dow = d.getDay();
        // Use per-day hours: a day with >0 hours is a work day
        const hpd = cc.hoursPerDay;
        if (Array.isArray(hpd)) return hpd[dow] > 0 && cc.workDays[dow];
        return cc.workDays[dow];
    }
    // Built-in calendars
    const wd = d.getDay();
    if (cal === 5) return wd >= 1 && wd <= 5;
    if (cal === 6) return wd !== 0;
    return true; // 7-day
}

/** Get the CAL_F factor for any calendar */
function calFactor(cal: CalendarType): number {
    const cc = findCustomCal(cal);
    if (cc) {
        const workCount = cc.workDays.filter(Boolean).length || 1;
        return 7 / workCount;
    }
    return CAL_F[cal as number] || CAL_F[6];
}

// ─── Date Utilities ─────────────────────────────────────────────

/** Snap a date forward to the next work day (returns same date if already a work day) */
export function snapToWorkDay(d: Date, cal: CalendarType): Date {
    const r = new Date(d);
    while (!isWorkDayForCal(r, cal)) r.setDate(r.getDate() + 1);
    return r;
}

/** Compute exclusive EF from ES and duration (ES is day 1, inclusive) */
function calcEF(es: Date, dur: number, cal: CalendarType): Date {
    if (dur <= 0) return new Date(es);
    // Snap ES to work day, then advance dur-1 more work days to reach last work day
    const snapped = snapToWorkDay(es, cal);
    const lastWorkDay = dur === 1 ? snapped : addWorkDays(snapped, dur - 1, cal);
    return addDays(lastWorkDay, 1); // EF is exclusive (day after last work day)
}

/** Compute Late Start from Late Finish (exclusive) and work-day duration — inverse of calcEF */
function calcLateStart(lf: Date, dur: number, cal: CalendarType): Date {
    if (dur <= 0) return new Date(lf);
    // LF is exclusive (day after the latest allowable last work day)
    // Find the latest last-work-day: go backward from lf-1 to a work day
    let lastWD = addDays(lf, -1);
    while (!isWorkDayForCal(lastWD, cal)) lastWD = addDays(lastWD, -1);
    // Go backward dur-1 work days to find LS
    return dur === 1 ? new Date(lastWD) : addWorkDays(lastWD, -(dur - 1), cal);
}

export function addWorkDays(d: Date, wd: number, cal: CalendarType): Date {
    if (wd === 0) return new Date(d);
    const r = new Date(d);
    let remaining = Math.abs(Math.round(wd));
    const dir = wd > 0 ? 1 : -1;
    while (remaining > 0) {
        r.setDate(r.getDate() + dir);
        if (isWorkDayForCal(r, cal)) remaining--;
    }
    return r;
}

export function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

export function dayDiff(a: Date, b: Date): number {
    const ad = a instanceof Date ? a : new Date(a as any);
    const bd = b instanceof Date ? b : new Date(b as any);
    return Math.round((bd.getTime() - ad.getTime()) / 864e5);
}

export function calWorkDays(a: Date, b: Date, cal: CalendarType): number {
    return getExactWorkDays(a, b, cal);
}

export function getExactWorkDays(start: Date, end: Date, cal: CalendarType): number {
    let count = 0;
    let cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endD = new Date(end);
    endD.setHours(0, 0, 0, 0);

    while (cur < endD) {
        if (isWorkDayForCal(cur, cal)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

export function getExactElapsedRatio(start: Date, end: Date, target: Date, cal: CalendarType): number {
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
        constraint: '',
        constraintDate: '',
        manual: false,
        actualStart: null,
        actualFinish: null,
        suspendDate: null,
        resumeDate: null,
        ES: null, EF: null, LS: null, LF: null, TF: null,
        crit: false,
        blDur: null, blES: null, blEF: null, blCal: null,
        baselines: [],
        encargado: '',
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
    activeBaselineIdx: number = 0,
    customCalendars: CustomCalendar[] = []
): CPMResult {
    // Set the global calendar registry so helper functions can find custom calendars
    setCalendarRegistry(customCalendars);
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
        a._remES = null; a._remEF = null; a._isSplit = false;
        a._spanDur = null;
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

        // Si la actividad tiene avance y Actual Start, usarlo como fecha fija
        if ((a.pct || 0) > 0 && a.actualStart) {
            const as_ = parseDate(a.actualStart);
            if (as_) { es = new Date(as_); forced = true; }
        }

        if (!forced && (a.manual || a.constraint === 'MSO') && a.constraintDate) {
            const cd = parseDate(a.constraintDate);
            if (cd) { es = new Date(cd); forced = true; }
        } else if (!forced && a.constraint === 'SNET') {
            const cd = parseDate(a.constraintDate);
            if (cd) es = new Date(Math.max(es.getTime(), cd.getTime()));
        }

        if (!forced && a.preds && a.preds.length) {
            a.preds.forEach(p => {
                const pred = byId[p.id]; if (!pred) return;
                if (pred.type === 'summary' || a.type === 'summary') return;
                getES(pred);
                const pEF = pred.EF || (pred.type === 'milestone' ? (pred.ES || projStart) : calcEF(pred.ES || projStart, pred.dur || 0, pred.cal || defCal));
                const pES = pred.ES || projStart;
                let t: Date;
                const lag = p.lag || 0;

                if (p.type === 'FS') t = addWorkDays(pEF, lag, a.cal || defCal);
                else if (p.type === 'SS') t = addWorkDays(pES, lag, a.cal || defCal);
                else if (p.type === 'FF') {
                    t = addWorkDays(addWorkDays(pEF, lag, a.cal || defCal), -(a.type === 'milestone' ? 0 : (a.dur || 0)), a.cal || defCal);
                } else if (p.type === 'SF') {
                    t = addWorkDays(addWorkDays(pES, lag, a.cal || defCal), -(a.type === 'milestone' ? 0 : (a.dur || 0)), a.cal || defCal);
                } else {
                    t = addWorkDays(pEF, lag, a.cal || defCal);
                }

                if (t > es) es = new Date(t);
            });
        }

        // Snap ES to next work day (unless forced by actual start or constraint)
        if (!forced && a.type !== 'milestone' && a.type !== 'summary') {
            es = snapToWorkDay(es, a.cal || defCal);
        }

        a.ES = es;
        a.EF = a.type === 'milestone' ? new Date(es) : calcEF(es, a.dur || 0, a.cal || defCal);
        // Para actividades 100% completas con Fin Real, usar actualFinish como EF
        if ((a.pct || 0) >= 100 && a.actualFinish) {
            const af = parseDate(a.actualFinish);
            if (af) {
                a.EF = addDays(af, 1); // EF es exclusivo
            }
        }
        return a.ES;
    }

    activities.forEach(a => getES(a));

    // Recalcular duración para actividades 100% con actualFinish (sin retained logic)
    activities.forEach(a => {
        if (a.type === 'summary' || a.type === 'milestone') return;
        if ((a.pct || 0) >= 100 && a.actualFinish && a.ES && a.EF) {
            a.dur = calWorkDays(a.ES, a.EF, a.cal || defCal);
        }
    });

    // ═══ RETAINED LOGIC (Status Date reprogramming) ═══
    // sd = día siguiente a la fecha de corte (las actividades se reprograman DESPUÉS de la fecha de corte)
    if (statusDate) {
        const sdRaw = new Date(statusDate);
        const sd = addDays(sdRaw, 1); // remaining work starts the day AFTER status date

        // Paso 1: Calcular duraciones realizadas/restantes para actividades con avance
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

        // Paso 2: Recalcular paso adelante respetando relaciones y restricciones
        activities.forEach(a => { a._retES = null; a._retEF = null; });

        const getRetES = (a: Activity): Date | null => {
            if (a._retES !== undefined && a._retES !== null) return a._retES;
            const pct = a.pct || 0;
            if (a.type === 'summary' || pct >= 100) {
                // Para actividades 100% completas con actualFinish, usar esa fecha como EF
                if (pct >= 100 && a.actualFinish) {
                    const af = parseDate(a.actualFinish);
                    if (af) {
                        a.EF = addDays(af, 1); // EF es exclusivo (día siguiente al último día de trabajo)
                    }
                }
                a._retES = a.ES; a._retEF = a.EF;
                return a._retES;
            }

            // Reprogramación: todas las actividades sin avance completo
            // se programan desde la fecha de corte hacia adelante
            let newES: Date;
            if (a.type === 'milestone') {
                newES = new Date(a.ES!);
            } else {
                // Tanto con avance parcial como sin avance: programar desde fecha de corte
                newES = new Date(sd);
            }

            // Considerar predecesoras (pueden empujar más adelante)
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
                        t = addWorkDays(addWorkDays(pEF!, lag, a.cal || defCal), -(a.type === 'milestone' ? 0 : (a._remDur || a.dur || 0)), a.cal || defCal);
                    } else if (p.type === 'SF') {
                        t = addWorkDays(addWorkDays(pES!, lag, a.cal || defCal), -(a.type === 'milestone' ? 0 : (a._remDur || a.dur || 0)), a.cal || defCal);
                    } else {
                        t = addWorkDays(pEF!, lag, a.cal || defCal);
                    }
                    if (t > newES) newES = new Date(t);
                });
            }

            if (pct > 0 && pct < 100 && a.type !== 'milestone') {
                // Actividad con avance parcial:
                // - ES se mantiene en la fecha de inicio real (actualStart)
                // - Solo el trabajo restante se programa hacia adelante desde newES (fecha de corte o pred)
                newES = snapToWorkDay(newES, a.cal || defCal);
                a._remStart = newES;
                const newEF = calcEF(newES, a._remDur!, a.cal || defCal);
                // Mantener ES en la fecha de inicio real (actualStart si existe, si no el ES del forward pass)
                if (a.actualStart) {
                    const asDate = parseDate(a.actualStart);
                    if (asDate) a.ES = asDate;
                }
                // a.ES no cambia — se respeta la fecha original de inicio real
                a._retES = a.ES;
                a._retEF = newEF;
                a.EF = newEF;

                // ── Split bar detection ──
                // _remES / _remEF = dónde empieza y termina el trabajo restante
                a._remES = newES;
                a._remEF = newEF;
                // _isSplit = true ONLY when a predecessor forces the remaining work
                // to start later than the status-date boundary (out-of-sequence).
                // A normal gap between _actualEnd and sd does NOT count as a split —
                // that's just the standard retained-logic reprogramming.
                // Also, suspend/resume splits are handled separately below.
                if (a._actualEnd && a._remES) {
                    // Only split if remaining start was pushed BEYOND the status date
                    // by a predecessor (i.e. newES > sd)
                    const sdSnapped = snapToWorkDay(sd, a.cal || defCal);
                    a._isSplit = a._remES.getTime() > sdSnapped.getTime();
                } else {
                    a._isSplit = false;
                }

                // La duración del modelo NO cambia — la definió el usuario.
                // _spanDur guarda el span visual real ES→EF para mostrar en tabla.
                a._spanDur = calWorkDays(a.ES!, a.EF!, a.cal || defCal);
            } else {
                // Sin avance: mover si newES es posterior al ES actual
                // Snap to next work day
                if (a.type !== 'milestone') newES = snapToWorkDay(newES, a.cal || defCal);
                if (newES > a.ES!) {
                    a.ES = newES;
                    const effDur = a.type === 'milestone' ? 0 : (a.remDur != null ? a.remDur : (a.dur || 0));
                    a.EF = calcEF(newES, effDur, a.cal || defCal);
                }
                a._retES = a.ES;
                a._retEF = a.EF;
            }
            return a._retES;
        }

        activities.forEach(a => getRetES(a));

        // Recalcular duración para actividades 100% completas con fin real
        activities.forEach(a => {
            if (a.type === 'summary' || a.type === 'milestone') return;
            const pct = a.pct || 0;
            if (pct >= 100 && a.actualFinish && a.ES && a.EF) {
                a.dur = calWorkDays(a.ES, a.EF, a.cal || defCal);
            }
        });
    }

    // ═══ SUSPEND / RESUME — post-retained split bar ═══
    // Runs after retained logic so _remES/_remEF/EF are already computed.
    // Splits the remaining work around the suspension gap.
    activities.forEach(a => {
        if (a.type === 'summary' || a.type === 'milestone') return;
        if ((a.pct || 0) >= 100) return;
        if (!a.suspendDate || !a.ES) return;

        const suspDate = parseDate(a.suspendDate);
        if (!suspDate) return;
        const cal = a.cal || defCal;

        // Determine where remaining work starts (from retained logic or status date)
        const remStart = a._remES || (statusDate ? addDays(new Date(statusDate), 1) : a.ES);

        if (a.resumeDate) {
            const resDate = parseDate(a.resumeDate);
            if (resDate && resDate > suspDate) {
                // Work days between remaining-start and suspend date
                const workBeforeSuspend = calWorkDays(remStart, suspDate, cal);
                const totalRemaining = a._remDur != null ? a._remDur
                    : (a.remDur != null ? a.remDur
                        : Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100));
                const remainingAfterResume = Math.max(0, totalRemaining - workBeforeSuspend);

                // New EF = addWorkDays(resumeDate, remainingAfterResume)
                const newEF = calcEF(resDate, remainingAfterResume, cal);
                a.EF = newEF;
                a._isSplit = true;
                a._actualEnd = suspDate;        // segment 1 ends at suspend date
                a._remES = resDate;              // segment 2 starts at resume date
                a._remEF = newEF;                // segment 2 ends at new EF
                a._spanDur = calWorkDays(a.ES, newEF, cal);
            }
        } else {
            // Suspended without resume date → work halted at suspend point
            a._actualEnd = suspDate;
            a.EF = suspDate;
            a._isSplit = false;
            a._spanDur = calWorkDays(a.ES, suspDate, cal);
        }
    });

    // ═══ Summary Tasks: compute ES/EF from children (bottom-up) ═══
    // Process in reverse so nested summaries are resolved before their parents
    // Note: task EF is "exclusive" (day after last work day) while milestone EF = ES (inclusive).
    // Normalize milestone EF to exclusive (+1 day) so summary EF is consistent.
    const childEF = (ch: Activity): Date | null => {
        if (!ch.EF) return null;
        if (ch.type === 'milestone') return addDays(ch.EF, 1);
        return ch.EF;
    };
    for (let i = activities.length - 1; i >= 0; i--) {
        const a = activities[i];
        if (a.type !== 'summary') continue;
        let minES: Date | null = null, maxEF: Date | null = null;

        if (a._isProjRow) {
            for (let j = 1; j < activities.length; j++) {
                const ch = activities[j];
                if (ch.ES && (!minES || ch.ES < minES)) minES = new Date(ch.ES);
                const ef = childEF(ch);
                if (ef && (!maxEF || ef > maxEF)) maxEF = new Date(ef);
            }
        } else {
            for (let j = i + 1; j < activities.length; j++) {
                if (activities[j].lv <= a.lv) break;
                const ch = activities[j];
                if (ch.ES && (!minES || ch.ES < minES)) minES = new Date(ch.ES);
                const ef = childEF(ch);
                if (ef && (!maxEF || ef > maxEF)) maxEF = new Date(ef);
            }
        }
        if (minES) a.ES = minES;
        if (maxEF) a.EF = maxEF;
        if (minES && maxEF) {
            a.dur = Math.max(1, getExactWorkDays(minES, maxEF, a.cal || defCal));
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
        if (a.type === 'summary') return; // summaries derive EF from tasks, skip to avoid rounding drift
        // Normalize milestone EF to exclusive (+1 day) to match task convention
        const ef = a.EF ? (a.type === 'milestone' ? addDays(a.EF, 1) : a.EF) : null;
        if (ef && ef > projEnd) projEnd = new Date(ef);
    });
    // projectDays = actual project span (for auto-fit zoom)
    // totalDays = project + buffer months (for scrollable timeline)
    const projectDays = Math.max(30, dayDiff(projStart, projEnd) + 3);
    const totalDays = Math.max(projectDays, dayDiff(projStart, projEnd) + 30 + 60);

    activities.forEach(a => { a.LF = new Date(projEnd); });
    const toD = (v: any): Date => v instanceof Date ? v : new Date(v);
    const sorted = [...activities].sort((a, b) => toD(b.EF || projEnd).getTime() - toD(a.EF || projEnd).getTime());

    // Función auxiliar: duración efectiva en días laborales (ES→EF) para el backward pass
    const effWorkDur = (a: Activity): number => {
        if (a.type === 'milestone') return 0;
        if (a.ES && a.EF) return Math.max(0, calWorkDays(a.ES, a.EF, a.cal || defCal));
        return a.dur || 0;
    };

    sorted.forEach(a => {
        const dur = effWorkDur(a);
        a.LS = calcLateStart(a.LF!, dur, a.cal || defCal);
        if (a.preds) {
            a.preds.forEach(p => {
                const pred = byId[p.id]; if (!pred) return;
                let newLF: Date; const lag = p.lag || 0;
                if (p.type === 'FS') {
                    newLF = addWorkDays(a.LS!, -lag, pred.cal || defCal);
                } else if (p.type === 'SS') {
                    // SS backward: latest pred ES such that suc.LS respects the SS link
                    const latestPredES = addWorkDays(a.LS!, -lag, pred.cal || defCal);
                    newLF = calcEF(latestPredES, effWorkDur(pred), pred.cal || defCal);
                } else if (p.type === 'FF') {
                    newLF = addWorkDays(a.LF!, -lag, pred.cal || defCal);
                } else {
                    // SF backward: latest pred ES then derive LF
                    const latestPredES = addWorkDays(a.LF!, -lag, pred.cal || defCal);
                    newLF = calcEF(latestPredES, effWorkDur(pred), pred.cal || defCal);
                }
                if (!pred.LF || newLF < pred.LF) {
                    pred.LF = new Date(newLF);
                }
            });
        }
    });

    activities.forEach(a => {
        if (!a.LF) a.LF = new Date(projEnd);
        const dur = effWorkDur(a);
        a.LS = calcLateStart(a.LF, dur, a.cal || defCal);
        a.TF = (a.ES && a.LS) ? Math.max(0, getExactWorkDays(a.ES, a.LS, a.cal || defCal)) : 0;
        a.crit = a.TF === 0;
        if (a.type === 'summary' || a._isProjRow) {
            // Summary remDur = always recalculated from dur and pct
            a.remDur = Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100);
        } else if (a.remDur === null || a.remDur === undefined) {
            a.remDur = Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100);
        }
    });

    return { activities, totalDays, projectDays };
}

// ─── Trace Logic (Chain Tracing) ────────────────────────────────

/**
 * Trace the logical chain from a given activity.
 * - 'bwd': trace all predecessors recursively (backward chain)
 * - 'fwd': trace all successors recursively (forward chain)
 * - 'both': trace in both directions
 *
 * Returns a Set of activity IDs that belong to the chain.
 */
export function traceChain(
    activities: Activity[],
    startId: string,
    direction: 'fwd' | 'bwd' | 'both'
): Set<string> {
    const result = new Set<string>();
    const byId: Record<string, Activity> = {};
    activities.forEach(a => { byId[a.id] = a; });

    if (!byId[startId]) return result;
    result.add(startId);

    // Build successor map for forward tracing
    const succMap = new Map<string, string[]>();
    for (const a of activities) {
        if (!a.preds) continue;
        for (const p of a.preds) {
            if (!succMap.has(p.id)) succMap.set(p.id, []);
            succMap.get(p.id)!.push(a.id);
        }
    }

    // Backward trace (predecessors)
    if (direction === 'bwd' || direction === 'both') {
        const queue = [startId];
        const visited = new Set<string>([startId]);
        while (queue.length > 0) {
            const curId = queue.shift()!;
            const cur = byId[curId];
            if (!cur || !cur.preds) continue;
            for (const p of cur.preds) {
                if (!visited.has(p.id) && byId[p.id]) {
                    visited.add(p.id);
                    result.add(p.id);
                    queue.push(p.id);
                }
            }
        }
    }

    // Forward trace (successors)
    if (direction === 'fwd' || direction === 'both') {
        const queue = [startId];
        const visited = new Set<string>([startId]);
        while (queue.length > 0) {
            const curId = queue.shift()!;
            const succs = succMap.get(curId) || [];
            for (const sId of succs) {
                if (!visited.has(sId) && byId[sId]) {
                    visited.add(sId);
                    result.add(sId);
                    queue.push(sId);
                }
            }
        }
    }

    return result;
}

// ─── Multiple Float Paths (Access Critical Path) ────────────────

/**
 * Calculate Relationship Float for a single link.
 * RF measures how much "slack" exists in this specific relationship.
 * RF = 0 means the relationship is "driving" (it controls the successor's timing).
 */
function calcRelationshipFloat(
    pred: Activity,
    succ: Activity,
    link: PredecessorLink,
    defCal: CalendarType
): number {
    const lag = link.lag || 0;
    const succCal = succ.cal || defCal;
    // pred.cal available but currently unused

    if (!pred.ES || !pred.EF || !succ.ES || !succ.EF) return Infinity;

    let impliedDate: Date;
    switch (link.type) {
        case 'FS':
            // Successor can start when pred finishes + lag
            impliedDate = addWorkDays(pred.EF, lag, succCal);
            return Math.max(0, dayDiff(impliedDate, succ.ES));
        case 'SS':
            // Successor can start when pred starts + lag
            impliedDate = addWorkDays(pred.ES, lag, succCal);
            return Math.max(0, dayDiff(impliedDate, succ.ES));
        case 'FF':
            // Successor can finish when pred finishes + lag
            impliedDate = addWorkDays(pred.EF, lag, succCal);
            return Math.max(0, dayDiff(impliedDate, succ.EF));
        case 'SF':
            // Successor can finish when pred starts + lag
            impliedDate = addWorkDays(pred.ES, lag, succCal);
            return Math.max(0, dayDiff(impliedDate, succ.EF));
        default:
            impliedDate = addWorkDays(pred.EF, lag, succCal);
            return Math.max(0, dayDiff(impliedDate, succ.ES));
    }
}

/**
 * Calculate Free Float for an activity.
 * Free Float = minimum of (ES_successor - EF_activity - lag) across all successors.
 * For activities with no successors, FF = TF.
 */
function calcFreeFloat(
    a: Activity,
    successors: { succ: Activity; link: PredecessorLink }[],
    defCal: CalendarType
): number {
    if (!a.EF || successors.length === 0) return a.TF || 0;

    let minSlack = Infinity;
    for (const { succ, link } of successors) {
        const rf = calcRelationshipFloat(a, succ, link, defCal);
        if (rf < minSlack) minSlack = rf;
    }
    return Math.max(0, minSlack);
}

/**
 * P6-style Multiple Float Paths calculation.
 *
 * Traces backward from an end activity, identifying driving predecessor chains
 * and numbering them by criticality (1 = most critical).
 *
 * Algorithm:
 *  1. Build successor map and compute Relationship Float for every link.
 *  2. Starting from the end activity, trace backward through driving predecessors.
 *  3. "Driving" = the predecessor with the lowest RF (tied → lowest TF/FF → longest dur → latest EF).
 *  4. When a path runs out of predecessors, increment the path counter and pick
 *     the next unassigned activity with the lowest TF.
 */
export function calcMultipleFloatPaths(
    activities: Activity[],
    endActivityId: string | null,
    mode: 'totalFloat' | 'freeFloat',
    maxPaths: number,
    defCal: CalendarType
): void {
    // Reset MFP fields
    activities.forEach(a => {
        a._floatPath = null;
        a._drivingPredId = null;
        a._relFloat = null;
        a._freeFloat = null;
    });

    // Only process actual tasks/milestones (not summary rows)
    const tasks = activities.filter(a => a.type !== 'summary' && !a._isProjRow);
    if (tasks.length === 0) return;

    const byId: Record<string, Activity> = {};
    activities.forEach(a => { byId[a.id] = a; });

    // Build successor map: predId → [{succ, link}]
    const succMap = new Map<string, { succ: Activity; link: PredecessorLink }[]>();
    for (const a of tasks) {
        if (!a.preds) continue;
        for (const p of a.preds) {
            const pred = byId[p.id];
            if (!pred || pred.type === 'summary') continue;
            if (!succMap.has(p.id)) succMap.set(p.id, []);
            succMap.get(p.id)!.push({ succ: a, link: p });
        }
    }

    // Compute Free Float for all tasks
    for (const a of tasks) {
        const succs = succMap.get(a.id) || [];
        a._freeFloat = calcFreeFloat(a, succs, defCal);
    }

    // Determine end activity
    let endAct: Activity | null = null;
    if (endActivityId && byId[endActivityId]) {
        endAct = byId[endActivityId];
    } else {
        // Auto-detect: task/milestone with latest EF
        let maxEF: Date | null = null;
        for (const a of tasks) {
            if (a.EF && (!maxEF || a.EF > maxEF)) {
                maxEF = a.EF;
                endAct = a;
            }
        }
    }
    if (!endAct) return;

    // Set of assigned activity IDs
    const assigned = new Set<string>();

    /**
     * Select the "most driving" predecessor of `current` that hasn't been assigned yet.
     * Tie-breaking (P6 rules):
     *   1. Lowest Relationship Float (RF)
     *   2. Lowest Total Float (or Free Float if mode = freeFloat)
     *   3. Longest duration
     *   4. Latest Early Finish
     */
    function selectDrivingPred(current: Activity): { pred: Activity; link: PredecessorLink; rf: number } | null {
        if (!current.preds || current.preds.length === 0) return null;

        const candidates: { pred: Activity; link: PredecessorLink; rf: number }[] = [];
        for (const p of current.preds) {
            const pred = byId[p.id];
            if (!pred || pred.type === 'summary' || pred._isProjRow) continue;
            if (assigned.has(pred.id)) continue;
            const rf = calcRelationshipFloat(pred, current, p, defCal);
            candidates.push({ pred, link: p, rf });
        }
        if (candidates.length === 0) return null;

        // Sort by P6 tie-breaking rules
        candidates.sort((a, b) => {
            // 1. Lowest RF (most driving)
            if (a.rf !== b.rf) return a.rf - b.rf;
            // 2. Lowest float (TF or FF depending on mode)
            const aFloat = mode === 'freeFloat' ? (a.pred._freeFloat ?? a.pred.TF ?? 0) : (a.pred.TF ?? 0);
            const bFloat = mode === 'freeFloat' ? (b.pred._freeFloat ?? b.pred.TF ?? 0) : (b.pred.TF ?? 0);
            if (aFloat !== bFloat) return aFloat - bFloat;
            // 3. Longest duration
            const aDur = a.pred.dur || 0;
            const bDur = b.pred.dur || 0;
            if (aDur !== bDur) return bDur - aDur;
            // 4. Latest EF
            const aEF = a.pred.EF?.getTime() || 0;
            const bEF = b.pred.EF?.getTime() || 0;
            return bEF - aEF;
        });

        return candidates[0];
    }

    let pathCounter = 1;
    let current: Activity | null = endAct;

    while (current && pathCounter <= maxPaths) {
        // Trace backward from current through driving predecessors
        let tracing: Activity | null = current;
        while (tracing) {
            if (assigned.has(tracing.id)) break;

            // Assign float path
            tracing._floatPath = pathCounter;
            assigned.add(tracing.id);

            // Select driving predecessor
            const best = selectDrivingPred(tracing);
            if (best) {
                tracing._drivingPredId = best.pred.id;
                tracing._relFloat = best.rf;
                tracing = best.pred;
            } else {
                tracing._relFloat = null;
                tracing = null;
            }
        }

        // Path complete — find next unassigned activity with lowest float
        pathCounter++;
        if (pathCounter > maxPaths) break;

        let nextBest: Activity | null = null;
        let nextBestFloat = Infinity;
        for (const a of tasks) {
            if (assigned.has(a.id)) continue;
            const f = mode === 'freeFloat' ? (a._freeFloat ?? a.TF ?? Infinity) : (a.TF ?? Infinity);
            if (f < nextBestFloat || (f === nextBestFloat && nextBest && (a.EF?.getTime() || 0) > (nextBest.EF?.getTime() || 0))) {
                nextBestFloat = f;
                nextBest = a;
            }
        }
        current = nextBest;
    }
}

// ─── Usage Distribution Helper ──────────────────────────────────

export function getUsageDailyValues(
    a: Activity,
    mode: 'Trabajo' | 'Trabajo real' | 'Trabajo acumulado' | 'Trabajo previsto' | 'Trabajo restante' | 'Trabajo real acumulado' | 'Trabajo previsto acumulado' | 'Trabajo restante acumulado',
    calcTotalAccumulated = false,
    defCal: CalendarType = 6,
    resId?: string,
    activeBaselineIdx: number = 0,
    statusDate?: Date | null,
    progressHistory?: ProgressHistoryEntry[]
): Map<number, number> {
    const map = new Map<number, number>();
    if (a.type === 'summary' || a._isProjRow) return map;
    const work = resId ? (a.resources?.find(r => String(r.rid) === String(resId))?.work || 0) : (a.work || 0);
    if (work === 0) return map;

    // ─── Helper: build array of work-day dates between two dates ───
    const buildWorkDays = (s: Date, e: Date, calN: CalendarType): Date[] => {
        const arr: Date[] = [];
        const c = new Date(s); c.setHours(0, 0, 0, 0);
        const ed = new Date(e); ed.setHours(0, 0, 0, 0);
        while (c < ed) {
            if (isWorkDayForCal(c, calN)) arr.push(new Date(c));
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
                if (calcTotalAccumulated || (mode as string) !== 'Trabajo acumulado') {
                    if (dailySeg1 > 0) map.set(t, dailySeg1);
                } else {
                    acc += dailySeg1;
                    map.set(t, acc);
                }
            }
            for (const d of datesSeg2) {
                const t = d.getTime();
                if (calcTotalAccumulated || (mode as string) !== 'Trabajo acumulado') {
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

    // ─── "Trabajo real": based on progressHistory weekly records ───
    // Each progress record captures activity % at that date.
    // Delta % between consecutive records → earned HH → distributed in calendar work days of that period.
    // After the last progress record → 0 (no data yet).
    if (mode === 'Trabajo real') {
        const cal = a.cal || defCal;
        const history = progressHistory || [];

        // Filter and sort progress entries that have data for this activity
        const actId = a.id;
        const entries: { date: Date; pct: number }[] = [];
        for (const h of history) {
            const pctVal = h.details ? h.details[actId] : undefined;
            if (pctVal !== undefined && pctVal > 0) {
                // Parse as local date (avoid UTC shift with 'T00:00:00')
                const d = new Date(h.date + 'T00:00:00'); d.setHours(0, 0, 0, 0);
                entries.push({ date: d, pct: pctVal });
            }
        }
        // Also include entries where pct is 0 explicitly (start reference)
        for (const h of history) {
            const pctVal = h.details ? h.details[actId] : undefined;
            if (pctVal === 0) {
                const d = new Date(h.date + 'T00:00:00'); d.setHours(0, 0, 0, 0);
                // Only add if not already present
                if (!entries.some(e => e.date.getTime() === d.getTime())) {
                    entries.push({ date: d, pct: 0 });
                }
            }
        }
        entries.sort((a, b) => a.date.getTime() - b.date.getTime());

        if (entries.length === 0) return map;

        // Activity start date as the implicit "0%" anchor
        const actStart = a.ES || a.blES;
        if (!actStart) return map;
        const startD = new Date(actStart); startD.setHours(0, 0, 0, 0);

        // Build periods: from actStart→first record, then record→record
        let prevDate = startD;
        let prevPct = 0;

        for (const entry of entries) {
            const deltaPct = entry.pct - prevPct;
            if (deltaPct > 0) {
                const earnedWork = work * (deltaPct / 100);
                // Period end is inclusive of the record date (end of that day)
                const periodEnd = new Date(entry.date);
                periodEnd.setDate(periodEnd.getDate() + 1);
                const periodDays = buildWorkDays(prevDate, periodEnd, cal);
                if (periodDays.length > 0) {
                    const dailyVal = earnedWork / periodDays.length;
                    for (const d of periodDays) {
                        const t = d.getTime();
                        map.set(t, (map.get(t) || 0) + dailyVal);
                    }
                }
            }
            prevDate = new Date(entry.date);
            prevDate.setDate(prevDate.getDate() + 1); // next period starts day after
            prevPct = entry.pct;
        }

        // After the last progress record → nothing (0). No future projection.
        return map;
    }

    // ─── "Trabajo restante": remaining work distributed from statusDate (or _remES) to EF ───
    if (mode === 'Trabajo restante') {
        const pct = Math.min(100, Math.max(0, a.pct || 0));
        const remainingWork = work * (1 - pct / 100);
        if (remainingWork <= 0) return map;
        const cal = a.cal || defCal;

        let remStart: Date;
        let endD: Date;

        if (a._remES && a._remEF) {
            // Split bar: remaining work goes from _remES to _remEF
            remStart = new Date(a._remES); remStart.setHours(0, 0, 0, 0);
            endD = new Date(a._remEF); endD.setHours(0, 0, 0, 0);
        } else {
            const sDate = statusDate ? new Date(statusDate) : new Date();
            sDate.setHours(0, 0, 0, 0);
            const sDateEnd = new Date(sDate);
            sDateEnd.setDate(sDateEnd.getDate() + 1);

            const actEF = a.EF;
            const actES = a.ES;
            if (!actEF || !actES) return map;
            const startD = new Date(actES); startD.setHours(0, 0, 0, 0);
            endD = new Date(actEF); endD.setHours(0, 0, 0, 0);
            remStart = sDateEnd > startD ? sDateEnd : startD;
        }

        if (endD <= remStart) return map;

        const remDates = buildWorkDays(remStart, endD, cal);
        if (remDates.length === 0) return map;
        const daily = remainingWork / remDates.length;
        for (const d of remDates) {
            if (daily > 0) map.set(d.getTime(), daily);
        }
        return map;
    }

    // ─── "Trabajo real acumulado": cumulative sum of Trabajo real ───
    if (mode === 'Trabajo real acumulado') {
        const dailyMap = getUsageDailyValues(a, 'Trabajo real', false, defCal, resId, activeBaselineIdx, statusDate, progressHistory);
        // Sort by date and accumulate
        const sorted = [...dailyMap.entries()].sort((a, b) => a[0] - b[0]);
        let acc = 0;
        for (const [t, v] of sorted) {
            acc += v;
            map.set(t, acc);
        }
        return map;
    }

    // ─── "Trabajo previsto acumulado": cumulative sum of Trabajo previsto ───
    if (mode === 'Trabajo previsto acumulado') {
        const dailyMap = getUsageDailyValues(a, 'Trabajo previsto', false, defCal, resId, activeBaselineIdx, statusDate, progressHistory);
        const sorted = [...dailyMap.entries()].sort((a, b) => a[0] - b[0]);
        let acc = 0;
        for (const [t, v] of sorted) {
            acc += v;
            map.set(t, acc);
        }
        return map;
    }

    // ─── "Trabajo restante acumulado": cumulative sum of Trabajo restante ───
    if (mode === 'Trabajo restante acumulado') {
        const dailyMap = getUsageDailyValues(a, 'Trabajo restante', false, defCal, resId, activeBaselineIdx, statusDate, progressHistory);
        const sorted = [...dailyMap.entries()].sort((a, b) => a[0] - b[0]);
        let acc = 0;
        for (const [t, v] of sorted) {
            acc += v;
            map.set(t, acc);
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
