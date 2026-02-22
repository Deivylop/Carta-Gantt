// ═══════════════════════════════════════════════════════════════════
// Gantt Timeline – Canvas-based chart with connection lines,
// bar drag (move/resize/link), tooltips, and full visual parity
// ═══════════════════════════════════════════════════════════════════
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGantt } from '../store/GanttContext';
import { dayDiff, addDays, fmtDate, isoDate } from '../utils/cpm';
import type { ThemeColors } from '../types/gantt';

const ROW_H = 26;
const HDR_H = 36;
const CAL_F: Record<number, number> = { 5: 7 / 5, 6: 7 / 6, 7: 1 };

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

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    if (w < 0) w = 0; if (h < 0) h = 0; if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

// Bar hit test zones: body=move, right edge=resize, beyond=link
interface BarHit { visIdx: number; zone: 'move' | 'resize-r' | 'link' }
interface DragState {
    mode: 'move' | 'resize' | 'link';
    idx: number; visIdx: number; startMX: number;
    origES: Date; origDur: number; origEF: Date | null;
    linkFromIdx?: number;
}
interface DragPreview {
    x?: number; y?: number; w?: number; h?: number;
    mode?: string; dateLabel?: string; durLabel?: string;
    sx?: number; sy?: number; ex?: number; ey?: number;
}

export default function GanttTimeline() {
    const { state, dispatch } = useGantt();
    const { visRows, zoom, totalDays, timelineStart: projStart, statusDate, selIdx, lightMode, activities, defCal, pxPerDay } = state;
    const PX = pxPerDay;
    const hdrRef = useRef<HTMLCanvasElement>(null);
    const barRef = useRef<HTMLCanvasElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const connLinesRef = useRef<any[]>([]);
    const t = th(lightMode);
    const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

    // Drag state refs (for mousedown/mousemove/mouseup)
    const dragRef = useRef<DragState | null>(null);
    const dragPreviewRef = useRef<DragPreview | null>(null);
    const didDragRef = useRef(false);
    const suppressClickRef = useRef(false);

    // Continuous timescale zoom state
    const [headerDrag, setHeaderDrag] = useState<{ startX: number; startPX: number } | null>(null);

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

    const W = Math.max(totalDays * PX, containerSize.w);
    const H = Math.max(visRows.length * ROW_H + 20 * ROW_H, containerSize.h);

    // Hit test a bar for drag zones
    const hitTestBar = useCallback((mx: number, my: number): BarHit | null => {
        const scrollTop = bodyRef.current?.scrollTop || 0;
        const vi = Math.floor((my + scrollTop) / ROW_H);
        if (vi < 0 || vi >= visRows.length) return null;
        const r = visRows[vi];
        if (r._isGroupHeader) return null;
        if (!r.ES || r.type === 'summary' || r.type === 'milestone' || r._isProjRow) return null;
        const bx = Math.max(0, dayDiff(projStart, r.ES) * PX);
        const efX = r.EF ? dayDiff(projStart, r.EF) * PX : bx;
        const bw = Math.max(4, efX - bx);
        const bh = ROW_H - 10;
        const barTop = vi * ROW_H + 5;
        const barBot = barTop + bh;
        const absY = my + scrollTop;
        if (absY < barTop || absY > barBot) return null;
        const EDGE = Math.min(7, Math.max(3, bw * 0.25));
        const LINK_ZONE = 12;
        if (mx > bx + bw + 2 && mx <= bx + bw + LINK_ZONE) return { visIdx: vi, zone: 'link' };
        if (mx >= bx + bw - EDGE && mx <= bx + bw + 2) return { visIdx: vi, zone: 'resize-r' };
        if (mx >= bx + EDGE && mx < bx + bw - EDGE) return { visIdx: vi, zone: 'move' };
        if (mx >= bx - 3 && mx < bx + EDGE) return { visIdx: vi, zone: 'resize-r' };
        return null;
    }, [visRows, projStart, PX]);

    // Draw drag overlay (preview bar or link line)
    const drawDragOverlay = useCallback(() => {
        const canvas = barRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const preview = dragPreviewRef.current;
        if (!preview) return;

        if (preview.mode === 'move' || preview.mode === 'resize') {
            // Semi-transparent rectangle preview
            ctx.save();
            ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
            ctx.fillStyle = 'rgba(99,102,241,.15)';
            rrect(ctx, preview.x!, preview.y!, preview.w!, preview.h!, 3);
            ctx.fill(); ctx.stroke();
            ctx.setLineDash([]);
            // Label
            ctx.fillStyle = '#c7d2fe'; ctx.font = 'bold 10px Segoe UI';
            const label = preview.mode === 'move' ? preview.dateLabel : preview.durLabel;
            if (label) ctx.fillText(label, preview.x! + 4, preview.y! - 4);
            ctx.restore();
        } else if (preview.sx !== undefined) {
            // Link drag line
            ctx.save();
            ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
            ctx.beginPath(); ctx.moveTo(preview.sx!, preview.sy!); ctx.lineTo(preview.ex!, preview.ey!); ctx.stroke();
            ctx.setLineDash([]);
            // Arrow
            ctx.fillStyle = '#818cf8';
            ctx.beginPath();
            ctx.arc(preview.ex!, preview.ey!, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }, []);

    const draw = useCallback(() => {
        // ─── Header ─────────────────────────────────────────
        const hdrC = hdrRef.current; if (!hdrC) return;
        hdrC.width = W; hdrC.height = HDR_H;
        hdrC.style.width = W + 'px'; hdrC.style.height = HDR_H + 'px';
        const hCtx = hdrC.getContext('2d')!;
        hCtx.clearRect(0, 0, W, HDR_H);

        // Month headers
        let cur = new Date(projStart);
        const end = addDays(projStart, totalDays);
        while (cur < end) {
            const x = dayDiff(projStart, cur) * PX;
            const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            const w = Math.min(dayDiff(cur, nm) * PX, W - x);
            hCtx.fillStyle = t.hdrTopBg; hCtx.fillRect(x, 0, w, 17);
            hCtx.strokeStyle = t.hdrTopBorder; hCtx.strokeRect(x, 0, w, 17);
            hCtx.fillStyle = t.hdrTopText; hCtx.font = 'bold 10px Segoe UI';
            const lbl = cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
            if (w > 24) hCtx.fillText(lbl, x + 4, 12);
            cur = nm;
        }
        // Day/week/month sub-headers
        cur = new Date(projStart);
        while (cur < end) {
            const x = dayDiff(projStart, cur) * PX;
            if (zoom === 'month') {
                const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); const w = dayDiff(cur, nm) * PX;
                hCtx.fillStyle = t.hdrBotBg; hCtx.fillRect(x, 17, w, 19);
                hCtx.strokeStyle = t.hdrBotBorder; hCtx.beginPath(); hCtx.moveTo(x, 17); hCtx.lineTo(x, HDR_H); hCtx.stroke();
                cur = nm;
            } else if (zoom === 'week') {
                const w = 7 * PX; hCtx.fillStyle = t.hdrBotBg; hCtx.fillRect(x, 17, w, 19);
                hCtx.strokeStyle = t.hdrBotBorder; hCtx.beginPath(); hCtx.moveTo(x, 17); hCtx.lineTo(x, HDR_H); hCtx.stroke();
                const dd = 'S ' + String(cur.getDate()).padStart(2, '0') + '/' + String(cur.getMonth() + 1).padStart(2, '0');
                hCtx.fillStyle = t.hdrBotText; hCtx.font = '9px Segoe UI';
                if (PX * 7 > 40) hCtx.fillText(dd, x + 2, 30);
                cur.setDate(cur.getDate() + 7);
            } else {
                const isSun = cur.getDay() === 0, isSat = cur.getDay() === 6;
                hCtx.fillStyle = isSun || isSat ? t.hdrWeekend : t.hdrBotBg; hCtx.fillRect(x, 17, PX, 19);
                hCtx.strokeStyle = t.hdrBotBorder; hCtx.beginPath(); hCtx.moveTo(x, 17); hCtx.lineTo(x, HDR_H); hCtx.stroke();
                const days = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
                hCtx.fillStyle = isSun || isSat ? (lightMode ? '#94a3b8' : '#374151') : t.hdrBotText; hCtx.font = '9px Segoe UI';
                if (PX >= 18) hCtx.fillText(days[cur.getDay()], x + 2, 30);
                else if (PX >= 14) hCtx.fillText(String(cur.getDate()), x + 2, 30);
                cur.setDate(cur.getDate() + 1);
            }
        }
        const today = new Date(); const todayX = dayDiff(projStart, today) * PX;
        if (todayX >= 0 && todayX <= W) { hCtx.fillStyle = '#f59e0b'; hCtx.fillRect(todayX, 0, 2, HDR_H); }
        if (statusDate) {
            const sdx = dayDiff(projStart, statusDate) * PX;
            if (sdx >= 0 && sdx <= W) { hCtx.fillStyle = '#06b6d4'; hCtx.fillRect(sdx, 0, 2, HDR_H); }
        }

        // ─── Body canvas ────────────────────────────────────
        const barC = barRef.current; if (!barC) return;
        barC.width = W; barC.height = H;
        barC.style.width = W + 'px'; barC.style.height = H + 'px';
        const ctx = barC.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);

        const tx = dayDiff(projStart, new Date()) * PX;

        // Row backgrounds
        visRows.forEach((r, i) => {
            if (r._isGroupHeader) {
                ctx.fillStyle = lightMode ? '#ede9fe' : '#1a1040'; ctx.fillRect(0, i * ROW_H, W, ROW_H);
                ctx.strokeStyle = lightMode ? '#818cf8' : '#4f46e5'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(0, i * ROW_H + ROW_H); ctx.lineTo(W, i * ROW_H + ROW_H); ctx.stroke();
            } else {
                ctx.fillStyle = i % 2 === 0 ? t.rowEven : t.rowOdd; ctx.fillRect(0, i * ROW_H, W, ROW_H);
            }
        });

        // Grid lines
        cur = new Date(projStart);
        while (cur < end) {
            const x = dayDiff(projStart, cur) * PX; const isM = cur.getDate() === 1;
            ctx.strokeStyle = isM ? t.gridMonth : t.gridLine; ctx.lineWidth = isM ? 1 : 0.4;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            if (zoom === 'month') cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            else if (zoom === 'week') cur.setDate(cur.getDate() + 7);
            else cur.setDate(cur.getDate() + 1);
        }

        // Today + Status Date lines
        if (tx >= 0 && tx <= W) { ctx.fillStyle = t.todayLine; ctx.fillRect(tx, 0, 2, H); }
        if (statusDate) {
            const sx = dayDiff(projStart, statusDate) * PX;
            if (sx >= 0 && sx <= W) { ctx.fillStyle = t.statusLine; ctx.fillRect(sx, 0, 2, H); }
        }

        // Draw bars
        visRows.forEach((r, i) => {
            if (!r.ES) return;
            const y = i * ROW_H;
            const bx = Math.max(0, dayDiff(projStart, r.ES) * PX);
            const efX = r.EF ? dayDiff(projStart, r.EF) * PX : bx;
            const bw = Math.max(r.type === 'milestone' ? 0 : 4, efX - bx);
            const by = y + 5, bh = ROW_H - 10;
            const color = r.crit ? '#ef4444' : (r.lv <= 1 ? '#6366f1' : '#3b82f6');

            if (r.type === 'milestone') {
                const mx = bx, my = y + ROW_H / 2, sz = 7;
                ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.PI / 4);
                ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.rect(-sz / 2, -sz / 2, sz, sz); ctx.fill();
                ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
                ctx.fillStyle = lightMode ? '#92400e' : '#fbbf24'; ctx.font = 'bold 9px Segoe UI';
                ctx.fillText(fmtDate(r.ES), mx + 10, my + 3.5);
            } else if (r.type === 'summary') {
                const sy = y + 6, sh = 6, brkH = 10;
                const sColor = r.crit ? '#ef4444' : t.summaryBar;
                ctx.fillStyle = sColor;
                ctx.fillRect(bx, sy, Math.max(bw, 2), sh);
                ctx.beginPath(); ctx.moveTo(bx, sy); ctx.lineTo(bx + 6, sy); ctx.lineTo(bx, sy + brkH); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(bx + bw, sy); ctx.lineTo(bx + bw - 6, sy); ctx.lineTo(bx + bw, sy + brkH); ctx.closePath(); ctx.fill();
                if ((r.pct || 0) > 0) { const pw = bw * r.pct / 100; ctx.fillStyle = '#22c55ecc'; ctx.fillRect(bx, sy, pw, sh); }
                // Label — always show for summary bars
                ctx.fillStyle = t.barLabelOut; ctx.font = 'bold 9px Segoe UI';
                const lbl = (r.dur || 0) + 'd' + (r.pct ? ' ' + r.pct + '%' : '');
                const lblW = ctx.measureText(lbl).width;
                if (lblW < bw - 8) ctx.fillText(lbl, bx + 5, y + ROW_H / 2 + 9);
                else ctx.fillText(lbl, bx + bw + 4, y + ROW_H / 2 + 9); // outside
            } else {
                const pct = r.pct || 0;
                ctx.fillStyle = color;
                if (!lightMode) { ctx.shadowColor = color; ctx.shadowBlur = 3; }
                rrect(ctx, bx, by, bw, bh, 3); ctx.fill();
                if (!lightMode) ctx.shadowBlur = 0;
                if (lightMode) {
                    ctx.strokeStyle = r.crit ? '#b91c1c' : (r.lv <= 1 ? '#4338ca' : '#1d4ed8');
                    ctx.lineWidth = 1; rrect(ctx, bx, by, bw, bh, 3); ctx.stroke();
                }
                // Progress fill
                if (pct > 0 && statusDate && r.ES) {
                    const sdX = dayDiff(projStart, statusDate) * PX;
                    const progressW = Math.min(Math.max(0, sdX - bx), bw);
                    if (progressW > 0) { ctx.fillStyle = lightMode ? '#22c55eaa' : '#22c55e99'; rrect(ctx, bx, by, progressW, bh, 3); ctx.fill(); }
                } else if (pct > 0) {
                    const pw = bw * pct / 100; ctx.fillStyle = lightMode ? '#22c55eaa' : '#22c55e99'; rrect(ctx, bx, by, pw, bh, 3); ctx.fill();
                }
                // Gradient sheen
                const g = ctx.createLinearGradient(0, by, 0, by + bh);
                g.addColorStop(0, t.gradTop); g.addColorStop(1, t.gradBot);
                ctx.fillStyle = g; rrect(ctx, bx, by, bw, bh, 3); ctx.fill();
                // Label — ALWAYS show, either inside or outside bar
                const lbl = (r.dur || 0) + 'd' + (pct ? ' ' + pct + '%' : '');
                const lblW = ctx.measureText(lbl).width;
                ctx.font = (r.lv <= 1 ? 'bold ' : '') + '9px Segoe UI';
                if (lblW < bw - 8) {
                    // Inside bar
                    ctx.fillStyle = t.barLabel;
                    ctx.fillText(lbl, bx + 5, y + ROW_H / 2 + 3.5);
                } else {
                    // Outside bar (to the right)
                    ctx.fillStyle = t.barLabelOut;
                    ctx.fillText(lbl, bx + bw + 4, y + ROW_H / 2 + 3.5);
                }

                // Draw resize/link hit zones as subtle handles (only on hover)
                // This is pure visual — actual hit-test is in hitTestBar
            }
            // Baseline
            if (r.blES && r.blEF && r.type !== 'milestone' && r.type !== 'summary') {
                const blBx = Math.max(0, dayDiff(projStart, r.blES) * PX);
                const blEx = dayDiff(projStart, r.blEF) * PX;
                const blBw = Math.max(2, blEx - blBx);
                const blBy = y + ROW_H - 6, blBh = 4;
                ctx.fillStyle = t.blBar; rrect(ctx, blBx, blBy, blBw, blBh, 2); ctx.fill();
            } else if (r.blES && r.type === 'milestone') {
                const bmx = dayDiff(projStart, r.blES) * PX, bmy = y + ROW_H - 4;
                ctx.save(); ctx.translate(bmx, bmy); ctx.rotate(Math.PI / 4);
                ctx.strokeStyle = t.blDiamond; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.rect(-3, -3, 6, 6); ctx.stroke(); ctx.restore();
            }
        });

        // ─── Connection Lines (dependency arrows) ───────────
        connLinesRef.current = [];
        const vrById: Record<string, number> = {};
        visRows.forEach((r, i) => { vrById[r.id] = i; });

        visRows.forEach((r, sucVi) => {
            if (!r.preds || !r.preds.length) return;
            r.preds.forEach((p, predIdx) => {
                const predVi = vrById[p.id];
                if (predVi === undefined) return;
                const pred = visRows[predVi];
                if (!pred || !pred.ES || !r.ES) return;
                if (pred.type === 'summary' || r.type === 'summary') return;

                const isCrit = !!(pred.crit && r.crit);
                ctx.strokeStyle = isCrit ? t.connCrit : t.connLine;
                ctx.fillStyle = isCrit ? t.connCrit : t.connLine;
                ctx.lineWidth = 1.2;

                const predY = predVi * ROW_H + ROW_H / 2;
                const sucY = sucVi * ROW_H + ROW_H / 2;
                let sx: number, sy: number, ex: number, ey: number;

                if (p.type === 'FS') { sx = dayDiff(projStart, pred.EF!) * PX; sy = predY; ex = dayDiff(projStart, r.ES) * PX; ey = sucY; }
                else if (p.type === 'SS') { sx = dayDiff(projStart, pred.ES!) * PX; sy = predY; ex = dayDiff(projStart, r.ES) * PX; ey = sucY; }
                else if (p.type === 'FF') { sx = dayDiff(projStart, pred.EF!) * PX; sy = predY; ex = dayDiff(projStart, r.EF!) * PX; ey = sucY; }
                else if (p.type === 'SF') { sx = dayDiff(projStart, pred.ES!) * PX; sy = predY; ex = dayDiff(projStart, r.EF!) * PX; ey = sucY; }
                else { sx = dayDiff(projStart, pred.EF!) * PX; sy = predY; ex = dayDiff(projStart, r.ES) * PX; ey = sucY; }

                const segs: any[] = [];
                ctx.beginPath();
                if (p.type === 'FS' || p.type === 'SF') {
                    if (ex > sx + 12) {
                        const bendX = sx + 6;
                        ctx.moveTo(sx, sy); ctx.lineTo(bendX, sy); ctx.lineTo(bendX, ey); ctx.lineTo(ex, ey);
                        segs.push({ x1: sx, y1: sy, x2: bendX, y2: sy }, { x1: bendX, y1: sy, x2: bendX, y2: ey }, { x1: bendX, y1: ey, x2: ex, y2: ey });
                    } else {
                        const detourY = ey > sy ? Math.max(ey, sy) + (ROW_H / 2 + 2) : Math.min(ey, sy) - (ROW_H / 2 + 2);
                        ctx.moveTo(sx, sy); ctx.lineTo(sx + 8, sy); ctx.lineTo(sx + 8, detourY); ctx.lineTo(ex - 8, detourY); ctx.lineTo(ex - 8, ey); ctx.lineTo(ex, ey);
                        segs.push({ x1: sx, y1: sy, x2: sx + 8, y2: sy }, { x1: sx + 8, y1: sy, x2: sx + 8, y2: detourY }, { x1: sx + 8, y1: detourY, x2: ex - 8, y2: detourY }, { x1: ex - 8, y1: detourY, x2: ex - 8, y2: ey }, { x1: ex - 8, y1: ey, x2: ex, y2: ey });
                    }
                } else if (p.type === 'SS') {
                    const leftX = Math.min(sx, ex) - 10;
                    ctx.moveTo(sx, sy); ctx.lineTo(leftX, sy); ctx.lineTo(leftX, ey); ctx.lineTo(ex, ey);
                    segs.push({ x1: sx, y1: sy, x2: leftX, y2: sy }, { x1: leftX, y1: sy, x2: leftX, y2: ey }, { x1: leftX, y1: ey, x2: ex, y2: ey });
                } else if (p.type === 'FF') {
                    const rightX = Math.max(sx, ex) + 10;
                    ctx.moveTo(sx, sy); ctx.lineTo(rightX, sy); ctx.lineTo(rightX, ey); ctx.lineTo(ex, ey);
                    segs.push({ x1: sx, y1: sy, x2: rightX, y2: sy }, { x1: rightX, y1: sy, x2: rightX, y2: ey }, { x1: rightX, y1: ey, x2: ex, y2: ey });
                } else {
                    ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx + 6, ey); ctx.lineTo(ex, ey);
                    segs.push({ x1: sx, y1: sy, x2: sx + 6, y2: sy }, { x1: sx + 6, y1: sy, x2: sx + 6, y2: ey }, { x1: sx + 6, y1: ey, x2: ex, y2: ey });
                }
                ctx.stroke();
                connLinesRef.current.push({ sucId: r.id, predId: p.id, predIdx, type: p.type, lag: p.lag || 0, segments: segs });

                // Arrowhead
                const aLen = 5, aW = 3;
                const isLeft = (p.type === 'SS' || p.type === 'FS');
                if (isLeft) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - aLen, ey - aW); ctx.lineTo(ex - aLen, ey + aW); ctx.closePath(); ctx.fill(); }
                else { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + aLen, ey - aW); ctx.lineTo(ex + aLen, ey + aW); ctx.closePath(); ctx.fill(); }
            });
        });

        // Selection highlight
        if (selIdx >= 0) {
            const vi = visRows.findIndex(v => v._idx === selIdx);
            if (vi >= 0) { ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5; ctx.strokeRect(0, vi * ROW_H, W, ROW_H); }
        }

        // Draw drag overlay if active
        if (dragPreviewRef.current) drawDragOverlay();
    }, [visRows, zoom, totalDays, projStart, statusDate, selIdx, lightMode, activities, W, H, t, PX, defCal, drawDragOverlay]);

    useEffect(() => { draw(); }, [draw]);

    // Go today event
    useEffect(() => {
        const handler = () => {
            const body = bodyRef.current;
            if (body) body.scrollLeft = Math.max(0, dayDiff(projStart, new Date()) * PX - 300);
        };
        window.addEventListener('gantt-go-today', handler);
        return () => window.removeEventListener('gantt-go-today', handler);
    }, [projStart, PX]);

    // Scroll sync
    useEffect(() => {
        const body = bodyRef.current; if (!body) return;
        const handler = () => {
            const glBody = document.getElementById('gl-body');
            if (glBody) glBody.scrollTop = body.scrollTop;
            const hdrWrap = body.previousElementSibling as HTMLElement;
            if (hdrWrap) hdrWrap.scrollLeft = body.scrollLeft;
            // Sync with S-Curve if present
            const scurveBody = document.getElementById('scurve-body');
            if (scurveBody) scurveBody.scrollLeft = body.scrollLeft;
        };
        body.addEventListener('scroll', handler);
        return () => body.removeEventListener('scroll', handler);
    }, []);

    // ─── Header Continuous Zoom Handlers ───
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

    // ─── Bar Drag Interactions (move/resize/link) ────────────
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const canvas = barRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const body = bodyRef.current;
        const scrollLeft = body?.scrollLeft || 0;
        const mx = e.clientX - rect.left + scrollLeft;
        const my = e.clientY - rect.top;
        const hit = hitTestBar(mx, my);
        if (!hit) return;

        const r = visRows[hit.visIdx];
        const a = activities[r._idx];
        if (!a || a._isProjRow || a.type === 'summary') return;

        e.preventDefault();
        didDragRef.current = false;
        dispatch({ type: 'SET_SELECTION', index: r._idx });

        if (hit.zone === 'move') {
            dragRef.current = {
                mode: 'move', idx: r._idx, visIdx: hit.visIdx, startMX: mx,
                origES: new Date(r.ES!), origDur: r.dur || 0, origEF: r.EF ? new Date(r.EF) : null
            };
        } else if (hit.zone === 'resize-r') {
            dragRef.current = {
                mode: 'resize', idx: r._idx, visIdx: hit.visIdx, startMX: mx,
                origES: new Date(r.ES!), origDur: r.dur || 0, origEF: r.EF ? new Date(r.EF) : null
            };
        } else if (hit.zone === 'link') {
            const efX = r.EF ? dayDiff(projStart, r.EF) * PX : 0;
            const scrollTop = body?.scrollTop || 0;
            dragRef.current = {
                mode: 'link', idx: r._idx, visIdx: hit.visIdx, startMX: mx,
                origES: new Date(r.ES!), origDur: r.dur || 0, origEF: r.EF ? new Date(r.EF) : null,
                linkFromIdx: r._idx
            };
            dragPreviewRef.current = { sx: efX, sy: hit.visIdx * ROW_H + ROW_H / 2, ex: mx, ey: my + scrollTop };
        }
    }, [visRows, activities, projStart, PX, dispatch, hitTestBar]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const canvas = barRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const body = bodyRef.current;
        const scrollLeft = body?.scrollLeft || 0;
        const scrollTop = body?.scrollTop || 0;
        const mx = e.clientX - rect.left + scrollLeft;
        const my = e.clientY - rect.top;

        if (dragRef.current) {
            didDragRef.current = true;
            const drag = dragRef.current;

            if (drag.mode === 'move') {
                const dx = mx - drag.startMX;
                const dayShift = Math.round(dx / PX);
                const newES = addDays(drag.origES, dayShift);
                const bx = dayDiff(projStart, newES) * PX;
                const cal = activities[drag.idx]?.cal || defCal;
                const f = CAL_F[cal] || CAL_F[6];
                const bw = Math.max(4, (drag.origDur || 1) * PX * f);
                dragPreviewRef.current = { x: bx, y: drag.visIdx * ROW_H + 5, w: bw, h: ROW_H - 10, mode: 'move', dateLabel: fmtDate(newES) };
                draw();
            } else if (drag.mode === 'resize') {
                const dx = mx - drag.startMX;
                const cal = activities[drag.idx]?.cal || defCal;
                const f = CAL_F[cal] || CAL_F[6];
                const origBw = Math.max(4, Math.round(drag.origDur * f) * PX);
                const newBw = Math.max(PX, origBw + dx);
                const newCalDays = Math.round(newBw / PX);
                const newDur = Math.max(1, Math.round(newCalDays / f));
                const bx = dayDiff(projStart, drag.origES) * PX;
                dragPreviewRef.current = { x: bx, y: drag.visIdx * ROW_H + 5, w: newBw, h: ROW_H - 10, mode: 'resize', durLabel: newDur + 'd' };
                draw();
            } else if (drag.mode === 'link') {
                dragPreviewRef.current = { ...dragPreviewRef.current, ex: mx, ey: my + scrollTop };
                draw();
            }
            canvas.style.cursor = drag.mode === 'link' ? 'crosshair' : drag.mode === 'resize' ? 'ew-resize' : 'grabbing';
            return;
        }

        // Hover cursor change
        const hit = hitTestBar(mx, my);
        if (hit) {
            if (hit.zone === 'move') canvas.style.cursor = 'grab';
            else if (hit.zone === 'resize-r') canvas.style.cursor = 'ew-resize';
            else if (hit.zone === 'link') canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'default';
        }
    }, [visRows, activities, projStart, PX, defCal, hitTestBar, draw]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        if (!dragRef.current) return;
        const canvas = barRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const body = bodyRef.current;
        const scrollLeft = body?.scrollLeft || 0;
        const scrollTop = body?.scrollTop || 0;
        const mx = e.clientX - rect.left + scrollLeft;
        const my = e.clientY - rect.top;
        const drag = dragRef.current;
        let changed = false;

        if (drag.mode === 'move' && didDragRef.current) {
            const dx = mx - drag.startMX;
            const dayShift = Math.round(dx / PX);
            if (dayShift !== 0) {
                const newES = addDays(drag.origES, dayShift);
                dispatch({ type: 'PUSH_UNDO' });
                dispatch({ type: 'COMMIT_EDIT', index: drag.idx, key: 'startDate', value: isoDate(newES) });
                changed = true;
            }
        } else if (drag.mode === 'resize' && didDragRef.current) {
            const dx = mx - drag.startMX;
            const cal = activities[drag.idx]?.cal || defCal;
            const f = CAL_F[cal] || CAL_F[6];
            const origBw = Math.max(4, Math.round(drag.origDur * f) * PX);
            const newBw = Math.max(PX, origBw + dx);
            const newCalDays = Math.round(newBw / PX);
            const newDur = Math.max(1, Math.round(newCalDays / f));
            if (newDur !== drag.origDur) {
                dispatch({ type: 'PUSH_UNDO' });
                dispatch({ type: 'COMMIT_EDIT', index: drag.idx, key: 'dur', value: String(newDur) });
                changed = true;
            }
        } else if (drag.mode === 'link' && didDragRef.current) {
            const vi = Math.floor((my + scrollTop) / ROW_H);
            if (vi >= 0 && vi < visRows.length) {
                const target = visRows[vi];
                const fromA = activities[drag.linkFromIdx!];
                const toA = activities[target._idx];
                if (toA && fromA && toA !== fromA && !toA._isProjRow && toA.type !== 'summary') {
                    const alreadyLinked = (toA.preds || []).some(p => p.id === fromA.id);
                    if (!alreadyLinked) {
                        dispatch({
                            type: 'OPEN_LINK_MODAL',
                            data: { fromId: fromA.id, toId: toA.id, type: 'FS', lag: 0, isEdit: false, sucIdx: target._idx, predIdx: -1 }
                        });
                    }
                }
            }
        }

        dragRef.current = null;
        dragPreviewRef.current = null;
        if (didDragRef.current) suppressClickRef.current = true;
        didDragRef.current = false;
        canvas.style.cursor = 'default';
        if (!changed) draw();
    }, [visRows, activities, projStart, PX, defCal, dispatch, draw]);

    const handleMouseLeave = useCallback(() => {
        if (dragRef.current) {
            dragRef.current = null;
            dragPreviewRef.current = null;
            didDragRef.current = false;
            if (barRef.current) barRef.current.style.cursor = 'default';
            draw();
        }
    }, [draw]);

    // Canvas click handler
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        const canvas = barRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const body = bodyRef.current;
        const scrollLeft = body?.scrollLeft || 0;
        const scrollTop = body?.scrollTop || 0;
        const mx = e.clientX - rect.left + scrollLeft;
        const my = e.clientY - rect.top;
        const i = Math.floor((my + scrollTop) / ROW_H);

        // Check connection line hit
        for (let cl = connLinesRef.current.length - 1; cl >= 0; cl--) {
            const conn = connLinesRef.current[cl];
            for (const seg of conn.segments) {
                const dist = distToSegment(mx, my + scrollTop, seg.x1, seg.y1, seg.x2, seg.y2);
                if (dist < 6) {
                    const sucIdx = activities.findIndex((a: any) => a.id === conn.sucId);
                    dispatch({
                        type: 'OPEN_LINK_MODAL',
                        data: { fromId: conn.predId, toId: conn.sucId, type: conn.type, lag: conn.lag, isEdit: true, sucIdx, predIdx: conn.predIdx }
                    });
                    return;
                }
            }
        }

        if (i >= 0 && i < visRows.length && !visRows[i]._isGroupHeader) {
            dispatch({ type: 'SET_SELECTION', index: visRows[i]._idx });
        }
    }, [visRows, activities, dispatch]);

    const handleDblClick = useCallback((e: React.MouseEvent) => {
        const canvas = barRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const body = bodyRef.current;
        const scrollTop = body?.scrollTop || 0;
        const my = e.clientY - rect.top;
        const i = Math.floor((my + scrollTop) / ROW_H);
        if (i >= 0 && i < visRows.length && !visRows[i]._isGroupHeader) {
            dispatch({ type: 'SET_SELECTION', index: visRows[i]._idx });
            dispatch({ type: 'OPEN_ACT_MODAL' });
        }
    }, [visRows, dispatch]);

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
            {/* Header canvas */}
            <div style={{ flexShrink: 0, overflow: 'hidden', borderBottom: `1px solid ${t.hdrBotBorder}` }}>
                <canvas
                    ref={hdrRef}
                    style={{ display: 'block', cursor: 'ew-resize' }}
                    onMouseDown={handleHeaderMouseDown}
                    onMouseMove={handleHeaderMouseMove}
                    onMouseUp={handleHeaderMouseUpOrLeave}
                    onMouseLeave={handleHeaderMouseUpOrLeave}
                />
            </div>
            {/* Body canvas */}
            <div ref={bodyRef} id="gantt-timeline-scroll" style={{ flex: 1, overflow: 'auto', outline: 'none', position: 'relative' }} tabIndex={0}
                onScroll={(e) => {
                    const scScroll = document.getElementById('scurve-scroll-container');
                    if (scScroll && scScroll.scrollLeft !== e.currentTarget.scrollLeft) {
                        scScroll.scrollLeft = e.currentTarget.scrollLeft;
                    }
                }}
            >
                <canvas ref={barRef} style={{ display: 'block' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleClick}
                    onDoubleClick={handleDblClick} />
                {visRows.length === 0 && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
                        <div>Escribe en la tabla para agregar actividades</div>
                    </div>
                )}
            </div>
        </div>
    );
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
