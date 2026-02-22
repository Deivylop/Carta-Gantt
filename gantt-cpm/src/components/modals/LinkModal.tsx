// ═══════════════════════════════════════════════════════════════════
// Link Type Modal – create/edit dependency links (FS/SS/FF/SF + lag)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';

export default function LinkModal() {
    const { state, dispatch } = useGantt();
    const [linkType, setLinkType] = useState('FS');
    const [lag, setLag] = useState(0);

    useEffect(() => {
        if (state.linkModalOpen && state.linkModalData) {
            setLinkType(state.linkModalData.type || 'FS');
            setLag(state.linkModalData.lag || 0);
        }
    }, [state.linkModalOpen, state.linkModalData]);

    if (!state.linkModalOpen || !state.linkModalData) return null;
    const data = state.linkModalData;

    const save = () => {
        dispatch({ type: 'PUSH_UNDO' });
        if (data.isEdit) {
            // Editing existing link
            const acts = [...state.activities];
            const suc = acts[data.sucIdx];
            if (suc && suc.preds && suc.preds[data.predIdx]) {
                suc.preds[data.predIdx].type = linkType as any;
                suc.preds[data.predIdx].lag = lag;
                dispatch({ type: 'SET_ACTIVITIES', activities: acts });
            }
        } else {
            // New link
            const toIdx = state.activities.findIndex(a => a.id === data.toId);
            if (toIdx >= 0) {
                dispatch({ type: 'ADD_PRED', actIdx: toIdx, pred: { id: data.fromId, type: linkType, lag } });
            }
        }
        dispatch({ type: 'CLOSE_LINK_MODAL' });
    };

    const del = () => {
        if (!data.isEdit) return;
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'REMOVE_PRED', actIdx: data.sucIdx, predIdx: data.predIdx });
        dispatch({ type: 'CLOSE_LINK_MODAL' });
    };

    const close = () => dispatch({ type: 'CLOSE_LINK_MODAL' });

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 18, width: 340, maxWidth: '90vw', boxShadow: '0 12px 40px rgba(0,0,0,.6)' }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                    🔗 {data.isEdit ? 'Editar Vinculación' : 'Nueva Vinculación'}
                </h2>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 11, color: '#94a3b8' }}>
                    <span>Desde: <b style={{ color: '#818cf8' }}>{data.fromId}</b></span>
                    <span>→</span>
                    <span>Hacia: <b style={{ color: '#6ee7b7' }}>{data.toId}</b></span>
                </div>
                <div className="form-row" style={{ marginBottom: 12 }}>
                    <div className="form-group"><label className="form-label">Tipo de Relación</label>
                        <select className="form-input" value={linkType} onChange={e => setLinkType(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}>
                            <option value="FS">FS – Fin a Comienzo</option>
                            <option value="SS">SS – Comienzo a Comienzo</option>
                            <option value="FF">FF – Fin a Fin</option>
                            <option value="SF">SF – Comienzo a Fin</option>
                        </select>
                    </div>
                    <div className="form-group"><label className="form-label">Lag (días)</label>
                        <input className="form-input" type="number" value={lag} onChange={e => setLag(parseInt(e.target.value) || 0)} style={{ width: 70 }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {data.isEdit && <button className="btn btn-danger" onClick={del} style={{ marginRight: 'auto' }}>Eliminar</button>}
                    <button className="btn btn-ghost" onClick={close}>Cancelar</button>
                    <button className="btn btn-primary" onClick={save}>Guardar</button>
                </div>
            </div>
        </div>
    );
}
