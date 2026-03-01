// ═══════════════════════════════════════════════════════════════════
// RiskResultsChart – Histogram + CDF + Percentile table
// Displays the results of a Monte Carlo simulation run.
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo, useRef, useEffect } from 'react';
import type { SimulationResult } from '../../types/risk';
import { fmtDate } from '../../utils/cpm';

interface Props {
  result: SimulationResult;
}

export default function RiskResultsChart({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const percentiles = useMemo(() => {
    const levels = Object.keys(result.durationPercentiles).map(Number).sort((a, b) => a - b);
    return levels.map(p => ({
      level: p,
      duration: result.durationPercentiles[p],
      date: result.datePercentiles[p],
      delta: result.durationPercentiles[p] - result.deterministicDuration,
    }));
  }, [result]);

  // Draw histogram + CDF on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = 300;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const bins = result.histogram;
    if (bins.length === 0) return;

    const pad = { top: 30, right: 60, bottom: 50, left: 60 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;
    const maxCount = Math.max(...bins.map(b => b.count), 1);
    const barW = cw / bins.length;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    ctx.fillRect(pad.left, pad.top, cw, ch);

    // Grid lines
    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (ch * i) / 5;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    }

    // Histogram bars
    for (let i = 0; i < bins.length; i++) {
      const b = bins[i];
      const x = pad.left + i * barW;
      const bh = (b.count / maxCount) * ch;
      const y = pad.top + ch - bh;

      // Color based on cumulative percentage
      if (b.cumPct <= 50) ctx.fillStyle = 'rgba(34,197,94,0.6)';
      else if (b.cumPct <= 80) ctx.fillStyle = 'rgba(245,158,11,0.6)';
      else ctx.fillStyle = 'rgba(239,68,68,0.6)';

      ctx.fillRect(x + 1, y, barW - 2, bh);
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 1, y, barW - 2, bh);
    }

    // CDF line (right Y axis)
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    for (let i = 0; i < bins.length; i++) {
      const b = bins[i];
      const x = pad.left + (i + 0.5) * barW;
      const y = pad.top + ch - (b.cumPct / 100) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Deterministic line
    const detDur = result.deterministicDuration;
    const minBin = bins[0].binStart;
    const maxBin = bins[bins.length - 1].binEnd;
    const detX = pad.left + ((detDur - minBin) / (maxBin - minBin)) * cw;
    if (detX >= pad.left && detX <= pad.left + cw) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(detX, pad.top); ctx.lineTo(detX, pad.top + ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Det: ${detDur}d`, detX, pad.top - 5);
    }

    // Percentile lines (P50, P80)
    const pColors: Record<number, string> = { 50: '#22c55e', 80: '#f59e0b', 90: '#ef4444' };
    for (const p of [50, 80, 90]) {
      const dur = result.durationPercentiles[p];
      if (dur == null) continue;
      const px = pad.left + ((dur - minBin) / (maxBin - minBin)) * cw;
      if (px < pad.left || px > pad.left + cw) continue;
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = pColors[p] || '#666';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, pad.top); ctx.lineTo(px, pad.top + ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pColors[p] || '#666';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`P${p}: ${dur}d`, px, pad.top + ch + 14);
    }

    // Axes labels
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + ch - (ch * i) / 5;
      const val = Math.round((maxCount * i) / 5);
      ctx.fillText(String(val), pad.left - 6, y + 3);
    }
    // Right axis (CDF %)
    ctx.textAlign = 'left';
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + ch - (ch * i) / 5;
      ctx.fillStyle = '#6366f1';
      ctx.fillText(`${i * 20}%`, pad.left + cw + 6, y + 3);
    }

    // Bottom axis (duration bins)
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(bins.length / 6));
    for (let i = 0; i < bins.length; i += step) {
      const x = pad.left + (i + 0.5) * barW;
      ctx.fillText(`${bins[i].binStart}d`, x, pad.top + ch + 28);
    }

    // Axis titles
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'var(--text-muted)';
    ctx.textAlign = 'center';
    ctx.fillText('Duración del proyecto (días laborales)', pad.left + cw / 2, H - 4);
    ctx.restore();

  }, [result]);

  const fmtDateStr = (iso: string) => {
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: '12px 16px', gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard label="Determinístico" value={`${result.deterministicDuration}d`} sub={fmtDateStr(result.deterministicFinish)} color="#6366f1" />
        <SummaryCard label="P50 (Mediana)" value={`${result.durationPercentiles[50] ?? '—'}d`}
          sub={result.datePercentiles[50] ? fmtDateStr(result.datePercentiles[50]) : ''} color="#22c55e" />
        <SummaryCard label="P80" value={`${result.durationPercentiles[80] ?? '—'}d`}
          sub={result.datePercentiles[80] ? fmtDateStr(result.datePercentiles[80]) : ''} color="#f59e0b" />
        <SummaryCard label="P90" value={`${result.durationPercentiles[90] ?? '—'}d`}
          sub={result.datePercentiles[90] ? fmtDateStr(result.datePercentiles[90]) : ''} color="#ef4444" />
        <SummaryCard label="Media ± σ" value={`${result.meanDuration} ± ${result.stdDevDuration}`} sub={`${result.completedIterations} iteraciones`} color="#a855f7" />
      </div>

      {/* Canvas chart */}
      <div ref={containerRef} style={{ width: '100%', flexShrink: 0 }}>
        <canvas ref={canvasRef} />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span>■ <span style={{ color: 'rgba(34,197,94,0.8)' }}>≤ P50</span></span>
        <span>■ <span style={{ color: 'rgba(245,158,11,0.8)' }}>P50–P80</span></span>
        <span>■ <span style={{ color: 'rgba(239,68,68,0.8)' }}>&gt; P80</span></span>
        <span style={{ color: '#6366f1' }}>— CDF (Prob. Acumulada)</span>
        <span style={{ color: '#ef4444' }}>--- Determinístico</span>
      </div>

      {/* Percentile table */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>Tabla de Percentiles</div>
        <table style={{ width: '100%', maxWidth: 600, borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--bg-panel)' }}>
              <th style={thS}>Nivel</th>
              <th style={thS}>Duración</th>
              <th style={thS}>Fecha Término</th>
              <th style={thS}>Δ vs Det.</th>
            </tr>
          </thead>
          <tbody>
            {percentiles.map(p => (
              <tr key={p.level}>
                <td style={tdS}>P{p.level}</td>
                <td style={tdS}>{p.duration}d</td>
                <td style={tdS}>{fmtDateStr(p.date)}</td>
                <td style={{ ...tdS, color: p.delta > 0 ? '#ef4444' : p.delta < 0 ? '#22c55e' : 'var(--text-muted)' }}>
                  {p.delta > 0 ? '+' : ''}{p.delta}d
                </td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(99,102,241,0.08)' }}>
              <td style={{ ...tdS, fontWeight: 600 }}>Det.</td>
              <td style={tdS}>{result.deterministicDuration}d</td>
              <td style={tdS}>{fmtDateStr(result.deterministicFinish)}</td>
              <td style={tdS}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      padding: '10px 16px', borderRadius: 8, minWidth: 130,
      background: `${color}10`, border: `1px solid ${color}30`,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const thS: React.CSSProperties = { padding: '5px 10px', textAlign: 'center', fontWeight: 600, fontSize: 10, borderBottom: '2px solid var(--border-primary)', color: 'var(--text-secondary)' };
const tdS: React.CSSProperties = { padding: '4px 10px', textAlign: 'center', borderBottom: '1px solid var(--border-primary)' };
