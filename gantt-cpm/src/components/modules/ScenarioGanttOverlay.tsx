// ═══════════════════════════════════════════════════════════════════
// ScenarioGanttOverlay – Interactive comparison Gantt chart
// Shows master (semi-transparent) vs scenario bars with zoom
// levels (day/week/month), status date line, today line, headers.
// Bars are clickable: single-click selects, double-click opens
// an inline activity detail/edit panel.
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import { dayDiff, fmtDate, addDays, isoDate, parseDate } from '../../utils/cpm';
import { predsToStr } from '../../utils/helpers';
import ScenarioAlertModal, {
  type ScenarioAlert,
  validateProgressDataDate,
  validateOutOfSequence,
} from './ScenarioAlertModal';
import type { WhatIfScenario, Activity } from '../../types/gantt';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props { scenario: WhatIfScenario; }

type Zoom = 'day' | 'week' | 'month';

const ROW_H = 30;
const HDR_H_DAY = 50;
const HDR_H_DEFAULT = 36;
const LABEL_W = 200;
const PANEL_W = 340;

// Fallback PX values; will be overridden by responsive calculation
const PX_FALLBACK: Record<Zoom, number> = { day: 24, week: 6, month: 1.6 };
const PX_MIN: Record<Zoom, number> = { day: 14, week: 3, month: 0.8 };
const PX_MAX: Record<Zoom, number> = { day: 40, week: 14, month: 4 };

export default function ScenarioGanttOverlay({ scenario }: Props) {
  const { state, dispatch } = useGantt();
  const { lightMode, statusDate } = state;
  const hdrCanvasRef = useRef<HTMLCanvasElement>(null);
  const bodyCanvasRef = useRef<HTMLCanvasElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const hdrScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState<Zoom>('week');
  const [selectedRowIdx, setSelectedRowIdx] = useState<number>(-1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [containerW, setContainerW] = useState(900);
  const [alert, setAlert] = useState<ScenarioAlert | null>(null);
  const pendingPctRef = useRef<{ idx: number; val: number } | null>(null);

  // ── Responsive: measure container width and auto-fit PX ──
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - (panelOpen ? PANEL_W : 0);
        setContainerW(Math.max(300, w));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [panelOpen]);

  const hdrH = zoom === 'day' ? HDR_H_DAY : HDR_H_DEFAULT;

  /* ── Theme colors ── */
  const t = useMemo(() => {
    if (lightMode) return {
      hdrTopBg: '#f1f5f9', hdrTopBorder: '#cbd5e1', hdrTopText: '#334155',
      hdrBotBg: '#f8fafc', hdrBotBorder: '#e2e8f0', hdrBotText: '#64748b', hdrWeekend: '#f1f5f9',
      rowEven: '#ffffff', rowOdd: '#f8fafc', rowSelected: 'rgba(99,102,241,0.12)',
      gridLine: '#e2e8f0', gridMonth: '#94a3b8',
      textPrimary: '#1e293b', textMuted: '#94a3b8',
      todayLine: '#f59e0b', statusLine: '#06b6d4',
      summaryBar: '#475569', barLabel: '#fff',
    };
    return {
      hdrTopBg: '#1e293b', hdrTopBorder: '#334155', hdrTopText: '#94a3b8',
      hdrBotBg: '#0f172a', hdrBotBorder: '#1e293b', hdrBotText: '#64748b', hdrWeekend: '#0c1322',
      rowEven: '#0f172a', rowOdd: '#111827', rowSelected: 'rgba(99,102,241,0.18)',
      gridLine: '#1e293b', gridMonth: '#334155',
      textPrimary: '#e2e8f0', textMuted: '#64748b',
      todayLine: '#f59e0b', statusLine: '#06b6d4',
      summaryBar: '#94a3b8', barLabel: '#fff',
    };
  }, [lightMode]);

  /* ── Build paired rows ── */
  const rows = useMemo(() => {
    const masterMap = new Map<string, Activity>();
    state.activities.forEach(a => masterMap.set(a.id, a));
    const pairs: { id: string; name: string; lv: number; type: string; master: Activity | null; scenario: Activity; scIdx: number }[] = [];
    scenario.activities.forEach((a, idx) => {
      if (a._isProjRow) return;
      pairs.push({ id: a.id, name: a.name, lv: a.lv, type: a.type, master: masterMap.get(a.id) || null, scenario: a, scIdx: idx });
    });
    return pairs;
  }, [state.activities, scenario.activities]);

  /* ── Date range ── */
  const { minDate, totalDays } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    rows.forEach(r => {
      [r.master?.ES, r.master?.EF, r.scenario.ES, r.scenario.EF].forEach(d => {
        if (d) { const t2 = new Date(d).getTime(); if (t2 < min) min = t2; if (t2 > max) max = t2; }
      });
    });
    if (statusDate) { const st = statusDate.getTime(); if (st < min) min = st; if (st > max) max = st; }
    const now = Date.now(); if (now < min) min = now; if (now > max) max = now;
    if (min === Infinity) { min = Date.now(); max = Date.now() + 86400000 * 90; }
    min -= 86400000 * 7; max += 86400000 * 14;
    const d = new Date(min); d.setDate(1); min = d.getTime();
    return { minDate: new Date(min), totalDays: Math.ceil((max - min) / 86400000) };
  }, [rows, statusDate]);

  /* ── Compute PX dynamically based on container width ── */
  const PX = useMemo(() => {
    if (totalDays <= 0) return PX_FALLBACK[zoom];
    const available = containerW - LABEL_W - 40;
    const ideal = available / totalDays;
    return Math.max(PX_MIN[zoom], Math.min(PX_MAX[zoom], ideal));
  }, [containerW, totalDays, zoom]);

  const W = LABEL_W + totalDays * PX + 40;
  const H = rows.length * ROW_H;

  /* ── Store bar hit areas for click detection ── */
  const barRectsRef = useRef<{ rowIdx: number; x: number; y: number; w: number; h: number }[]>([]);

  /* ── Scroll sync ── */
  useEffect(() => {
    const body = bodyScrollRef.current;
    if (!body) return;
    const handler = () => { if (hdrScrollRef.current) hdrScrollRef.current.scrollLeft = body.scrollLeft; };
    body.addEventListener('scroll', handler);
    return () => body.removeEventListener('scroll', handler);
  }, []);

  /* ── Canvas click handlers ── */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = bodyCanvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const i = Math.floor(my / ROW_H);
    if (i >= 0 && i < rows.length) {
      setSelectedRowIdx(i);
      // Single-click on a bar → open detail panel directly
      const hitBar = barRectsRef.current.some(b =>
        b.rowIdx === i && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h
      );
      if (hitBar) {
        setPanelOpen(true);
      }
    }
  }, [rows.length]);

  const handleCanvasDblClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = bodyCanvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const i = Math.floor(my / ROW_H);
    if (i >= 0 && i < rows.length) {
      setSelectedRowIdx(i);
      setPanelOpen(true);
    }
  }, [rows.length]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = bodyCanvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const overBar = barRectsRef.current.some(b =>
      mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h
    );
    canvas.style.cursor = overBar ? 'pointer' : 'default';
  }, []);

  /* ── Draw ── */
  const draw = useCallback(() => {
    const barRects: typeof barRectsRef.current = [];

    // ═══ HEADER ═══
    const hdrC = hdrCanvasRef.current; if (!hdrC) return;
    hdrC.width = W; hdrC.height = hdrH; hdrC.style.width = W + 'px'; hdrC.style.height = hdrH + 'px';
    const hCtx = hdrC.getContext('2d')!;
    hCtx.clearRect(0, 0, W, hdrH);
    const endDate = addDays(minDate, totalDays);

    // Month top row
    let cur = new Date(minDate);
    while (cur < endDate) {
      const x = LABEL_W + dayDiff(minDate, cur) * PX;
      const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const w = Math.min(dayDiff(cur, nm) * PX, W - x);
      hCtx.fillStyle = t.hdrTopBg; hCtx.fillRect(x, 0, w, 17);
      hCtx.strokeStyle = t.hdrTopBorder; hCtx.strokeRect(x, 0, w, 17);
      hCtx.fillStyle = t.hdrTopText; hCtx.font = 'bold 10px Segoe UI';
      const lbl = cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
      if (w > 24) hCtx.fillText(lbl, x + 4, 12);
      cur = nm;
    }

    // Sub rows
    cur = new Date(minDate);
    while (cur < endDate) {
      const x = LABEL_W + dayDiff(minDate, cur) * PX;
      if (zoom === 'month') {
        const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); const w = dayDiff(cur, nm) * PX;
        hCtx.fillStyle = t.hdrBotBg; hCtx.fillRect(x, 17, w, 19);
        hCtx.strokeStyle = t.hdrBotBorder; hCtx.beginPath(); hCtx.moveTo(x, 17); hCtx.lineTo(x, hdrH); hCtx.stroke();
        cur = nm;
      } else if (zoom === 'week') {
        const w = 7 * PX;
        hCtx.fillStyle = t.hdrBotBg; hCtx.fillRect(x, 17, w, 19);
        hCtx.strokeStyle = t.hdrBotBorder; hCtx.beginPath(); hCtx.moveTo(x, 17); hCtx.lineTo(x, hdrH); hCtx.stroke();
        const dd = 'S' + String(cur.getDate()).padStart(2, '0') + '/' + String(cur.getMonth() + 1).padStart(2, '0');
        hCtx.fillStyle = t.hdrBotText; hCtx.font = '9px Segoe UI';
        if (PX * 7 > 30) hCtx.fillText(dd, x + 2, 30);
        cur.setDate(cur.getDate() + 7);
      } else {
        const isSun = cur.getDay() === 0, isSat = cur.getDay() === 6;
        const bg = (isSun || isSat) ? t.hdrWeekend : t.hdrBotBg;
        const fg = (isSun || isSat) ? t.textMuted : t.hdrBotText;
        hCtx.fillStyle = bg; hCtx.fillRect(x, 17, PX, 16); hCtx.fillRect(x, 33, PX, 17);
        hCtx.strokeStyle = t.hdrBotBorder; hCtx.beginPath(); hCtx.moveTo(x, 17); hCtx.lineTo(x, hdrH); hCtx.stroke();
        hCtx.fillStyle = fg; hCtx.font = '9px Segoe UI'; hCtx.textAlign = 'center';
        if (PX >= 14) hCtx.fillText(String(cur.getDate()), x + PX / 2, 29);
        const days = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        if (PX >= 10) hCtx.fillText(days[cur.getDay()], x + PX / 2, 46);
        hCtx.textAlign = 'left';
        cur.setDate(cur.getDate() + 1);
      }
    }
    if (zoom === 'day') {
      hCtx.strokeStyle = t.hdrBotBorder;
      hCtx.beginPath(); hCtx.moveTo(0, 33); hCtx.lineTo(W, 33); hCtx.stroke();
    }

    // Header label column area
    hCtx.fillStyle = t.hdrTopBg; hCtx.fillRect(0, 0, LABEL_W, hdrH);
    hCtx.strokeStyle = t.hdrTopBorder; hCtx.strokeRect(0, 0, LABEL_W, hdrH);
    hCtx.fillStyle = t.hdrTopText; hCtx.font = 'bold 10px Segoe UI';
    hCtx.fillText('Actividad', 8, hdrH / 2 + 4);

    const todayX = LABEL_W + (dayDiff(minDate, new Date()) + 1) * PX;
    if (todayX > LABEL_W && todayX < W) { hCtx.fillStyle = t.todayLine; hCtx.fillRect(todayX, 0, 2, hdrH); }
    if (statusDate) {
      const sdx = LABEL_W + (dayDiff(minDate, statusDate) + 1) * PX;
      if (sdx > LABEL_W && sdx < W) { hCtx.fillStyle = t.statusLine; hCtx.fillRect(sdx, 0, 2, hdrH); }
    }

    // ═══ BODY ═══
    const bC = bodyCanvasRef.current; if (!bC) return;
    bC.width = W; bC.height = H; bC.style.width = W + 'px'; bC.style.height = H + 'px';
    const ctx = bC.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // Row backgrounds (with selection highlight)
    rows.forEach((_, i) => {
      ctx.fillStyle = i === selectedRowIdx ? t.rowSelected : (i % 2 === 0 ? t.rowEven : t.rowOdd);
      ctx.fillRect(0, i * ROW_H, W, ROW_H);
    });

    // Grid lines
    cur = new Date(minDate);
    while (cur < endDate) {
      const x = LABEL_W + dayDiff(minDate, cur) * PX;
      const isM = cur.getDate() === 1;
      ctx.strokeStyle = isM ? t.gridMonth : t.gridLine;
      ctx.lineWidth = isM ? 1 : 0.4;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      if (zoom === 'month') cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      else if (zoom === 'week') cur.setDate(cur.getDate() + 7);
      else cur.setDate(cur.getDate() + 1);
    }

    // Today line
    if (todayX > LABEL_W && todayX < W) { ctx.fillStyle = t.todayLine; ctx.globalAlpha = 0.7; ctx.fillRect(todayX, 0, 2, H); ctx.globalAlpha = 1; }
    // Status date line
    if (statusDate) {
      const sdx = LABEL_W + (dayDiff(minDate, statusDate) + 1) * PX;
      if (sdx > LABEL_W && sdx < W) {
        ctx.fillStyle = t.statusLine; ctx.globalAlpha = 0.7; ctx.fillRect(sdx, 0, 2, H); ctx.globalAlpha = 1;
        ctx.save(); ctx.font = 'bold 9px Segoe UI'; ctx.fillStyle = t.statusLine;
        ctx.fillText('Corte ' + fmtDate(statusDate), sdx + 5, 12); ctx.restore();
      }
    }

    // Label column
    rows.forEach((_, i) => {
      ctx.fillStyle = i === selectedRowIdx ? t.rowSelected : (i % 2 === 0 ? t.rowEven : t.rowOdd);
      ctx.fillRect(0, i * ROW_H, LABEL_W, ROW_H);
    });
    ctx.strokeStyle = t.gridMonth; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, H); ctx.stroke();

    const dateToX = (d: Date | null) => d ? LABEL_W + dayDiff(minDate, new Date(d)) * PX : LABEL_W;

    const rrect = (cx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number, r: number) => {
      r = Math.min(r, rw / 2, rh / 2);
      cx.beginPath(); cx.moveTo(rx + r, ry); cx.lineTo(rx + rw - r, ry);
      cx.arcTo(rx + rw, ry, rx + rw, ry + rh, r); cx.lineTo(rx + rw, ry + rh - r);
      cx.arcTo(rx + rw, ry + rh, rx, ry + rh, r); cx.lineTo(rx + r, ry + rh);
      cx.arcTo(rx, ry + rh, rx, ry, r); cx.lineTo(rx, ry + r);
      cx.arcTo(rx, ry, rx + rw, ry, r); cx.closePath();
    };

    rows.forEach((r, i) => {
      const y = i * ROW_H;

      ctx.strokeStyle = t.gridLine; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(W, y + ROW_H); ctx.stroke();

      // Selection indicator on label
      if (i === selectedRowIdx) {
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(0, y, 3, ROW_H);
      }

      // Label
      ctx.font = r.type === 'summary' ? 'bold 10px Segoe UI' : '10px Segoe UI';
      ctx.fillStyle = i === selectedRowIdx ? '#6366f1' : t.textPrimary;
      const indent = Math.max(0, r.lv) * 10;
      const label = r.name.length > 25 ? r.name.slice(0, 23) + '…' : r.name;
      ctx.fillText(label, 6 + indent, y + ROW_H / 2 + 3);

      const BAR_H = r.type === 'summary' ? 6 : 10;
      const masterY = y + (ROW_H / 2) - BAR_H - 1;
      const scY = y + (ROW_H / 2) + 1;

      // ── Master bar (semi-transparent, top) ──
      if (r.master?.ES && r.master?.EF) {
        const x1 = dateToX(r.master.ES); const x2 = dateToX(r.master.EF);
        const bw = Math.max(x2 - x1, 2);
        if (r.type === 'milestone') {
          const mx = x1, my2 = y + ROW_H / 2 - 4;
          ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#fbbf24';
          ctx.translate(mx, my2); ctx.rotate(Math.PI / 4);
          ctx.fillRect(-3, -3, 6, 6); ctx.restore();
          barRects.push({ rowIdx: i, x: mx - 5, y: my2 - 5, w: 10, h: 10 });
        } else if (r.type === 'summary') {
          ctx.globalAlpha = 0.3; ctx.fillStyle = r.master.crit ? '#ef4444' : t.summaryBar;
          ctx.fillRect(x1, masterY, bw, BAR_H);
          ctx.beginPath(); ctx.moveTo(x1, masterY); ctx.lineTo(x1 + 4, masterY); ctx.lineTo(x1, masterY + BAR_H + 3); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x1 + bw, masterY); ctx.lineTo(x1 + bw - 4, masterY); ctx.lineTo(x1 + bw, masterY + BAR_H + 3); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          barRects.push({ rowIdx: i, x: x1, y: masterY, w: bw, h: BAR_H + 3 });
        } else {
          ctx.globalAlpha = 0.3; ctx.fillStyle = r.master.crit ? '#ef4444' : '#94a3b8';
          rrect(ctx, x1, masterY, bw, BAR_H, 3); ctx.fill();
          if ((r.master.pct || 0) > 0) {
            const pw = bw * (r.master.pct || 0) / 100;
            ctx.fillStyle = '#22c55e'; rrect(ctx, x1, masterY, pw, BAR_H, 3); ctx.fill();
          }
          ctx.globalAlpha = 1;
          barRects.push({ rowIdx: i, x: x1, y: masterY, w: bw, h: BAR_H });
        }
      }

      // ── Scenario bar (vivid, bottom) ──
      if (r.scenario.ES && r.scenario.EF) {
        const x1 = dateToX(r.scenario.ES); const x2 = dateToX(r.scenario.EF);
        const bw = Math.max(x2 - x1, 2);
        const color = r.scenario.crit ? '#ef4444' : scenario.color;
        if (r.type === 'milestone') {
          const mx = x1, my2 = y + ROW_H / 2 + 4;
          ctx.save(); ctx.fillStyle = color;
          ctx.translate(mx, my2); ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4, -4, 8, 8); ctx.restore();
          ctx.font = '8px Segoe UI'; ctx.fillStyle = color;
          ctx.fillText(fmtDate(r.scenario.ES), mx + 8, my2 + 3);
          barRects.push({ rowIdx: i, x: mx - 6, y: my2 - 6, w: 12, h: 12 });
        } else if (r.type === 'summary') {
          ctx.fillStyle = color; ctx.globalAlpha = 0.85;
          ctx.fillRect(x1, scY, bw, BAR_H);
          ctx.beginPath(); ctx.moveTo(x1, scY); ctx.lineTo(x1 + 4, scY); ctx.lineTo(x1, scY + BAR_H + 3); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x1 + bw, scY); ctx.lineTo(x1 + bw - 4, scY); ctx.lineTo(x1 + bw, scY + BAR_H + 3); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          if ((r.scenario.pct || 0) > 0) {
            const pw = bw * (r.scenario.pct || 0) / 100;
            ctx.globalAlpha = 0.85; ctx.fillStyle = '#22c55e'; ctx.fillRect(x1, scY, pw, BAR_H); ctx.globalAlpha = 1;
          }
          barRects.push({ rowIdx: i, x: x1, y: scY, w: bw, h: BAR_H + 3 });
        } else {
          if (!lightMode) { ctx.shadowColor = color; ctx.shadowBlur = 3; }
          ctx.fillStyle = color; rrect(ctx, x1, scY, bw, BAR_H, 3); ctx.fill();
          ctx.shadowBlur = 0;
          if ((r.scenario.pct || 0) > 0) {
            const pw = bw * (r.scenario.pct || 0) / 100;
            ctx.fillStyle = '#22c55ecc'; rrect(ctx, x1, scY, pw, BAR_H, 3); ctx.fill();
          }
          const dur = ((r.scenario as any)._spanDur != null ? (r.scenario as any)._spanDur : (r.scenario.dur || 0)) + 'd';
          ctx.font = '8px Segoe UI'; ctx.fillStyle = t.textPrimary;
          if (bw > 40) ctx.fillText(dur, x1 + 4, scY + BAR_H - 2);
          else ctx.fillText(dur, x1 + bw + 3, scY + BAR_H - 2);
          barRects.push({ rowIdx: i, x: x1, y: scY, w: bw, h: BAR_H });
        }
      }
    });

    barRectsRef.current = barRects;
  }, [rows, minDate, totalDays, W, H, PX, zoom, t, statusDate, scenario.color, lightMode, hdrH, selectedRowIdx]);

  useEffect(() => { draw(); }, [draw]);

  /* ── Selected activity for detail panel ── */
  const selectedRow = selectedRowIdx >= 0 && selectedRowIdx < rows.length ? rows[selectedRowIdx] : null;

  /* ── Handle edits from detail panel ── */
  const handlePanelEdit = useCallback((key: string, value: string) => {
    if (!selectedRow) return;
    const scIdx = selectedRow.scIdx;
    const a = scenario.activities[scIdx];
    if (!a) return;

    const updates: Partial<Activity> = {};

    if (key === 'pct') {
      const n = Math.min(100, Math.max(0, parseInt(value) || 0));

      const ddAlert = validateProgressDataDate(a, n, statusDate, fmtDate);
      if (ddAlert) { setAlert(ddAlert); return; }

      const oosAlert = validateOutOfSequence(a, n, scenario.activities);
      if (oosAlert) {
        pendingPctRef.current = { idx: scIdx, val: n };
        setAlert(oosAlert);
        return;
      }

      const oldPct = a.pct || 0;
      if (oldPct === 0 && n > 0 && !a.actualStart) {
        if (a.ES) updates.actualStart = isoDate(a.ES);
        else if (a.constraintDate) updates.actualStart = a.constraintDate;
      }
      if (n === 0) { updates.actualStart = null as any; updates.actualFinish = null as any; }
      if (n === 100 && !a.actualFinish && a.EF) updates.actualFinish = isoDate(addDays(a.EF, -1));
      if (n < 100) updates.actualFinish = null as any;
      updates.pct = n;
      updates.remDur = Math.round((a.dur || 0) * (100 - n) / 100);
    } else if (key === 'dur') {
      const n = parseInt(value);
      if (!isNaN(n)) {
        const newDur = Math.max(0, n);
        const visualDur = (a as any)._spanDur != null ? (a as any)._spanDur : (a.dur || 0);
        const delta = newDur - visualDur;
        if ((a.pct || 0) > 0 && a.remDur != null) updates.remDur = Math.max(0, a.remDur + delta);
        else if ((a.pct || 0) === 0) updates.remDur = null as any;
        updates.dur = Math.max(0, (a.dur || 0) + delta);
        if (newDur === 0) updates.type = 'milestone'; else if (a.type === 'milestone') updates.type = 'task';
      }
    } else if (key === 'name') {
      updates.name = value;
    } else if (key === 'actualStart') {
      const d = parseDate(value);
      if (d) updates.actualStart = isoDate(d);
      else updates.actualStart = null as any;
    }

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'UPDATE_SCENARIO_ACTIVITY', scenarioId: scenario.id, activityIndex: scIdx, updates });
      setTimeout(() => dispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id }), 50);
    }
  }, [selectedRow, scenario, dispatch, statusDate]);

  /* ── Handle "proceed anyway" from lógica-rota warning ── */
  const handleAlertProceed = useCallback(() => {
    const pending = pendingPctRef.current;
    if (pending) {
      const a = scenario.activities[pending.idx];
      if (a) {
        const updates: Partial<Activity> = {};
        const oldPct = a.pct || 0;
        const n = pending.val;
        if (oldPct === 0 && n > 0 && !a.actualStart) {
          if (a.ES) updates.actualStart = isoDate(a.ES);
          else if (a.constraintDate) updates.actualStart = a.constraintDate;
        }
        if (n === 0) { updates.actualStart = null as any; updates.actualFinish = null as any; }
        if (n === 100 && !a.actualFinish && a.EF) updates.actualFinish = isoDate(addDays(a.EF, -1));
        if (n < 100) updates.actualFinish = null as any;
        updates.pct = n;
        updates.remDur = Math.round((a.dur || 0) * (100 - n) / 100);
        dispatch({ type: 'UPDATE_SCENARIO_ACTIVITY', scenarioId: scenario.id, activityIndex: pending.idx, updates });
        setTimeout(() => dispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id }), 50);
      }
      pendingPctRef.current = null;
    }
  }, [scenario, dispatch]);

  const goPrev = useCallback(() => {
    if (selectedRowIdx > 0) setSelectedRowIdx(selectedRowIdx - 1);
  }, [selectedRowIdx]);
  const goNext = useCallback(() => {
    if (selectedRowIdx < rows.length - 1) setSelectedRowIdx(selectedRowIdx + 1);
  }, [selectedRowIdx, rows.length]);

  if (rows.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        Sin actividades para comparar.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Gantt area ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-panel)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-input)', borderRadius: 4, padding: 2 }}>
            {(['day', 'week', 'month'] as Zoom[]).map(z => (
              <button key={z} onClick={() => setZoom(z)} style={{
                padding: '3px 10px', fontSize: 11, fontWeight: zoom === z ? 600 : 400,
                background: zoom === z ? 'var(--bg-panel)' : 'transparent',
                color: zoom === z ? 'var(--text-accent)' : 'var(--text-secondary)',
                border: zoom === z ? '1px solid var(--border-primary)' : '1px solid transparent',
                borderRadius: 3, cursor: 'pointer',
              }}>
                {z === 'day' ? 'Día' : z === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
            Click en barra para editar · Dbl-click en fila para editar
          </span>

          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 6, background: 'rgba(148,163,184,0.5)', borderRadius: 2, display: 'inline-block' }} /> Maestro
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 6, background: scenario.color, borderRadius: 2, display: 'inline-block' }} /> Escenario
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, background: '#f59e0b', borderRadius: 1, display: 'inline-block' }} /> Hoy
            </span>
            {statusDate && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: '#06b6d4', borderRadius: 1, display: 'inline-block' }} /> Corte
              </span>
            )}
          </div>
        </div>

        {/* Header */}
        <div ref={hdrScrollRef} style={{ overflowX: 'hidden', flexShrink: 0 }}>
          <canvas ref={hdrCanvasRef} />
        </div>

        {/* Body */}
        <div ref={bodyScrollRef} style={{ flex: 1, overflow: 'auto' }}>
          <canvas
            ref={bodyCanvasRef}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDblClick}
            onMouseMove={handleCanvasMouseMove}
          />
        </div>
      </div>

      {/* ── Detail Panel (slides in from right) ── */}
      {panelOpen && selectedRow && (
        <ScenarioActivityPanel
          row={selectedRow}
          master={selectedRow.master}
          activity={selectedRow.scenario}
          statusDate={statusDate}
          onEdit={handlePanelEdit}
          onClose={() => setPanelOpen(false)}
          onPrev={goPrev}
          onNext={goNext}
          hasPrev={selectedRowIdx > 0}
          hasNext={selectedRowIdx < rows.length - 1}
        />
      )}

      <ScenarioAlertModal
        alert={alert}
        onClose={() => { setAlert(null); pendingPctRef.current = null; }}
        onProceed={handleAlertProceed}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ScenarioActivityPanel – Inline detail/edit panel for selected bar
// ═══════════════════════════════════════════════════════════════════
interface PanelProps {
  row: { id: string; name: string; lv: number; type: string };
  master: Activity | null;
  activity: Activity;
  statusDate: Date | null;
  onEdit: (key: string, value: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

function ScenarioActivityPanel({ row, master, activity, statusDate, onEdit, onClose, onPrev, onNext, hasPrev, hasNext }: PanelProps) {
  const a = activity;
  const m = master;

  const deltaTag = (key: string): React.ReactNode => {
    if (!m) return null;
    let mv: any, sv: any;
    if (key === 'dur') { mv = m.dur; sv = a.dur; }
    else if (key === 'pct') { mv = m.pct || 0; sv = a.pct || 0; }
    else if (key === 'ES') { mv = m.ES ? fmtDate(m.ES) : '—'; sv = a.ES ? fmtDate(a.ES) : '—'; }
    else if (key === 'EF') { mv = m.EF ? fmtDate(addDays(m.EF, -1)) : '—'; sv = a.EF ? fmtDate(addDays(a.EF, -1)) : '—'; }
    else if (key === 'TF') { mv = m.TF; sv = a.TF; }
    else return null;
    if (String(mv) === String(sv)) return null;
    return (
      <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 4 }}>
        (maestro: {mv}{key === 'pct' ? '%' : key === 'dur' || key === 'TF' ? 'd' : ''})
      </span>
    );
  };

  const fieldRow = (label: string, value: React.ReactNode, dk?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-primary)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
        {value}{dk && deltaTag(dk)}
      </span>
    </div>
  );

  const [editDur, setEditDur] = useState(String((a as any)._spanDur != null ? (a as any)._spanDur : (a.dur || 0)));
  const [editPct, setEditPct] = useState(String(a.pct || 0));
  const [editActStart, setEditActStart] = useState(a.actualStart || '');

  useEffect(() => {
    setEditDur(String((a as any)._spanDur != null ? (a as any)._spanDur : (a.dur || 0)));
    setEditPct(String(a.pct || 0));
    setEditActStart(a.actualStart || '');
  }, [a.id, a.dur, a.pct, a.actualStart, (a as any)._spanDur]);

  const isCrit = a.crit;
  const preds = predsToStr(a.preds);

  return (
    <div style={{
      width: PANEL_W, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--border-primary)', background: 'var(--bg-panel)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
      }}>
        <button onClick={onPrev} disabled={!hasPrev} style={{ background: 'none', border: 'none', cursor: hasPrev ? 'pointer' : 'default', color: hasPrev ? 'var(--text-primary)' : 'var(--text-muted)', padding: 2 }}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={onNext} disabled={!hasNext} style={{ background: 'none', border: 'none', cursor: hasNext ? 'pointer' : 'default', color: hasNext ? 'var(--text-primary)' : 'var(--text-muted)', padding: 2 }}>
          <ChevronRight size={14} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.id} – {row.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {row.type === 'summary' ? 'Resumen' : row.type === 'milestone' ? 'Hito' : 'Tarea'}
            {isCrit && <span style={{ color: '#ef4444', fontWeight: 600, marginLeft: 6 }}>● Crítico</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {fieldRow('Comienzo', a.ES ? fmtDate(a.ES) : '—', 'ES')}
        {fieldRow('Fin', a.EF ? fmtDate(addDays(a.EF, -1)) : '—', 'EF')}

        {/* Duration (editable) */}
        {row.type !== 'summary' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-primary)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duración</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="number" value={editDur} min={0}
                onChange={e => setEditDur(e.target.value)}
                onBlur={() => onEdit('dur', editDur)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{
                  width: 48, textAlign: 'right', padding: '2px 4px', fontSize: 11,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)', borderRadius: 3, outline: 'none',
                }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>días</span>
              {deltaTag('dur')}
            </div>
          </div>
        )}

        {fieldRow('Dur. Restante', (a.remDur != null ? a.remDur : (a.dur || 0)) + ' días')}

        {/* Progress (editable) */}
        {row.type !== 'summary' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-primary)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>% Avance</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="number" value={editPct} min={0} max={100} step={5}
                onChange={e => setEditPct(e.target.value)}
                onBlur={() => onEdit('pct', editPct)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{
                  width: 48, textAlign: 'right', padding: '2px 4px', fontSize: 11,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)', borderRadius: 3, outline: 'none',
                }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
              {deltaTag('pct')}
            </div>
          </div>
        )}

        {/* Actual Start (editable) */}
        {row.type !== 'summary' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-primary)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Inicio Real</span>
            <input type="date" value={editActStart}
              onChange={e => setEditActStart(e.target.value)}
              onBlur={() => onEdit('actualStart', editActStart)}
              style={{
                padding: '2px 4px', fontSize: 11,
                background: 'var(--bg-input)', color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)', borderRadius: 3, outline: 'none',
              }} />
          </div>
        )}

        {fieldRow('Fin Real', a.actualFinish || '—')}
        {fieldRow('Holgura Total', a.TF != null ? a.TF + 'd' : '—', 'TF')}
        {fieldRow('Holgura Libre', a._freeFloat != null ? a._freeFloat + 'd' : '—')}
        {fieldRow('Predecesoras', preds || '—')}
        {fieldRow('Recursos', a.res || '—')}

        {/* Status Date info */}
        {statusDate && (
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 6,
            background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)',
            fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 600, color: '#06b6d4', marginBottom: 4 }}>Fecha de Corte: {fmtDate(statusDate)}</div>
            {a.ES && a.ES > statusDate && (a.pct || 0) === 0 && (
              <div style={{ color: '#f59e0b' }}>
                ⚠ Inicio planificado posterior a la Fecha de Corte. Si desea registrar avance, primero defina un Inicio Real.
              </div>
            )}
            {(a.pct || 0) > 0 && a.ES && a.ES <= statusDate && (
              <div style={{ color: '#22c55e' }}>✓ Actividad en curso, coherente con la Fecha de Corte.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
