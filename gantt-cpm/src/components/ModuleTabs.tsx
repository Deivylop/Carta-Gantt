// ═══════════════════════════════════════════════════════════════════
// ModuleTabs – Top-level navigation between application modules
// Tabs beyond 'Proyectos' are hidden until a project is opened.
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo } from 'react';
import { Home, CalendarRange, BarChart3, Settings, GanttChart, GitBranch, Building2, Briefcase } from 'lucide-react';

export type ModuleId = 'inicio' | 'projects' | 'gantt' | 'lookAhead' | 'dashboard' | 'whatIf' | 'config';

interface Tab {
  id: ModuleId;
  label: string;
  icon: React.ReactNode;
  requiresProject?: boolean;  // true = hidden until a project is opened
}

const TABS: Tab[] = [
  { id: 'inicio',     label: 'Inicio',          icon: <Home size={16} /> },
  { id: 'projects',   label: 'Proyectos',       icon: <Building2 size={16} /> },
  { id: 'gantt',      label: 'Carta Gantt',     icon: <GanttChart size={16} />,     requiresProject: true },
  { id: 'lookAhead',  label: 'Look Ahead',      icon: <CalendarRange size={16} />,  requiresProject: true },
  { id: 'whatIf',     label: 'What-If',         icon: <GitBranch size={16} />,      requiresProject: true },
  { id: 'dashboard',  label: 'Dashboard',       icon: <BarChart3 size={16} />,      requiresProject: true },
  { id: 'config',     label: 'Configuración',   icon: <Settings size={16} />,       requiresProject: true },
];

interface Props {
  active: ModuleId;
  onChange: (id: ModuleId) => void;
  activeProjectName?: string | null;
  hasActiveProject?: boolean;
}

export default function ModuleTabs({ active, onChange, activeProjectName, hasActiveProject }: Props) {
  const visibleTabs = useMemo(() => {
    return TABS.filter(t => !t.requiresProject || hasActiveProject);
  }, [hasActiveProject]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--bg-ribbon-tabs)',
        borderBottom: '1px solid var(--border-primary)',
        height: 36,
        paddingLeft: 8,
        gap: 2,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {visibleTabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 16px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text-accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--bg-ribbon)' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-indigo)' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              transition: 'all .15s ease',
              letterSpacing: 0.3,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}

      {/* Active project indicator on the right */}
      {activeProjectName && (
        <>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              paddingRight: 16,
              fontSize: 11,
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
            onClick={() => onChange('projects')}
            title="Ir a Cartera de Proyectos"
          >
            <Briefcase size={13} style={{ color: '#6366f1' }} />
            <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProjectName}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
