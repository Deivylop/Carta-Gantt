import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGantt } from '../store/GanttContext';
import { dayDiff, addDays, getUsageDailyValues } from '../utils/cpm';
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

export default function TaskUsageGrid() {
    const { state, dispatch } = useGantt();
    const { visRows, usageZoom, usageMode, totalDays, timelineStart: projStart, selIdx, lightMode, activities, pxPerDay, statusDate, activeBaselineIdx, progressHistory } = state;

    // Use Gantt's pxPerDay for synchronized column widths
    const PX = pxPerDay;
    const activeZoom = usageZoom || 'week';

    const hdrRef = useRef<HTMLCanvasElement>(null);
    const bodyCanvasRef = useRef<HTMLCanvasElement>(null);
    const bodyDivRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const t = th(lightMode);
    const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

    // Measure container
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

    // Get time intervals based on zoom - using pxPerDay for width so columns match Gantt
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
            // month
            while (cur < end) {
                const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const daysInMonth = dayDiff(cur, next);
                intervals.push({ start: new Date(cur), end: next, label: cur.toLocaleDateString('es-CL', { month: 'short' }), w: daysInMonth * PX, isWeekend: false });
                cur = next;
            }
        }
        return intervals;
    }, [projStart, totalDays, activeZoom, PX]);

    // Total width matches Gantt: totalDays * pxPerDay
    const W = Math.max(totalDays * PX, containerSize.w);
    const H = Math.max(visRows.length * ROW_H + 20 * ROW_H, containerSize.h);

    const draw = useCallback(() => {
        if (!containerSize.w) return;
        const intervals = getIntervals();

        // ─── Header ─────────────────────────────────────────
        const hdrC = hdrRef.current; if (!hdrC) return;
        hdrC.width = W; hdrC.height = HDR_H;
        hdrC.style.width = W + 'px'; hdrC.style.height = HDR_H + 'px';
        const hCtx = hdrC.getContext('2d')!;
        hCtx.clearRect(0, 0, W, HDR_H);

        // Top Header (Months/Years) - using dayDiff * PX to match Gantt
        let cur = new Date(projStart);
        const end = addDays(projStart, totalDays);

        if (activeZoom === 'day' || activeZoom === 'week') {
            while (cur < end) {
                const x = dayDiff(projStart, cur) * PX;
                const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const w = Math.min(dayDiff(cur, nm) * PX, W - x);
                hCtx.fillStyle = t.hdrTopBg; hCtx.fillRect(x, 0, w, 17);
                hCtx.strokeStyle = t.hdrTopBorder; hCtx.strokeRect(x, 0, w, 17);
                hCtx.fillStyle = t.hdrTopText; hCtx.font = 'bold 10px Segoe UI';
                const lbl = cur.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
                if (w > 40) hCtx.fillText(lbl, x + 4, 12);
                cur = nm;
            }
        } else {
            // For month zoom, top header is Year
            while (cur < end) {
                const x = dayDiff(projStart, cur) * PX;
                const ny = new Date(cur.getFullYear() + 1, 0, 1);
                const w = dayDiff(cur, ny) * PX;
                hCtx.fillStyle = t.hdrTopBg; hCtx.fillRect(x, 0, w, 17);
                hCtx.strokeStyle = t.hdrTopBorder; hCtx.strokeRect(x, 0, w, 17);
                hCtx.fillStyle = t.hdrTopText; hCtx.font = 'bold 10px Segoe UI';
                if (w > 20) hCtx.fillText(String(cur.getFullYear()), x + 4, 12);
                cur = ny;
            }
        }

        // Bottom Header (Intervals)
        intervals.forEach(inv => {
            const x = dayDiff(projStart, inv.start) * PX;
            hCtx.fillStyle = inv.isWeekend ? t.hdrWeekend : t.hdrBotBg;
            hCtx.fillRect(x, 17, inv.w, 19);
            hCtx.strokeStyle = t.hdrBotBorder;
            hCtx.beginPath(); hCtx.moveTo(x, 17); hCtx.lineTo(x, HDR_H); hCtx.stroke();
            hCtx.fillStyle = inv.isWeekend ? (lightMode ? '#94a3b8' : '#374151') : t.hdrBotText;
            hCtx.font = '9px Segoe UI';
            hCtx.fillText(inv.label, x + 4, 30);
        });

        // ─── Body ───────────────────────────────────────────
        const bC = bodyCanvasRef.current; if (!bC) return;
        bC.width = W; bC.height = H;
        bC.style.width = W + 'px'; bC.style.height = H + 'px';
        const ctx = bC.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);

        if (visRows.length === 0) return;

        // Draw rows
        visRows.forEach((r, i) => {
            const y = i * ROW_H;
            const isResAssign = r._isResourceAssignment;
            ctx.fillStyle = isResAssign
                ? (lightMode ? '#f0f9ff' : '#0c1929')
                : (i % 2 === 0 ? t.rowEven : t.rowOdd);
            if (selIdx === r._idx && !isResAssign) ctx.fillStyle = lightMode ? '#e0f2fe' : '#0c4a6e';
            ctx.fillRect(0, y, W, ROW_H);
            ctx.strokeStyle = t.gridLine;
            ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(W, y + ROW_H); ctx.stroke();

            if (r._isGroupHeader) return;

            const a = activities[r._idx];
            if (!a || a._isProjRow) return;

            // Get precalculated daily values for this activity (or specific resource assignment)
            const dailyValues = getUsageDailyValues(a, usageMode as any, false, 6, r._isResourceAssignment ? r.res : undefined, activeBaselineIdx, statusDate, progressHistory);

            ctx.fillStyle = r._isResourceAssignment
                ? (lightMode ? '#2563eb' : '#60a5fa')
                : (lightMode ? '#1e293b' : '#f8fafc');
            ctx.font = r._isResourceAssignment ? 'italic 10px Segoe UI' : '10px Segoe UI';
            ctx.textAlign = 'right';

            intervals.forEach(inv => {
                const x = dayDiff(projStart, inv.start) * PX;

                // Sum the values falling in this interval
                let sum = 0;
                let cDate = new Date(inv.start);
                while (cDate < inv.end) {
                    sum += dailyValues.get(cDate.getTime()) || 0;
                    cDate.setDate(cDate.getDate() + 1);
                }

                if (sum > 0) {
                    const txt = sum.toFixed(1).replace('.0', '');
                    ctx.fillText(txt, x + inv.w - 4, y + 17);
                }

                // Draw vertical grid line
                ctx.strokeStyle = t.gridLine;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + ROW_H); ctx.stroke();
            });
        });

        // Current status date line
        if (statusDate) {
            const sdX = dayDiff(projStart, statusDate) * PX;
            ctx.beginPath();
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(sdX, 0); ctx.lineTo(sdX, H);
            ctx.stroke();
            ctx.setLineDash([]);
        }

    }, [W, H, visRows, activities, activeZoom, PX, usageMode, projStart, totalDays, t, selIdx, lightMode, getIntervals, statusDate, activeBaselineIdx, progressHistory]);

    useEffect(() => {
        draw();
    }, [draw]);

    // Set scroll handler so GanttTable can sync with it
    useEffect(() => {
        const body = bodyDivRef.current;
        if (!body) return;
        const handler = () => {
            // GanttTable has id 'gl-body'
            const glBody = document.getElementById('gl-body');
            if (glBody) glBody.scrollTop = body.scrollTop;
            if (hdrRef.current) hdrRef.current.parentElement!.scrollLeft = body.scrollLeft;
            // Sync with S-Curve if present
            const scurveBody = document.getElementById('scurve-body');
            if (scurveBody) scurveBody.scrollLeft = body.scrollLeft;
        };
        body.addEventListener('scroll', handler);
        return () => body.removeEventListener('scroll', handler);
    }, []);

    // Also when GanttTable scrolls, we need to update *this* body (id="gr-body")
    // GanttTable does `document.getElementById('gr-body').scrollTop = body.scrollTop`.

    // Canvas click
    const handleClick = useCallback((e: React.MouseEvent) => {
        const body = bodyDivRef.current;
        const rect = body?.getBoundingClientRect();
        if (!body || !rect) return;
        const my = e.clientY - rect.top;
        const i = Math.floor((my + body.scrollTop) / ROW_H);
        if (i >= 0 && i < visRows.length && !visRows[i]._isGroupHeader) {
            dispatch({ type: 'SET_SELECTION', index: visRows[i]._idx });
        }
    }, [visRows, dispatch]);

    const handleDblClick = useCallback((e: React.MouseEvent) => {
        const body = bodyDivRef.current;
        const rect = body?.getBoundingClientRect();
        if (!body || !rect) return;
        const my = e.clientY - rect.top;
        const i = Math.floor((my + body.scrollTop) / ROW_H);
        if (i >= 0 && i < visRows.length && !visRows[i]._isGroupHeader) {
            dispatch({ type: 'SET_SELECTION', index: visRows[i]._idx });
            dispatch({ type: 'OPEN_ACT_MODAL' });
        }
    }, [visRows, dispatch]);

    // ─── Header Continuous Zoom Handlers ───
    const [headerDrag, setHeaderDrag] = useState<{ startX: number, startPX: number } | null>(null);

    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        setHeaderDrag({ startX: e.clientX, startPX: PX });
    }, [PX]);

    const handleHeaderMouseMove = useCallback((e: React.MouseEvent) => {
        if (!headerDrag) return;
        const dx = e.clientX - headerDrag.startX;
        let newPX = headerDrag.startPX * (1 + dx / 400);
        newPX = Math.max(0.5, Math.min(newPX, 150)); // Clamp scale
        dispatch({ type: 'SET_PX_PER_DAY', px: newPX });
    }, [headerDrag, dispatch]);

    const handleHeaderMouseUpOrLeave = useCallback(() => {
        setHeaderDrag(null);
    }, []);

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
            {/* Header */}
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

            {/* Body */}
            <div ref={bodyDivRef} id="gr-body"
                style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}
                onClick={handleClick}
                onDoubleClick={handleDblClick}>
                <canvas ref={bodyCanvasRef} style={{ display: 'block' }} />
            </div>
        </div>
    );
}
