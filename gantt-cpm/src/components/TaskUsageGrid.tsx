import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGantt } from '../store/GanttContext';
import { dayDiff, addDays, getUsageDailyValues } from '../utils/cpm';
import type { ThemeColors } from '../types/gantt';
import DetailContextMenu from './DetailContextMenu';

const LINE_H = 16;      // height per metric line inside a row
const MIN_ROW_H = 26;   // minimum row height (single line)
const HDR_H = 36;
const DETAIL_W = 100;   // "Detalles" column width

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

// Short display labels
const SHORT_LABELS: Record<string, string> = {
    'Trabajo': 'Trab.',
    'Trabajo acumulado': 'Trab. acum.',
    'Trabajo previsto': 'Trab. prev.',
    'Trabajo previsto acumulado': 'Trab. prev. ac.',
    'Trabajo real': 'Trab. real',
    'Trabajo real acumulado': 'Trab. real ac.',
    'Trabajo restante': 'Trab. rest.',
    'Trabajo restante acumulado': 'Trab. rest. ac.',
};

// Colors: [lightMode, darkMode]
const METRIC_COLORS: Record<string, [string, string]> = {
    'Trabajo':                   ['#1e293b', '#e2e8f0'],
    'Trabajo acumulado':         ['#1e40af', '#93c5fd'],
    'Trabajo previsto':          ['#166534', '#86efac'],
    'Trabajo previsto acumulado': ['#15803d', '#4ade80'],
    'Trabajo real':              ['#9a3412', '#fdba74'],
    'Trabajo real acumulado':     ['#c2410c', '#fb923c'],
    'Trabajo restante':          ['#7e22ce', '#d8b4fe'],
    'Trabajo restante acumulado': ['#6b21a8', '#c084fc'],
};

export default function TaskUsageGrid() {
    const { state, dispatch } = useGantt();
    const { visRows, usageZoom, usageModes, totalDays, timelineStart: projStart,
        selIdx, lightMode, activities, pxPerDay, statusDate, activeBaselineIdx, progressHistory } = state;

    const PX = pxPerDay;
    const activeZoom = usageZoom || 'week';
    const modes = usageModes.length > 0 ? usageModes : ['Trabajo'];

    const hdrRef = useRef<HTMLCanvasElement>(null);
    const bodyCanvasRef = useRef<HTMLCanvasElement>(null);
    const bodyDivRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const detailCanvasRef = useRef<HTMLCanvasElement>(null);
    const t = th(lightMode);
    const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

    // Row height: multi-line for activities & resource rows, single for summaries/groupHeaders
    const rowH = useCallback((r: any): number => {
        if (r._isGroupHeader) return MIN_ROW_H;
        const a = activities[r._idx];
        if (!a || a._isProjRow || a.type === 'summary') return MIN_ROW_H;
        return Math.max(MIN_ROW_H, modes.length * LINE_H + 4);
    }, [activities, modes.length]);

    // Cumulative Y offsets
    const yOffsets = useMemo(() => {
        const off: number[] = [];
        let y = 0;
        visRows.forEach(r => { off.push(y); y += rowH(r); });
        off.push(y);
        return off;
    }, [visRows, rowH]);

    const totalH = yOffsets[yOffsets.length - 1] || 0;

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

    // Time intervals
    const getIntervals = useCallback(() => {
        const intervals: { start: Date; end: Date; label: string; w: number; isWeekend: boolean }[] = [];
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

    const W = Math.max(totalDays * PX, containerSize.w - DETAIL_W);
    const H = Math.max(totalH, containerSize.h);

    // ─── DRAW ─────────────────────────────────────────────────
    const draw = useCallback(() => {
        if (!containerSize.w) return;
        const intervals = getIntervals();

        // ── Detail Header (fixed left) ──
        const hdC = hdrDetailRef.current;
        if (hdC) {
            hdC.width = DETAIL_W; hdC.height = HDR_H;
            const dh = hdC.getContext('2d')!;
            dh.clearRect(0, 0, DETAIL_W, HDR_H);
            dh.fillStyle = t.hdrTopBg; dh.fillRect(0, 0, DETAIL_W, 17);
            dh.strokeStyle = t.hdrTopBorder; dh.strokeRect(0, 0, DETAIL_W, 17);
            dh.fillStyle = t.hdrBotBg; dh.fillRect(0, 17, DETAIL_W, 19);
            dh.strokeStyle = t.hdrBotBorder; dh.strokeRect(0, 17, DETAIL_W, 19);
            dh.fillStyle = t.hdrTopText; dh.font = 'bold 10px Segoe UI';
            dh.fillText('Detalles', 6, 30);
            // Small dropdown triangle
            dh.beginPath();
            dh.moveTo(DETAIL_W - 16, 27);
            dh.lineTo(DETAIL_W - 10, 27);
            dh.lineTo(DETAIL_W - 13, 31);
            dh.closePath();
            dh.fillStyle = t.hdrTopText;
            dh.fill();
        }

        // ── Time Header (scrollable) ──
        const hdrC = hdrRef.current; if (!hdrC) return;
        hdrC.width = W; hdrC.height = HDR_H;
        hdrC.style.width = W + 'px'; hdrC.style.height = HDR_H + 'px';
        const hCtx = hdrC.getContext('2d')!;
        hCtx.clearRect(0, 0, W, HDR_H);

        // Top header row (months/years)
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

        // Bottom header (intervals)
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

        // ── Detail Labels Column ──
        const dC = detailCanvasRef.current; if (!dC) return;
        dC.width = DETAIL_W; dC.height = H;
        dC.style.width = DETAIL_W + 'px'; dC.style.height = H + 'px';
        const dCtx = dC.getContext('2d')!;
        dCtx.clearRect(0, 0, DETAIL_W, H);

        visRows.forEach((r, i) => {
            const y = yOffsets[i];
            const rh = yOffsets[i + 1] - y;
            const a = activities[r._idx];
            const showMetrics = a && !a._isProjRow && a.type !== 'summary' && !r._isGroupHeader;

            // Background
            dCtx.fillStyle = r._isResourceAssignment
                ? (lightMode ? '#f0f9ff' : '#0c1929')
                : (i % 2 === 0 ? t.rowEven : t.rowOdd);
            if (selIdx === r._idx && !r._isResourceAssignment) dCtx.fillStyle = lightMode ? '#e0f2fe' : '#0c4a6e';
            dCtx.fillRect(0, y, DETAIL_W, rh);
            // Bottom border
            dCtx.strokeStyle = t.gridLine;
            dCtx.beginPath(); dCtx.moveTo(0, y + rh); dCtx.lineTo(DETAIL_W, y + rh); dCtx.stroke();
            // Right border
            dCtx.beginPath(); dCtx.moveTo(DETAIL_W - 0.5, y); dCtx.lineTo(DETAIL_W - 0.5, y + rh); dCtx.stroke();

            if (showMetrics && modes.length > 0) {
                dCtx.font = '9px Segoe UI';
                modes.forEach((mode, mi) => {
                    const [lc, dc] = METRIC_COLORS[mode] || ['#1e293b', '#e2e8f0'];
                    dCtx.fillStyle = lightMode ? lc : dc;
                    const lineY = y + 2 + mi * LINE_H + 11;
                    dCtx.fillText(SHORT_LABELS[mode] || mode, 4, lineY);
                });
            }
        });

        // ── Time-grid Body ──
        const bC = bodyCanvasRef.current; if (!bC) return;
        bC.width = W; bC.height = H;
        bC.style.width = W + 'px'; bC.style.height = H + 'px';
        const ctx = bC.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);

        if (visRows.length === 0) return;

        visRows.forEach((r, i) => {
            const y = yOffsets[i];
            const rh = yOffsets[i + 1] - y;

            // Row background
            const isRes = r._isResourceAssignment;
            ctx.fillStyle = isRes
                ? (lightMode ? '#f0f9ff' : '#0c1929')
                : (i % 2 === 0 ? t.rowEven : t.rowOdd);
            if (selIdx === r._idx && !isRes) ctx.fillStyle = lightMode ? '#e0f2fe' : '#0c4a6e';
            ctx.fillRect(0, y, W, rh);
            ctx.strokeStyle = t.gridLine;
            ctx.beginPath(); ctx.moveTo(0, y + rh); ctx.lineTo(W, y + rh); ctx.stroke();

            if (r._isGroupHeader) return;
            const a = activities[r._idx];
            if (!a || a._isProjRow) return;

            // Summaries: only first mode, single-line
            const rowModes = (a.type === 'summary')
                ? [modes[0]]
                : modes;

            rowModes.forEach((mode, mi) => {
                const dailyValues = getUsageDailyValues(
                    a, mode as any, false, 6,
                    isRes ? r.res : undefined,
                    activeBaselineIdx, statusDate, progressHistory
                );

                const [lc, dc] = METRIC_COLORS[mode] || ['#1e293b', '#e2e8f0'];
                ctx.fillStyle = lightMode ? lc : dc;
                ctx.font = (isRes ? 'italic ' : '') + '9px Segoe UI';
                ctx.textAlign = 'right';

                const lineY = (a.type === 'summary')
                    ? y + 17
                    : y + 2 + mi * LINE_H + 11;

                intervals.forEach(inv => {
                    const x = dayDiff(projStart, inv.start) * PX;

                    let sum = 0;
                    let cd = new Date(inv.start);
                    while (cd < inv.end) {
                        sum += dailyValues.get(cd.getTime()) || 0;
                        cd.setDate(cd.getDate() + 1);
                    }

                    if (sum > 0) {
                        const txt = sum >= 100
                            ? Math.round(sum) + 'h'
                            : sum.toFixed(1).replace('.0', '') + 'h';
                        ctx.fillText(txt, x + inv.w - 3, lineY);
                    }

                    // Vertical grid
                    ctx.strokeStyle = t.gridLine;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rh); ctx.stroke();
                });
            });

            // Thin separator lines between metrics within a row
            if (rowModes.length > 1) {
                ctx.strokeStyle = lightMode ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
                ctx.setLineDash([2, 2]);
                for (let mi = 1; mi < rowModes.length; mi++) {
                    const sepY = y + 2 + mi * LINE_H - 2;
                    ctx.beginPath(); ctx.moveTo(0, sepY); ctx.lineTo(W, sepY); ctx.stroke();
                }
                ctx.setLineDash([]);
            }
        });

        // Status date line
        if (statusDate) {
            const sdX = dayDiff(projStart, statusDate) * PX;
            ctx.beginPath();
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(sdX, 0); ctx.lineTo(sdX, H);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
        }

    }, [W, H, visRows, activities, activeZoom, PX, modes, projStart, totalDays, t, selIdx,
        lightMode, getIntervals, statusDate, activeBaselineIdx, progressHistory, yOffsets]);

    useEffect(() => { draw(); }, [draw]);

    // Scroll sync
    useEffect(() => {
        const body = bodyDivRef.current;
        if (!body) return;
        const handler = () => {
            const glBody = document.getElementById('gl-body');
            if (glBody) glBody.scrollTop = body.scrollTop;
            if (hdrRef.current) hdrRef.current.parentElement!.scrollLeft = body.scrollLeft;
            // Keep detail column in sync vertically
            const detDiv = document.getElementById('usage-detail-col');
            if (detDiv) detDiv.scrollTop = body.scrollTop;
            const scurveBody = document.getElementById('scurve-body');
            if (scurveBody) scurveBody.scrollLeft = body.scrollLeft;
        };
        body.addEventListener('scroll', handler);
        return () => body.removeEventListener('scroll', handler);
    }, []);

    // Click → find row by Y
    const findRow = useCallback((clientY: number) => {
        const body = bodyDivRef.current;
        const rect = body?.getBoundingClientRect();
        if (!body || !rect) return -1;
        const my = clientY - rect.top + body.scrollTop;
        for (let i = 0; i < visRows.length; i++) {
            if (my >= yOffsets[i] && my < yOffsets[i + 1]) return i;
        }
        return -1;
    }, [visRows, yOffsets]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        const i = findRow(e.clientY);
        if (i >= 0 && !visRows[i]._isGroupHeader) dispatch({ type: 'SET_SELECTION', index: visRows[i]._idx });
    }, [visRows, dispatch, findRow]);

    const handleDblClick = useCallback((e: React.MouseEvent) => {
        const i = findRow(e.clientY);
        if (i >= 0 && !visRows[i]._isGroupHeader) {
            dispatch({ type: 'SET_SELECTION', index: visRows[i]._idx });
            dispatch({ type: 'OPEN_ACT_MODAL' });
        }
    }, [visRows, dispatch, findRow]);

    // Header drag-zoom
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

    const [headerDrag, setHeaderDrag] = useState<{ startX: number; startPX: number } | null>(null);
    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => { setHeaderDrag({ startX: e.clientX, startPX: PX }); }, [PX]);
    const handleHeaderMouseMove = useCallback((e: React.MouseEvent) => {
        if (!headerDrag) return;
        let newPX = headerDrag.startPX * (1 + (e.clientX - headerDrag.startX) / 400);
        newPX = Math.max(0.5, Math.min(newPX, 150));
        dispatch({ type: 'SET_PX_PER_DAY', px: newPX });
    }, [headerDrag, dispatch]);
    const handleHeaderMouseUpOrLeave = useCallback(() => { setHeaderDrag(null); }, []);

    const hdrDetailRef = useRef<HTMLCanvasElement>(null);

    /* Context menu handlers */
    const handleDetailContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const handleDetailHeaderClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setCtxMenu({ x: rect.left, y: rect.bottom + 2 });
    }, []);

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
            {/* Context menu for metric selection */}
            {ctxMenu && <DetailContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} />}

            {/* Header row: fixed Detail header + scrollable time header */}
            <div style={{ height: HDR_H, flexShrink: 0, display: 'flex', overflow: 'hidden' }}>
                {/* Fixed "Detalles" header — clickable */}
                <div style={{ width: DETAIL_W, flexShrink: 0, overflow: 'hidden', cursor: 'pointer' }}
                    onClick={handleDetailHeaderClick}
                    onContextMenu={handleDetailContextMenu}
                    title="Clic para seleccionar campos de detalle">
                    <canvas ref={hdrDetailRef}
                        style={{ display: 'block', width: DETAIL_W, height: HDR_H, pointerEvents: 'none' }}
                    />
                </div>
                {/* Scrollable time header */}
                <div id="usage-hdr-scroll" style={{ flex: 1, overflow: 'hidden' }}>
                    <canvas ref={hdrRef}
                        style={{ display: 'block', cursor: 'ew-resize' }}
                        onMouseDown={handleHeaderMouseDown}
                        onMouseMove={handleHeaderMouseMove}
                        onMouseUp={handleHeaderMouseUpOrLeave}
                        onMouseLeave={handleHeaderMouseUpOrLeave}
                    />
                </div>
            </div>

            {/* Body row: fixed Detail labels + scrollable time grid */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Fixed "Detalles" label column — right-click opens metric selector */}
                <div id="usage-detail-col"
                    onContextMenu={handleDetailContextMenu}
                    style={{ width: DETAIL_W, flexShrink: 0, overflowY: 'hidden', overflowX: 'hidden' }}>
                    <canvas ref={detailCanvasRef} style={{ display: 'block', pointerEvents: 'none' }} />
                </div>

                {/* Scrollable time grid */}
                <div ref={bodyDivRef} id="gr-body"
                    style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}
                    onClick={handleClick}
                    onDoubleClick={handleDblClick}>
                    <canvas ref={bodyCanvasRef} style={{ display: 'block' }} />
                </div>
            </div>
        </div>
    );
}
