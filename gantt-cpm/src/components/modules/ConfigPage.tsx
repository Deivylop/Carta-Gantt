// ═══════════════════════════════════════════════════════════════════
// ConfigPage – Global application settings (not project-specific)
// ═══════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { useGantt } from '../../store/GanttContext';
import { useAuth } from '../../store/AuthContext';
import { supabase } from '../../lib/supabase';
import { Settings, CalendarDays, Palette, Sun, Moon, Users, CloudOff, UserCircle2 } from 'lucide-react';
import type { CalendarType } from '../../types/gantt';
import SuperAdminPage from './SuperAdminPage';

export default function ConfigPage() {
  const { state, dispatch } = useGantt();
  const { user, role, empresaName } = useAuth();
  const [showUserManagement, setShowUserManagement] = useState(false);

  // ── Reusable layout components ─────────────────────────────────
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
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 200, flexShrink: 0 }}>{label}</label>
      {children}
    </div>
  );

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
    borderRadius: 6, padding: '6px 12px', color: 'var(--text-primary)', fontSize: 12, width: 260, cursor: 'pointer',
  };

  // ── Role display helpers ────────────────────────────────────────
  const roleLabel = role === 'superadmin' ? 'Super Administrador'
    : role === 'admin' ? 'Administrador'
      : role === 'editor' ? 'Editor'
        : role === 'viewer' ? 'Visualizador'
          : 'Sin rol asignado';

  const roleColor = role === 'superadmin' ? '#ef4444'
    : role === 'admin' ? '#f59e0b'
      : role === 'editor' ? '#3b82f6'
        : '#6b7280';

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Settings size={22} style={{ color: 'var(--color-indigo)' }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Configuración</h1>
      </div>

      {/* ── Perfil de Usuario ───────────────────────────────────── */}
      <Section title="Perfil de Usuario" icon={<UserCircle2 size={16} style={{ color: '#6366f1' }} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            padding: '14px 16px', background: 'var(--bg-input)',
            border: '1px solid var(--border-secondary)', borderRadius: 8,
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{user?.email || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empresa</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{empresaName || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rol</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: roleColor }}>{roleLabel}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(role === 'superadmin' || role === 'admin') && (
              <button
                onClick={() => setShowUserManagement(!showUserManagement)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
                  background: showUserManagement ? 'var(--bg-input)' : '#3b82f622',
                  border: showUserManagement ? '1px solid var(--border-secondary)' : '1px solid #3b82f644',
                  borderRadius: 8, color: showUserManagement ? 'var(--text-primary)' : '#3b82f6',
                  fontSize: 13, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
                }}>
                <Users size={15} />
                {showUserManagement ? 'Ocultar Gestión de Perfiles' : 'Gestión de Perfiles'}
              </button>
            )}

            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8, color: '#ef4444', fontSize: 13, cursor: 'pointer', fontWeight: 600,
              }}>
              <CloudOff size={15} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </Section>

      {/* ── Gestión de Perfiles (Admin / SuperAdmin) ────────────── */}
      {showUserManagement && (role === 'superadmin' || role === 'admin') && (
        <div style={{ marginBottom: 20 }}>
          <SuperAdminPage />
        </div>
      )}

      {/* ── Calendario predeterminado ───────────────────────────── */}
      <Section title="Calendario Predeterminado" icon={<CalendarDays size={16} style={{ color: '#0ea5e9' }} />}>
        <Field label="Calendario para nuevos proyectos">
          <select
            style={selectStyle}
            value={state.defCal}
            onChange={e => dispatch({ type: 'SET_PROJECT_CONFIG', config: { ...state, defCal: e.target.value as CalendarType } })}>
            <option value="5d">5 días (Lun-Vie)</option>
            <option value="6d">6 días (Lun-Sáb)</option>
            <option value="7d">7 días</option>
          </select>
        </Field>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Este calendario se aplicará como valor predeterminado al crear nuevos proyectos.
          Para gestionar calendarios personalizados, use Ribbon → Formato → Calendarios en la Carta Gantt.
        </p>
      </Section>

      {/* ── Apariencia ──────────────────────────────────────────── */}
      <Section title="Apariencia" icon={<Palette size={16} style={{ color: '#f59e0b' }} />}>
        <Field label="Tema de la aplicación">
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

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
        Gantt CPM v1.0 · Planificación &amp; Control de Proyectos
      </div>
    </div>
  );
}
