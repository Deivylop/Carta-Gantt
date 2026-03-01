// ═══════════════════════════════════════════════════════════════════
// RiskGanttChart – Simplified Gantt comparison (Deterministic vs Simulation)
// Shows deterministic bars and simulated P50/P80/P90 overlays.
// Simulated bars use per-activity START + FINISH percentiles so that
// cascading effects (successor delays) are properly rendered.
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { SimulationResult } from '../../types/risk';
import { useGantt } from '../../store/GanttContext';

const ROW_H = 32;
const LABEL_W = 260;
const BAR_H = 9;
const TOP_HEADER = 44;

interface Props {
  result: SimulationResult;
}

export default function RiskGanttChart({ result }: Props) {
  const { state } = useGantt();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pLevel, setPLevel] = useState<50 | 80 | 90>(80);

  // Build display rows (tasks + summaries, no proj/meta)
  const displayRows = useMemo(() => {
    return state.activities.filter(a =>
      !a._isProjRow && !a.id.startsWith('__') && (a.type === 'task' || a.type === 'summary')
    );
  }, [state.activities]);

  // Date range
  const { minDate, maxDate, daySpan } = useMemo(() => {
    let min = new Date(state.projStart);
    let max = new Date(state.projStart);

    for (const a of displayRows) {
      if (a.ES && a.ES < min) min = new Date(a.ES);
      if (a.EF && a.EF > max) max = new Date(a.EF);
    }

    // Extend to include simulated dates (both start & finish)
    const ap = result.activityPercentiles;
    for (const actId of Object.keys(ap)) {
      for (const p of [50, 80, 90]) {
        const fStr = ap[actId]?.datePercentiles?.[p];
        if (fStr) {
          const d = new Date(fStr);
          d.setDate(d.getDate() + 1); // inclusive→exclusive for range calc
          if (!isNaN(d.getTime()) && d > max) max = new Date(d);
        }
        const sStr = ap[actId]?.startDatePercentiles?.[p];
        if (sStr) {
          const d = new Date(sStr);
          if (!isNaN(d.getTime()) && d < min) min = new Date(d);
        }
      }
    }

    min = new Date(min.getTime() - 3 * 86400000);
    max = new Date(max.getTime() + 7 * 86400000);
    const span = Math.max(1, Math.ceil((max.getTime() - min.getTime()) / 86400000));
    return { minDate: min, maxDate: max, daySpan: span };
  }, [displayRows, result, state.projStart]);

  // Resolve CSS variable colors from the DOM
  const colors = useMemo(() => {
    const el = containerRef.current || document.documentElement;
    const cs = getComputedStyle(el);
    return {
      textPrimary: cs.getPropertyValue('--text-primary').trim() || '#e2e8f0',
      textSecondary: cs.getPropertyValue('--text-secondary').trim() || '#94a3b8',
      textMuted: cs.getPropertyValue('--text-muted').trim() || '#64748b',
      textHeading: cs.getPropertyValue('--text-heading').trim() || '#f1f5f9',
      borderPrimary: cs.getPropertyValue('--border-primary').trim() || '#334155',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows]); // re-resolve when rows change (theme may have changed)

  // ─── Draw ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const cW = Math.max(LABEL_W + daySpan * 3.5, container.clientWidth);
    const cH = TOP_HEADER + displayRows.length * ROW_H + 20;
    canvas.width = cW * dpr;
    canvas.height = cH * dpr;
    canvas.style.width = cW + 'px';
    canvas.style.height = cH + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cW, cH);

    const chartW = cW - LABEL_W;
    const dayW = chartW / daySpan;
    const toX = (d: Date) => LABEL_W + ((d.getTime() - minDate.getTime()) / 86400000) * dayW;

    // ─── Grid Background ──────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    ctx.fillRect(LABEL_W, 0, chartW, cH);

    // Month headers
    const cur = new Date(minDate);
    cur.setDate(1);
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    while (cur <= maxDate) {
      const x = toX(cur);
      if (x >= LABEL_W) {
        ctx.strokeStyle = 'rgba(128,128,128,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x, TOP_HEADER); ctx.lineTo(x, cH); ctx.stroke();
        ctx.fillStyle = colors.textMuted;
        ctx.fillText(
          cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
          x + 35, 14
        );
      }
      cur.setMonth(cur.getMonth() + 1);
    }

    // Week lines
    const wk = new Date(minDate);
    while (wk <= maxDate) {
      if (wk.getDay() === 1) {
        const x = toX(wk);
        if (x >= LABEL_W) {
          ctx.strokeStyle = 'rgba(128,128,128,0.06)';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(x, TOP_HEADER); ctx.lineTo(x, cH); ctx.stroke();
          ctx.fillStyle = colors.textMuted;
          ctx.font = '8px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(wk.getDate().toString(), x, TOP_HEADER - 5);
        }
      }
      wk.setDate(wk.getDate() + 1);
    }

    // Status date line
    if (state.statusDate) {
      const sx = toX(state.statusDate);
      if (sx >= LABEL_W && sx <= cW) {
        ctx.setLineDash([4, 2]);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, TOP_HEADER); ctx.lineTo(sx, cH); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ─── Draw Rows ────────────────────────────────────────────
    const ap = result.activityPercentiles;

    for (let i = 0; i < displayRows.length; i++) {
      const a = displayRows[i];
      const y = TOP_HEADER + i * ROW_H;

      // Row background
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0.03)';
      ctx.fillRect(0, y, cW, ROW_H);

      // Row separator
      ctx.strokeStyle = 'rgba(128,128,128,0.08)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(cW, y + ROW_H); ctx.stroke();

      // ─── Label column ──────────────────────────────────────
      const indent = (a.lv || 0) * 14;
      ctx.textAlign = 'left';

      // Activity ID
      ctx.fillStyle = colors.textMuted;
      ctx.font = '8px Inter, system-ui, sans-serif';
      ctx.fillText(a.id, 6 + indent, y + 11, 60);

      // Activity Name
      ctx.fillStyle = a.type === 'summary' ? colors.textHeading : colors.textPrimary;
      ctx.font = a.type === 'summary' ? 'bold 10px Inter, system-ui, sans-serif' : '10px Inter, system-ui, sans-serif';
      ctx.fillText(a.name, 6 + indent, y + 23, LABEL_W - 14 - indent);

      // ─── Bars ──────────────────────────────────────────────
      if (a.ES && a.EF) {
        const x1 = toX(a.ES);
        const x2 = toX(a.EF);
        const bw = Math.max(2, x2 - x1);
        const by = y + (ROW_H - BAR_H * 2 - 3) / 2;

        if (a.type === 'summary') {
          // Summary: thin bar with triangle markers
          ctx.fillStyle = '#475569';
          ctx.fillRect(x1, by + BAR_H / 2, bw, 3);
          ctx.beginPath(); ctx.moveTo(x1, by); ctx.lineTo(x1 + 5, by + BAR_H); ctx.lineTo(x1, by + BAR_H); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x2, by); ctx.lineTo(x2 - 5, by + BAR_H); ctx.lineTo(x2, by + BAR_H); ctx.fill();
        } else {
          // ── Deterministic bar (blue) ──
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.roundRect(x1, by, bw, BAR_H, 2);
          ctx.fill();

          // Progress overlay (green) — extends up to status date
          if ((a.pct || 0) > 0) {
            let pw: number;
            if (state.statusDate) {
              const sdX = toX(state.statusDate);
              pw = Math.max(2, Math.min(sdX - x1, bw));
            } else {
              pw = bw * Math.min(1, (a.pct || 0) / 100);
            }
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.roundRect(x1, by, pw, BAR_H, 2);
            ctx.fill();
          }

          // Duration label (right of deterministic bar) — show remaining duration
          ctx.fillStyle = colors.textSecondary;
          ctx.font = '8px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${a.remDur ?? a.dur}d`, x2 + 4, by + BAR_H - 1);

          // ── Simulated P-level bar (uses SIMULATED START -> FINISH) ──
          const actP = ap[a.id];
          if (actP) {
            const simFinishStr = actP.datePercentiles[pLevel];
            const simStartStr = actP.startDatePercentiles?.[pLevel];
            const simDur = actP.durationPercentiles[pLevel];

            if (simFinishStr) {
              const simFinish = new Date(simFinishStr);
              // Dates are stored inclusive; add 1 day for exclusive bar positioning (matching EF convention)
              simFinish.setDate(simFinish.getDate() + 1);
              // Use simulated start if available (accounts for cascading), else fallback to det ES
              const simStart = simStartStr ? new Date(simStartStr) : a.ES;

              if (!isNaN(simFinish.getTime()) && !isNaN(simStart.getTime())) {
                const sx1 = toX(simStart);
                const sx2 = toX(simFinish);
                const sby = by + BAR_H + 3;
                const sbw = Math.max(2, sx2 - sx1);

                const simColor = pLevel <= 50 ? '#22c55e' : pLevel <= 80 ? '#f59e0b' : '#ef4444';

                // Fill
                ctx.fillStyle = simColor + '50';
                ctx.beginPath();
                ctx.roundRect(sx1, sby, sbw, BAR_H, 2);
                ctx.fill();

                // Border
                ctx.strokeStyle = simColor;
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.roundRect(sx1, sby, sbw, BAR_H, 2);
                ctx.stroke();

                // P-level duration label
                if (simDur != null) {
                  ctx.fillStyle = simColor;
                  ctx.font = 'bold 8px Inter, system-ui, sans-serif';
                  ctx.textAlign = 'left';
                  ctx.fillText(`P${pLevel}: ${simDur}d`, sx2 + 4, sby + BAR_H - 1);
                }
              }
            }
          }
        }
      }
    }

    // Label / chart separator
    ctx.strokeStyle = colors.borderPrimary;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, cH); ctx.stroke();

    // Header bottom line
    ctx.beginPath(); ctx.moveTo(0, TOP_HEADER); ctx.lineTo(cW, TOP_HEADER); ctx.stroke();

  }, [displayRows, result, minDate, daySpan, pLevel, state.statusDate, maxDate, colors]);

  const handleScroll = useCallback((_e: React.UIEvent<HTMLDivElement>) => {
    // reserved for future scroll sync
  }, []);

  const fmtDateStr = (iso: string) => {
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
        background: 'var(--bg-panel)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-heading)' }}>
          Comparación Gantt: Determinístico vs Simulación
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Mostrar percentil:</span>
        {([50, 80, 90] as const).map(p => (
          <button key={p} onClick={() => setPLevel(p)}
            style={{
              padding: '2px 10px', fontSize: 10, fontWeight: pLevel === p ? 700 : 400,
              borderRadius: 4, cursor: 'pointer',
              border: pLevel === p ? '1px solid #6366f1' : '1px solid var(--border-primary)',
              background: pLevel === p ? '#6366f120' : 'var(--bg-input)',
              color: pLevel === p ? '#6366f1' : 'var(--text-secondary)',
            }}>
            P{p}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '4px 12px',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
        fontSize: 9, color: 'var(--text-muted)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 16, height: 8, borderRadius: 2, background: '#3b82f6' }} />
          Determinístico
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 16, height: 8, borderRadius: 2, background: '#22c55e50', border: '1px solid #22c55e' }} />
          P50
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 16, height: 8, borderRadius: 2, background: '#f59e0b50', border: '1px solid #f59e0b' }} />
          P80
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 16, height: 8, borderRadius: 2, background: '#ef444450', border: '1px solid #ef4444' }} />
          P90
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 16, height: 8, borderRadius: 2, background: '#22c55e' }} />
          Progreso
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontWeight: 600, fontSize: 10 }}>
          Det: {result.deterministicDuration}d | P{pLevel}: {result.durationPercentiles[pLevel] ?? '?'}d
          ({fmtDateStr(result.datePercentiles[pLevel] || '')})
        </span>
      </div>

      {/* Chart */}
      <div ref={containerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflow: 'auto' }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}