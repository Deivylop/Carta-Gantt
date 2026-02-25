// ═══════════════════════════════════════════════════════════════════
// PPCPanel – Percent Plan Complete & Root-Cause Analysis
//
// Last Planner System core metrics:
// 1. PPC (Porcentaje de Plan Cumplido) — weekly reliability measure
// 2. Efficiency — programmed % vs real % achieved
// 3. CNC (Causas de No Cumplimiento) — root-cause Pareto analysis
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import type { PPCWeekRecord, CNCEntry, CNCCategory, ProgressHistoryEntry, BaselineEntry } from '../../types/gantt';
import { isoDate, fmtDate, parseDate, getExactElapsedRatio, getExactWorkDays } from '../../utils/cpm';
import { BarChart3, PlusCircle, Trash2, CalendarDays, TrendingUp, Award, Activity, Search, CheckSquare, Square, GripVertical, Edit2, AlertTriangle } from 'lucide-react';

/** Get the planned % at a specific date (0-100) using two-segment baseline interpolation
 *  (matches LookAheadGrid logic: if baseline had progress at save-time, interpolates in two segments) */
function getPlannedPctAt(
  a: { blES: Date|null; blEF: Date|null; ES: Date|null; EF: Date|null; cal: any; baselines?: BaselineEntry[] },
  target: Date, defCal: any, activeBlIdx: number
): number {
  const start = a.blES || a.ES;
  const end = a.blEF || a.EF;
  if (!start || !end) return 0;
  const stObj = new Date(start); stObj.setHours(0,0,0,0);
  const endObj = new Date(end); endObj.setHours(0,0,0,0);
  if (target <= stObj) return 0;
  if (target >= endObj) return 100;
  const cal = a.cal || defCal;
  const activeBl = (a.baselines || [])[activeBlIdx] || null;
  if (activeBl && activeBl.pct != null && activeBl.statusDate) {
    const blPct = activeBl.pct;
    if (blPct === 0) return getExactElapsedRatio(start, end, target, cal) * 100;
    const blStatusEnd = new Date(activeBl.statusDate); blStatusEnd.setHours(0,0,0,0);
    blStatusEnd.setDate(blStatusEnd.getDate() + 1);
    if (target <= blStatusEnd) {
      const totalWdSeg1 = getExactWorkDays(stObj, blStatusEnd, cal);
      const elapsedWd = getExactWorkDays(stObj, target <= stObj ? stObj : new Date(target), cal);
      const ratioSeg1 = totalWdSeg1 > 0 ? elapsedWd / totalWdSeg1 : 1;
      return ratioSeg1 * blPct;
    } else {
      const totalWdSeg2 = getExactWorkDays(blStatusEnd, endObj, cal);
      const elapsedWd = getExactWorkDays(blStatusEnd, new Date(target), cal);
      const ratioSeg2 = totalWdSeg2 > 0 ? elapsedWd / totalWdSeg2 : 1;
      return blPct + ratioSeg2 * (100 - blPct);
    }
  }
  return getExactElapsedRatio(start, end, target, cal) * 100;
}

/** Get the real % for an activity at a specific date from progressHistory (closest entry ≤ date) */
function getRealPctAt(actId: string, targetISO: string, sortedHistory: ProgressHistoryEntry[]): number {
  // sortedHistory must be ascending by date
  let best = 0;
  for (const entry of sortedHistory) {
    if (entry.date > targetISO) break;
    if (entry.snapshots?.[actId]) best = entry.snapshots[actId].pct;
    else if (entry.details?.[actId] != null) best = entry.details[actId];
  }
  return best;
}

const CNC_CATEGORIES: CNCCategory[] = [
  'Sin Restricción', 'Programación', 'Material', 'Mano de Obra', 'Equipos',
  'Subcontrato', 'Clima', 'Diseño', 'Cliente',
  'Actividad Previa', 'Calidad', 'Seguridad', 'Otro'
];
const CNC_COLORS: Record<CNCCategory, string> = {
  'Sin Restricción': '#94a3b8', 'Programación': '#ef4444', 'Material': '#f97316', 'Mano de Obra': '#f59e0b',
  'Equipos': '#eab308', 'Subcontrato': '#84cc16', 'Clima': '#22c55e',
  'Diseño': '#06b6d4', 'Cliente': '#14b8a6',
  'Actividad Previa': '#3b82f6', 'Calidad': '#6366f1', 'Seguridad': '#8b5cf6', 'Otro': '#64748b'
};

/** Shared tooltip style for canvas charts */
const TOOLTIP_STYLE: React.CSSProperties = {
  position: 'absolute', pointerEvents: 'none', background: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, padding: '6px 10px',
  fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap', zIndex: 50,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)', lineHeight: 1.5, transition: 'opacity 0.15s',
};

let _uid = 0;
const uid = () => `ppc_${Date.now()}_${++_uid}`;
const cncUid = () => `cnc_${Date.now()}_${++_uid}`;

interface Props {
  windowStart: Date;
  windowEnd: Date;
}

// ─── Canvas Chart: PPC Trend Line ──────────────────────────────
function PPCTrendChart({ history }: { history: PPCWeekRecord[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measuredW, setMeasuredW] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null);

  const sorted = useMemo(() => [...history].sort((a, b) => a.weekStart.localeCompare(b.weekStart)), [history]);
  const minCanvasW = Math.max(sorted.length * 70, 400);

  // Store computed point positions for hit-testing
  const pointsRef = useRef<{ x: number; y: number; rec: PPCWeekRecord }[]>([]);

  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth; const h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (sorted.length === 0) return;

    const pad = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Y axis: 0-100%
    ctx.strokeStyle = 'rgba(100,100,100,0.2)'; ctx.lineWidth = 0.5;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '9px system-ui';
    ctx.fillStyle = 'rgba(180,180,180,0.7)';
    for (let p = 0; p <= 100; p += 20) {
      const y = pad.top + chartH - (p / 100) * chartH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      ctx.fillText(p + '%', pad.left - 4, y);
    }

    // 85% target line
    const y85 = pad.top + chartH - (85 / 100) * chartH;
    ctx.strokeStyle = '#22c55e55'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, y85); ctx.lineTo(pad.left + chartW, y85); ctx.stroke();
    ctx.setLineDash([]);

    // 60% min line
    const y60 = pad.top + chartH - (60 / 100) * chartH;
    ctx.strokeStyle = '#f59e0b55'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, y60); ctx.lineTo(pad.left + chartW, y60); ctx.stroke();
    ctx.setLineDash([]);

    // Points
    const n = sorted.length;
    const gap = n > 1 ? chartW / (n - 1) : chartW / 2;

    // Area fill
    ctx.beginPath();
    sorted.forEach((rec, i) => {
      const x = pad.left + (n > 1 ? i * gap : chartW / 2);
      const y = pad.top + chartH - (rec.ppc / 100) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (n > 1 ? (n - 1) * gap : chartW / 2), pad.top + chartH);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = '#6366f118';
    ctx.fill();

    // Line
    ctx.beginPath();
    sorted.forEach((rec, i) => {
      const x = pad.left + (n > 1 ? i * gap : chartW / 2);
      const y = pad.top + chartH - (rec.ppc / 100) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.stroke();

    // Dots + labels
    sorted.forEach((rec, i) => {
      const x = pad.left + (n > 1 ? i * gap : chartW / 2);
      const y = pad.top + chartH - (rec.ppc / 100) * chartH;
      const color = rec.ppc >= 85 ? '#22c55e' : rec.ppc >= 60 ? '#f59e0b' : '#ef4444';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      // PPC value
      ctx.fillStyle = color; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(rec.ppc + '%', x, y - 10);
      // Week label
      const d = parseDate(rec.weekStart);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(d ? fmtDate(d).replace(/^(\d{2})-(\d{2}).*/, '$1/$2') : rec.weekStart.slice(5), x, pad.top + chartH + 14);
    });
    // Store positions for hit-testing
    pointsRef.current = sorted.map((rec, i) => ({
      x: pad.left + (n > 1 ? i * gap : chartW / 2),
      y: pad.top + chartH - (rec.ppc / 100) * chartH,
      rec,
    }));
  }, [sorted]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (cv.clientWidth / rect.width);
    const my = (e.clientY - rect.top) * (cv.clientHeight / rect.height);
    const hit = pointsRef.current.find(p => Math.hypot(p.x - mx, p.y - my) < 18);
    if (hit) {
      const d = parseDate(hit.rec.weekStart);
      const label = d ? fmtDate(d) : hit.rec.weekStart;
      const color = hit.rec.ppc >= 85 ? '#22c55e' : hit.rec.ppc >= 60 ? '#f59e0b' : '#ef4444';
      setTooltip({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top - 8,
        html: `<b style="color:${color}">PPC: ${hit.rec.ppc}%</b><br/>Semana: ${label}<br/>Planif.: ${hit.rec.planned.length} | Cumpl.: ${hit.rec.completed.length}`,
      });
    } else setTooltip(null);
  }, []);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    setMeasuredW(el.clientWidth);
    const ro = new ResizeObserver(() => { setMeasuredW(el.clientWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Redraw whenever data changes (draw) or container resizes (measuredW)
  useEffect(() => { requestAnimationFrame(draw); }, [draw, measuredW]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
      <canvas ref={canvasRef} onMouseMove={onMouseMove} onMouseLeave={() => setTooltip(null)}
        style={{ width: Math.max(minCanvasW, measuredW || 400), height: '100%', display: 'block' }} />
      {tooltip && <div style={{ ...TOOLTIP_STYLE, left: tooltip.x, top: tooltip.y }} dangerouslySetInnerHTML={{ __html: tooltip.html }} />}
    </div>
  );
}

// ─── Canvas Chart: Efficiency Bar Chart ────────────────────────
interface EnrichedWeek extends PPCWeekRecord { _totalProg: number; _totalReal: number; }

function EfficiencyChart({ history }: { history: EnrichedWeek[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measuredW, setMeasuredW] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null);

  const sorted = useMemo(() => [...history].sort((a, b) => a.weekStart.localeCompare(b.weekStart)), [history]);
  const minCanvasW = Math.max(sorted.length * 70, 400);
  const barsRef = useRef<{ cx: number; y: number; w: number; h: number; rec: EnrichedWeek; eff: number }[]>([]);

  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth; const h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (sorted.length === 0) return;

    const pad = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Y axis 0-140%
    const maxY = 140;
    ctx.strokeStyle = 'rgba(100,100,100,0.2)'; ctx.lineWidth = 0.5;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '9px system-ui'; ctx.fillStyle = 'rgba(180,180,180,0.7)';
    for (let p = 0; p <= maxY; p += 20) {
      const y = pad.top + chartH - (p / maxY) * chartH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      ctx.fillText(p + '%', pad.left - 4, y);
    }
    // 100% target
    const y100 = pad.top + chartH - (100 / maxY) * chartH;
    ctx.strokeStyle = '#22c55e55'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, y100); ctx.lineTo(pad.left + chartW, y100); ctx.stroke();
    ctx.setLineDash([]);

    const n = sorted.length;
    const barW = Math.min(40, (chartW - 10) / n - 4);

    sorted.forEach((rec, i) => {
      const cx = pad.left + (i + 0.5) * (chartW / n);
      const eff = rec._totalProg > 0 ? Math.round((rec._totalReal / rec._totalProg) * 100) : (rec.ppc || 0);
      const clampedEff = Math.min(eff, maxY);
      const barH = (clampedEff / maxY) * chartH;
      const y = pad.top + chartH - barH;
      const color = eff >= 100 ? '#22c55e' : eff >= 80 ? '#f59e0b' : '#ef4444';
      // Bar
      ctx.fillStyle = color + '66';
      ctx.fillRect(cx - barW / 2, y, barW, barH);
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.strokeRect(cx - barW / 2, y, barW, barH);
      // Value
      ctx.fillStyle = color; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(eff + '%', cx, y - 6);
      // Week label
      const d = parseDate(rec.weekStart);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '9px system-ui';
      ctx.fillText(d ? fmtDate(d).replace(/^(\d{2})-(\d{2}).*/, '$1/$2') : rec.weekStart.slice(5), cx, pad.top + chartH + 14);
    });
    // Store bar positions
    barsRef.current = sorted.map((rec, i) => {
      const cx = pad.left + (i + 0.5) * (chartW / n);
      const eff = rec._totalProg > 0 ? Math.round((rec._totalReal / rec._totalProg) * 100) : (rec.ppc || 0);
      const clampedEff = Math.min(eff, maxY);
      const bH = (clampedEff / maxY) * chartH;
      return { cx, y: pad.top + chartH - bH, w: barW, h: bH, rec, eff };
    });
  }, [sorted]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (cv.clientWidth / rect.width);
    const my = (e.clientY - rect.top) * (cv.clientHeight / rect.height);
    const hit = barsRef.current.find(b => mx >= b.cx - b.w / 2 && mx <= b.cx + b.w / 2 && my >= b.y && my <= b.y + b.h);
    if (hit) {
      const d = parseDate(hit.rec.weekStart);
      const label = d ? fmtDate(d) : hit.rec.weekStart;
      const color = hit.eff >= 100 ? '#22c55e' : hit.eff >= 80 ? '#f59e0b' : '#ef4444';
      setTooltip({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top - 8,
        html: `<b style="color:${color}">Eficiencia: ${hit.eff}%</b><br/>Semana: ${label}<br/>% Prog.: ${hit.rec._totalProg.toFixed(1)} | % Real: ${hit.rec._totalReal.toFixed(1)}`,
      });
    } else setTooltip(null);
  }, []);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    setMeasuredW(el.clientWidth);
    const ro = new ResizeObserver(() => { setMeasuredW(el.clientWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { requestAnimationFrame(draw); }, [draw, measuredW]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
      <canvas ref={canvasRef} onMouseMove={onMouseMove} onMouseLeave={() => setTooltip(null)}
        style={{ width: Math.max(minCanvasW, measuredW || 400), height: '100%', display: 'block' }} />
      {tooltip && <div style={{ ...TOOLTIP_STYLE, left: tooltip.x, top: tooltip.y }} dangerouslySetInnerHTML={{ __html: tooltip.html }} />}
    </div>
  );
}

// ─── Canvas Chart: CNC Pareto ──────────────────────────────────
function CNCParetoChart({ data, total }: { data: { cat: CNCCategory; count: number }[]; total: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measuredW, setMeasuredW] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null);

  const minCanvasW = Math.max(data.length * 80, 300);
  const barsRef = useRef<{ cx: number; y: number; w: number; h: number; cat: CNCCategory; count: number; cumPct: number }[]>([]);

  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth; const h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (data.length === 0 || total === 0) return;

    const pad = { top: 20, right: 45, bottom: 65, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const maxCount = Math.max(...data.map(d => d.count), 1);

    // Y axis left (counts)
    ctx.strokeStyle = 'rgba(100,100,100,0.2)'; ctx.lineWidth = 0.5;
    ctx.font = '10px system-ui'; ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const v = Math.round((maxCount / ySteps) * i);
      const y = pad.top + chartH - (v / maxCount) * chartH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      ctx.fillText(String(v), pad.left - 4, y);
    }

    const n = data.length;
    const barW = Math.min(36, (chartW - 10) / n - 4);

    // Bars
    let cumPct = 0;
    const cumPoints: { x: number; y: number; pct: number }[] = [];
    data.forEach((d, i) => {
      const cx = pad.left + (i + 0.5) * (chartW / n);
      const barH = (d.count / maxCount) * chartH;
      const y = pad.top + chartH - barH;
      const color = CNC_COLORS[d.cat];
      ctx.fillStyle = color + '88';
      ctx.fillRect(cx - barW / 2, y, barW, barH);
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.strokeRect(cx - barW / 2, y, barW, barH);
      // Count label
      ctx.fillStyle = color; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(String(d.count), cx, y - 6);
      // X axis label
      ctx.save();
      ctx.translate(cx, pad.top + chartH + 8);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(d.cat, 0, 0);
      ctx.restore();
      // Cumulative
      cumPct += (d.count / total) * 100;
      cumPoints.push({ x: cx, y: pad.top + chartH - (cumPct / 100) * chartH, pct: Math.round(cumPct) });
    });

    // Y axis right (cumulative %)
    ctx.textAlign = 'left'; ctx.fillStyle = '#e2e8f0'; ctx.font = '10px system-ui';
    for (let p = 0; p <= 100; p += 20) {
      const y = pad.top + chartH - (p / 100) * chartH;
      ctx.fillText(p + '%', pad.left + chartW + 4, y);
    }

    // 80% line
    const y80 = pad.top + chartH - 0.8 * chartH;
    ctx.strokeStyle = '#ef444444'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad.left, y80); ctx.lineTo(pad.left + chartW, y80); ctx.stroke();
    ctx.setLineDash([]);

    // Cumulative line
    if (cumPoints.length > 0) {
      ctx.beginPath();
      cumPoints.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke();
      cumPoints.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b'; ctx.fill();
      });
    }
    // Store bar positions for hit-testing
    let cum2 = 0;
    barsRef.current = data.map((d, i) => {
      const cx = pad.left + (i + 0.5) * (chartW / n);
      const bH = (d.count / maxCount) * chartH;
      cum2 += (d.count / total) * 100;
      return { cx, y: pad.top + chartH - bH, w: barW, h: bH, cat: d.cat, count: d.count, cumPct: Math.round(cum2) };
    });
  }, [data, total]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (cv.clientWidth / rect.width);
    const my = (e.clientY - rect.top) * (cv.clientHeight / rect.height);
    const hit = barsRef.current.find(b => mx >= b.cx - b.w / 2 && mx <= b.cx + b.w / 2 && my >= b.y && my <= b.y + b.h);
    if (hit) {
      const color = CNC_COLORS[hit.cat];
      const pct = total > 0 ? Math.round((hit.count / total) * 100) : 0;
      setTooltip({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top - 8,
        html: `<b style="color:${color}">${hit.cat}</b><br/>Cantidad: ${hit.count} (${pct}%)<br/>Acumulado: ${hit.cumPct}%`,
      });
    } else setTooltip(null);
  }, [total]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    setMeasuredW(el.clientWidth);
    const ro = new ResizeObserver(() => { setMeasuredW(el.clientWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { requestAnimationFrame(draw); }, [draw, measuredW]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
      <canvas ref={canvasRef} onMouseMove={onMouseMove} onMouseLeave={() => setTooltip(null)}
        style={{ width: Math.max(minCanvasW, measuredW || 300), height: '100%', display: 'block' }} />
      {tooltip && <div style={{ ...TOOLTIP_STYLE, left: tooltip.x, top: tooltip.y }} dangerouslySetInnerHTML={{ __html: tooltip.html }} />}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
export default function PPCPanel({ windowStart, windowEnd }: Props) {
  const { state, dispatch } = useGantt();

  /** Trigger a silent (no-alert) immediate save to Supabase after PPC/CNC mutations */
  const triggerSave = () => {
    setTimeout(() => window.dispatchEvent(new CustomEvent('sb-force-save', { detail: { silent: true } })), 500);
  };

  // Week selection — date entered is the CUT-OFF (end/fecha de corte of the period)
  // Sync with Gantt's statusDate by default
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(state.statusDate); d.setHours(0, 0, 0, 0);
    return isoDate(d);
  });
  const [selectedPlanned, setSelectedPlanned] = useState<string[]>([]);
  const [selectedCompleted, setSelectedCompleted] = useState<string[]>([]);
  const [weekNotes, setWeekNotes] = useState('');
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  // Edit mode: when editing an existing PPC record, store its id
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  // CNC form (history section)
  const [cncActId, setCncActId] = useState('');
  const [cncCat, setCncCat] = useState<CNCCategory>('Sin Restricción');
  const [cncDesc, setCncDesc] = useState('');

  // CNC per-activity in registration form: { actId → { category, description } }
  const [formCNC, setFormCNC] = useState<Record<string, { category: CNCCategory; description: string }>>({});

  // Activity search filter for registration form
  const [actSearch, setActSearch] = useState('');

  // Resizable chart panel split (left column flex ratio)
  const [chartSplit, setChartSplit] = useState(65); // left column % width
  const [chartHeights, setChartHeights] = useState([1, 1, 1]); // flex ratios for PPC/Efficiency/History
  const [paretoHeight, setParetoHeight] = useState(350); // pixel height for Pareto chart
  const splitDragging = useRef(false);
  const chartDragging = useRef<number | null>(null);
  const paretoDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sorted progress history (ascending) for interpolation
  const sortedProgHistory = useMemo(() => {
    return [...state.progressHistory].sort((a, b) => a.date.localeCompare(b.date));
  }, [state.progressHistory]);

  const activeBlIdx = state.activeBaselineIdx;

  // Activities in look-ahead window
  const activitiesInWindow = useMemo(() => {
    return state.activities.filter(a => {
      if (a.type === 'summary' || a._isProjRow) return false;
      if (!a.ES || !a.EF) return false;
      return a.ES <= windowEnd && a.EF >= windowStart;
    });
  }, [state.activities, windowStart, windowEnd]);

  // Compute PARTIAL planned % and PARTIAL real % for each activity (only the increment within this week)
  // The selected date is the CUT-OFF (end of period); period = [date-7, date]
  const activityMetrics = useMemo(() => {
    const wsDate = parseDate(weekStart);
    if (!wsDate) return {} as Record<string, { planned: number; real: number }>;
    // Week boundaries: selected date is END of period (fecha de corte)
    const periodEnd = new Date(wsDate); periodEnd.setHours(0,0,0,0);
    const periodStart = new Date(periodEnd); periodStart.setDate(periodStart.getDate() - 7);
    const defCal = state.defCal || 5;
    const periodStartISO = isoDate(periodStart);
    const periodEndISO = isoDate(periodEnd);

    const metrics: Record<string, { planned: number; real: number }> = {};
    activitiesInWindow.forEach(a => {
      // Planned % increment = planned(end) - planned(start) using two-segment baseline interpolation
      const pEnd = getPlannedPctAt(a, periodEnd, defCal, activeBlIdx);
      const pStart = getPlannedPctAt(a, periodStart, defCal, activeBlIdx);
      const plannedPeriod = Math.max(0, pEnd - pStart);

      // Real % increment = real(end) - real(start) from progressHistory
      const rEnd = getRealPctAt(a.id, periodEndISO, sortedProgHistory);
      const rStart = getRealPctAt(a.id, periodStartISO, sortedProgHistory);
      const realPeriod = Math.max(0, rEnd - rStart);

      metrics[a.id] = {
        planned: Math.round(plannedPeriod * 10) / 10,
        real: Math.round(realPeriod * 10) / 10,
      };
    });
    return metrics;
  }, [activitiesInWindow, weekStart, state.defCal, sortedProgHistory, activeBlIdx]);

  // Sorted PPC history
  const history = useMemo(() => {
    return [...state.ppcHistory].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [state.ppcHistory]);

  // Enrich history with PARTIAL totals for efficiency chart
  const enrichedHistory = useMemo((): EnrichedWeek[] => {
    const defCal = state.defCal || 5;
    return history.map(w => {
      let totalProg = 0; let totalReal = 0;
      const wsDate = parseDate(w.weekStart);
      if (!wsDate) return { ...w, _totalProg: 0, _totalReal: 0 };
      // weekStart stores the cut-off date (end of period)
      const periodEnd = new Date(wsDate); periodEnd.setHours(0,0,0,0);
      const periodStart = new Date(periodEnd); periodStart.setDate(periodStart.getDate() - 7);
      const periodStartISO = isoDate(periodStart);
      const periodEndISO = isoDate(periodEnd);

      w.planned.forEach(id => {
        const a = state.activities.find(x => x.id === id);
        if (!a) return;
        // Partial planned (two-segment baseline interpolation)
        const pEnd = getPlannedPctAt(a, periodEnd, defCal, activeBlIdx);
        const pStart = getPlannedPctAt(a, periodStart, defCal, activeBlIdx);
        totalProg += Math.max(0, pEnd - pStart);
        // Partial real
        const rEnd = getRealPctAt(id, periodEndISO, sortedProgHistory);
        const rStart = getRealPctAt(id, periodStartISO, sortedProgHistory);
        totalReal += Math.max(0, rEnd - rStart);
      });
      return { ...w, _totalProg: totalProg, _totalReal: totalReal };
    });
  }, [history, state.activities, state.defCal, sortedProgHistory, activeBlIdx]);

  // Aggregate CNC for Pareto
  const cncAgg = useMemo(() => {
    const counts: Record<CNCCategory, number> = {} as any;
    CNC_CATEGORIES.forEach(c => counts[c] = 0);
    state.ppcHistory.forEach(w => {
      w.cncEntries.forEach(e => counts[e.category]++);
    });
    return CNC_CATEGORIES.map(c => ({ cat: c, count: counts[c] }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [state.ppcHistory]);
  const totalCNC = cncAgg.reduce((s, x) => s + x.count, 0);

  // Overall PPC
  const avgPPC = useMemo(() => {
    if (history.length === 0) return 0;
    return Math.round(history.reduce((s, w) => s + w.ppc, 0) / history.length);
  }, [history]);

  // Overall Efficiency
  const avgEfficiency = useMemo(() => {
    if (enrichedHistory.length === 0) return 0;
    const totProg = enrichedHistory.reduce((s, w) => s + w._totalProg, 0);
    const totReal = enrichedHistory.reduce((s, w) => s + w._totalReal, 0);
    return totProg > 0 ? Math.round((totReal / totProg) * 100) : 0;
  }, [enrichedHistory]);

  // Trend (last 4 weeks)
  const recentTrend = useMemo(() => {
    const recent = history.slice(0, 4);
    if (recent.length < 2) return 0;
    return recent[0].ppc - recent[recent.length - 1].ppc;
  }, [history]);

  // Check if the current weekStart period already has a record (duplicate check)
  const existingRecordForPeriod = useMemo(() => {
    return state.ppcHistory.find(w => w.weekStart === weekStart && w.id !== editingRecordId);
  }, [state.ppcHistory, weekStart, editingRecordId]);

  // Load an existing PPC record into the form for editing
  const loadRecordForEdit = (w: PPCWeekRecord) => {
    setEditingRecordId(w.id);
    setWeekStart(w.weekStart);
    setSelectedPlanned([...w.planned]);
    setSelectedCompleted([...w.completed]);
    setWeekNotes(w.notes || '');
    // Rebuild formCNC from existing CNC entries
    const cnc: Record<string, { category: CNCCategory; description: string }> = {};
    w.cncEntries.forEach(e => {
      cnc[e.activityId] = { category: e.category, description: e.description };
    });
    setFormCNC(cnc);
  };

  // Cancel editing and reset form
  const cancelEdit = () => {
    setEditingRecordId(null);
    setSelectedPlanned([]); setSelectedCompleted([]); setWeekNotes(''); setFormCNC({});
  };

  // Record PPC week (create or update)
  const recordWeek = () => {
    if (existingRecordForPeriod) return; // block duplicate registration
    const planned = [...selectedPlanned];
    const completed = [...selectedCompleted];
    const ppc = planned.length > 0 ? Math.round((completed.length / planned.length) * 100) : 0;
    // Build CNC entries from the registration form (non-completed planned activities)
    // Every planned-but-not-completed activity gets a CNC entry for Pareto analysis
    const cncEntries: CNCEntry[] = [];
    const notCompleted = planned.filter(id => !completed.includes(id));
    notCompleted.forEach(actId => {
      const cnc = formCNC[actId];
      const category = cnc?.category || 'Programación';
      const description = cnc?.description?.trim() || '';
      cncEntries.push({ id: cncUid(), activityId: actId, category, description, responsible: '' });
    });
    if (editingRecordId) {
      // Update existing record
      dispatch({ type: 'UPDATE_PPC_WEEK', id: editingRecordId, updates: { weekStart, planned, completed, ppc, cncEntries, notes: weekNotes } });
      setEditingRecordId(null);
    } else {
      // Create new record
      const rec: PPCWeekRecord = {
        id: uid(), weekStart, planned, completed,
        ppc, cncEntries, notes: weekNotes, createdAt: new Date().toISOString()
      };
      dispatch({ type: 'ADD_PPC_WEEK', record: rec });
      setEditingWeekId(rec.id);
    }
    setSelectedPlanned([]); setSelectedCompleted([]); setWeekNotes(''); setFormCNC({});
    triggerSave();
  };

  // Add CNC entry
  const addCNC = (weekId: string) => {
    if (!cncActId || !cncDesc) return;
    const entry: CNCEntry = { id: cncUid(), activityId: cncActId, category: cncCat, description: cncDesc, responsible: '' };
    dispatch({ type: 'ADD_CNC_ENTRY', weekId, entry });
    setCncActId(''); setCncDesc('');
    triggerSave();
  };

  const togglePlanned = (id: string) => {
    if (selectedPlanned.includes(id)) {
      setSelectedPlanned(prev => prev.filter(x => x !== id));
      setSelectedCompleted(prev => prev.filter(x => x !== id));
    } else {
      setSelectedPlanned(prev => [...prev, id]);
      // Auto-check as completed if efficiency >= 100%
      const m = activityMetrics[id];
      if (m) {
        const eff = m.planned > 0 ? Math.round((m.real / m.planned) * 100) : (m.real > 0 ? 100 : 0);
        if (eff >= 100) {
          setSelectedCompleted(prev => prev.includes(id) ? prev : [...prev, id]);
        }
      }
    }
  };
  const toggleCompleted = (id: string) => {
    if (!selectedPlanned.includes(id)) return;
    setSelectedCompleted(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Select all / none toggles
  const filteredActivities = useMemo(() => {
    if (!actSearch.trim()) return activitiesInWindow;
    const q = actSearch.toLowerCase();
    return activitiesInWindow.filter(a => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.encargado || '').toLowerCase().includes(q));
  }, [activitiesInWindow, actSearch]);

  const allPlanned = filteredActivities.length > 0 && filteredActivities.every(a => selectedPlanned.includes(a.id));
  const allCompleted = filteredActivities.length > 0 && filteredActivities.every(a => selectedCompleted.includes(a.id));

  const toggleAllPlanned = () => {
    if (allPlanned) {
      const ids = new Set(filteredActivities.map(a => a.id));
      setSelectedPlanned(prev => prev.filter(id => !ids.has(id)));
      setSelectedCompleted(prev => prev.filter(id => !ids.has(id)));
    } else {
      const ids = filteredActivities.map(a => a.id);
      setSelectedPlanned(prev => [...new Set([...prev, ...ids])]);
      // Auto-check completed for activities with efficiency >= 100%
      const autoComplete = filteredActivities.filter(a => {
        const m = activityMetrics[a.id];
        if (!m) return false;
        const eff = m.planned > 0 ? Math.round((m.real / m.planned) * 100) : (m.real > 0 ? 100 : 0);
        return eff >= 100;
      }).map(a => a.id);
      if (autoComplete.length > 0) {
        setSelectedCompleted(prev => [...new Set([...prev, ...autoComplete])]);
      }
    }
  };
  const toggleAllCompleted = () => {
    if (allCompleted) {
      const ids = new Set(filteredActivities.map(a => a.id));
      setSelectedCompleted(prev => prev.filter(id => !ids.has(id)));
    } else {
      const ids = filteredActivities.filter(a => selectedPlanned.includes(a.id)).map(a => a.id);
      setSelectedCompleted(prev => [...new Set([...prev, ...ids])]);
    }
  };

  // Horizontal split drag handler
  const onSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    splitDragging.current = true;
    const startX = e.clientX;
    const startSplit = chartSplit;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const onMove = (ev: MouseEvent) => {
      if (!splitDragging.current) return;
      const delta = ev.clientX - startX;
      const pct = startSplit + (delta / rect.width) * 100;
      setChartSplit(Math.max(30, Math.min(80, pct)));
    };
    const onUp = () => { splitDragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Vertical chart resize drag handler
  const onChartDragMouseDown = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    chartDragging.current = idx;
    const startY = e.clientY;
    const startHeights = [...chartHeights];
    const onMove = (ev: MouseEvent) => {
      if (chartDragging.current === null) return;
      const delta = ev.clientY - startY;
      const newH = [...startHeights];
      newH[idx] = Math.max(0.3, startHeights[idx] + delta / 200);
      newH[idx + 1] = Math.max(0.3, startHeights[idx + 1] - delta / 200);
      setChartHeights(newH);
    };
    const onUp = () => { chartDragging.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const ppcColor = (v: number) => v >= 85 ? '#22c55e' : v >= 60 ? '#f59e0b' : '#ef4444';
  const effColor = (v: number) => v >= 100 ? '#22c55e' : v >= 80 ? '#f59e0b' : '#ef4444';
  const actName = (id: string) => state.activities.find(a => a.id === id)?.name || id;
  const thS: React.CSSProperties = { padding: '5px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--border-primary)' };
  const tdS: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, color: 'var(--text-primary)' };

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12, padding: '16px 20px', flexShrink: 0 }}>
        {[
          { label: 'PPC Promedio', value: avgPPC + '%', color: ppcColor(avgPPC), icon: <BarChart3 size={14} /> },
          { label: 'Eficiencia Prom.', value: avgEfficiency + '%', color: effColor(avgEfficiency), icon: <Activity size={14} /> },
          { label: 'Semanas Reg.', value: history.length, color: '#6366f1', icon: <CalendarDays size={14} /> },
          { label: 'Tendencia (4 sem)', value: (recentTrend >= 0 ? '+' : '') + recentTrend + 'pp', color: recentTrend >= 0 ? '#22c55e' : '#ef4444', icon: <TrendingUp size={14} /> },
          { label: 'CNC Totales', value: totalCNC, color: '#f59e0b', icon: <Award size={14} /> },
        ].map((k, i) => (
          <div key={i} style={{ flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-heading)' }}>{k.value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts Area ── */}
      <div ref={containerRef} style={{ display: 'flex', padding: '0 20px 12px', minHeight: 500, overflow: 'hidden', flexShrink: 0 }}>

        {/* Left Column: PPC Trend + Efficiency + History */}
        <div style={{ width: `${chartSplit}%`, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', paddingRight: 0 }}>

          {/* PPC Trend Chart */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, flex: chartHeights[0], minHeight: 180, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)' }}>Tendencia PPC Semanal</div>
              <div style={{ display: 'flex', gap: 10, fontSize: 9 }}>
                <span style={{ color: '#22c55e' }}>— Meta 85%</span>
                <span style={{ color: '#f59e0b' }}>— Mín 60%</span>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 120 }}>
              {history.length === 0
                ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>Sin datos. Registra semanas PPC para ver la tendencia.</div>
                : <PPCTrendChart history={[...history].reverse()} />
              }
            </div>
          </div>

          {/* Resize handle between PPC Trend and Efficiency */}
          <div onMouseDown={e => onChartDragMouseDown(0, e)}
            style={{ height: 8, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--border-secondary)' }} />
          </div>

          {/* Efficiency Chart */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, flex: chartHeights[1], minHeight: 180, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)' }}>Eficiencia Semanal (% Real / % Programado)</div>
              <div style={{ fontSize: 9, color: '#22c55e' }}>— 100% Objetivo</div>
            </div>
            <div style={{ flex: 1, minHeight: 120 }}>
              {history.length === 0
                ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>Sin datos de eficiencia.</div>
                : <EfficiencyChart history={[...enrichedHistory].reverse()} />
              }
            </div>
          </div>

          {/* Resize handle between Efficiency and History */}
          <div onMouseDown={e => onChartDragMouseDown(1, e)}
            style={{ height: 8, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--border-secondary)' }} />
          </div>

          {/* Registered Weeks History */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, flex: chartHeights[2], overflow: 'auto', minHeight: 100 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8 }}>Historial de Semanas Registradas</div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
                No hay registros PPC. Haz clic en "Registrar" para iniciar el seguimiento semanal.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {history.map(w => {
                  const d = parseDate(w.weekStart);
                  const color = ppcColor(w.ppc);
                  const eW = enrichedHistory.find(e => e.id === w.id);
                  const eff = eW && eW._totalProg > 0 ? Math.round((eW._totalReal / eW._totalProg) * 100) : w.ppc;
                  return (
                    <div key={w.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}
                        onClick={() => setEditingWeekId(editingWeekId === w.id ? null : w.id)}>
                        <span style={{ width: 70, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>{d ? fmtDate(d) : w.weekStart}</span>
                        <div style={{ flex: 1, height: 18, background: 'var(--bg-input)', borderRadius: 4, position: 'relative' }}>
                          <div style={{ height: '100%', width: `${w.ppc}%`, background: color, borderRadius: 4, transition: 'width .3s' }} />
                          <div style={{ position: 'absolute', left: '85%', top: 0, bottom: 0, width: 1, background: '#22c55e44' }} />
                          <div style={{ position: 'absolute', left: '60%', top: 0, bottom: 0, width: 1, background: '#f59e0b44' }} />
                        </div>
                        <span style={{ width: 38, fontSize: 11, fontWeight: 700, color, textAlign: 'right' }}>{w.ppc}%</span>
                        <span style={{ width: 45, fontSize: 9, color: effColor(eff), fontWeight: 600 }}>Ef:{eff}%</span>
                        <span style={{ width: 50, fontSize: 9, color: 'var(--text-muted)' }}>{w.planned.length}p/{w.completed.length}c</span>
                        <span style={{ width: 30, fontSize: 9, color: '#ef444488' }}>{w.cncEntries.length > 0 ? w.cncEntries.length + ' CNC' : ''}</span>
                        <button onClick={(e) => { e.stopPropagation(); loadRecordForEdit(w); }}
                          title="Editar registro"
                          style={{ background: 'none', border: 'none', color: editingRecordId === w.id ? '#6366f1' : '#6366f188', cursor: 'pointer', padding: 2 }}><Edit2 size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); if (editingRecordId === w.id) setEditingRecordId(null); dispatch({ type: 'DELETE_PPC_WEEK', id: w.id }); triggerSave(); }}
                          style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', padding: 2 }}><Trash2 size={12} /></button>
                      </div>

                      {/* CNC entry section (expanded) */}
                      {editingWeekId === w.id && (() => {
                        const notCompleted = w.planned.filter(id => !w.completed.includes(id));
                        return (
                          <div style={{ marginTop: 4, marginBottom: 8, marginLeft: 78, background: 'var(--bg-app)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 6 }}>
                              CNC — {notCompleted.length} no cumplida(s)
                            </div>
                            {w.cncEntries.length > 0 && (
                              <div style={{ marginBottom: 6 }}>
                                {w.cncEntries.map(e => (
                                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', borderBottom: '1px solid var(--border-primary)' }}>
                                    <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, background: CNC_COLORS[e.category] + '22', color: CNC_COLORS[e.category] }}>{e.category}</span>
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{e.activityId}</span>
                                    <span style={{ flex: 1, fontSize: 10 }}>{e.description}</span>
                                    <button onClick={() => { dispatch({ type: 'DELETE_CNC_ENTRY', weekId: w.id, entryId: e.id }); triggerSave(); }}
                                      style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', padding: 2 }}><Trash2 size={10} /></button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {notCompleted.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                                <div>
                                  <label style={{ fontSize: 8, color: 'var(--text-muted)', display: 'block' }}>Actividad</label>
                                  <select value={cncActId} onChange={e => setCncActId(e.target.value)}
                                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 10, maxWidth: 140 }}>
                                    <option value="">...</option>
                                    {notCompleted.map(id => <option key={id} value={id}>{id} – {actName(id)}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={{ fontSize: 8, color: 'var(--text-muted)', display: 'block' }}>Categoría</label>
                                  <select value={cncCat} onChange={e => setCncCat(e.target.value as CNCCategory)}
                                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 10 }}>
                                    {CNC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: 8, color: 'var(--text-muted)', display: 'block' }}>Descripción</label>
                                  <input value={cncDesc} onChange={e => setCncDesc(e.target.value)} placeholder="Causa..."
                                    onKeyDown={e => e.key === 'Enter' && addCNC(w.id)}
                                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 10 }} />
                                </div>
                                <button onClick={() => addCNC(w.id)} disabled={!cncActId || !cncDesc}
                                  style={{ padding: '3px 10px', background: '#6366f1', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 10, fontWeight: 600, opacity: (!cncActId || !cncDesc) ? 0.5 : 1 }}>+ CNC</button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Vertical resize handle between columns */}
        <div onMouseDown={onSplitMouseDown}
          style={{ width: 10, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 3, height: 40, borderRadius: 2, background: 'var(--border-secondary)' }} />
        </div>

        {/* Right Column: CNC Pareto Chart + Legend */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
          {/* CNC Pareto Chart */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, height: paretoHeight, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)' }}>Análisis Pareto — CNC</div>
              <div style={{ fontSize: 9, color: '#f59e0b' }}>— Acum. % | <span style={{ color: '#ef4444' }}>— 80%</span></div>
            </div>
            <div style={{ flex: 1, minHeight: 180 }}>
              {cncAgg.length === 0
                ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>Sin datos de CNC.</div>
                : <CNCParetoChart data={cncAgg} total={totalCNC} />
              }
            </div>
            {cncAgg.length > 0 && (
              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: 6 }}>
                <span style={{ fontSize: 9, color: '#f59e0b' }}>
                  Las primeras {Math.min(cncAgg.length, cncAgg.filter((_, i) => {
                    let cum = 0; for (let j = 0; j <= i; j++) cum += cncAgg[j].count;
                    return cum / totalCNC <= 0.8;
                  }).length + 1)} categorías representan ~80% de las causas de no cumplimiento.
                </span>
              </div>
            )}
          </div>

          {/* Resize handle for Pareto height */}
          <div onMouseDown={e => {
            e.preventDefault();
            paretoDragging.current = true;
            const startY = e.clientY;
            const startH = paretoHeight;
            const onMove = (ev: MouseEvent) => { if (!paretoDragging.current) return; setParetoHeight(Math.max(200, Math.min(800, startH + ev.clientY - startY))); };
            const onUp = () => { paretoDragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; };
            document.body.style.cursor = 'row-resize';
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
            style={{ height: 8, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--border-secondary)' }} />
          </div>

          {/* Category Legend */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, flexShrink: 0, marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 6 }}>Categorías CNC</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CNC_CATEGORIES.map(c => (
                <span key={c} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, background: CNC_COLORS[c] + '18', color: CNC_COLORS[c], fontWeight: 500 }}>{c}</span>
              ))}
            </div>
          </div>

          {/* Reference */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 6 }}>Referencia Last Planner System</div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong style={{ color: '#22c55e' }}>PPC ≥ 85%</strong> → Planificación confiable<br />
              <strong style={{ color: '#f59e0b' }}>PPC 60-84%</strong> → Mejora necesaria<br />
              <strong style={{ color: '#ef4444' }}>PPC &lt; 60%</strong> → Problemas sistémicos<br />
              <strong>Eficiencia</strong> = Σ(% Real) / Σ(% Programado) × 100
            </div>
          </div>
        </div>
      </div>

      {/* ── Registration Table (always visible below charts) ── */}
      <div style={{ padding: '0 20px 16px', flexShrink: 0 }}>
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {editingRecordId
                ? <><Edit2 size={14} style={{ color: '#f59e0b' }} /><span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>Editando Registro</span></>
                : <><PlusCircle size={14} style={{ color: '#6366f1' }} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)' }}>Registrar Semana</span></>
              }
            </div>
            {editingRecordId && (
              <button onClick={cancelEdit} style={{ padding: '2px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10 }}>Cancelar edición</button>
            )}
            <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fecha de corte:</label>
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
            {(() => { const d = parseDate(weekStart); if (!d) return null; const s = new Date(d); s.setDate(s.getDate() - 7); return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Período: {fmtDate(s)} — {fmtDate(d)}</span>; })()}
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>| Planificadas: {selectedPlanned.length} | Cumplidas: {selectedCompleted.length} | PPC: {selectedPlanned.length > 0 ? Math.round(selectedCompleted.length / selectedPlanned.length * 100) : 0}%</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input value={actSearch} onChange={e => setActSearch(e.target.value)} placeholder="Buscar actividad..."
                style={{ width: 180, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 10 }} />
              {actSearch && <button onClick={() => setActSearch('')} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>}
            </div>
          </div>
          <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '3.5%' }} />{/* Plan */}
                <col style={{ width: '3.5%' }} />{/* ✓ */}
                <col style={{ width: '6%' }} />{/* ID */}
                <col style={{ width: '20%' }} />{/* Actividad */}
                <col style={{ width: '7%' }} />{/* % Prog */}
                <col style={{ width: '7%' }} />{/* % Real */}
                <col style={{ width: '5%' }} />{/* Efic */}
                <col style={{ width: '10%' }} />{/* Encargado */}
                <col style={{ width: '14%' }} />{/* CNC Cat */}
                <col style={{ width: '24%' }} />{/* CNC Desc */}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'center', cursor: 'pointer' }} onClick={toggleAllPlanned} title={allPlanned ? 'Deseleccionar todas' : 'Seleccionar todas'}>
                    {allPlanned ? <CheckSquare size={13} style={{ color: '#6366f1' }} /> : <Square size={13} />} <span style={{ display: 'block', fontSize: 8, marginTop: 1 }}>Plan</span>
                  </th>
                  <th style={{ ...thS, textAlign: 'center', cursor: 'pointer' }} onClick={toggleAllCompleted} title={allCompleted ? 'Desmarcar todas' : 'Marcar todas cumplidas'}>
                    {allCompleted ? <CheckSquare size={13} style={{ color: '#22c55e' }} /> : <Square size={13} />} <span style={{ display: 'block', fontSize: 8, marginTop: 1 }}>✓</span>
                  </th>
                  <th style={thS}>ID</th>
                  <th style={thS}>Actividad</th>
                  <th style={{ ...thS, textAlign: 'center' }}>% Prog.</th>
                  <th style={{ ...thS, textAlign: 'center' }}>% Real</th>
                  <th style={{ ...thS, textAlign: 'center' }}>Efic.</th>
                  <th style={thS}>Encargado</th>
                  <th style={thS}>CNC Categoría</th>
                  <th style={thS}>CNC Descripción</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map(a => {
                  const m = activityMetrics[a.id] || { planned: 0, real: 0 };
                  const eff = m.planned > 0 ? Math.round((m.real / m.planned) * 100) : (m.real > 0 ? 100 : 0);
                  const isNoCumplida = selectedPlanned.includes(a.id) && !selectedCompleted.includes(a.id);
                  const cncRow = formCNC[a.id] || { category: 'Sin Restricción' as CNCCategory, description: '' };
                  return (
                    <tr key={a.id} style={{ background: selectedPlanned.includes(a.id) ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                      <td style={{ ...tdS, textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedPlanned.includes(a.id)} onChange={() => togglePlanned(a.id)} />
                      </td>
                      <td style={{ ...tdS, textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedCompleted.includes(a.id)} onChange={() => toggleCompleted(a.id)} disabled={!selectedPlanned.includes(a.id)} />
                      </td>
                      <td style={{ ...tdS, fontFamily: 'var(--font-mono)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.id}</td>
                      <td style={{ ...tdS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</td>
                      <td style={{ ...tdS, textAlign: 'center', fontWeight: 600, color: '#6366f1' }}>{m.planned.toFixed(1)}%</td>
                      <td style={{ ...tdS, textAlign: 'center', fontWeight: 600, color: m.real >= m.planned ? '#22c55e' : '#ef4444' }}>{m.real}%</td>
                      <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: effColor(eff), fontSize: 10 }}>{eff}%</td>
                      <td style={{ ...tdS, color: 'var(--text-secondary)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.encargado || '—'}</td>
                      <td style={tdS}>
                        {isNoCumplida ? (
                          <select value={cncRow.category}
                            onChange={e => setFormCNC(prev => ({ ...prev, [a.id]: { ...cncRow, category: e.target.value as CNCCategory } }))}
                            style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 9 }}>
                            {CNC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>—</span>}
                      </td>
                      <td style={tdS}>
                        {isNoCumplida ? (
                          <input value={cncRow.description}
                            onChange={e => setFormCNC(prev => ({ ...prev, [a.id]: { ...cncRow, description: e.target.value } }))}
                            placeholder="Causa de no cumplimiento..."
                            style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '2px 6px', color: 'var(--text-primary)', fontSize: 9 }} />
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Totals row */}
          {activitiesInWindow.length > 0 && (() => {
            const totProg = activitiesInWindow.reduce((s, a) => s + (activityMetrics[a.id]?.planned || 0), 0);
            const totReal = activitiesInWindow.reduce((s, a) => s + (activityMetrics[a.id]?.real || 0), 0);
            const totEff = totProg > 0 ? Math.round((totReal / totProg) * 100) : 0;
            return (
              <div style={{ display: 'flex', gap: 12, padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-heading)', borderTop: '2px solid var(--border-primary)' }}>
                <span>Σ % Prog.: <span style={{ color: '#6366f1' }}>{totProg.toFixed(1)}%</span></span>
                <span>Σ % Real: <span style={{ color: totReal >= totProg ? '#22c55e' : '#ef4444' }}>{totReal.toFixed(1)}%</span></span>
                <span>Eficiencia Global: <span style={{ color: effColor(totEff) }}>{totEff}%</span></span>
              </div>
            );
          })()}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            {existingRecordForPeriod && !editingRecordId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: 6 }}>
                <AlertTriangle size={12} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 500 }}>Ya existe un registro para este período.</span>
                <button onClick={() => loadRecordForEdit(existingRecordForPeriod)}
                  style={{ padding: '1px 8px', background: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: 3, color: '#f59e0b', cursor: 'pointer', fontSize: 9, fontWeight: 600 }}>Editar existente</button>
              </div>
            )}
            <input value={weekNotes} onChange={e => setWeekNotes(e.target.value)} placeholder="Notas de la semana..."
              style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
            <button onClick={recordWeek} disabled={selectedPlanned.length === 0 || !!existingRecordForPeriod}
              style={{ padding: '6px 20px', background: editingRecordId ? '#f59e0b' : '#6366f1', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: (selectedPlanned.length === 0 || !!existingRecordForPeriod) ? 0.5 : 1 }}>
              {editingRecordId
                ? <><Edit2 size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Actualizar</>
                : <><PlusCircle size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Registrar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
