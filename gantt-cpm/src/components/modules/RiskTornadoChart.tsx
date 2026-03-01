// ═══════════════════════════════════════════════════════════════════
// RiskTornadoChart – Tornado diagram + Criticality Index table
// Shows which activities have the most impact on project duration.
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import type { SimulationResult } from '../../types/risk';

interface Props {
  result: SimulationResult;
}

export default function RiskTornadoChart({ result }: Props) {
  const { state } = useGantt();

  const actNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    state.activities.forEach(a => { m[a.id] = a.name; });
    return m;
  }, [state.activities]);

  // Tornado data: top 15 by absolute sensitivity
  const tornadoData = useMemo(() => {
    const entries = Object.entries(result.sensitivityIndex)
      .map(([id, rho]) => ({ id, name: actNameMap[id] || id, rho }))
      .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
      .slice(0, 15);
    return entries;
  }, [result.sensitivityIndex, actNameMap]);

  // Criticality data: all activities with CI > 0
  const critData = useMemo(() => {
    return Object.entries(result.criticalityIndex)
      .map(([id, ci]) => ({
        id,
        name: actNameMap[id] || id,
        ci,
        rho: result.sensitivityIndex[id] || 0,
        dist: result.distributionsSnapshot[id],
      }))
      .sort((a, b) => b.ci - a.ci);
  }, [result.criticalityIndex, result.sensitivityIndex, result.distributionsSnapshot, actNameMap]);

  const maxRho = Math.max(...tornadoData.map(d => Math.abs(d.rho)), 0.01);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: '12px 16px', gap: 20 }}>
      {/* Tornado Chart */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 10 }}>
          Diagrama Tornado – Sensibilidad de Duración
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
          Correlación de Spearman entre la duración de cada actividad y la duración total del proyecto.
        </div>
        {tornadoData.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 16 }}>
            No hay datos de sensibilidad. Ejecuta una simulación con distribuciones asignadas.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {tornadoData.map(d => {
              const pct = (Math.abs(d.rho) / maxRho) * 100;
              const isPositive = d.rho >= 0;
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24 }}>
                  {/* Activity name */}
                  <div style={{
                    width: 180, fontSize: 11, textAlign: 'right',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'var(--text-primary)', flexShrink: 0,
                  }}>
                    {d.name}
                  </div>
                  {/* Bar */}
                  <div style={{ flex: 1, position: 'relative', height: 18 }}>
                    <div style={{
                      position: 'absolute',
                      left: isPositive ? '50%' : `${50 - pct / 2}%`,
                      width: `${pct / 2}%`,
                      top: 1, height: 16, borderRadius: 3,
                      background: isPositive
                        ? 'linear-gradient(90deg, #6366f180, #6366f1)'
                        : 'linear-gradient(270deg, #22c55e80, #22c55e)',
                    }} />
                    {/* Center line */}
                    <div style={{
                      position: 'absolute', left: '50%', top: 0, bottom: 0,
                      borderLeft: '1px solid var(--text-muted)',
                    }} />
                  </div>
                  {/* Value */}
                  <div style={{ width: 50, fontSize: 10, fontWeight: 600, color: isPositive ? '#6366f1' : '#22c55e', textAlign: 'right' }}>
                    {d.rho > 0 ? '+' : ''}{d.rho.toFixed(3)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Criticality Index Table */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 8 }}>
          Índice de Criticidad
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
          Porcentaje de iteraciones donde cada actividad se encontró en la ruta crítica.
        </div>
        <table style={{ width: '100%', maxWidth: 800, borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--bg-panel)' }}>
              <th style={thS}>Actividad</th>
              <th style={thS}>CI (%)</th>
              <th style={thS}>Sensibilidad (ρ)</th>
              <th style={thS}>Distribución</th>
              <th style={thS}>Min / ML / Max</th>
            </tr>
          </thead>
          <tbody>
            {critData.map((d, i) => {
              const dist = d.dist;
              const ciColor = d.ci >= 80 ? '#ef4444' : d.ci >= 50 ? '#f59e0b' : d.ci >= 20 ? '#6366f1' : 'var(--text-secondary)';
              return (
                <tr key={d.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                  <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{d.name}</td>
                  <td style={tdS}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <div style={{
                        width: 40, height: 8, borderRadius: 4,
                        background: 'rgba(128,128,128,0.15)', overflow: 'hidden',
                      }}>
                        <div style={{ width: `${d.ci}%`, height: '100%', background: ciColor, borderRadius: 4 }} />
                      </div>
                      <span style={{ color: ciColor, fontWeight: 600 }}>{d.ci}%</span>
                    </div>
                  </td>
                  <td style={tdS}>
                    <span style={{ color: d.rho > 0 ? '#6366f1' : '#22c55e', fontWeight: 500 }}>
                      {d.rho > 0 ? '+' : ''}{d.rho.toFixed(3)}
                    </span>
                  </td>
                  <td style={tdS}>{dist ? dist.type : '—'}</td>
                  <td style={tdS}>
                    {dist && dist.type !== 'none'
                      ? `${dist.min ?? '—'} / ${dist.mostLikely ?? '—'} / ${dist.max ?? '—'}`
                      : '—'}
                  </td>
                </tr>
              );
            })}
            {critData.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
                No hay datos de criticidad.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thS: React.CSSProperties = { padding: '5px 10px', textAlign: 'center', fontWeight: 600, fontSize: 10, borderBottom: '2px solid var(--border-primary)', color: 'var(--text-secondary)' };
const tdS: React.CSSProperties = { padding: '4px 10px', textAlign: 'center', borderBottom: '1px solid var(--border-primary)' };
