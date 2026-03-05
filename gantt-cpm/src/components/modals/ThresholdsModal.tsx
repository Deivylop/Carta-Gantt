import { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { supabase } from '../../lib/supabase';
import type { ProjectThreshold, ThresholdSeverity } from '../../types/gantt';

const SEV_COLORS: Record<ThresholdSeverity, string> = {
    'Crítica': '#ef4444',
    'Alta': '#f97316',
    'Media': '#eab308',
    'Baja': '#3b82f6',
};

export function ThresholdsModal() {
    const { state, dispatch } = useGantt();
    const [thresholds, setThresholds] = useState<ProjectThreshold[]>([]);
    const [loading, setLoading] = useState(true);

    const projectId = localStorage.getItem('GANTT_ACTIVE_PROJECT_ID') || localStorage.getItem('supabase_project_id');

    const isOpen = state.activeModal === 'thresholds';

    useEffect(() => {
        if (!isOpen || !projectId) { setLoading(false); return; }
        loadThresholds();
    }, [isOpen]);

    const loadThresholds = async () => {
        setLoading(true);
        if (!projectId) return;
        const { data } = await supabase
            .from('project_thresholds')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });
        if (data) setThresholds(data as ProjectThreshold[]);
        setLoading(false);
    };

    const handleAdd = () => {
        if (!projectId) { alert('No hay un proyecto conectado a la base de datos.'); return; }
        setThresholds([...thresholds, {
            id: 'temp-' + Date.now(),
            project_id: projectId,
            parameter: 'devPct',
            operator: '<',
            limit_value: -5,
            severity: 'Crítica',
            active: true,
        } as ProjectThreshold]);
    };

    const handleUpdate = (id: string, field: keyof ProjectThreshold, value: any) => {
        setThresholds(thresholds.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    const handleRemove = async (id: string) => {
        if (!id.startsWith('temp-')) {
            await supabase.from('project_thresholds').delete().eq('id', id);
        }
        setThresholds(thresholds.filter(t => t.id !== id));
    };

    const handleSave = async () => {
        const toUpsert = thresholds.map(t => {
            const copy: any = { ...t };
            if (copy.id.startsWith('temp-')) delete copy.id;
            return copy;
        });
        if (toUpsert.length > 0) {
            await supabase.from('project_thresholds').upsert(toUpsert);
        }
        dispatch({ type: 'CLOSE_MODAL' });
    };

    const handleClose = () => dispatch({ type: 'CLOSE_MODAL' });

    if (!isOpen) return null;

    // ── All inline styles ──
    const overlay: React.CSSProperties = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 999999,
    };
    const card: React.CSSProperties = {
        background: '#fff', color: '#111', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        width: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
    };
    const header: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: '1px solid #e5e7eb',
    };
    const body: React.CSSProperties = { padding: 16, flex: 1, overflowY: 'auto', background: '#f9fafb' };
    const footer: React.CSSProperties = {
        display: 'flex', justifyContent: 'flex-end', gap: 8,
        padding: '12px 18px', borderTop: '1px solid #e5e7eb', background: '#fff',
    };
    const rowStyle = (sev: ThresholdSeverity): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${SEV_COLORS[sev]}`,
        borderRadius: 6, marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    });
    const selectS: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: 13, background: '#f9fafb' };
    const inputS: React.CSSProperties = { ...selectS, width: 70 };
    const btnPrimary: React.CSSProperties = { padding: '8px 18px', fontSize: 13, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 4, cursor: 'pointer' };
    const btnSecondary: React.CSSProperties = { padding: '8px 18px', fontSize: 13, color: '#374151', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' };
    const btnAdd: React.CSSProperties = { ...btnSecondary, display: 'flex', alignItems: 'center', gap: 4, margin: '12px auto 0' };

    return (
        <div style={overlay} onClick={handleClose}>
            <div style={card} onClick={e => e.stopPropagation()}>
                <div style={header}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Reglas de Control de Proyecto</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Configure los umbrales para envío de alertas y registro de problemas.</div>
                    </div>
                    <span style={{ cursor: 'pointer', fontSize: 18, color: '#9ca3af' }} onClick={handleClose}>✕</span>
                </div>

                <div style={body}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>Cargando reglas...</div>
                    ) : thresholds.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', border: '2px dashed #d1d5db', borderRadius: 8 }}>
                            Ninguna regla definida para este proyecto.<br />
                            <span style={{ color: '#2563eb', cursor: 'pointer' }} onClick={handleAdd}>Haga clic aquí para agregar una.</span>
                        </div>
                    ) : (
                        thresholds.map(t => (
                            <div key={t.id} style={rowStyle(t.severity)}>
                                <input type="checkbox" checked={t.active} onChange={e => handleUpdate(t.id, 'active', e.target.checked)} style={{ cursor: 'pointer' }} />

                                <span style={{ fontSize: 13 }}>Si</span>
                                <select value={t.parameter} onChange={e => handleUpdate(t.id, 'parameter', e.target.value)} style={selectS}>
                                    <option value="devPct">% Desviación Fis.</option>
                                    <option value="varStart">Var. Inicio</option>
                                    <option value="varEnd">Var. Fin</option>
                                    <option value="varDur">Var. Duración</option>
                                </select>

                                <span style={{ fontSize: 13 }}>es</span>
                                <select value={t.operator} onChange={e => handleUpdate(t.id, 'operator', e.target.value)} style={selectS}>
                                    <option value="<">{'Menor a'}</option>
                                    <option value="<=">{'Menor o igual a'}</option>
                                    <option value=">">{'Mayor a'}</option>
                                    <option value=">=">{'Mayor o igual a'}</option>
                                </select>

                                <input type="number" value={t.limit_value} onChange={e => handleUpdate(t.id, 'limit_value', Number(e.target.value))} style={inputS} />

                                <span style={{ fontSize: 12, color: '#6b7280' }}>→ Alerta:</span>
                                <select value={t.severity} onChange={e => handleUpdate(t.id, 'severity', e.target.value as ThresholdSeverity)} style={{ ...selectS, fontWeight: 700, color: SEV_COLORS[t.severity] }}>
                                    <option value="Crítica">CRÍTICA 🔴</option>
                                    <option value="Alta">ALTA 🟠</option>
                                    <option value="Media">MEDIA 🟡</option>
                                    <option value="Baja">BAJA 🔵</option>
                                </select>

                                <span style={{ cursor: 'pointer', color: '#ef4444', fontSize: 16, marginLeft: 'auto' }} onClick={() => handleRemove(t.id)} title="Eliminar">🗑</span>
                            </div>
                        ))
                    )}

                    <button style={btnAdd} onClick={handleAdd}>＋ Añadir Nueva Regla</button>
                </div>

                <div style={footer}>
                    <button style={btnSecondary} onClick={handleClose}>Cancelar</button>
                    <button style={btnPrimary} onClick={handleSave}>Guardar Umbrales</button>
                </div>
            </div>
        </div>
    );
}
