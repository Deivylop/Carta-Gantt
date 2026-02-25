// ═══════════════════════════════════════════════════════════════════
// InicioPage – Landing / home module
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import { isoDate, fmtDate } from '../../utils/cpm';
import { GanttChart, CalendarRange, BarChart3, Settings, FolderOpen, Clock, TrendingUp, TrendingDown, CalendarCheck } from 'lucide-react';
import type { ModuleId } from '../ModuleTabs';

interface Props {
  onNavigate: (id: ModuleId) => void;
}

export default function InicioPage({ onNavigate }: Props) {
  const { state } = useGantt();

  const cards: { id: ModuleId; icon: React.ReactNode; title: string; desc: string; color: string }[] = [
    { id: 'gantt',     icon: <GanttChart size={28} />,    title: 'Carta Gantt',    desc: 'Programa CPM completo con Ruta Crítica, Float Paths, recursos y líneas base.',                   color: '#6366f1' },
    { id: 'lookAhead', icon: <CalendarRange size={28} />,  title: 'Look Ahead',     desc: 'Planificación a corto plazo con ventana deslizante de 3 semanas.',                                color: '#0ea5e9' },
    { id: 'dashboard', icon: <BarChart3 size={28} />,      title: 'Dashboard',      desc: 'Indicadores clave del proyecto: SPI, CPI, curvas S y desempeño de recursos.',                    color: '#22c55e' },
    { id: 'config',    icon: <Settings size={28} />,       title: 'Configuración',  desc: 'Calendarios, conexión a Supabase, preferencias de visualización y exportaciones.',               color: '#f59e0b' },
  ];

  // ── Derived stats ──
  const { totalActs, completed, critCount, avanceGlobal, avanceProgramado, desviacion, statusDateStr } = useMemo(() => {
    const tasks = state.activities.filter(a => (a.type === 'task' || a.type === 'milestone') && !a._isProjRow);
    const total = tasks.length;
    const comp = tasks.filter(a => a.pct === 100).length;
    // Critical count: only non-summary actual tasks
    const crit = tasks.filter(a => a.crit).length;

    // Use project summary row for weighted global progress if available
    const projRow = state.activities.find(a => a._isProjRow);
    let globalPct = 0;
    let plannedPct = 0;

    if (projRow) {
      globalPct = Math.round((projRow.pct || 0) * 10) / 10;
      plannedPct = Math.round((projRow._plannedPct || 0) * 10) / 10;
    } else if (total > 0) {
      // Fallback: weighted by duration
      let sumW = 0, sumPct = 0, sumPlanned = 0;
      tasks.forEach(a => {
        const w = a.dur || 1;
        sumW += w;
        sumPct += w * (a.pct || 0);
        sumPlanned += w * (a._plannedPct || 0);
      });
      globalPct = sumW > 0 ? Math.round(sumPct / sumW * 10) / 10 : 0;
      plannedPct = sumW > 0 ? Math.round(sumPlanned / sumW * 10) / 10 : 0;
    }

    const dev = Math.round((globalPct - plannedPct) * 10) / 10;

    // Status date formatted
    const sd = state.statusDate || new Date();
    const sdStr = fmtDate(sd);

    return { totalActs: total, completed: comp, critCount: crit, avanceGlobal: globalPct, avanceProgramado: plannedPct, desviacion: dev, statusDateStr: sdStr };
  }, [state.activities, state.statusDate]);

  const devColor = desviacion > 0 ? '#22c55e' : desviacion < 0 ? '#ef4444' : '#f59e0b';
  const devSign = desviacion > 0 ? '+' : '';

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)', padding: '32px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
          Planificación &amp; Control de Proyectos
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6 }}>
          Proyecto actual: <strong style={{ color: 'var(--text-primary)' }}>{state.projName || 'Sin nombre'}</strong>
          {' · '}{totalActs} actividades · {completed} completadas · {critCount} en ruta crítica
        </p>
      </div>

      {/* Fecha de Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 16px',
        background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 8,
        width: 'fit-content' }}>
        <CalendarCheck size={16} style={{ color: '#6366f1' }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fecha de Control:</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>{statusDateStr}</span>
      </div>

      {/* Quick Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Actividades',      value: totalActs,                icon: <GanttChart size={18} />,     color: '#6366f1' },
          { label: 'Completadas',      value: completed,                icon: <Clock size={18} />,          color: '#22c55e' },
          { label: 'Ruta Crítica',     value: critCount,                icon: <BarChart3 size={18} />,      color: '#ef4444' },
          { label: 'Avance Global',    value: `${avanceGlobal}%`,       icon: <BarChart3 size={18} />,      color: '#0ea5e9' },
          { label: 'Avance Programado',value: `${avanceProgramado}%`,   icon: <TrendingUp size={18} />,     color: '#8b5cf6' },
          { label: 'Desviación',       value: `${devSign}${desviacion}%`, icon: desviacion >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />, color: devColor },
        ].map((s, i) => (
          <div key={i} style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
            borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: i === 5 ? devColor : 'var(--text-heading)' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Module Cards */}
      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16 }}>Módulos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {cards.map(c => (
          <button key={c.id} onClick={() => onNavigate(c.id)}
            style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
              borderRadius: 12, padding: '24px 20px', textAlign: 'left', cursor: 'pointer',
              transition: 'all .2s ease', display: 'flex', flexDirection: 'column', gap: 12,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 20px ${c.color}22`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: c.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-heading)' }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{c.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Recent Actions / Tips */}
      <div style={{ marginTop: 32, background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: '20px 24px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 10 }}>Acciones rápidas</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('gantt')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
            <FolderOpen size={14} /> Abrir Carta Gantt
          </button>
          <button onClick={() => onNavigate('lookAhead')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
            <CalendarRange size={14} /> Ver Look Ahead
          </button>
          <button onClick={() => onNavigate('dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
            <BarChart3 size={14} /> Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
