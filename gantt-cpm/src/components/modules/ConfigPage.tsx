// ═══════════════════════════════════════════════════════════════════
// ConfigPage – Application settings module
// ═══════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { useGantt } from '../../store/GanttContext';
import { isoDate } from '../../utils/cpm';
import { Settings, CalendarDays, Database, Palette, Sun, Moon, Globe, Save, RotateCcw } from 'lucide-react';
import type { CalendarType } from '../../types/gantt';

export default function ConfigPage() {
  const { state, dispatch } = useGantt();
  const [saved, setSaved] = useState(false);

  const showSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon} {title}
      </h3>
      {children}
    </div>
  );

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 160, flexShrink: 0 }}>{label}</label>
      {children}
    </div>
  );

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
    borderRadius: 6, padding: '6px 12px', color: 'var(--text-primary)', fontSize: 12, width: 260,
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Settings size={22} style={{ color: 'var(--color-indigo)' }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Configuración</h1>
        {saved && (
          <span style={{ marginLeft: 12, fontSize: 12, color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Save size={14} /> Guardado
          </span>
        )}
      </div>

      {/* Project Settings */}
      <Section title="Proyecto" icon={<Globe size={16} style={{ color: '#6366f1' }} />}>
        <Field label="Nombre del proyecto">
          <input style={inputStyle} value={state.projName}
            onChange={e => { dispatch({ type: 'SET_PROJECT_CONFIG', config: { ...state, projName: e.target.value } }); showSaved(); }} />
        </Field>
        <Field label="Fecha de inicio">
          <input type="date" style={inputStyle} value={isoDate(state.projStart)}
            onChange={e => { dispatch({ type: 'SET_PROJECT_CONFIG', config: { ...state, projStart: new Date(e.target.value) } }); showSaved(); }} />
        </Field>
        <Field label="Fecha de estado">
          <input type="date" style={inputStyle} value={state.statusDate ? isoDate(state.statusDate) : ''}
            onChange={e => { dispatch({ type: 'SET_PROJECT_CONFIG', config: { ...state, statusDate: e.target.value ? new Date(e.target.value) : undefined } as any }); showSaved(); }} />
        </Field>
      </Section>

      {/* Calendar Settings */}
      <Section title="Calendario" icon={<CalendarDays size={16} style={{ color: '#0ea5e9' }} />}>
        <Field label="Calendario predeterminado">
          <select style={selectStyle} value={state.defCal}
            onChange={e => { dispatch({ type: 'SET_PROJECT_CONFIG', config: { ...state, defCal: e.target.value as CalendarType } }); showSaved(); }}>
            <option value="5d">5 días (Lun-Vie)</option>
            <option value="6d">6 días (Lun-Sáb)</option>
            <option value="7d">7 días</option>
          </select>
        </Field>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Para gestionar calendarios personalizados, utilice el Ribbon → Formato → Calendarios en la Carta Gantt.
        </p>
      </Section>

      {/* Appearance */}
      <Section title="Apariencia" icon={<Palette size={16} style={{ color: '#f59e0b' }} />}>
        <Field label="Tema">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (state.lightMode) dispatch({ type: 'TOGGLE_THEME' }); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px',
                background: !state.lightMode ? 'var(--color-indigo)' : 'var(--bg-input)',
                color: !state.lightMode ? 'white' : 'var(--text-secondary)',
                border: '1px solid var(--border-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
              }}>
              <Moon size={14} /> Oscuro
            </button>
            <button
              onClick={() => { if (!state.lightMode) dispatch({ type: 'TOGGLE_THEME' }); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px',
                background: state.lightMode ? 'var(--color-indigo)' : 'var(--bg-input)',
                color: state.lightMode ? 'white' : 'var(--text-secondary)',
                border: '1px solid var(--border-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
              }}>
              <Sun size={14} /> Claro
            </button>
          </div>
        </Field>
      </Section>

      {/* Database Connection */}
      <Section title="Base de Datos (Supabase)" icon={<Database size={16} style={{ color: '#22c55e' }} />}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          La conexión a Supabase se configura en el archivo <code style={{ color: 'var(--text-accent)', background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>src/lib/supabase.ts</code>.
          El proyecto se guarda automáticamente cada 3 segundos.
        </p>
        <Field label="Proyecto actual (ID)">
          <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 11 }} readOnly
            value={typeof window !== 'undefined' ? localStorage.getItem('sb_current_project_id') || 'Ninguno' : 'Ninguno'} />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => window.dispatchEvent(new Event('sb-force-save'))}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: 6, color: '#22c55e', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
            <Save size={14} /> Guardar ahora
          </button>
          <button onClick={() => { if (confirm('¿Desconectar proyecto de Supabase? Se perderá el ID guardado localmente.')) { localStorage.removeItem('sb_current_project_id'); showSaved(); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            <RotateCcw size={14} /> Desconectar
          </button>
        </div>
      </Section>

      {/* Info */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 24 }}>
        Gantt CPM v1.0 · Planificación &amp; Control de Proyectos
      </div>
    </div>
  );
}
