import { useGantt } from '../../store/GanttContext';
import { isoDate, parseDate } from '../../utils/cpm';

export default function SaveProgressModal() {
    const { state, dispatch } = useGantt();

    if (!state.progressModalOpen) return null;

    const todayISO = isoDate(state.statusDate || new Date());
    const existingEntry = state.progressHistory.find(h => h.date === todayISO);

    let tasksWithProgress = 0;
    state.activities.forEach(a => {
        if (a.type === 'task' && !a._isProjRow && (a.pct || 0) > 0) {
            tasksWithProgress++;
        }
    });

    const close = () => dispatch({ type: 'CLOSE_PROGRESS_MODAL' });
    const save = () => {
        dispatch({ type: 'SAVE_PERIOD_PROGRESS' });
    };

    const loadDate = (dString: string) => {
        const d = parseDate(dString);
        if (d) {
            dispatch({ type: 'SET_PROJECT_CONFIG', config: { statusDate: d } });
        }
    };

    const delEntry = (dString: string) => {
        dispatch({ type: 'DELETE_PROGRESS_ENTRY', date: dString });
    };

    const historyDesc = [...state.progressHistory].sort((a, b) => b.date.localeCompare(a.date));

    return (
        <div id="progress-modal-overlay" className="modal-overlay open" onMouseDown={close}>
            <div className="modal" onMouseDown={e => e.stopPropagation()} style={{ width: 450, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Guardar Progreso Semanal</h2>
                    <button className="modal-close" onClick={close}>✕</button>
                </div>
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <p style={{ margin: 0, fontSize: 13, color: state.lightMode ? '#334155' : '#cbd5e1' }}>
                        Se registrará el avance actual de todas las actividades para la Fecha de Corte seleccionada.
                    </p>

                    <div style={{ background: state.lightMode ? '#f1f5f9' : '#1e293b', padding: 12, borderRadius: 6, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600 }}>Nueva Fecha de Corte a Guardar:</span>
                            <span>{state.statusDate?.toLocaleDateString() || new Date().toLocaleDateString()}</span>
                        </div>
                        <p style={{ margin: '0 0 10px 0', fontSize: 11, color: state.lightMode ? '#64748b' : '#94a3b8', fontStyle: 'italic' }}>
                            * La medición se realiza asumiendo el final del día (100% de la jornada de la fecha indicada).
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600 }}>Actividades con Avance Actual:</span>
                            <span>{tasksWithProgress}</span>
                        </div>
                    </div>

                    {existingEntry && (
                        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: 10, borderRadius: 6, fontSize: 12, marginTop: 5 }}>
                            <strong>⚠️ Advertencia:</strong> Ya existe un registro de progreso para esta fecha de corte. Si guardas ahora, el registro anterior será <strong>sobreescrito</strong>.
                        </div>
                    )}

                    <div style={{ borderTop: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}`, paddingTop: 15, marginTop: 5 }}>
                        <h3 style={{ fontSize: 14, margin: '0 0 10px 0' }}>Historial de Registros de Progreso</h3>
                        {historyDesc.length === 0 ? (
                            <div style={{ fontSize: 12, color: state.lightMode ? '#64748b' : '#94a3b8', fontStyle: 'italic' }}>
                                No hay registros guardados.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {historyDesc.map(h => {
                                    const dObj = parseDate(h.date);
                                    const dStr = dObj ? dObj.toLocaleDateString() : h.date;
                                    const isCurrent = h.date === todayISO;
                                    return (
                                        <div key={h.date} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '8px 12px', borderRadius: 6,
                                            background: isCurrent ? (state.lightMode ? '#e0f2fe' : '#0c4a6e') : (state.lightMode ? '#f8fafc' : '#1e293b'),
                                            border: `1px solid ${isCurrent ? '#38bdf8' : (state.lightMode ? '#e2e8f0' : '#334155')}`
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <span style={{ fontSize: 13, fontWeight: 600 }}>{dStr} {isCurrent && <span style={{ fontSize: 10, color: '#38bdf8', marginLeft: 4 }}>(Seleccionada)</span>}</span>
                                                <span style={{ fontSize: 11, color: state.lightMode ? '#64748b' : '#94a3b8' }}>{h.actualPct.toFixed(1)}% Avance Real Proyecto</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {!isCurrent && (
                                                    <button onClick={() => loadDate(h.date)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: state.lightMode ? '#e2e8f0' : '#475569', color: 'inherit', border: 'none', cursor: 'pointer' }}>
                                                        Seleccionar
                                                    </button>
                                                )}
                                                <button onClick={() => delEntry(h.date)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', cursor: 'pointer' }}>
                                                    Eliminar
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <div className="modal-footer" style={{ borderTop: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}`, paddingTop: 15, marginTop: 15 }}>
                    <button className="btn btn-secondary" onClick={close}>Cancelar</button>
                    <button className="btn btn-primary" onClick={save}>Guardar Progreso sobre {state.statusDate?.toLocaleDateString() || new Date().toLocaleDateString()}</button>
                </div>
            </div>
        </div>
    );
}
