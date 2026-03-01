// ═══════════════════════════════════════════════════════════════════
// RiskDistributionPanel – Table to assign probability distributions
// to each activity's duration. Works on the active project.
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import type { DurationDistribution, DistributionType } from '../../types/risk';
import { Shuffle } from 'lucide-react';

const DIST_LABELS: Record<DistributionType, string> = {
  triangular: 'Triangular',
  betaPERT: 'BetaPERT',
  uniform: 'Uniforme',
  none: 'Sin riesgo',
};

const DIST_TYPES: DistributionType[] = ['none', 'triangular', 'betaPERT', 'uniform'];

export default function RiskDistributionPanel() {
  const { state, dispatch } = useGantt();
  const distributions = state.riskState.distributions;

  // Only show task activities (not summary, milestone, project row, hidden)
  const tasks = useMemo(
    () => state.activities.filter(a => !a._isProjRow && a.type === 'task' && !a.id.startsWith('__')),
    [state.activities],
  );

  const handleDistType = useCallback((actId: string, type: DistributionType) => {
    const current = distributions[actId];
    const actDur = state.activities.find(a => a.id === actId)?.dur || 10;
    let dist: DurationDistribution;
    if (type === 'none') {
      dist = { type: 'none' };
    } else if (type === 'triangular' || type === 'betaPERT') {
      dist = {
        type,
        min: current?.min ?? Math.max(1, Math.round(actDur * 0.8)),
        mostLikely: current?.mostLikely ?? actDur,
        max: current?.max ?? Math.round(actDur * 1.3),
      };
    } else {
      dist = {
        type,
        min: current?.min ?? Math.max(1, Math.round(actDur * 0.8)),
        max: current?.max ?? Math.round(actDur * 1.3),
      };
    }
    dispatch({ type: 'SET_RISK_DISTRIBUTION', activityId: actId, dist });
  }, [distributions, state.activities, dispatch]);

  const handleNumChange = useCallback((actId: string, field: 'min' | 'mostLikely' | 'max', val: string) => {
    const current = distributions[actId];
    if (!current || current.type === 'none') return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    dispatch({ type: 'SET_RISK_DISTRIBUTION', activityId: actId, dist: { ...current, [field]: Math.round(num) } });
  }, [distributions, dispatch]);

  const handleApplyDefault = useCallback(() => {
    const bulk: Record<string, DurationDistribution> = {};
    for (const a of tasks) {
      if ((a.pct || 0) >= 100) continue;
      const dur = a.dur || 1;
      bulk[a.id] = {
        type: 'triangular',
        min: Math.max(1, Math.round(dur * 0.8)),
        mostLikely: dur,
        max: Math.round(dur * 1.3),
      };
    }
    dispatch({ type: 'SET_RISK_DISTRIBUTIONS_BULK', distributions: bulk });
  }, [tasks, dispatch]);

  // Color for uncertainty range
  const uncertaintyColor = (dist: DurationDistribution | undefined): string => {
    if (!dist || dist.type === 'none') return 'var(--text-muted)';
    const range = (dist.max || 0) - (dist.min || 0);
    const ml = dist.mostLikely || dist.min || 1;
    const ratio = range / ml;
    if (ratio < 0.3) return '#22c55e';
    if (ratio < 0.6) return '#f59e0b';
    return '#ef4444';
  };

  // Mini sparkline SVG for distribution preview
  const MiniDistPreview = ({ dist }: { dist: DurationDistribution | undefined }) => {
    if (!dist || dist.type === 'none') return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>;
    const w = 60, h = 20;
    const mn = dist.min || 0, ml = dist.mostLikely || mn, mx = dist.max || ml;
    if (mx <= mn) return null;
    const xMin = 2, xMax = w - 2;
    const scale = (v: number) => xMin + ((v - mn) / (mx - mn)) * (xMax - xMin);
    const color = uncertaintyColor(dist);

    if (dist.type === 'uniform') {
      return (
        <svg width={w} height={h} style={{ verticalAlign: 'middle' }}>
          <rect x={scale(mn)} y={4} width={scale(mx) - scale(mn)} height={h - 8} fill={color} opacity={0.3} rx={1} />
          <line x1={scale(mn)} y1={4} x2={scale(mn)} y2={h - 4} stroke={color} strokeWidth={1.5} />
          <line x1={scale(mx)} y1={4} x2={scale(mx)} y2={h - 4} stroke={color} strokeWidth={1.5} />
        </svg>
      );
    }

    // Triangular / BetaPERT shape
    const xMl = scale(ml);
    return (
      <svg width={w} height={h} style={{ verticalAlign: 'middle' }}>
        <polygon
          points={`${scale(mn)},${h - 3} ${xMl},3 ${scale(mx)},${h - 3}`}
          fill={color} opacity={0.25} stroke={color} strokeWidth={1}
        />
      </svg>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
      }}>
        <button
          onClick={handleApplyDefault}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', fontSize: 11, fontWeight: 600,
            background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: 5, cursor: 'pointer',
          }}
          title="Aplicar distribución Triangular (−20% / +30%) a todas las actividades sin distribución"
        >
          <Shuffle size={12} />
          Aplicar Distribución por Defecto
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Triangular: −20% / dur / +30%
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={thStyle}>#</th>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 160 }}>Actividad</th>
              <th style={thStyle}>Dur. Det.</th>
              <th style={{ ...thStyle, minWidth: 100 }}>Distribución</th>
              <th style={thStyle}>Min</th>
              <th style={thStyle}>Más Probable</th>
              <th style={thStyle}>Max</th>
              <th style={thStyle}>Preview</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((a, i) => {
              const dist = distributions[a.id];
              const isComplete = (a.pct || 0) >= 100;
              const distType = dist?.type || 'none';
              const showML = distType === 'triangular' || distType === 'betaPERT';
              const showMinMax = distType !== 'none';
              return (
                <tr key={a.id} style={{
                  background: isComplete ? 'rgba(34,197,94,0.05)' : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'),
                  opacity: isComplete ? 0.5 : 1,
                }}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 500 }}>{a.name}</td>
                  <td style={tdStyle}>{a.dur}d</td>
                  <td style={tdStyle}>
                    <select
                      value={distType}
                      onChange={e => handleDistType(a.id, e.target.value as DistributionType)}
                      disabled={isComplete}
                      style={{
                        fontSize: 11, padding: '2px 4px', borderRadius: 3,
                        border: '1px solid var(--border-primary)',
                        background: 'var(--bg-input)', color: 'var(--text-primary)',
                        cursor: 'pointer', width: '100%',
                      }}
                    >
                      {DIST_TYPES.map(dt => (
                        <option key={dt} value={dt}>{DIST_LABELS[dt]}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    {showMinMax ? (
                      <input type="number" min={1} value={dist?.min ?? ''} onChange={e => handleNumChange(a.id, 'min', e.target.value)}
                        style={inputStyle} />
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>
                    {showML ? (
                      <input type="number" min={1} value={dist?.mostLikely ?? ''} onChange={e => handleNumChange(a.id, 'mostLikely', e.target.value)}
                        style={inputStyle} />
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>
                    {showMinMax ? (
                      <input type="number" min={1} value={dist?.max ?? ''} onChange={e => handleNumChange(a.id, 'max', e.target.value)}
                        style={inputStyle} />
                    ) : '—'}
                  </td>
                  <td style={tdStyle}><MiniDistPreview dist={dist} /></td>
                </tr>
              );
            })}
            {tasks.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No hay actividades tipo tarea en el proyecto.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'center', fontWeight: 600, fontSize: 10,
  borderBottom: '2px solid var(--border-primary)', whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
};
const tdStyle: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-primary)',
  whiteSpace: 'nowrap',
};
const inputStyle: React.CSSProperties = {
  width: 55, fontSize: 11, padding: '2px 4px', borderRadius: 3,
  border: '1px solid var(--border-primary)', textAlign: 'center',
  background: 'var(--bg-input)', color: 'var(--text-primary)',
};
