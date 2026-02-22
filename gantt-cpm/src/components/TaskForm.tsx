// ═══════════════════════════════════════════════════════════════════
// TaskForm – Bottom panel with pred/suc/resource inline editing
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import { fmtDate, addDays } from '../utils/cpm';
import type { Activity } from '../types/gantt';
import SCurveChart from './SCurveChart';

export default function TaskForm() {
    const { state, dispatch } = useGantt();
    const { activities, selIdx, resourcePool } = state;
    const [tab, setTab] = useState<'pred' | 'res' | 'scurve'>('pred');
    const a = selIdx >= 0 ? activities[selIdx] : null;

    // ── Autocomplete State ──
    const [acOpen, setAcOpen] = useState(false);
    const [acFilter, setAcFilter] = useState('');
    const [acTarget, setAcTarget] = useState<'pred' | 'suc' | 'res'>('pred');
    const acRef = useRef<HTMLDivElement>(null);

    const acItems = useCallback(() => {
        if (!a) return [];
        if (acTarget === 'pred' || acTarget === 'suc') {
            return activities.filter(x => !x._isProjRow && x.id !== a.id && x.type !== 'summary')
                .filter(x => !acFilter || x.id.toLowerCase().includes(acFilter.toLowerCase()) || x.name.toLowerCase().includes(acFilter.toLowerCase()));
        } else {
            return resourcePool.filter(r => !acFilter || r.name.toLowerCase().includes(acFilter.toLowerCase()));
        }
    }, [a, activities, resourcePool, acFilter, acTarget]);

    // Close on outside click
    useEffect(() => {
        if (!acOpen) return;
        const h = (e: MouseEvent) => { if (acRef.current && !acRef.current.contains(e.target as Node)) setAcOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [acOpen]);

    if (!a) {
        return (
            <div className="form-zone" style={{ height: '100%' }}>
                <div className="form-header"><span className="fh-title">Selecciona una actividad</span></div>
            </div>
        );
    }

    const nextAct = () => { if (selIdx < activities.length - 1) dispatch({ type: 'SET_SELECTION', index: selIdx + 1 }); };
    const prevAct = () => { if (selIdx > 0) dispatch({ type: 'SET_SELECTION', index: selIdx - 1 }); };

    // Predecessors & successors for this activity
    const preds = (a.preds || []).map((p, pi) => {
        const predAct = activities.find(x => x.id === p.id);
        return { ...p, name: predAct?.name || '?', pi };
    });
    const succs: { sucId: string; sucName: string; type: string; lag: number; predIdx: number }[] = [];
    activities.forEach((x) => {
        if (!x.preds) return;
        x.preds.forEach((p, pi) => {
            if (p.id === a.id) succs.push({ sucId: x.id, sucName: x.name, type: p.type, lag: p.lag, predIdx: pi });
        });
    });

    const addPred = (predId: string) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'ADD_PRED', actIdx: selIdx, pred: { id: predId, type: 'FS', lag: 0 } });
        setAcOpen(false); setAcFilter('');
    };
    const addSuc = (sucId: string) => {
        const sucIdx = activities.findIndex(x => x.id === sucId);
        if (sucIdx < 0) return;
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'ADD_SUC', fromIdx: selIdx, sucIdx, linkType: 'FS', lag: 0 });
        setAcOpen(false); setAcFilter('');
    };
    const removePred = (pi: number) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'REMOVE_PRED', actIdx: selIdx, predIdx: pi });
    };
    const removeSuc = (sucId: string, predIdx: number) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'REMOVE_SUC', sucId, predIdx });
    };
    const addResourceToAct = (rid: number, name: string) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'ADD_RESOURCE_TO_ACT', actIdx: selIdx, rid, name, units: '100%', work: 0 });
        setAcOpen(false); setAcFilter('');
    };

    const handleFieldCommit = (key: string, val: string) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'COMMIT_EDIT', index: selIdx, key, value: val });
    };

    const isMgr = a.constraint && a.manual;

    return (
        <div className="form-zone" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header row */}
            <div className="form-header" style={{ flexWrap: 'wrap' }}>
                <span className="fh-title">{a.outlineNum || ''} {a.id}</span>
                <FHField label="Nombre:" val={a.name} k="name" onCommit={handleFieldCommit} width={120} />
                <FHField label="Duración:" val={String(a.dur || 0)} k="dur" onCommit={handleFieldCommit} width={30} />
                <FHField label="% completado:" val={String(a.pct || 0)} k="pct" onCommit={handleFieldCommit} width={30} />
                <span className="fh-field"><span className="fh-label">Tipo tarea: </span>
                    <select className="form-input" style={{ fontSize: 10, padding: '1px 4px' }} value={a.type}
                        onChange={e => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: { type: e.target.value as any, dur: e.target.value === 'milestone' ? 0 : a.dur } }); }}>
                        <option value="task">Tarea</option><option value="milestone">Hito</option><option value="summary">Resumen</option>
                    </select>
                </span>
                <span className="fh-field"><span className="fh-label">Comienzo: </span>{a.ES ? fmtDate(a.ES) : ''}</span>
                <span className="fh-field"><span className="fh-label">Fin: </span>{a.EF ? fmtDate(addDays(a.EF, -1)) : ''}</span>
                {isMgr && <span className="fh-field" style={{ color: '#fbbf24' }}>📌 Programada manualmente</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 10 }} onClick={prevAct}>Anterior</button>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 10 }} onClick={nextAct}>Siguiente</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="fv-tabs">
                <div className={`fv-tab ${tab === 'pred' ? 'active' : ''}`} onClick={() => setTab('pred')}>▼ Predecesoras / Sucesoras</div>
                <div className={`fv-tab ${tab === 'res' ? 'active' : ''}`} onClick={() => setTab('res')}>🔧 Recursos</div>
                <div className={`fv-tab ${tab === 'scurve' ? 'active' : ''}`} onClick={() => setTab('scurve')}>📈 Curva S</div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
                {tab === 'pred' && (
                    <div style={{ display: 'flex', gap: 12 }}>
                        {/* Predecessors */}
                        <div style={{ flex: 1 }}>
                            <div className="fp-section-hdr" style={{ color: '#818cf8' }}>▶ PREDECESORAS</div>
                            <div className="fp-col-hdr">
                                <div className="fp-cell fp-cell-id">ID</div>
                                <div className="fp-cell fp-cell-name">Nombre de la predecesora</div>
                                <div className="fp-cell fp-cell-type">Tipo</div>
                                <div className="fp-cell fp-cell-lag">Retardo</div>
                                <div className="fp-cell fp-cell-btn" />
                            </div>
                            {preds.map((p, pi) => (
                                <div key={pi} className="fp-row">
                                    <div className="fp-cell fp-cell-id">{p.id}</div>
                                    <div className="fp-cell fp-cell-name">{p.name}</div>
                                    <div className="fp-cell fp-cell-type">
                                        <select value={p.type} onChange={e => {
                                            dispatch({ type: 'PUSH_UNDO' });
                                            dispatch({ type: 'UPDATE_PRED', actIdx: selIdx, predIdx: pi, updates: { type: e.target.value as any } });
                                        }} style={{ background: 'transparent', color: 'inherit', border: 'none', outline: 'none', width: '100%', fontSize: 11 }}>
                                            <option style={{ color: '#000' }} value="FS">FC</option>
                                            <option style={{ color: '#000' }} value="SS">CC</option>
                                            <option style={{ color: '#000' }} value="FF">FF</option>
                                            <option style={{ color: '#000' }} value="SF">CF</option>
                                        </select>
                                    </div>
                                    <div className="fp-cell fp-cell-lag">
                                        <input type="number" value={p.lag} onChange={e => {
                                            dispatch({ type: 'PUSH_UNDO' });
                                            dispatch({ type: 'UPDATE_PRED', actIdx: selIdx, predIdx: pi, updates: { lag: parseInt(e.target.value) || 0 } });
                                        }} style={{ background: 'transparent', color: 'inherit', border: 'none', outline: 'none', width: '100%', fontSize: 11 }} />
                                    </div>
                                    <div className="fp-cell fp-cell-btn" style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => removePred(pi)}>✕</div>
                                </div>
                            ))}
                            <div className="fp-row" style={{ position: 'relative' }} ref={acRef}>
                                <input
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 11, padding: '0 4px', outline: 'none', width: '100%' }}
                                    placeholder="+ Agregar predecesora (ID o nombre)..."
                                    value={acFilter}
                                    onFocus={() => { setAcTarget('pred'); setAcOpen(true); }}
                                    onChange={e => { setAcFilter(e.target.value); setAcOpen(true); }}
                                />
                                {acOpen && acTarget === 'pred' && (
                                    <div className="ac-list open">
                                        {acItems().length === 0 && <div className="ac-empty">Sin coincidencias</div>}
                                        {(acItems() as Activity[]).slice(0, 20).map((x: Activity) => (
                                            <div key={x.id} className="ac-item" onMouseDown={e => { e.preventDefault(); addPred(x.id); }}>
                                                <span className="ac-id">{x.id}</span><span className="ac-nm">{x.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Successors */}
                        <div style={{ flex: 1 }}>
                            <div className="fp-section-hdr" style={{ color: '#6ee7b7' }}>▶ SUCESORAS</div>
                            <div className="fp-col-hdr">
                                <div className="fp-cell fp-cell-id">ID</div>
                                <div className="fp-cell fp-cell-name">Nombre de la sucesora</div>
                                <div className="fp-cell fp-cell-type">Tipo</div>
                                <div className="fp-cell fp-cell-lag">Retardo</div>
                                <div className="fp-cell fp-cell-btn" />
                            </div>
                            {succs.map((s, si) => (
                                <div key={si} className="fp-row">
                                    <div className="fp-cell fp-cell-id">{s.sucId}</div>
                                    <div className="fp-cell fp-cell-name">{s.sucName}</div>
                                    <div className="fp-cell fp-cell-type">
                                        <select value={s.type} onChange={e => {
                                            const sucIdx = activities.findIndex(x => x.id === s.sucId);
                                            if (sucIdx >= 0) {
                                                dispatch({ type: 'PUSH_UNDO' });
                                                dispatch({ type: 'UPDATE_PRED', actIdx: sucIdx, predIdx: s.predIdx, updates: { type: e.target.value as any } });
                                            }
                                        }} style={{ background: 'transparent', color: 'inherit', border: 'none', outline: 'none', width: '100%', fontSize: 11 }}>
                                            <option style={{ color: '#000' }} value="FS">FC</option>
                                            <option style={{ color: '#000' }} value="SS">CC</option>
                                            <option style={{ color: '#000' }} value="FF">FF</option>
                                            <option style={{ color: '#000' }} value="SF">CF</option>
                                        </select>
                                    </div>
                                    <div className="fp-cell fp-cell-lag">
                                        <input type="number" value={s.lag} onChange={e => {
                                            const sucIdx = activities.findIndex(x => x.id === s.sucId);
                                            if (sucIdx >= 0) {
                                                dispatch({ type: 'PUSH_UNDO' });
                                                dispatch({ type: 'UPDATE_PRED', actIdx: sucIdx, predIdx: s.predIdx, updates: { lag: parseInt(e.target.value) || 0 } });
                                            }
                                        }} style={{ background: 'transparent', color: 'inherit', border: 'none', outline: 'none', width: '100%', fontSize: 11 }} />
                                    </div>
                                    <div className="fp-cell fp-cell-btn" style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => removeSuc(s.sucId, s.predIdx)}>✕</div>
                                </div>
                            ))}
                            <div className="fp-row" style={{ position: 'relative' }} ref={acRef}>
                                <input
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 11, padding: '0 4px', outline: 'none', width: '100%' }}
                                    placeholder="+ Agregar sucesora (ID o nombre)..."
                                    value={acTarget === 'suc' ? acFilter : ''}
                                    onFocus={() => { setAcTarget('suc'); setAcFilter(''); setAcOpen(true); }}
                                    onChange={e => { setAcFilter(e.target.value); setAcOpen(true); }}
                                />
                                {acOpen && acTarget === 'suc' && (
                                    <div className="ac-list open">
                                        {acItems().length === 0 && <div className="ac-empty">Sin coincidencias</div>}
                                        {(acItems() as Activity[]).slice(0, 20).map((x: Activity) => (
                                            <div key={x.id} className="ac-item" onMouseDown={e => { e.preventDefault(); addSuc(x.id); }}>
                                                <span className="ac-id">{x.id}</span><span className="ac-nm">{x.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'scurve' && (
                    <div style={{ flex: 1, height: '100%', minHeight: 0, position: 'relative' }}>
                        <SCurveChart hideHeader forcedActivityId={a.id} />
                    </div>
                )}

                {tab === 'res' && (
                    <div>
                        <div className="fp-section-hdr" style={{ color: '#34d399' }}>🔧 RECURSOS ASIGNADOS</div>
                        <div className="fp-col-hdr">
                            <div className="fp-cell fp-cell-id">ID Req.</div>
                            <div className="fp-cell fp-cell-name">Nombre</div>
                            <div className="fp-cell fp-cell-units">Unidades</div>
                            <div className="fp-cell fp-cell-work">Trabajo</div>
                            <div className="fp-cell fp-cell-btn" />
                        </div>
                        {(a.resources || []).map((r, ri) => (
                            <div key={ri} className="fp-row">
                                <div className="fp-cell fp-cell-id">{r.rid}</div>
                                <div className="fp-cell fp-cell-name">{r.name}</div>
                                <div className="fp-cell fp-cell-units">{r.units || '100%'}</div>
                                <div className="fp-cell fp-cell-work">{(r.work || 0) + ' hrs'}</div>
                                <div className="fp-cell fp-cell-btn" style={{ color: '#ef4444', cursor: 'pointer' }}
                                    onClick={() => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'REMOVE_RESOURCE_FROM_ACT', actIdx: selIdx, resIdx: ri }); }}>✕</div>
                            </div>
                        ))}
                        <div className="fp-row" style={{ position: 'relative' }} ref={acRef}>
                            <input
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 11, padding: '0 4px', outline: 'none', width: '100%' }}
                                placeholder="+ Agregar recurso..."
                                value={acTarget === 'res' ? acFilter : ''}
                                onFocus={() => { setAcTarget('res'); setAcFilter(''); setAcOpen(true); }}
                                onChange={e => { setAcFilter(e.target.value); setAcOpen(true); }}
                            />
                            {acOpen && acTarget === 'res' && (
                                <div className="ac-list open">
                                    {acItems().length === 0 && <div className="ac-empty">Sin coincidencias</div>}
                                    {(acItems() as any[]).slice(0, 20).map((r: any) => (
                                        <div key={r.rid || r.name} className="ac-item" onMouseDown={e => { e.preventDefault(); addResourceToAct(r.rid, r.name); }}>
                                            <span className="ac-id">{r.rid}</span><span className="ac-nm">{r.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 8, padding: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                            Trabajo total: <b>{(a.work || 0).toFixed(1)} hrs</b>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function FHField({ label, val, k, onCommit, width }: { label: string; val: string; k: string; onCommit: (k: string, v: string) => void; width: number }) {
    return (
        <span className="fh-field">
            <span className="fh-label">{label} </span>
            <input className="fh-input" style={{ width }} defaultValue={val} key={val}
                onBlur={e => { if (e.target.value !== val) onCommit(k, e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }} />
        </span>
    );
}
