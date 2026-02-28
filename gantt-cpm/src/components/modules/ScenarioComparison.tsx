// ═══════════════════════════════════════════════════════════════════
// ScenarioComparison – Delta table & impact summary
// Shows differences between master schedule and a What-If scenario
// ═══════════════════════════════════════════════════════════════════
import { useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import { fmtDate } from '../../utils/cpm';
import { compareScenario, scenarioImpactSummary } from '../../utils/whatIfEngine';
import type { WhatIfScenario } from '../../types/gantt';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Calendar, Activity, Zap } from 'lucide-react';

interface Props {
  scenario: WhatIfScenario;
}

export default function ScenarioComparison({ scenario }: Props) {
  const { state } = useGantt();

  const comparison = useMemo(
    () => compareScenario(state.activities, scenario.activities),
    [state.activities, scenario.activities]
  );

  const impact = useMemo(
    () => scenarioImpactSummary(state.activities, scenario.activities),
    [state.activities, scenario.activities]
  );

  const deltaIcon = (d: number) => {
    if (d > 0) return <TrendingDown size={12} style={{ color: '#ef4444' }} />;
    if (d < 0) return <TrendingUp size={12} style={{ color: '#22c55e' }} />;
    return <Minus size={12} style={{ color: 'var(--text-muted)' }} />;
  };

  const deltaColor = (d: number) => d > 0 ? '#ef4444' : d < 0 ? '#22c55e' : 'var(--text-muted)';
  const deltaSign = (d: number) => d > 0 ? '+' + d : String(d);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Impact Summary Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10, padding: '12px 14px',
        borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-panel)',
      }}>
        {/* Project End Delta */}
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Calendar size={13} style={{ color: impact.projectEndDelta > 0 ? '#ef4444' : impact.projectEndDelta < 0 ? '#22c55e' : '#6366f1' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Fin del Proyecto</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: deltaColor(impact.projectEndDelta) }}>
            {impact.projectEndDelta === 0 ? 'Sin cambio' : deltaSign(impact.projectEndDelta) + ' días'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            Maestro: {impact.masterProjectEnd ? fmtDate(impact.masterProjectEnd) : '–'}
            {' → '}
            Escenario: {impact.scenarioProjectEnd ? fmtDate(impact.scenarioProjectEnd) : '–'}
          </div>
        </div>

        {/* Critical Path Changes */}
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Zap size={13} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Ruta Crítica</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>
            +{impact.newCriticalActivities.length} / −{impact.removedCriticalActivities.length}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            Nuevas críticas / Dejaron de serlo
          </div>
        </div>

        {/* Activities Affected */}
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Activity size={13} style={{ color: '#0ea5e9' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Actividades Afectadas</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-heading)' }}>
            {impact.totalActivitiesAffected}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            Holgura promedio: {impact.avgFloatChange >= 0 ? '+' : ''}{impact.avgFloatChange} días
          </div>
        </div>
      </div>

      {/* Delta Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {comparison.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <AlertTriangle size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <br />
            No hay diferencias entre el escenario y el programa maestro.
            <br />
            <span style={{ fontSize: 11 }}>Edita actividades en el editor para ver el impacto aquí.</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-panel)' }}>
                {['ID', 'Nombre', 'Inicio Δ', 'Fin Δ', 'Maestro Inicio', 'Escenario Inicio', 'Maestro Fin', 'Escenario Fin', 'Crit. M', 'Crit. E', 'HT M', 'HT E'].map(h => (
                  <th key={h} style={{
                    padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-primary)',
                    whiteSpace: 'nowrap', textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map((r, i) => (
                <tr key={r.activityId} style={{ background: i % 2 === 0 ? 'var(--bg-app)' : 'var(--bg-panel)' }}>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', fontFamily: 'monospace', fontSize: 11 }}>{r.activityId}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.activityName}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', color: deltaColor(r.deltaStart), fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {deltaIcon(r.deltaStart)} {r.deltaStart === 0 ? '–' : deltaSign(r.deltaStart) + 'd'}
                    </div>
                  </td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', color: deltaColor(r.deltaFinish), fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {deltaIcon(r.deltaFinish)} {r.deltaFinish === 0 ? '–' : deltaSign(r.deltaFinish) + 'd'}
                    </div>
                  </td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11 }}>{fmtDate(r.masterES)}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, color: r.deltaStart !== 0 ? '#f59e0b' : 'var(--text-primary)' }}>{fmtDate(r.scenarioES)}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11 }}>{fmtDate(r.masterEF)}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, color: r.deltaFinish !== 0 ? '#f59e0b' : 'var(--text-primary)' }}>{fmtDate(r.scenarioEF)}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', color: r.masterCrit ? '#ef4444' : 'var(--text-muted)' }}>{r.masterCrit ? 'Sí' : 'No'}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', color: r.scenarioCrit ? '#ef4444' : 'var(--text-muted)', fontWeight: r.masterCrit !== r.scenarioCrit ? 700 : 400 }}>{r.scenarioCrit ? 'Sí' : 'No'}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)' }}>{r.masterTF ?? '–'}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', color: r.masterTF !== r.scenarioTF ? '#f59e0b' : 'var(--text-primary)', fontWeight: r.masterTF !== r.scenarioTF ? 600 : 400 }}>{r.scenarioTF ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
