// ═══════════════════════════════════════════════════════════════════
// Supabase Load/Save Modal – matches HTML #sb-overlay exactly
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { supabase } from '../../lib/supabase';

interface SBProject {
    id: string; projname: string; projstart: string; created_at: string;
}

export default function SupabaseModal() {
    const { state, dispatch } = useGantt();
    const [projects, setProjects] = useState<SBProject[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [status, setStatus] = useState('Cargando...');
    const [statusColor, setStatusColor] = useState('#fbbf24');

    useEffect(() => {
        if (state.sbModalOpen) fetchProjects();
    }, [state.sbModalOpen]);

    const fetchProjects = async () => {
        setStatus('Cargando...'); setStatusColor('#fbbf24');
        try {
            const { data, error } = await supabase.from('gantt_projects').select('id,projname,projstart,created_at').order('created_at', { ascending: false });
            if (error) throw error;
            if (!data || !data.length) { setStatus('No hay proyectos guardados'); setStatusColor('#94a3b8'); return; }
            setProjects(data); setStatus(data.length + ' proyecto(s)'); setStatusColor('#4ade80');
        } catch (err: any) {
            setStatus('❌ ' + (err.message || 'Error')); setStatusColor('#f87171');
        }
    };

    const currentId = typeof window !== 'undefined' ? localStorage.getItem('sb_current_project_id') : null;

    const loadProject = async () => {
        if (!selected) { alert('Selecciona un proyecto'); return; }
        // Loading logic will be handled by the parent
        dispatch({ type: 'CLOSE_SB_MODAL' });
        // Trigger load event
        window.dispatchEvent(new CustomEvent('sb-load-project', { detail: { projectId: selected } }));
    };

    const deleteProject = async () => {
        if (!selected) { alert('Selecciona un proyecto'); return; }
        if (!confirm('¿Eliminar este proyecto? No se puede deshacer.')) return;
        try {
            await supabase.from('gantt_projects').delete().eq('id', selected);
            if (currentId === selected) localStorage.removeItem('sb_current_project_id');
            setSelected(null);
            fetchProjects();
        } catch (err: any) { alert('Error: ' + err.message); }
    };

    if (!state.sbModalOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) dispatch({ type: 'CLOSE_SB_MODAL' }); }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 22, width: 420, maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,.6)' }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#a5b4fc', marginBottom: 14 }}>📂 Cargar Proyecto desde la Nube</h2>
                <div style={{ color: statusColor, fontSize: 11, margin: '6px 0' }}>{status}</div>
                <div style={{ maxHeight: 280, overflowY: 'auto', margin: '8px 0' }}>
                    {projects.map(p => {
                        const isCurrent = p.id === currentId;
                        const isSelected = p.id === selected;
                        return (
                            <div key={p.id}
                                onClick={() => setSelected(p.id)}
                                style={{
                                    padding: '8px 10px', margin: '3px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 6,
                                    background: isCurrent ? '#1e3a5f' : '#0f172a',
                                    border: `1px solid ${isSelected ? '#6366f1' : isCurrent ? '#3b82f6' : '#334155'}`,
                                }}>
                                <div>
                                    <strong style={{ color: '#e2e8f0', fontSize: 12 }}>{isCurrent ? '▶ ' : ''}{p.projname}</strong><br />
                                    <span style={{ color: '#64748b', fontSize: 10 }}>Inicio: {p.projstart || '?'} | {new Date(p.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button onClick={() => dispatch({ type: 'CLOSE_SB_MODAL' })} style={{ padding: '6px 14px', background: '#334155', color: '#d1d5db', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={deleteProject} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>🗑️ Eliminar</button>
                    <button onClick={loadProject} style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>⏫ Cargar</button>
                </div>
            </div>
        </div>
    );
}
