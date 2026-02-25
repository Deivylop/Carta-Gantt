// ═══════════════════════════════════════════════════════════════════
// Baseline Manager Modal – save / view / assign / clear baselines
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useGantt } from '../../store/GanttContext';
import { useResizable } from '../../hooks/useResizable';

const BL_COLORS = [
    '#94a3b8', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#84cc16',
];

export default function BaselineModal() {
    const { state, dispatch } = useGantt();
    const [tab, setTab] = useState<'save' | 'list'>('list');
    const [slotIdx, setSlotIdx] = useState(0);
    const [blName, setBlName] = useState('');
    const [blDesc, setBlDesc] = useState('');
    const [overwritePrompt, setOverwritePrompt] = useState(false);

    const { ref: resizeRef, style: resizeStyle } = useResizable({ initW: 720, minW: 450, minH: 300 });

    if (!state.blModalOpen) return null;

    const close = () => dispatch({ type: 'CLOSE_BL_MODAL' });

    // Gather saved baseline info (slot, name, description, date) from first activity that has it
    const savedSlots: { idx: number; name: string; description: string; savedAt: string; statusDate: string; isActive: boolean }[] = [];
    for (let i = 0; i <= 10; i++) {
        const sample = state.activities.find(a => a.baselines?.[i]);
        if (sample && sample.baselines[i]) {
            const bl = sample.baselines[i];
            savedSlots.push({
                idx: i,
                name: bl.name || `Línea Base ${i}`,
                description: bl.description || '',
                savedAt: bl.savedAt || '',
                statusDate: bl.statusDate || '',
                isActive: i === state.activeBaselineIdx,
            });
        }
    }

    const handleSave = () => {
        if (!state.activities.length) { alert('No hay actividades para guardar.'); return; }
        const existsInSlot = state.activities.some(a => a.baselines?.[slotIdx]);
        if (existsInSlot) {
            // Show custom overwrite dialog instead of simple confirm
            setOverwritePrompt(true);
            return;
        }
        // New slot — save for entire project
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'SAVE_BASELINE', index: slotIdx, name: blName.trim() || `Línea Base ${slotIdx}`, description: blDesc.trim() });
        setBlName('');
        setBlDesc('');
        setTab('list');
    };

    const doSaveAll = () => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'SAVE_BASELINE', index: slotIdx, name: blName.trim() || `Línea Base ${slotIdx}`, description: blDesc.trim() });
        setBlName('');
        setBlDesc('');
        setOverwritePrompt(false);
        setTab('list');
    };

    const doSaveSelected = () => {
        if (!state.selIndices || state.selIndices.size === 0) {
            alert('No hay actividades seleccionadas. Seleccione al menos una fila en la tabla.');
            return;
        }
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({
            type: 'SAVE_BASELINE',
            index: slotIdx,
            name: blName.trim() || `Línea Base ${slotIdx}`,
            description: blDesc.trim(),
            selectedOnly: true,
            selectedIndices: new Set(state.selIndices),
        });
        setBlName('');
        setBlDesc('');
        setOverwritePrompt(false);
        setTab('list');
    };

    const handleAssign = (idx: number) => {
        dispatch({ type: 'SET_ACTIVE_BASELINE', index: idx });
    };

    const handleClear = (idx: number) => {
        const slot = savedSlots.find(s => s.idx === idx);
        const label = slot ? slot.name : `Línea Base ${idx}`;
        if (!confirm(`¿Limpiar "${label}"? Esto eliminará todos los datos de esta línea base.`)) return;
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'CLEAR_BASELINE', index: idx });
    };

    // Find available slots (0-10)
    const usedSlots = new Set(savedSlots.map(s => s.idx));

    const thStyle: React.CSSProperties = {
        padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#94a3b8',
        fontSize: 11, borderBottom: '2px solid #334155', whiteSpace: 'nowrap',
    };
    const tdStyle: React.CSSProperties = {
        padding: '6px 10px', fontSize: 11, color: '#cbd5e1', borderBottom: '1px solid #1e293b',
    };

    return (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="modal" ref={resizeRef} style={{ ...resizeStyle, maxWidth: '95vw', minWidth: 450, display: 'flex', flexDirection: 'column', maxHeight: '92vh', position: 'relative' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    📊 Administrador de Líneas Base
                </h2>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid #1e293b' }}>
                    <button
                        onClick={() => setTab('list')}
                        style={{
                            padding: '8px 18px', fontSize: 11, fontWeight: tab === 'list' ? 700 : 400,
                            color: tab === 'list' ? '#60a5fa' : '#94a3b8', background: 'transparent', border: 'none',
                            borderBottom: tab === 'list' ? '2px solid #60a5fa' : '2px solid transparent',
                            cursor: 'pointer', marginBottom: -2,
                        }}>
                        Líneas Base Guardadas ({savedSlots.length})
                    </button>
                    <button
                        onClick={() => setTab('save')}
                        style={{
                            padding: '8px 18px', fontSize: 11, fontWeight: tab === 'save' ? 700 : 400,
                            color: tab === 'save' ? '#60a5fa' : '#94a3b8', background: 'transparent', border: 'none',
                            borderBottom: tab === 'save' ? '2px solid #60a5fa' : '2px solid transparent',
                            cursor: 'pointer', marginBottom: -2,
                        }}>
                        ➕ Guardar Nueva
                    </button>
                </div>

                {/* Scrollable content area */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {/* TAB: List saved baselines */}
                {tab === 'list' && (
                    <div>
                        {savedSlots.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 30, color: '#64748b', fontSize: 12 }}>
                                No hay líneas base guardadas.<br />
                                <span style={{ fontSize: 11 }}>Use la pestaña "Guardar Nueva" para crear una.</span>
                            </div>
                        ) : (
                            <div style={{ overflowY: 'auto', border: '1px solid #1e293b', borderRadius: 6 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(30,41,59,.6)' }}>
                                            <th style={thStyle}>#</th>
                                            <th style={thStyle}>Nombre</th>
                                            <th style={thStyle}>Descripción</th>
                                            <th style={thStyle}>F. Guardada</th>
                                            <th style={thStyle}>F. Corte Ref.</th>
                                            <th style={thStyle}>Estado</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {savedSlots.map(slot => (
                                            <tr key={slot.idx} style={{
                                                background: slot.isActive ? 'rgba(37,99,235,.12)' : 'transparent',
                                            }}>
                                                <td style={tdStyle}>
                                                    <span style={{
                                                        display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                                                        background: BL_COLORS[slot.idx % BL_COLORS.length], marginRight: 6, verticalAlign: 'middle',
                                                    }} />
                                                    LB {slot.idx}
                                                </td>
                                                <td style={{ ...tdStyle, fontWeight: 600, color: slot.isActive ? '#60a5fa' : '#e2e8f0' }}>
                                                    {slot.name}
                                                </td>
                                                <td style={{ ...tdStyle, color: '#94a3b8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                    title={slot.description}>
                                                    {slot.description || '—'}
                                                </td>
                                                <td style={{ ...tdStyle, color: '#6b7280', fontSize: 10 }}>
                                                    {slot.savedAt ? new Date(slot.savedAt).toLocaleDateString('es-CL', {
                                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                                        hour: '2-digit', minute: '2-digit',
                                                    }) : '—'}
                                                </td>
                                                <td style={{ ...tdStyle, color: '#6b7280', fontSize: 10 }}>
                                                    {slot.statusDate ? new Date(slot.statusDate).toLocaleDateString('es-CL', {
                                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                                    }) : '—'}
                                                </td>
                                                <td style={tdStyle}>
                                                    {slot.isActive ? (
                                                        <span style={{
                                                            background: '#1e3a5f', color: '#60a5fa', padding: '2px 8px',
                                                            borderRadius: 10, fontSize: 10, fontWeight: 600,
                                                        }}>ACTIVA</span>
                                                    ) : (
                                                        <span style={{ color: '#64748b', fontSize: 10 }}>Inactiva</span>
                                                    )}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    {!slot.isActive && (
                                                        <button
                                                            className="btn btn-primary"
                                                            style={{ fontSize: 9, padding: '2px 8px', marginRight: 4 }}
                                                            onClick={() => handleAssign(slot.idx)}
                                                            title="Asignar como línea base activa">
                                                            Asignar
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn-danger"
                                                        style={{ fontSize: 9, padding: '2px 8px' }}
                                                        onClick={() => handleClear(slot.idx)}
                                                        title="Eliminar esta línea base">
                                                        🗑️
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {/* Active baseline summary */}
                        {savedSlots.some(s => s.isActive) && (
                            <div style={{
                                marginTop: 10, padding: '8px 12px', background: 'rgba(37,99,235,.08)',
                                borderRadius: 6, border: '1px solid rgba(96,165,250,.2)', fontSize: 10, color: '#94a3b8',
                            }}>
                                <strong style={{ color: '#60a5fa' }}>Activa:</strong>{' '}
                                LB {state.activeBaselineIdx} — {savedSlots.find(s => s.isActive)?.name || ''}
                                {savedSlots.find(s => s.isActive)?.description && (
                                    <span style={{ display: 'block', marginTop: 2, fontStyle: 'italic' }}>
                                        {savedSlots.find(s => s.isActive)?.description}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB: Save new baseline */}
                {tab === 'save' && (
                    <div>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Slot (posición 0-10)</label>
                            <select className="form-input" value={slotIdx} onChange={e => setSlotIdx(parseInt(e.target.value))}
                                style={{ fontSize: 11, maxWidth: 200 }}>
                                {Array.from({ length: 11 }, (_, i) => (
                                    <option key={i} value={i}>
                                        LB {i}{usedSlots.has(i) ? ' (ocupado ✓)' : ' (disponible)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Nombre de la Línea Base</label>
                            <input className="form-input" value={blName} onChange={e => setBlName(e.target.value)}
                                placeholder={`Línea Base ${slotIdx}`}
                                style={{ fontSize: 11 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 14 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Descripción / Observaciones</label>
                            <textarea className="form-input" rows={3} value={blDesc} onChange={e => setBlDesc(e.target.value)}
                                placeholder="Ej: Programación aprobada en reunión del 15/01/2025..."
                                style={{ fontSize: 11, resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 4, fontSize: 10, color: '#64748b', marginBottom: 12, lineHeight: 1.3 }}>
                            <span>ℹ️</span>
                            <span>Se capturará la duración, fecha de inicio y fin de cada actividad en su estado actual. La fecha de guardado se registrará automáticamente.</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setTab('list')}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                💾 Guardar Línea Base
                            </button>
                        </div>
                    </div>
                )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, flexShrink: 0 }}>
                    <button className="btn btn-ghost" onClick={close}>Cerrar</button>
                </div>

                {/* Overwrite choice dialog */}
                {overwritePrompt && (
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'inherit', zIndex: 50,
                    }}>
                        <div style={{
                            background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                            padding: '20px 24px', maxWidth: 420, width: '90%',
                            boxShadow: '0 8px 32px rgba(0,0,0,.5)',
                        }}>
                            <h3 style={{ margin: '0 0 6px', fontSize: 14, color: '#f1f5f9' }}>
                                ⚠️ La Línea Base {slotIdx} ya existe
                            </h3>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
                                Elija cómo desea sobrescribir esta línea base:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 12, padding: '10px 14px' }}
                                    onClick={doSaveAll}
                                >
                                    🔄 Actualizar Línea Base para todo el proyecto
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{
                                        width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 12, padding: '10px 14px',
                                        background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.4)', color: '#34d399',
                                    }}
                                    onClick={doSaveSelected}
                                >
                                    ✅ Actualizar solo actividades seleccionadas
                                    {state.selIndices && state.selIndices.size > 0
                                        ? ` (${state.selIndices.size})`
                                        : ' (ninguna)'}
                                </button>
                                <p style={{ fontSize: 10, color: '#64748b', margin: '2px 0 0', lineHeight: 1.4, fontStyle: 'italic' }}>
                                    Las actividades no seleccionadas mantendrán su línea base anterior.
                                </p>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                                <button className="btn btn-ghost" onClick={() => setOverwritePrompt(false)} style={{ fontSize: 11 }}>
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
