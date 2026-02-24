import React, { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { useResizable } from '../../hooks/useResizable';
import { Filter, Plus, Trash2, Copy, Check, Lock } from 'lucide-react';
import type { CustomFilter, CustomFilterCondition } from '../../types/gantt';
import { DEFAULT_COLS, BUILTIN_FILTERS } from '../../store/GanttContext';

const randomId = () => Math.random().toString(36).substr(2, 9);

export default function FilterModal() {
    const { state, dispatch } = useGantt();
    const { ref: resizeRef, style: resizeStyle } = useResizable({ initW: 850, minW: 700, minH: 500 });

    // Local state for editing draft filters before saving
    const [draftFilters, setDraftFilters] = useState<CustomFilter[]>([]);
    const [draftMatchAll, setDraftMatchAll] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Sync from global state when opened
    useEffect(() => {
        if (state.filtersModalOpen) {
            // Ensure all 11 builtins are present in draftFilters (merge with saved active state)
            const savedMap = new Map(state.customFilters.map(f => [f.id, f]));
            const builtins: CustomFilter[] = BUILTIN_FILTERS.map(bf => ({ ...bf, active: savedMap.get(bf.id)?.active ?? bf.active }));
            const userFilters: CustomFilter[] = state.customFilters.filter(f => !f.builtin);
            setDraftFilters([...builtins, ...userFilters]);
            setDraftMatchAll(state.filtersMatchAll);
            if (!selectedId) {
                setSelectedId(builtins.length > 0 ? builtins[0].id : userFilters.length > 0 ? userFilters[0].id : null);
            }
        }
    }, [state.filtersModalOpen]);

    if (!state.filtersModalOpen) return null;

    const close = () => dispatch({ type: 'CLOSE_FILTERS_MODAL' });

    const saveAndApply = () => {
        dispatch({ type: 'SET_CUSTOM_FILTERS', filters: draftFilters });
        dispatch({ type: 'SET_FILTERS_MATCH_ALL', matchAll: draftMatchAll });
        localStorage.setItem('gantt-cpm-custom-filters', JSON.stringify(draftFilters));
        localStorage.setItem('gantt-cpm-filters-match-all', JSON.stringify(draftMatchAll));
        close();
    };

    const addFilter = () => {
        const nf: CustomFilter = {
            id: 'f_' + randomId(),
            name: 'Nuevo Filtro',
            matchAll: true,
            active: false,
            conditions: []
        };
        setDraftFilters([...draftFilters, nf]);
        setSelectedId(nf.id);
    };

    const deleteFilter = () => {
        if (!selectedId) return;
        const target = draftFilters.find(f => f.id === selectedId);
        if (!target || target.builtin) return; // cannot delete builtin
        const updated = draftFilters.filter(f => f.id !== selectedId);
        setDraftFilters(updated);
        const firstUser = updated.find(f => !f.builtin);
        setSelectedId(firstUser ? firstUser.id : updated.length > 0 ? updated[0].id : null);
    };

    const copyFilter = () => {
        if (!selectedId) return;
        const src = draftFilters.find(f => f.id === selectedId);
        if (!src) return;
        const nf: CustomFilter = {
            ...JSON.parse(JSON.stringify(src)),
            id: 'f_' + randomId(),
            name: src.name + ' (Copia)',
            active: false,
            builtin: false
        };
        setDraftFilters([...draftFilters, nf]);
        setSelectedId(nf.id);
    };

    const updateSelectedFilter = (updates: Partial<CustomFilter>) => {
        if (!selectedId) return;
        setDraftFilters(dfs => dfs.map(f => f.id === selectedId ? { ...f, ...updates } : f));
    };

    const toggleFilterActive = (id: string) => {
        setDraftFilters(dfs => dfs.map(f => f.id === id ? { ...f, active: !f.active } : f));
    };

    const addCondition = () => {
        if (!selectedId) return;
        const f = draftFilters.find(x => x.id === selectedId);
        if (!f) return;
        const nc: CustomFilterCondition = {
            id: 'c_' + randomId(),
            field: 'name',
            operator: 'contains',
            value: ''
        };
        updateSelectedFilter({ conditions: [...f.conditions, nc] });
    };

    const removeCondition = (cid: string) => {
        if (!selectedId) return;
        const f = draftFilters.find(x => x.id === selectedId);
        if (!f) return;
        updateSelectedFilter({ conditions: f.conditions.filter(c => c.id !== cid) });
    };

    const updateCondition = (cid: string, updates: Partial<CustomFilterCondition>) => {
        if (!selectedId) return;
        const f = draftFilters.find(x => x.id === selectedId);
        if (!f) return;
        updateSelectedFilter({ conditions: f.conditions.map(c => c.id === cid ? { ...c, ...updates } : c) });
    };

    const selectedFilter = draftFilters.find(f => f.id === selectedId);

    // Extract available fields
    const availableFields = DEFAULT_COLS.filter(c => c.key !== '_num' && c.key !== '_info' && c.key !== '_mode');

    // Fields that are date-type (show date picker)
    const DATE_FIELDS = new Set(['startDate', 'endDate', 'actualStart', 'actualFinish', 'remStartDate', 'remEndDate', 'blStart', 'blEnd', 'constraintDate']);

    return (
        <div className="modal-overlay open" onClick={close} style={{ zIndex: 10000 }}>
            <div className="modal" ref={resizeRef} onClick={e => e.stopPropagation()} style={{ ...resizeStyle, width: 850, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '12px 18px', borderBottom: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Filter size={20} />
                        <h3 style={{ margin: 0, fontSize: 16 }}>Filtros</h3>
                    </div>
                    <button className="modal-close" onClick={close} style={{ marginLeft: 'auto' }}>✕</button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 15, padding: 15 }}>

                    {/* LEFT PANEL: Filters List */}
                    <div style={{ width: '35%', display: 'flex', flexDirection: 'column', gap: 10, borderRight: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}`, paddingRight: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}` }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Mostrar actividades que coincidan con:</span>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                <input type="radio" checked={draftMatchAll} onChange={() => setDraftMatchAll(true)} />
                                Todos los filtros seleccionados
                            </label>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                <input type="radio" checked={!draftMatchAll} onChange={() => setDraftMatchAll(false)} />
                                Cualquier filtro seleccionado
                            </label>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', border: `1px solid ${state.lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: 4, background: state.lightMode ? '#fff' : '#1e293b' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <tbody>
                                    {/* ── Por defecto ── */}
                                    <tr style={{ background: state.lightMode ? '#f1f5f9' : '#0f172a' }}>
                                        <td colSpan={2} style={{ padding: '5px 8px', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', color: state.lightMode ? '#475569' : '#94a3b8', textTransform: 'uppercase' }}>
                                            Por defecto
                                        </td>
                                    </tr>
                                    {draftFilters.filter(f => f.builtin).map(f => (
                                        <tr
                                            key={f.id}
                                            onClick={() => setSelectedId(f.id)}
                                            style={{
                                                cursor: 'pointer',
                                                background: selectedId === f.id ? (state.lightMode ? '#e0f2fe' : '#0ea5e940') : 'transparent',
                                                borderBottom: `1px solid ${state.lightMode ? '#f1f5f9' : '#1e293b'}`
                                            }}
                                        >
                                            <td style={{ padding: '5px 8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Lock size={11} color="#94a3b8" />
                                                    <span>{f.name}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={f.active}
                                                    onChange={() => toggleFilterActive(f.id)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    {/* ── Personalizado ── */}
                                    <tr style={{ background: state.lightMode ? '#f1f5f9' : '#0f172a' }}>
                                        <td colSpan={2} style={{ padding: '5px 8px', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', color: state.lightMode ? '#475569' : '#94a3b8', textTransform: 'uppercase' }}>
                                            Personalizado
                                        </td>
                                    </tr>
                                    {draftFilters.filter(f => !f.builtin).map(f => (
                                        <tr
                                            key={f.id}
                                            onClick={() => setSelectedId(f.id)}
                                            style={{
                                                cursor: 'pointer',
                                                background: selectedId === f.id ? (state.lightMode ? '#e0f2fe' : '#0ea5e940') : 'transparent',
                                                borderBottom: `1px solid ${state.lightMode ? '#f1f5f9' : '#1e293b'}`
                                            }}
                                        >
                                            <td style={{ padding: '5px 8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Filter size={12} color="#64748b" />
                                                    <span>{f.name}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={f.active}
                                                    onChange={() => toggleFilterActive(f.id)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    {draftFilters.filter(f => !f.builtin).length === 0 && (
                                        <tr>
                                            <td colSpan={2} style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                                Sin filtros personalizados
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                            <button className="btn btn-secondary" onClick={addFilter} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 13 }}>
                                <Plus size={14} /> Nuevo...
                            </button>
                            <button className="btn btn-secondary" onClick={copyFilter} disabled={!selectedId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 13 }}>
                                <Copy size={14} /> Copiar
                            </button>
                            <button className="btn btn-danger" onClick={deleteFilter} disabled={!selectedId || !!draftFilters.find(f => f.id === selectedId)?.builtin} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 13 }}>
                                <Trash2 size={14} /> Suprimir
                            </button>
                        </div>
                    </div>

                    {/* RIGHT PANEL: Filter Editor */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 15 }}>
                        {selectedFilter ? (
                            <>
                                {selectedFilter.builtin && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 4, background: state.lightMode ? '#fef9c3' : '#422006', border: `1px solid ${state.lightMode ? '#fde68a' : '#854d0e'}`, fontSize: 12 }}>
                                        <Lock size={12} color={state.lightMode ? '#92400e' : '#fbbf24'} />
                                        <span style={{ color: state.lightMode ? '#92400e' : '#fbbf24' }}>Este es un filtro del sistema y no se puede editar ni eliminar.</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, width: 120 }}>Nombre de filtro:</span>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={selectedFilter.name}
                                        onChange={e => !selectedFilter.builtin && updateSelectedFilter({ name: e.target.value })}
                                        readOnly={!!selectedFilter.builtin}
                                        style={{ flex: 1, opacity: selectedFilter.builtin ? 0.7 : 1, cursor: selectedFilter.builtin ? 'default' : 'text' }}
                                    />
                                </div>
                                <div style={{ border: `1px solid ${state.lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: 4, padding: '8px 10px', background: state.lightMode ? '#f8fafc' : '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 13 }}>Mostrar tareas que cumplan <strong>{selectedFilter.matchAll ? '(Todas)' : '(Cualquiera)'}</strong> de las siguientes condiciones:</span>
                                    <select
                                        className="form-input"
                                        style={{ width: 160, padding: '4px 8px', marginLeft: 'auto', opacity: selectedFilter.builtin ? 0.7 : 1 }}
                                        value={selectedFilter.matchAll ? 'all' : 'any'}
                                        onChange={e => !selectedFilter.builtin && updateSelectedFilter({ matchAll: e.target.value === 'all' })}
                                        disabled={!!selectedFilter.builtin}
                                    >
                                        <option value="all">Todas</option>
                                        <option value="any">Cualquiera</option>
                                    </select>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', border: `1px solid ${state.lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: 4 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: state.lightMode ? '#f1f5f9' : '#334155', textAlign: 'left', borderBottom: `1px solid ${state.lightMode ? '#cbd5e1' : '#475569'}` }}>
                                                <th style={{ padding: '6px 8px', width: 30 }}></th>
                                                <th style={{ padding: '6px 8px', width: 130 }}>Parámetro</th>
                                                <th style={{ padding: '6px 8px', width: 130 }}>Es</th>
                                                <th style={{ padding: '6px 8px' }}>Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedFilter.conditions.map(cond => (
                                                <tr key={cond.id} style={{ borderBottom: `1px solid ${state.lightMode ? '#f1f5f9' : '#334155'}` }}>
                                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                        {!selectedFilter.builtin && (
                                                            <button
                                                                onClick={() => removeCondition(cond.id)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                                                                title="Eliminar condición"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <select
                                                            className="form-input"
                                                            style={{ width: '100%', padding: '4px', opacity: selectedFilter.builtin ? 0.7 : 1 }}
                                                            value={cond.field}
                                                            onChange={e => !selectedFilter.builtin && updateCondition(cond.id, { field: e.target.value })}
                                                            disabled={!!selectedFilter.builtin}
                                                        >
                                                            {availableFields.map(c => (
                                                                <option key={c.key} value={c.key}>{c.label}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <select
                                                            className="form-input"
                                                            style={{ width: '100%', padding: '4px', textAlign: 'center', opacity: selectedFilter.builtin ? 0.7 : 1 }}
                                                            value={cond.operator}
                                                            onChange={e => !selectedFilter.builtin && updateCondition(cond.id, { operator: e.target.value as any })}
                                                            disabled={!!selectedFilter.builtin}
                                                        >
                                                            <option value="equals">es igual a</option>
                                                            <option value="not_equals">no es igual a</option>
                                                            <option value="greater_than">es mayor que</option>
                                                            <option value="greater_than_or_equal">es mayor o igual que (&gt;=)</option>
                                                            <option value="less_than">es menor que</option>
                                                            <option value="less_than_or_equal">es menor o igual que (&lt;=)</option>
                                                            <option value="contains">contiene</option>
                                                            <option value="not_contains">no contiene</option>
                                                            <option value="is_empty">está vacío</option>
                                                            <option value="is_not_empty">no está vacío</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        {cond.operator !== 'is_empty' && cond.operator !== 'is_not_empty' ? (
                                                            DATE_FIELDS.has(cond.field) ? (
                                                                <input
                                                                    type="date"
                                                                    className="form-input"
                                                                    style={{ width: '100%', padding: '4px', textAlign: 'center', opacity: selectedFilter.builtin ? 0.7 : 1 }}
                                                                    value={cond.value}
                                                                    onChange={e => !selectedFilter.builtin && updateCondition(cond.id, { value: e.target.value })}
                                                                    readOnly={!!selectedFilter.builtin}
                                                                />
                                                            ) : (
                                                                <input
                                                                    type="text"
                                                                    className="form-input"
                                                                    style={{ width: '100%', padding: '4px', textAlign: 'center', opacity: selectedFilter.builtin ? 0.7 : 1 }}
                                                                    value={cond.value}
                                                                    onChange={e => !selectedFilter.builtin && updateCondition(cond.id, { value: e.target.value })}
                                                                    readOnly={!!selectedFilter.builtin}
                                                                    placeholder="..."
                                                                />
                                                            )
                                                        ) : null}
                                                    </td>
                                                </tr>
                                            ))}
                                            {selectedFilter.conditions.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                                                        No se han definido condiciones. Agrega una condición abajo.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {!selectedFilter.builtin && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                        <button className="btn btn-secondary" onClick={addCondition} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 13 }}>
                                            <Plus size={14} /> Agregar Condición
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', border: `1px dashed ${state.lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: 8 }}>
                                Selecciona un filtro para editar sus detalles.
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer" style={{ borderTop: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}`, padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={close}>Cancelar</button>
                    <button className="btn btn-primary" onClick={saveAndApply} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Check size={16} /> Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
}
