// ═══════════════════════════════════════════════════════════════════
// ThresholdsModal.tsx – Modal de Reglas de Control (Umbrales)
// Patrón idéntico a CheckThresholdsModal – usa className="modal-overlay open"
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { supabase } from '../../lib/supabase';
import type { ProjectThreshold, ThresholdSeverity } from '../../types/gantt';

const PARAM_LABELS: Record<string, string> = {
    devPct: '% Desviación Fís.',
    varStart: 'Var. Inicio (días)',
    varEnd: 'Var. Fin (días)',
    varDur: 'Var. Duración (días)',
};

const SEV_OPTIONS: { value: ThresholdSeverity; label: string; color: string }[] = [
    { value: 'Crítica', label: '🔴 Crítica', color: '#ef4444' },
    { value: 'Alta', label: '🟠 Alta', color: '#f97316' },
    { value: 'Media', label: '🟡 Media', color: '#eab308' },
    { value: 'Baja', label: '🔵 Baja', color: '#3b82f6' },
];

export default function ThresholdsModal() {
    const { state, dispatch } = useGantt();
    const isOpen = state.thresholdsModalOpen;

    const [rows, setRows] = useState<ProjectThreshold[]>([]);
    const [loading, setLoading] = useState(false);

    const projectId =
        localStorage.getItem('GANTT_ACTIVE_PROJECT_ID') ||
        localStorage.getItem('supabase_project_id');

    // Load thresholds when modal opens
    useEffect(() => {
        if (!isOpen) return;
        if (!projectId) { setLoading(false); return; }
        setLoading(true);
        supabase
            .from('project_thresholds')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
                if (data) setRows(data as ProjectThreshold[]);
                setLoading(false);
            });
    }, [isOpen]);

    const onClose = () => dispatch({ type: 'CLOSE_THRESHOLDS_MODAL' });

    const addRow = () => {
        if (!projectId) { alert('No hay un proyecto conectado.'); return; }
        setRows(prev => [
            ...prev,
            {
                id: 'new-' + Date.now(),
                project_id: projectId,
                parameter: 'devPct',
                operator: '<',
                limit_value: -5,
                severity: 'Crítica' as ThresholdSeverity,
                active: true,
            } as ProjectThreshold,
        ]);
    };

    const updateRow = (id: string, field: keyof ProjectThreshold, value: any) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
    };

    const removeRow = async (id: string) => {
        if (!id.startsWith('new-')) {
            await supabase.from('project_thresholds').delete().eq('id', id);
        }
        setRows(prev => prev.filter(r => r.id !== id));
    };

    const saveAll = async () => {
        const toUpsert = rows.map(r => {
            const copy: any = { ...r };
            if (String(copy.id).startsWith('new-')) delete copy.id;
            return copy;
        });
        if (toUpsert.length > 0) {
            await supabase.from('project_thresholds').upsert(toUpsert);
        }
        onClose();
    };

    if (!isOpen) return null;

    const sevColor = (s: ThresholdSeverity) =>
        SEV_OPTIONS.find(o => o.value === s)?.color ?? '#6b7280';

    return (
        <div className="modal-overlay open" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🚦</span>
                        <h3 style={{ margin: 0, fontSize: 15 }}>Reglas de Control de Proyecto</h3>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                {/* Body */}
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                        Configure los umbrales que dispararán alertas y registrarán problemas automáticamente.
                    </p>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Cargando reglas…</div>
                    ) : rows.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: 30, color: 'var(--text-muted)',
                            border: '2px dashed var(--border-primary)', borderRadius: 8
                        }}>
                            No hay reglas definidas.
                            <br />
                            <span style={{ color: '#2563eb', cursor: 'pointer' }} onClick={addRow}>Haga clic aquí para agregar una.</span>
                        </div>
                    ) : (
                        rows.map(r => (
                            <div key={r.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px',
                                background: 'var(--bg-secondary, #1e293b)',
                                border: '1px solid var(--border-primary)',
                                borderLeft: `4px solid ${sevColor(r.severity)}`,
                                borderRadius: 6,
                            }}>
                                <input
                                    type="checkbox"
                                    checked={r.active}
                                    onChange={e => updateRow(r.id, 'active', e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                />

                                <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Si</span>

                                <select
                                    className="form-input"
                                    value={r.parameter}
                                    onChange={e => updateRow(r.id, 'parameter', e.target.value)}
                                    style={{ fontSize: 12, padding: '3px 6px', minWidth: 130 }}
                                >
                                    {Object.entries(PARAM_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>

                                <span style={{ fontSize: 12 }}>es</span>

                                <select
                                    className="form-input"
                                    value={r.operator}
                                    onChange={e => updateRow(r.id, 'operator', e.target.value)}
                                    style={{ fontSize: 12, padding: '3px 6px', width: 90 }}
                                >
                                    <option value="<">Menor a</option>
                                    <option value="<=">Menor o igual</option>
                                    <option value=">">Mayor a</option>
                                    <option value=">=">Mayor o igual</option>
                                </select>

                                <input
                                    type="number"
                                    className="form-input"
                                    value={r.limit_value}
                                    onChange={e => updateRow(r.id, 'limit_value', Number(e.target.value))}
                                    style={{ fontSize: 12, padding: '3px 6px', width: 65 }}
                                />

                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>→ Alerta:</span>

                                <select
                                    className="form-input"
                                    value={r.severity}
                                    onChange={e => updateRow(r.id, 'severity', e.target.value as ThresholdSeverity)}
                                    style={{ fontSize: 12, padding: '3px 6px', fontWeight: 700, color: sevColor(r.severity), minWidth: 100 }}
                                >
                                    {SEV_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>

                                <span
                                    style={{ cursor: 'pointer', color: '#ef4444', fontSize: 15, marginLeft: 'auto' }}
                                    title="Eliminar"
                                    onClick={() => removeRow(r.id)}
                                >🗑</span>
                            </div>
                        ))
                    )}

                    <button className="btn btn-secondary" onClick={addRow} style={{ alignSelf: 'center', marginTop: 6, fontSize: 12 }}>
                        ＋ Añadir Nueva Regla
                    </button>
                </div>

                {/* Footer */}
                <div className="modal-footer" style={{
                    borderTop: '1px solid var(--border-primary)',
                    padding: '10px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8,
                }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={saveAll}>Guardar Umbrales</button>
                </div>
            </div>
        </div>
    );
}
