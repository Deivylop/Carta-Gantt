// ═══════════════════════════════════════════════════════════════════
// ConfigPage – Application settings module
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import { isoDate } from '../../utils/cpm';
import { supabase } from '../../lib/supabase';
import { saveToSupabase } from '../../utils/supabaseSync';
import { Settings, CalendarDays, Database, Palette, Sun, Moon, Globe, Save, RotateCcw, Plus, Trash2, Upload, FolderOpen, CloudOff, Cloud, RefreshCw } from 'lucide-react';
import type { CalendarType } from '../../types/gantt';

interface SBProject { id: string; projname: string; projstart: string; created_at: string; statusdate?: string; defcal?: number; }

export default function ConfigPage() {
  const { state, dispatch } = useGantt();
  const [saved, setSaved] = useState(false);
  const [projects, setProjects] = useState<SBProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const showSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const currentPid = typeof window !== 'undefined' ? localStorage.getItem('sb_current_project_id') : null;

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase.from('gantt_projects').select('id,projname,projstart,created_at,statusdate,defcal').order('created_at', { ascending: false });
      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreateProject = async () => {
    setCreating(true);
    try {
      const newId = await saveToSupabase(state, null);
      if (newId) {
        localStorage.setItem('sb_current_project_id', newId);
        await fetchProjects();
        alert('Proyecto creado y guardado exitosamente.');
      }
    } catch (err: any) {
      alert('Error al crear proyecto: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLoadProject = () => {
    if (!selectedProject) { alert('Seleccione un proyecto de la lista.'); return; }
    window.dispatchEvent(new CustomEvent('sb-load-project', { detail: { projectId: selectedProject } }));
    setSelectedProject(null);
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) { alert('Seleccione un proyecto de la lista.'); return; }
    const proj = projects.find(p => p.id === selectedProject);
    if (!confirm(`¿Eliminar "${proj?.projname || selectedProject}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('gantt_projects').delete().eq('id', selectedProject);
      if (error) throw error;
      if (currentPid === selectedProject) localStorage.removeItem('sb_current_project_id');
      setSelectedProject(null);
      await fetchProjects();
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const handleDisconnect = () => {
    if (!confirm('¿Desconectar del proyecto actual? Los datos locales se mantendrán pero no se guardarán automáticamente.')) return;
    localStorage.removeItem('sb_current_project_id');
    showSaved();
    fetchProjects(); // refresh list
  };

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

      {/* Database / Project Management */}
      <Section title="Base de Datos (Supabase)" icon={<Database size={16} style={{ color: '#22c55e' }} />}>
        {/* Connection status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: currentPid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${currentPid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          {currentPid ? <Cloud size={16} style={{ color: '#22c55e' }} /> : <CloudOff size={16} style={{ color: '#ef4444' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: currentPid ? '#22c55e' : '#ef4444' }}>
              {currentPid ? 'Conectado' : 'Sin proyecto conectado'}
            </div>
            {currentPid && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {currentPid}
              </div>
            )}
          </div>
          {currentPid && (
            <button onClick={handleDisconnect} title="Desconectar proyecto"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, color: '#ef4444', fontSize: 10, cursor: 'pointer' }}>
              <CloudOff size={12} /> Desconectar
            </button>
          )}
        </div>

        {/* Auto-save info */}
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          {currentPid
            ? 'El proyecto se guarda automáticamente cada 3 segundos cuando hay cambios.'
            : 'Cree un nuevo proyecto o cargue uno existente para habilitar el guardado automático.'}
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button onClick={handleCreateProject} disabled={creating}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: 6, color: '#22c55e', fontSize: 12, cursor: creating ? 'wait' : 'pointer', fontWeight: 600, opacity: creating ? 0.6 : 1 }}>
            <Plus size={14} /> {creating ? 'Creando...' : 'Crear Proyecto Nuevo'}
          </button>
          {currentPid && (
            <button onClick={() => window.dispatchEvent(new Event('sb-force-save'))}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#3b82f622', border: '1px solid #3b82f644', borderRadius: 6, color: '#3b82f6', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
              <Save size={14} /> Guardar ahora
            </button>
          )}
        </div>

        {/* Project list */}
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-header)', padding: '8px 12px', borderBottom: '1px solid var(--border-primary)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)' }}>
              <FolderOpen size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Proyectos en la nube ({projects.length})
            </span>
            <button onClick={fetchProjects} disabled={loadingProjects} title="Refrescar lista"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
              <RefreshCw size={14} style={{ animation: loadingProjects ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {projects.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {loadingProjects ? 'Cargando...' : 'No hay proyectos guardados.'}
              </div>
            )}
            {projects.map(p => {
              const isCurrent = p.id === currentPid;
              const isSelected = p.id === selectedProject;
              return (
                <div key={p.id}
                  onClick={() => setSelectedProject(p.id === selectedProject ? null : p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                    background: isCurrent ? (state.lightMode ? '#eff6ff' : '#172554') : isSelected ? (state.lightMode ? '#f0fdf4' : '#14532d') : 'transparent',
                    borderBottom: '1px solid var(--border-secondary)',
                    borderLeft: isSelected ? '3px solid #6366f1' : isCurrent ? '3px solid #3b82f6' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isCurrent && !isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isCurrent && !isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isCurrent && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: '#3b82f633', color: '#3b82f6', fontWeight: 700 }}>ACTUAL</span>}
                      {p.projname}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Inicio: {p.projstart || '—'} · Creado: {new Date(p.created_at).toLocaleDateString('es-CL')}
                      {p.statusdate && ` · Corte: ${p.statusdate}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {p.id.slice(0, 8)}…
                  </div>
                </div>
              );
            })}
          </div>
          {/* Bottom action bar */}
          {projects.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-primary)', background: 'var(--bg-header)' }}>
              <button onClick={handleLoadProject} disabled={!selectedProject || selectedProject === currentPid}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: selectedProject && selectedProject !== currentPid ? '#3b82f622' : 'var(--bg-input)', border: `1px solid ${selectedProject && selectedProject !== currentPid ? '#3b82f644' : 'var(--border-secondary)'}`, borderRadius: 5, color: selectedProject && selectedProject !== currentPid ? '#3b82f6' : 'var(--text-muted)', fontSize: 11, cursor: selectedProject && selectedProject !== currentPid ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: selectedProject && selectedProject !== currentPid ? 1 : 0.5 }}>
                <Upload size={12} /> Cargar
              </button>
              <button onClick={handleDeleteProject} disabled={!selectedProject}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: selectedProject ? 'rgba(239,68,68,0.1)' : 'var(--bg-input)', border: `1px solid ${selectedProject ? 'rgba(239,68,68,0.3)' : 'var(--border-secondary)'}`, borderRadius: 5, color: selectedProject ? '#ef4444' : 'var(--text-muted)', fontSize: 11, cursor: selectedProject ? 'pointer' : 'not-allowed', fontWeight: 500, opacity: selectedProject ? 1 : 0.5 }}>
                <Trash2 size={12} /> Eliminar
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* Info */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 24 }}>
        Gantt CPM v1.0 · Planificación &amp; Control de Proyectos
      </div>
    </div>
  );
}
