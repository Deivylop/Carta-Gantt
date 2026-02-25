// ═══════════════════════════════════════════════════════════════════
// DashboardPage – Project KPIs and performance charts
// ═══════════════════════════════════════════════════════════════════
import { useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import { fmtDate } from '../../utils/cpm';
import { BarChart3, TrendingUp, Clock, CheckCircle2, AlertTriangle, Target, Activity } from 'lucide-react';

export default function DashboardPage() {
  const { state } = useGantt();

  const tasks = useMemo(() => state.activities.filter(a => a.type === 'task' || a.type === 'milestone'), [state.activities]);

  const kpis = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(a => a.pct === 100).length;
    const inProgress = tasks.filter(a => (a.pct || 0) > 0 && (a.pct || 0) < 100).length;
    const notStarted = tasks.filter(a => !a.pct || a.pct === 0).length;
    const critical = tasks.filter(a => a.crit).length;
    const milestones = tasks.filter(a => a.type === 'milestone').length;
    const avgPct = total > 0 ? Math.round(tasks.reduce((s, a) => s + (a.pct || 0), 0) / total) : 0;

    // Work metrics
    const totalWork = tasks.reduce((s, a) => s + (a.work || 0), 0);
    const earnedWork = tasks.reduce((s, a) => s + (a.work || 0) * ((a.pct || 0) / 100), 0);

    // Duration metrics
    const totalDur = tasks.reduce((s, a) => s + (a.dur || 0), 0);
    const avgDur = total > 0 ? Math.round(totalDur / total) : 0;

    return { total, completed, inProgress, notStarted, critical, milestones, avgPct, totalWork, earnedWork, totalDur, avgDur };
  }, [tasks]);

  // Completion by status pie-chart data
  const statusData = useMemo(() => [
    { label: 'Completada', value: kpis.completed, color: '#22c55e' },
    { label: 'En curso', value: kpis.inProgress, color: '#f59e0b' },
    { label: 'No iniciada', value: kpis.notStarted, color: '#64748b' },
  ], [kpis]);

  // Progress distribution data for histogram
  const progressDist = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0]; // 0%, 1-25%, 26-50%, 51-75%, 76-100%
    tasks.forEach(a => {
      const p = a.pct || 0;
      if (p === 0) buckets[0]++;
      else if (p <= 25) buckets[1]++;
      else if (p <= 50) buckets[2]++;
      else if (p <= 75) buckets[3]++;
      else buckets[4]++;
    });
    return buckets;
  }, [tasks]);

  // Simple SVG donut chart
  const DonutChart = ({ data, size = 180 }: { data: typeof statusData; size?: number }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Sin datos</div>;
    const r = size / 2 - 10;
    const c = size / 2;
    let cum = 0;

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          if (d.value === 0) return null;
          const angle0 = (cum / total) * 2 * Math.PI - Math.PI / 2;
          cum += d.value;
          const angle1 = (cum / total) * 2 * Math.PI - Math.PI / 2;
          const largeArc = d.value / total > 0.5 ? 1 : 0;
          const path = [
            `M ${c + r * Math.cos(angle0)} ${c + r * Math.sin(angle0)}`,
            `A ${r} ${r} 0 ${largeArc} 1 ${c + r * Math.cos(angle1)} ${c + r * Math.sin(angle1)}`,
            `L ${c} ${c}`,
            'Z',
          ].join(' ');
          return <path key={i} d={path} fill={d.color} stroke="var(--bg-panel)" strokeWidth={2} />;
        })}
        {/* Center hole */}
        <circle cx={c} cy={c} r={r * 0.55} fill="var(--bg-panel)" />
        <text x={c} y={c - 6} textAnchor="middle" fill="var(--text-heading)" fontSize={22} fontWeight={700}>{kpis.avgPct}%</text>
        <text x={c} y={c + 12} textAnchor="middle" fill="var(--text-muted)" fontSize={10}>Avance Global</text>
      </svg>
    );
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <BarChart3 size={22} style={{ color: 'var(--color-indigo)' }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Dashboard del Proyecto</h1>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {state.projName || 'Sin nombre'}
          {state.statusDate && ` · Fecha de estado: ${fmtDate(state.statusDate)}`}
        </span>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { icon: <Target size={16} />, label: 'Total', value: kpis.total, color: '#6366f1' },
          { icon: <CheckCircle2 size={16} />, label: 'Completadas', value: kpis.completed, color: '#22c55e' },
          { icon: <Clock size={16} />, label: 'En curso', value: kpis.inProgress, color: '#f59e0b' },
          { icon: <Activity size={16} />, label: 'No iniciadas', value: kpis.notStarted, color: '#64748b' },
          { icon: <AlertTriangle size={16} />, label: 'Críticas', value: kpis.critical, color: '#ef4444' },
          { icon: <TrendingUp size={16} />, label: 'Avance Prom.', value: kpis.avgPct + '%', color: '#0ea5e9' },
        ].map((k, i) => (
          <div key={i} style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-heading)' }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, marginBottom: 24 }}>
        {/* Donut */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16, alignSelf: 'flex-start' }}>Estado de Actividades</h3>
          <DonutChart data={statusData} />
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            {statusData.map((d, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} />
                {d.label} ({d.value})
              </span>
            ))}
          </div>
        </div>

        {/* Progress Distribution (bar chart with CSS) */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16 }}>Distribución de Avance</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 180 }}>
            {['0%', '1-25%', '26-50%', '51-75%', '76-100%'].map((lbl, i) => {
              const maxH = 160;
              const maxVal = Math.max(...progressDist, 1);
              const h = (progressDist[i] / maxVal) * maxH;
              const colors = ['#64748b', '#ef4444', '#f59e0b', '#0ea5e9', '#22c55e'];
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{progressDist[i]}</span>
                  <div style={{ width: '100%', height: h, background: colors[i], borderRadius: '4px 4px 0 0', transition: 'height .3s', minHeight: 4 }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' }}>{lbl}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Work Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 12 }}>Trabajo (Horas)</h3>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-heading)' }}>{kpis.totalWork.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total planificado</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{Math.round(kpis.earnedWork).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Valor ganado</div>
            </div>
          </div>
          <div style={{ marginTop: 12, background: 'var(--bg-input)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
            <div style={{ width: kpis.totalWork > 0 ? `${(kpis.earnedWork / kpis.totalWork) * 100}%` : '0%', height: '100%', background: '#22c55e', borderRadius: 6, transition: 'width .3s' }} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 12 }}>Duración</h3>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-heading)' }}>{kpis.totalDur}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Días totales</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0ea5e9' }}>{kpis.avgDur}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duración promedio</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{kpis.critical}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Actividades críticas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Critical Activities Table */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 12 }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: '#ef4444' }} />
          Actividades en Ruta Crítica
        </h3>
        <div style={{ overflow: 'auto', maxHeight: 300 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                {['ID', 'Nombre', 'Duración', 'Inicio', 'Fin', 'Avance', 'H.Total'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.filter(a => a.crit).slice(0, 20).map((a, i) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-primary)', background: i % 2 ? 'var(--bg-row-odd)' : 'transparent' }}>
                  <td style={{ padding: '5px 8px', color: '#ef4444', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{a.id}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-primary)' }}>{a.name}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>{a.dur}d</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontSize: 10 }}>{fmtDate(a.ES) || '-'}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontSize: 10 }}>{fmtDate(a.EF) || '-'}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: a.pct === 100 ? '#22c55e' : a.pct! > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{a.pct || 0}%</span>
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', color: (a.TF || 0) < 0 ? '#ef4444' : 'var(--text-secondary)' }}>{a.TF ?? '-'}</td>
                </tr>
              ))}
              {tasks.filter(a => a.crit).length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No hay actividades críticas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
