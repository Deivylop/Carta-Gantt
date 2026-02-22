import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGantt } from '../store/GanttContext';
import { dayDiff, addDays } from '../utils/cpm';
import type { ThemeColors } from '../types/gantt';

const ROW_H = 26;
const HDR_H = 36;

function th(light: boolean): ThemeColors {
    return light ? {
        rowEven: '#ffffff', rowOdd: '#f8fafc', gridMonth: '#cbd5e1', gridLine: '#e2e8f0',
        hdrTopBg: '#e2e8f0', hdrTopBorder: '#cbd5e1', hdrTopText: '#334155',
        hdrBotBg: '#f1f5f9', hdrBotBorder: '#e2e8f0', hdrBotText: '#334155', hdrWeekend: '#e0e7ff',
        summaryBar: '#4338ca', barLabel: '#fff', barLabelOut: '#334155',
        blBar: '#94a3b8', blDiamond: '#64748b', connLine: '#6b7280', connCrit: '#dc2626',
        todayLine: '#f59e0b', statusLine: '#06b6d4', gradTop: 'rgba(255,255,255,.25)', gradBot: 'rgba(0,0,0,.08)',
    } : {
        rowEven: '#0d1422', rowOdd: '#111827', gridMonth: '#1f2937', gridLine: 'rgba(30,41,59,.4)',
        hdrTopBg: '#0a0f1a', hdrTopBorder: '#1f2937', hdrTopText: '#94a3b8',
        hdrBotBg: '#0f172a', hdrBotBorder: '#1e293b', hdrBotText: '#64748b', hdrWeekend: '#1a1040',
        summaryBar: '#4338ca', barLabel: '#e5e7eb', barLabelOut: '#e5e7eb',
        blBar: 'rgba(148,163,184,.3)', blDiamond: '#64748b', connLine: '#4b5563', connCrit: '#ef4444',
        todayLine: '#f59e0b', statusLine: '#06b6d4', gradTop: 'rgba(255,255,255,.12)', gradBot: 'rgba(0,0,0,.2)',
    };
}

export default function ResourceUsageGrid() {
    const { state, dispatch } = useGantt();
    const { resourcePool, activities, expResources, usageZoom, totalDays, timelineStart: projStart, lightMode, pxPerDay, usageMode, defCal } = state;

    const PX = pxPerDay;
    const activeZoom = usageZoom || 'week';

    const hdrRef = useRef<HTMLCanvasElement>(null);
    const bodyCanvasRef = useRef<HTMLCanvasElement>(null);
    const bodyDivRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const t = th(lightMode);
    const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

    const normalActs = activities.filter(a => !a._isProjRow && a.type !== 'summary');
    const renderRows: any[] = [];

    resourcePool.forEach((res) => {
        const assignedActs = normalActs.filter(a => a.resources && a.resources.some(r => r.name === res.name));
        if (assignedActs.length === 0) return;

        let resTotalWork = 0;
        const actRows: any[] = [];

        assignedActs.forEach(a => {
            const assignment = a.resources!.find(r => r.name === res.name)!;
            const work = assignment.work || 0;
            resTotalWork += work;
            actRows.push({ ...a, _isResChild: true, _resWork: work });
        });

        const isExp = expResources.has(res.name);
        renderRows.push({
            _isResParent: true,
            id: res.name,
            name: res.name,
            work: resTotalWork,
            isExp
        });

        if (isExp) {
            renderRows.push(...actRows);
        }
    });

    useEffect(() => {
        const el = containerRef.current; if (!el) return;
        const measure = () => {
            const rect = el.getBoundingClientRect();
            setContainerSize({ w: Math.max(rect.width, 400), h: Math.max(rect.height - HDR_H, 200) });
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const getIntervals = useCallback(() => {
        const intervals = [];
        let cur = new Date(projStart);
        const end = addDays(projStart, totalDays);
        if (activeZoom === 'day') {
            while (cur < end) {
                intervals.push({ start: new Date(cur), end: addDays(cur, 1), label: String(cur.getDate()), w: PX, isWeekend: cur.getDay() === 0 || cur.getDay() === 6 });
                cur.setDate(cur.getDate() + 1);
            }
        } else if (activeZoom === 'week') {
            while (cur < end) {
                const next = addDays(cur, 7);
                const dd = String(cur.getDate()).padStart(2, '0') + '/' + String(cur.getMonth() + 1).padStart(2, '0');
                intervals.push({ start: new Date(cur), end: next, label: dd, w: 7 * PX, isWeekend: false });
                cur = next;
            }
        } else {
            while (cur < end) {
                const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const daysInMonth = dayDiff(cur, next);
                intervals.push({ start: new Date(cur), end: next, label: cur.toLocaleDateString('es-CL', { month: 'short' }), w: daysInMonth * PX, isWeekend: false });
                cur = next;
            }
        }
        return intervals;
    }, [projStart, totalDays, activeZoom, PX]);

    const W = Math.max(totalDays * PX, containerSize.w);
    const H = Math.max(renderRows.length * ROW_H + 20 * ROW_H, containerSize.h);

    const draw = useCallback(() => {
        if (!containerSize.w) return;
        const intervals = getIntervals();

        const hdrC = hdrRef.current; if (!hdrC) return;
        hdrC.width = W; hdrC.height = HDR_H;
        hdrC.style.width = W + 'px'; hdrC.style.height = HDR_H + 'px';
        const hCtx = hdrC.getContext('2d')!;
        hCtx.clearRect(0, 0, W, HDR_H);

        let cur = new Date(projStart);
        const endD = addDays(projStart, totalDays);
        hCtx.fillStyle = t.hdrTopBg; hCtx.fillRect(0, 0, W, 18);
        hCtx.fillStyle = t.hdrTopBorder; hCtx.fillRect(0, 18, W, 1);
        hCtx.fillStyle = t.hdrTopText; hCtx.font = '10px sans-serif'; hCtx.textAlign = 'center'; hCtx.textBaseline = 'middle';

        while (cur < endD) {
            const mStart = new Date(cur);
            const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            const w = dayDiff(projStart, mEnd) * PX - dayDiff(projStart, mStart) * PX;
            const x = dayDiff(projStart, mStart) * PX;
            if (activeZoom !== 'month') {
                hCtx.fillText(mStart.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }), x + w / 2, 9);
            }
            hCtx.fillStyle = t.hdrTopBorder; hCtx.fillRect(x + w, 0, 1, 18);
            hCtx.fillStyle = t.hdrTopText;
            cur = mEnd;
        }

        hCtx.fillStyle = t.hdrBotBg; hCtx.fillRect(0, 19, W, 17);
        hCtx.fillStyle = t.hdrBotBorder; hCtx.fillRect(0, 35, W, 1);
        hCtx.fillStyle = t.hdrBotText; hCtx.font = '10px sans-serif';

        let curX = 0;
        intervals.forEach(inv => {
            if (inv.isWeekend) { hCtx.fillStyle = t.hdrWeekend; hCtx.fillRect(curX, 19, inv.w, 17); }
            hCtx.fillStyle = t.hdrBotText;
            hCtx.fillText(inv.label, curX + inv.w / 2, 27);
            hCtx.fillStyle = t.hdrBotBorder; hCtx.fillRect(curX + inv.w, 19, 1, 17);
            curX += inv.w;
        });

        const bC = bodyCanvasRef.current; if (!bC) return;
        bC.width = W; bC.height = H;
        bC.style.width = W + 'px'; bC.style.height = H + 'px';
        const ctx = bC.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);

        ctx.strokeStyle = t.gridLine; ctx.lineWidth = 1;
        ctx.beginPath();
        curX = 0;
        intervals.forEach(inv => {
            curX += inv.w;
            ctx.moveTo(Math.floor(curX) + 0.5, 0); ctx.lineTo(Math.floor(curX) + 0.5, H);
        });
        ctx.stroke();

        renderRows.forEach((r, i) => {
            const y = i * ROW_H;
            ctx.fillStyle = i % 2 === 0 ? t.rowEven : t.rowOdd;
            ctx.fillRect(0, y, W, ROW_H);

            if (r._isResParent) {
                // To do parent aggregate, we collect all assigned acts
                const acts = normalActs.filter(a => a.resources && a.resources.some(rr => rr.name === r.name));
                const resDaily = new Map<number, number>();

                acts.forEach(a => {
                    const work = a.resources!.find(rr => rr.name === r.name)!.work || 0;
                    if (work === 0) return;
                    const ES = (usageMode === 'Trabajo previsto' ? a.blES : a.ES) || a.ES;
                    const EF = (usageMode === 'Trabajo previsto' ? a.blEF : a.EF) || a.EF;
                    if (!ES || !EF) return;

                    const start = new Date(ES); start.setHours(0, 0, 0, 0);
                    const end = new Date(EF); end.setHours(0, 0, 0, 0);
                    const cal = (usageMode === 'Trabajo previsto' ? a.blCal : a.cal) || a.cal || defCal;
                    const isWorkDay = (d: Date) => {
                        const wd = d.getDay();
                        if (cal === 5) return wd >= 1 && wd <= 5;
                        if (cal === 6) return wd !== 0;
                        return true;
                    };

                    let workDaysCount = 0;
                    let cur = new Date(start);
                    const validDates: number[] = [];
                    while (cur < end) {
                        if (isWorkDay(cur)) {
                            workDaysCount++;
                            validDates.push(cur.getTime());
                        }
                        cur.setDate(cur.getDate() + 1);
                    }
                    if (workDaysCount === 0) {
                        workDaysCount = 1;
                        validDates.push(start.getTime());
                    }

                    const dailyRaw = work / workDaysCount;
                    let acc = 0;
                    validDates.forEach(time => {
                        let toAdd = dailyRaw;
                        if (usageMode === 'Trabajo acumulado') {
                            acc += dailyRaw;
                            toAdd = acc;
                        }
                        resDaily.set(time, (resDaily.get(time) || 0) + toAdd);
                    });
                });

                // Plot Parent Row
                ctx.fillStyle = '#fef08a'; // distinct highlight color for parent cells
                const aggregatedValues = new Map<number, number>();
                intervals.forEach((inv, j) => {
                    let sum = 0;
                    for (let [time, val] of Array.from(resDaily.entries())) {
                        if (time >= inv.start.getTime() && time < inv.end.getTime()) sum += val;
                    }
                    if (sum > 0) aggregatedValues.set(j, sum);
                });

                let cx = 0;
                intervals.forEach((inv, j) => {
                    const sm = aggregatedValues.get(j);
                    if (sm) {
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // light red cell bg
                        ctx.fillRect(cx, y, inv.w, ROW_H);
                        ctx.fillStyle = '#dc2626'; // bold red text
                        ctx.font = 'bold 11px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(sm.toLocaleString('es-CL', { maximumFractionDigits: 1 }), cx + inv.w / 2, y + ROW_H / 2);
                    }
                    cx += inv.w;
                });

            } else {
                // Child Row
                const work = r._resWork || 0;
                if (work > 0 && r.ES && r.EF) {
                    const ES = (usageMode === 'Trabajo previsto' ? r.blES : r.ES) || r.ES;
                    const EF = (usageMode === 'Trabajo previsto' ? r.blEF : r.EF) || r.EF;
                    if (ES && EF) {
                        const start = new Date(ES); start.setHours(0, 0, 0, 0);
                        const end = new Date(EF); end.setHours(0, 0, 0, 0);
                        const cal = (usageMode === 'Trabajo previsto' ? r.blCal : r.cal) || r.cal || defCal;
                        const isWorkDay = (d: Date) => {
                            const wd = d.getDay();
                            if (cal === 5) return wd >= 1 && wd <= 5;
                            if (cal === 6) return wd !== 0;
                            return true;
                        };

                        let workDaysCount = 0;
                        let cur = new Date(start);
                        const validDates: number[] = [];
                        while (cur < end) {
                            if (isWorkDay(cur)) {
                                workDaysCount++;
                                validDates.push(cur.getTime());
                            }
                            cur.setDate(cur.getDate() + 1);
                        }
                        if (workDaysCount === 0) {
                            workDaysCount = 1;
                            validDates.push(start.getTime());
                        }

                        const dailyRaw = work / workDaysCount;

                        const aggregatedValues = new Map<number, number>();
                        let acc = 0;
                        intervals.forEach((inv, j) => {
                            let sum = 0;
                            validDates.forEach(time => {
                                if (time >= inv.start.getTime() && time < inv.end.getTime()) {
                                    if (usageMode === 'Trabajo acumulado') {
                                        acc += dailyRaw;
                                        sum += acc;
                                    } else {
                                        sum += dailyRaw;
                                    }
                                }
                            });
                            if (sum > 0) aggregatedValues.set(j, sum);
                        });

                        let cx = 0;
                        intervals.forEach((inv, j) => {
                            const sm = aggregatedValues.get(j);
                            if (sm) {
                                ctx.font = '11px sans-serif';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillStyle = lightMode ? '#000' : '#fff';
                                ctx.fillText(sm.toLocaleString('es-CL', { maximumFractionDigits: 1 }), cx + inv.w / 2, y + ROW_H / 2);
                            }
                            cx += inv.w;
                        });
                    }
                }
            }
        });

        // Current status date line
        const sdX = dayDiff(projStart, state.statusDate) * PX;
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(sdX, 0); ctx.lineTo(sdX, H);
        ctx.stroke();
        ctx.setLineDash([]);

    }, [containerSize, getIntervals, W, H, renderRows, projStart, totalDays, PX, lightMode, state.statusDate, t, usageMode, defCal]);

    useEffect(() => { draw(); }, [draw]);

    useEffect(() => {
        const body = bodyDivRef.current;
        if (!body) return;
        const handler = () => {
            const scBody = document.getElementById('scurve-body');
            if (scBody) scBody.scrollLeft = body.scrollLeft;
            const resGlBody = document.getElementById('res-gl-body');
            if (resGlBody) resGlBody.scrollTop = body.scrollTop;
            if (hdrRef.current) hdrRef.current.parentElement!.scrollLeft = body.scrollLeft;
        };
        body.addEventListener('scroll', handler);
        return () => body.removeEventListener('scroll', handler);
    }, []);

    const [headerDrag, setHeaderDrag] = useState<{ startX: number, startPX: number } | null>(null);
    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        setHeaderDrag({ startX: e.clientX, startPX: PX });
    }, [PX]);
    const handleHeaderMouseMove = useCallback((e: React.MouseEvent) => {
        if (!headerDrag) return;
        const dx = e.clientX - headerDrag.startX;
        let newPX = headerDrag.startPX * (1 + dx / 400);
        newPX = Math.max(0.5, Math.min(newPX, 150));
        dispatch({ type: 'SET_PX_PER_DAY', px: newPX });
    }, [headerDrag, dispatch]);
    const handleHeaderMouseUpOrLeave = useCallback(() => {
        setHeaderDrag(null);
    }, []);

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: HDR_H, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                <canvas
                    ref={hdrRef}
                    style={{ display: 'block', cursor: 'ew-resize' }}
                    onMouseDown={handleHeaderMouseDown}
                    onMouseMove={handleHeaderMouseMove}
                    onMouseUp={handleHeaderMouseUpOrLeave}
                    onMouseLeave={handleHeaderMouseUpOrLeave}
                />
            </div>
            <div ref={bodyDivRef} id="res-gr-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>
                <canvas ref={bodyCanvasRef} style={{ display: 'block' }} />
            </div>
        </div>
    );
}
