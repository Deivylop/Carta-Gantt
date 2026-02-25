// ═══════════════════════════════════════════════════════════════════
// LookAheadPage – Lean Construction / Last Planner System module
//
// Sub-tabs: Plan Semanal | Kanban | Restricciones | PPC / CNC
//
// Based on the Last Planner System (LPS) methodology:
// • Look-Ahead Planning (ventana deslizante 3-6 semanas)
// • Make Ready Process (análisis y liberación de restricciones)
// • Weekly Work Plan (compromisos semanales → PPC)
// • Visual management (tablero Kanban tipo Scrum)
//
// Scrum-inspired elements:
// • Sprint ≈ Semana de planificación del Look Ahead
// • Sprint Planning ≈ Plan semanal (selección de actividades libres)
// • Kanban Board ≈ Gestión visual del flujo de trabajo
// • Sprint Review ≈ Medición PPC semanal
// • Retrospectiva ≈ Análisis CNC (Causas de No Cumplimiento)
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import { fmtDate } from '../../utils/cpm';
import { CalendarRange, ChevronLeft, ChevronRight, Layout, ShieldAlert, BarChart3, ListTodo } from 'lucide-react';
import LookAheadGrid from './LookAheadGrid';
import KanbanBoard from './KanbanBoard';
import RestrictionsPanel from './RestrictionsPanel';
import PPCPanel from './PPCPanel';

type SubTab = 'plan' | 'kanban' | 'restricciones' | 'ppc';

const TABS: { key: SubTab; label: string; icon: React.ReactNode }[] = [
  { key: 'plan',           label: 'Plan Semanal',  icon: <ListTodo size={14} /> },
  { key: 'kanban',         label: 'Kanban',         icon: <Layout size={14} /> },
  { key: 'restricciones',  label: 'Restricciones',  icon: <ShieldAlert size={14} /> },
  { key: 'ppc',            label: 'PPC / CNC',      icon: <BarChart3 size={14} /> },
];

export default function LookAheadPage() {
  const { state } = useGantt();
  const [activeTab, setActiveTab] = useState<SubTab>('plan');
  const [weeksAhead, setWeeksAhead] = useState(3);
  const [startOffset, setStartOffset] = useState(0);

  const statusDate = useMemo(() => {
    if (state.statusDate) return state.statusDate;
    return new Date();
  }, [state.statusDate]);

  const windowStart = useMemo(() => {
    const d = new Date(statusDate!.getTime());
    d.setDate(d.getDate() + startOffset * 7);
    const day = d.getDay();
    d.setDate(d.getDate() - ((day + 6) % 7));
    return d;
  }, [statusDate, startOffset]);

  const windowEnd = useMemo(() => {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + weeksAhead * 7 - 1);
    return d;
  }, [windowStart, weeksAhead]);

  return (
    <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar: navigation + window controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px',
        background: 'var(--bg-ribbon)', borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
      }}>
        <CalendarRange size={18} style={{ color: 'var(--color-indigo)' }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-heading)' }}>Look Ahead</span>

        {/* Window navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
          <button onClick={() => setStartOffset(o => o - 1)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 180, textAlign: 'center' }}>
            {fmtDate(windowStart)} — {fmtDate(windowEnd)}
          </span>
          <button onClick={() => setStartOffset(o => o + 1)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ChevronRight size={14} />
          </button>
          <button onClick={() => setStartOffset(0)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
            Hoy
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginLeft: 12 }}>
          Semanas:
          <select value={weeksAhead} onChange={e => setWeeksAhead(Number(e.target.value))}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 0, padding: '0 20px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-indigo)' : 'var(--text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-indigo)' : '2px solid transparent',
                transition: 'color .15s, border-color .15s',
              }}>
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'plan' && (
          <LookAheadGrid windowStart={windowStart} windowEnd={windowEnd} />
        )}
        {activeTab === 'kanban' && (
          <KanbanBoard windowStart={windowStart} windowEnd={windowEnd} />
        )}
        {activeTab === 'restricciones' && (
          <RestrictionsPanel windowStart={windowStart} windowEnd={windowEnd} />
        )}
        {activeTab === 'ppc' && (
          <PPCPanel windowStart={windowStart} windowEnd={windowEnd} />
        )}
      </div>
    </div>
  );
}
