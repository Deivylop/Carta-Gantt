import { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { Settings } from 'lucide-react';

export default function CheckThresholdsModal() {
    const { state, dispatch } = useGantt();
    const isOpen = state.checkModalOpen;

    const onClose = () => dispatch({ type: 'CLOSE_CHECK_MODAL' });

    // Local state to hold temporary inputs before saving
    const [longLags, setLongLags] = useState<number>(20);
    const [largeMargins, setLargeMargins] = useState<number>(20);
    const [longDurations, setLongDurations] = useState<number>(20);

    // Sync with global state when modal opens
    useEffect(() => {
        if (isOpen && state.checkerThresholds) {
            setLongLags(state.checkerThresholds.longLags);
            setLargeMargins(state.checkerThresholds.largeMargins);
            setLongDurations(state.checkerThresholds.longDurations);
        }
    }, [isOpen, state.checkerThresholds]);

    if (!isOpen) return null;

    const handleSave = () => {
        dispatch({
            type: 'SET_CHECKER_THRESHOLDS',
            thresholds: { longLags, largeMargins, longDurations }
        });
        onClose();
    };

    return (
        <div className="modal-overlay open" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Settings size={20} />
                        <h3 style={{ margin: 0, fontSize: 15 }}>Configuración de Comprobación</h3>
                    </div>
                    <button className="modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    <div className="form-group">
                        <label>Demoras Prolongadas (días)</label>
                        <input
                            type="number"
                            className="form-input"
                            min={0}
                            value={longLags}
                            onChange={e => setLongLags(Math.max(0, parseInt(e.target.value) || 0))}
                        />
                        <small style={{ color: 'var(--text-muted)' }}>Mínimo de días para considerar una demora como prolongada.</small>
                    </div>

                    <div className="form-group">
                        <label>Duraciones Prolongadas (días)</label>
                        <input
                            type="number"
                            className="form-input"
                            min={0}
                            value={longDurations}
                            onChange={e => setLongDurations(Math.max(0, parseInt(e.target.value) || 0))}
                        />
                        <small style={{ color: 'var(--text-muted)' }}>Mínima duración para considerar una actividad como prolongada.</small>
                    </div>

                    <div className="form-group">
                        <label>Márgenes Grandes (días)</label>
                        <input
                            type="number"
                            className="form-input"
                            min={0}
                            value={largeMargins}
                            onChange={e => setLargeMargins(Math.max(0, parseInt(e.target.value) || 0))}
                        />
                        <small style={{ color: 'var(--text-muted)' }}>Mínimo de holgura (TF) para considerarlo un margen grande.</small>
                    </div>
                </div>

                <div className="modal-footer" style={{ borderTop: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}`, padding: '10px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
                </div>
            </div>
        </div>
    );
}
