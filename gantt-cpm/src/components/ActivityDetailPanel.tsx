// ═══════════════════════════════════════════════════════════════════
// ActivityDetailPanel – P6-style bottom panel for activity updates
// Tabs: General | Estado | Recursos | Predecesores | Sucesores | Relaciones | Pasos | Curva S
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import { isoDate, fmtDate, addDays } from '../utils/cpm';
import type { Activity, ConstraintType } from '../types/gantt';
import SCurveChart from './SCurveChart';

type Tab = 'general' | 'estado' | 'recursos' | 'predecesores' | 'sucesores' | 'relaciones' | 'pasos' | 'curvas';

/* ── Constraint labels ── */
const CONSTRAINT_LABELS: Record<string, string> = {
    '': '< None >',
    'SNET': 'No iniciar antes de',
    'SNLT': 'No iniciar después de',
    'MSO': 'Debe iniciar el',
    'MFO': 'Debe finalizar el',
    'FNET': 'No finalizar antes de',
    'FNLT': 'No finalizar después de',
};

/* ── Link-type labels (Spanish) ── kept for future tab usage */
export const LINK_TYPE_LABELS: Record<string, string> = {
    FS: 'Fin a Comienzo',
    SS: 'Comienzo a Comienzo',
    FF: 'Fin a Fin',
    SF: 'Comienzo a Fin',
};

export default function ActivityDetailPanel() {
    const { state, dispatch } = useGantt();
    const { activities, selIdx, resourcePool } = state;
    const a = selIdx >= 0 ? activities[selIdx] : null;
    const [tab, setTab] = useState<Tab>('estado');

    // ── Autocomplete ──
    const [acOpen, setAcOpen] = useState(false);
    const [acFilter, setAcFilter] = useState('');
    const [acTarget, setAcTarget] = useState<'pred' | 'suc' | 'res'>('pred');
    const acRef = useRef<HTMLDivElement>(null);

    // Close autocomplete on outside click
    useEffect(() => {
        if (!acOpen) return;
        const h = (e: MouseEvent) => { if (acRef.current && !acRef.current.contains(e.target as Node)) setAcOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [acOpen]);

    const acItems = useCallback(() => {
        if (!a) return [];
        if (acTarget === 'pred' || acTarget === 'suc') {
            return activities.filter(x => !x._isProjRow && x.id !== a.id && x.type !== 'summary')
                .filter(x => !acFilter || x.id.toLowerCase().includes(acFilter.toLowerCase()) || x.name.toLowerCase().includes(acFilter.toLowerCase()));
        } else {
            return resourcePool.filter(r => !acFilter || r.name.toLowerCase().includes(acFilter.toLowerCase()));
        }
    }, [a, activities, resourcePool, acFilter, acTarget]);

    if (!a) {
        return (
            <div className="adp-root">
                <div className="adp-tabs">
                    {(['General', 'Estado', 'Recursos', 'Predecesores', 'Sucesores', 'Relaciones', 'Pasos', 'Curva S'] as const).map(t => (
                        <div key={t} className="adp-tab disabled">{t}</div>
                    ))}
                </div>
                <div className="adp-body adp-empty">Selecciona una actividad</div>
            </div>
        );
    }

    // ── Predecessors / Successors data ──
    const preds = (a.preds || []).map((p, pi) => {
        const predAct = activities.find(x => x.id === p.id);
        return { ...p, name: predAct?.name || '?', pi };
    });
    const succs: { sucId: string; sucName: string; type: string; lag: number; predIdx: number }[] = [];
    activities.forEach(x => {
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
    const removePred = (pi: number) => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'REMOVE_PRED', actIdx: selIdx, predIdx: pi }); };
    const removeSuc = (sucId: string, predIdx: number) => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'REMOVE_SUC', sucId, predIdx }); };
    const addResourceToAct = (rid: number, name: string) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'ADD_RESOURCE_TO_ACT', actIdx: selIdx, rid, name, units: '100%', work: 0 });
        setAcOpen(false); setAcFilter('');
    };
    const addResourceByName = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'ADD_RESOURCE_BY_NAME', actIdx: selIdx, name: trimmed });
        setAcOpen(false); setAcFilter('');
    };

    const nextAct = () => { if (selIdx < activities.length - 1) dispatch({ type: 'SET_SELECTION', index: selIdx + 1 }); };
    const prevAct = () => { if (selIdx > 0) dispatch({ type: 'SET_SELECTION', index: selIdx - 1 }); };

    const TABS: { key: Tab; label: string }[] = [
        { key: 'general', label: 'General' },
        { key: 'estado', label: 'Estado' },
        { key: 'recursos', label: 'Recursos' },
        { key: 'predecesores', label: 'Predecesores' },
        { key: 'sucesores', label: 'Sucesores' },
        { key: 'relaciones', label: 'Relaciones' },
        { key: 'pasos', label: 'Pasos' },
        { key: 'curvas', label: 'Curva S' },
    ];

    return (
        <div className="adp-root">
            {/* ── Tab strip ── */}
            <div className="adp-tabs">
                {TABS.map(t => (
                    <div key={t.key} className={`adp-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</div>
                ))}
                {/* Navigation arrows */}
                <div className="adp-nav">
                    <button className="adp-nav-btn" onClick={prevAct} title="Anterior">▲</button>
                    <button className="adp-nav-btn" onClick={nextAct} title="Siguiente">▼</button>
                </div>
                {/* Activity header */}
                <div className="adp-act-hdr">
                    <span className="adp-lbl">Actividad</span>
                    <span className="adp-val" style={{ width: 100 }}>{a.id}</span>
                    <span className="adp-val" style={{ flex: 1 }}>{a.name}</span>
                    <span className="adp-lbl" style={{ marginLeft: 16 }}>Proyecto</span>
                    <span className="adp-val" style={{ width: 160 }}>{state.projName}</span>
                </div>
            </div>

            {/* ── Tab content ── */}
            <div className="adp-body">
                {tab === 'general' && <TabGeneral a={a} dispatch={dispatch} selIdx={selIdx} state={state} />}
                {tab === 'estado' && (
                    <TabEstado a={a} dispatch={dispatch} selIdx={selIdx} />
                )}
                {tab === 'recursos' && (
                    <TabRecursos
                        a={a} selIdx={selIdx} dispatch={dispatch}
                        resourcePool={resourcePool} acOpen={acOpen} acTarget={acTarget}
                        acFilter={acFilter} acRef={acRef} setAcOpen={setAcOpen}
                        setAcTarget={setAcTarget} setAcFilter={setAcFilter}
                        acItems={acItems} addResourceToAct={addResourceToAct}
                        addResourceByName={addResourceByName}
                    />
                )}
                {tab === 'predecesores' && (
                    <TabPredecesores
                        a={a} preds={preds} selIdx={selIdx} dispatch={dispatch}
                        acOpen={acOpen} acTarget={acTarget} acFilter={acFilter}
                        acRef={acRef} setAcOpen={setAcOpen} setAcTarget={setAcTarget}
                        setAcFilter={setAcFilter} acItems={acItems} addPred={addPred} removePred={removePred}
                    />
                )}
                {tab === 'sucesores' && (
                    <TabSucesores
                        a={a} succs={succs} activities={activities} selIdx={selIdx} dispatch={dispatch}
                        acOpen={acOpen} acTarget={acTarget} acFilter={acFilter}
                        acRef={acRef} setAcOpen={setAcOpen} setAcTarget={setAcTarget}
                        setAcFilter={setAcFilter} acItems={acItems} addSuc={addSuc} removeSuc={removeSuc}
                    />
                )}
                {tab === 'relaciones' && <TabRelaciones a={a} activities={activities} succs={succs} preds={preds} dispatch={dispatch} selIdx={selIdx} addPred={addPred} addSuc={addSuc} removePred={removePred} removeSuc={removeSuc} acOpen={acOpen} acTarget={acTarget} acFilter={acFilter} acRef={acRef} setAcOpen={setAcOpen} setAcTarget={setAcTarget} setAcFilter={setAcFilter} acItems={acItems} />}
                {tab === 'pasos' && <TabPasos a={a} />}
                {tab === 'curvas' && <TabCurvaS activityId={a.id} />}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: General
   ════════════════════════════════════════════════════════════════ */
function TabGeneral({ a, dispatch, selIdx, state }: { a: Activity; dispatch: any; selIdx: number; state: any }) {
    const handleFieldCommit = (key: string, val: string) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'COMMIT_EDIT', index: selIdx, key, value: val });
    };

    return (
        <div className="adp-general">
            <div className="adp-section">
                <div className="adp-section-title">Información de la Actividad</div>
                <div className="adp-field-row">
                    <label className="adp-field-label">ID de Actividad</label>
                    <input className="adp-input" value={a.id} readOnly style={{ opacity: 0.7 }} />
                </div>
                <div className="adp-field-row">
                    <label className="adp-field-label">Nombre</label>
                    <input className="adp-input" style={{ flex: 1 }} defaultValue={a.name} key={a.id + a.name}
                        onBlur={e => { if (e.target.value !== a.name) handleFieldCommit('name', e.target.value); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                </div>
                <div className="adp-field-row">
                    <label className="adp-field-label">WBS / Nivel</label>
                    <span className="adp-readonly">{a.outlineNum || ''} (Nivel {a.lv})</span>
                </div>
                <div className="adp-field-row">
                    <label className="adp-field-label">Tipo de tarea</label>
                    <select className="adp-input" value={a.type}
                        onChange={e => {
                            dispatch({ type: 'PUSH_UNDO' });
                            dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: { type: e.target.value as any, dur: e.target.value === 'milestone' ? 0 : a.dur } });
                        }}>
                        <option value="task">Tarea</option>
                        <option value="milestone">Hito (0 días)</option>
                        <option value="summary">Resumen</option>
                    </select>
                </div>
                <div className="adp-field-row">
                    <label className="adp-field-label">Calendario</label>
                    <select className="adp-input" value={a.cal}
                        onChange={e => {
                            dispatch({ type: 'PUSH_UNDO' });
                            dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: { cal: isNaN(parseInt(e.target.value)) ? e.target.value : parseInt(e.target.value) as any } });
                        }}>
                        <option value={5}>5d (Lun-Vie)</option>
                        <option value={6}>6d (Lun-Sáb)</option>
                        <option value={7}>7d (continuo)</option>
                        {state.customCalendars.map((cc: any) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                </div>
            </div>
            <div className="adp-section">
                <div className="adp-section-title">Fechas Calculadas (CPM)</div>
                <div className="adp-fields-grid">
                    <div className="adp-field-row"><label className="adp-field-label">Comienzo temprano (ES)</label><span className="adp-readonly">{a.ES ? fmtDate(a.ES) : '—'}</span></div>
                    <div className="adp-field-row"><label className="adp-field-label">Fin temprano (EF)</label><span className="adp-readonly">{a.EF ? fmtDate(addDays(a.EF, -1)) : '—'}</span></div>
                    <div className="adp-field-row"><label className="adp-field-label">Comienzo tardío (LS)</label><span className="adp-readonly">{a.LS ? fmtDate(a.LS) : '—'}</span></div>
                    <div className="adp-field-row"><label className="adp-field-label">Fin tardío (LF)</label><span className="adp-readonly">{a.LF ? fmtDate(addDays(a.LF, -1)) : '—'}</span></div>
                </div>
            </div>
            <div className="adp-section">
                <div className="adp-section-title">Notas / Supuestos</div>
                <textarea className="adp-input" rows={3} defaultValue={a.notes || ''} key={a.id + 'notes'}
                    onBlur={e => { if (e.target.value !== (a.notes || '')) handleFieldCommit('notes', e.target.value); }} />
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: Estado  (P6-style status update panel)
   ════════════════════════════════════════════════════════════════ */
function TabEstado({ a, dispatch, selIdx }: {
    a: Activity; dispatch: any; selIdx: number;
}) {
    // Derived display values (read from actual state, not form)
    const origDur = (a as any)._origDur ?? a.dur ?? 0;
    const realDur = (a as any)._doneDur ?? (a.pct > 0 ? Math.round(origDur * a.pct / 100) : 0);
    const remDur = a.remDur ?? Math.round(origDur * (100 - (a.pct || 0)) / 100);
    const atCompletion = a.pct === 100 ? realDur : (realDur + remDur);
    const started = a.pct > 0 || !!a.actualStart;
    const finished = a.pct === 100 && !!a.actualFinish;

    const commit = (key: string, value: string) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'COMMIT_EDIT', index: selIdx, key, value });
    };
    const update = (upd: Partial<Activity>) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: upd });
    };

    return (
        <div className="adp-estado">
            {/* ── Row 1: Duración | Estado | Unidades de mano de obra ── */}
            <div className="adp-estado-grid">
                {/* ── Duración ── */}
                <fieldset className="adp-fieldset">
                    <legend>Duración</legend>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Original</label>
                        <input className="adp-input adp-num" type="number" step={1} min={0} value={origDur} readOnly />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Real</label>
                        <input className="adp-input adp-num" type="number" step={1} min={0} value={realDur} readOnly />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Restante</label>
                        <input className="adp-input adp-num" type="number" step={1} min={0} key={`${a.id}-rem-${remDur}`} defaultValue={remDur}
                            onBlur={e => { const v = e.target.value.trim(); if (v !== String(remDur)) commit('remDur', v); }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Al finalizar</label>
                        <input className="adp-input adp-num" type="number" step={1} min={0} value={atCompletion} readOnly />
                    </div>
                </fieldset>

                {/* ── Estado ── */}
                <fieldset className="adp-fieldset adp-fieldset-wide">
                    <legend>Estado</legend>
                    <div className="adp-estado-checks">
                        <div className="adp-field-row">
                            <label className="adp-check-label">
                                <input type="checkbox" checked={started}
                                    onChange={e => {
                                        if (e.target.checked) {
                                            const startDate = a.ES ? isoDate(a.ES) : isoDate(new Date());
                                            update({ actualStart: a.actualStart || startDate, pct: a.pct > 0 ? a.pct : 1 });
                                        } else {
                                            update({ actualStart: null, pct: 0 });
                                        }
                                    }} />
                                Iniciado
                            </label>
                            <input className="adp-input" type="date" key={`${a.id}-as-${a.actualStart}`}
                                defaultValue={a.actualStart || ''}
                                onBlur={e => { const v = e.target.value; if (v !== (a.actualStart || '')) update({ actualStart: v || null }); }}
                                disabled={!started} />
                            <label className="adp-field-label" style={{ marginLeft: 16 }}>% físico</label>
                            <input className="adp-input adp-num" type="number" step={5} min={0} max={100} key={`${a.id}-pct-${a.pct}`} defaultValue={a.pct || 0}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== String(a.pct || 0)) commit('pct', v); }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                style={{ width: 58 }} />
                            <span className="adp-suffix">%</span>
                        </div>
                        <div className="adp-field-row">
                            <label className="adp-check-label">
                                <input type="checkbox" checked={finished}
                                    onChange={e => {
                                        if (e.target.checked) {
                                            const finDate = a.actualFinish || (a.EF ? isoDate(addDays(a.EF, -1)) : isoDate(new Date()));
                                            update({ actualFinish: finDate, pct: 100, remDur: 0 });
                                        } else {
                                            update({ actualFinish: null, pct: a.pct === 100 ? 99 : a.pct });
                                        }
                                    }} />
                                Finalizado
                            </label>
                            <input className="adp-input" type="date" key={`${a.id}-af-${a.actualFinish}`}
                                defaultValue={a.actualFinish || ''}
                                onBlur={e => { const v = e.target.value; if (v !== (a.actualFinish || '')) update({ actualFinish: v || null }); }}
                                disabled={!finished} />
                            <label className="adp-field-label" style={{ marginLeft: 16 }}>Suspender</label>
                            <input className="adp-input" type="date" key={`${a.id}-susp-${a.suspendDate}`}
                                defaultValue={a.suspendDate || ''}
                                onBlur={e => { const v = e.target.value; if (v !== (a.suspendDate || '')) update({ suspendDate: v || null }); }}
                            />
                        </div>
                        <div className="adp-field-row">
                            <label className="adp-field-label" style={{ minWidth: 90 }}>Final previsto</label>
                            <input className="adp-input" type="date"
                                value={a.EF ? isoDate(a.type === 'milestone' ? a.EF : addDays(a.EF, -1)) : ''}
                                readOnly />
                            <label className="adp-field-label" style={{ marginLeft: 16 }}>Reanudar</label>
                            <input className="adp-input" type="date" key={`${a.id}-res-${a.resumeDate}`}
                                defaultValue={a.resumeDate || ''}
                                onBlur={e => { const v = e.target.value; if (v !== (a.resumeDate || '')) update({ resumeDate: v || null }); }}
                                disabled={!a.suspendDate}
                            />
                        </div>
                    </div>
                </fieldset>

                {/* ── Unidades de mano de obra ── */}
                <fieldset className="adp-fieldset">
                    <legend>Unidades de mano de obra</legend>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Presupuestado</label>
                        <input className="adp-input adp-num" type="number" step={100} min={0} value={a.work || 0} readOnly />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Real</label>
                        <input className="adp-input adp-num" type="number" step={100} min={0} value={a.pct === 100 ? (a.work || 0) : Math.round((a.work || 0) * (a.pct || 0) / 100)} readOnly />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Restante</label>
                        <input className="adp-input adp-num" type="number" step={100} min={0} value={a.pct === 100 ? 0 : Math.round((a.work || 0) * (100 - (a.pct || 0)) / 100)} readOnly />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Al finalizar</label>
                        <input className="adp-input adp-num" type="number" step={100} min={0} value={a.work || 0} readOnly />
                    </div>
                </fieldset>
            </div>

            {/* ── Row 2: Margen & Restricciones ── */}
            <div className="adp-estado-row2">
                <fieldset className="adp-fieldset" style={{ maxWidth: 200 }}>
                    <legend>Margen</legend>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Margen total</label>
                        <input className="adp-input adp-num" type="number" step={1} value={a.TF != null ? a.TF : ''} readOnly />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Margen libre</label>
                        <input className="adp-input adp-num" type="number" step={1} value={a._freeFloat != null ? a._freeFloat : ''} readOnly />
                    </div>
                </fieldset>

                <fieldset className="adp-fieldset" style={{ flex: 1 }}>
                    <legend>Restricciones</legend>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Principal</label>
                        <select className="adp-input" value={a.constraint || ''}
                            onChange={e => {
                                const c = e.target.value as ConstraintType;
                                update(c ? { constraint: c } : { constraint: '' as any, constraintDate: '', manual: false });
                            }}>
                            {Object.entries(CONSTRAINT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <label className="adp-field-label" style={{ marginLeft: 12 }}>Fecha</label>
                        <input className="adp-input" type="date" key={`${a.id}-cd-${a.constraintDate}`}
                            defaultValue={a.constraintDate || ''}
                            onBlur={e => { const v = e.target.value; if (v !== (a.constraintDate || '')) update({ constraintDate: v }); }}
                            disabled={!(a.constraint || '')} />
                    </div>
                    <div className="adp-field-row">
                        <label className="adp-field-label">Secundario</label>
                        <select className="adp-input" value="" onChange={() => {}}>
                            {Object.entries(CONSTRAINT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <label className="adp-field-label" style={{ marginLeft: 12 }}>Fecha</label>
                        <input className="adp-input" type="date" disabled />
                    </div>
                </fieldset>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: Recursos
   ════════════════════════════════════════════════════════════════ */
function TabRecursos({ a, selIdx, dispatch, resourcePool, acOpen, acTarget, acFilter, acRef, setAcOpen, setAcTarget, setAcFilter, acItems, addResourceToAct, addResourceByName }: any) {
    return (
        <div className="adp-table-tab">
            <table className="adp-tbl">
                <thead>
                    <tr>
                        <th>ID Recurso</th>
                        <th>Nombre</th>
                        <th>Unidades</th>
                        <th>Trabajo (hrs)</th>
                        <th style={{ width: 30 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {(a.resources || []).map((r: any, ri: number) => (
                        <tr key={ri}>
                            <td>{r.rid}</td>
                            <td>{r.name}</td>
                            <td>{r.units || '100%'}</td>
                            <td>{r.work || 0}</td>
                            <td className="adp-del-cell" onClick={() => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'REMOVE_RESOURCE_FROM_ACT', actIdx: selIdx, resIdx: ri }); }}>✕</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="adp-add-row" ref={acRef} style={{ position: 'relative' }}>
                <input className="adp-input" placeholder="+ Agregar recurso (seleccionar o escribir nombre nuevo)..."
                    style={{ width: '100%' }}
                    value={acTarget === 'res' ? acFilter : ''}
                    onFocus={() => { setAcTarget('res'); setAcFilter(''); setAcOpen(true); }}
                    onChange={(e: any) => { setAcFilter(e.target.value); setAcOpen(true); }}
                    onKeyDown={(e: any) => {
                        if (e.key === 'Enter' && acFilter.trim()) {
                            e.preventDefault();
                            // If there's an exact match in pool, use it; otherwise create new
                            const match = resourcePool.find((r: any) => r.name.toLowerCase() === acFilter.trim().toLowerCase());
                            if (match) addResourceToAct(match.rid, match.name);
                            else addResourceByName(acFilter.trim());
                        }
                    }} />
                {acOpen && acTarget === 'res' && (
                    <div className="adp-ac-list">
                        {/* Show "Create new" option when no exact match */}
                        {acFilter.trim() && !resourcePool.some((r: any) => r.name.toLowerCase() === acFilter.trim().toLowerCase()) && (
                            <div className="adp-ac-item adp-ac-create" onMouseDown={(e: any) => { e.preventDefault(); addResourceByName(acFilter.trim()); }}>
                                <span className="adp-ac-id">+</span>
                                <span className="adp-ac-nm">Crear recurso "<b>{acFilter.trim()}</b>"</span>
                            </div>
                        )}
                        {acItems().length === 0 && !acFilter.trim() && <div className="adp-ac-empty">Sin recursos en el pool</div>}
                        {(acItems() as any[]).slice(0, 20).map((r: any) => (
                            <div key={r.rid || r.name} className="adp-ac-item" onMouseDown={(e: any) => { e.preventDefault(); addResourceToAct(r.rid, r.name); }}>
                                <span className="adp-ac-id">{r.rid}</span>
                                <span className="adp-ac-nm">{r.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="adp-summary">Trabajo total: <b>{(a.work || 0).toFixed(1)} hrs</b></div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: Predecesores
   ════════════════════════════════════════════════════════════════ */
function TabPredecesores({ a: _a, preds, selIdx, dispatch, acOpen, acTarget, acFilter, acRef, setAcOpen, setAcTarget, setAcFilter, acItems, addPred, removePred }: any) {
    return (
        <div className="adp-table-tab">
            <table className="adp-tbl">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre de la actividad</th>
                        <th>Tipo</th>
                        <th>Retardo</th>
                        <th style={{ width: 30 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {preds.map((p: any, pi: number) => (
                        <tr key={pi}>
                            <td>{p.id}</td>
                            <td>{p.name}</td>
                            <td>
                                <select className="adp-inline-sel" value={p.type}
                                    onChange={(e: any) => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: selIdx, predIdx: pi, updates: { type: e.target.value } }); }}>
                                    <option value="FS">FC (Fin-Comienzo)</option>
                                    <option value="SS">CC (Comienzo-Comienzo)</option>
                                    <option value="FF">FF (Fin-Fin)</option>
                                    <option value="SF">CF (Comienzo-Fin)</option>
                                </select>
                            </td>
                            <td>
                                <input className="adp-inline-input" type="number" value={p.lag}
                                    onChange={(e: any) => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: selIdx, predIdx: pi, updates: { lag: parseInt(e.target.value) || 0 } }); }} />
                            </td>
                            <td className="adp-del-cell" onClick={() => removePred(pi)}>✕</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="adp-add-row" ref={acRef} style={{ position: 'relative' }}>
                <input className="adp-input" placeholder="+ Agregar predecesora (ID o nombre)..."
                    value={acTarget === 'pred' ? acFilter : ''}
                    onFocus={() => { setAcTarget('pred'); setAcFilter(''); setAcOpen(true); }}
                    onChange={(e: any) => { setAcFilter(e.target.value); setAcOpen(true); }} />
                {acOpen && acTarget === 'pred' && (
                    <div className="adp-ac-list">
                        {acItems().length === 0 && <div className="adp-ac-empty">Sin coincidencias</div>}
                        {(acItems() as Activity[]).slice(0, 20).map((x: Activity) => (
                            <div key={x.id} className="adp-ac-item" onMouseDown={(e: any) => { e.preventDefault(); addPred(x.id); }}>
                                <span className="adp-ac-id">{x.id}</span>
                                <span className="adp-ac-nm">{x.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: Sucesores
   ════════════════════════════════════════════════════════════════ */
function TabSucesores({ a: _a, succs, activities, selIdx: _selIdx, dispatch, acOpen, acTarget, acFilter, acRef, setAcOpen, setAcTarget, setAcFilter, acItems, addSuc, removeSuc }: any) {
    return (
        <div className="adp-table-tab">
            <table className="adp-tbl">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre de la actividad</th>
                        <th>Tipo</th>
                        <th>Retardo</th>
                        <th style={{ width: 30 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {succs.map((s: any, si: number) => (
                        <tr key={si}>
                            <td>{s.sucId}</td>
                            <td>{s.sucName}</td>
                            <td>
                                <select className="adp-inline-sel" value={s.type}
                                    onChange={(e: any) => {
                                        const sucIdx = activities.findIndex((x: any) => x.id === s.sucId);
                                        if (sucIdx >= 0) { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: sucIdx, predIdx: s.predIdx, updates: { type: e.target.value } }); }
                                    }}>
                                    <option value="FS">FC (Fin-Comienzo)</option>
                                    <option value="SS">CC (Comienzo-Comienzo)</option>
                                    <option value="FF">FF (Fin-Fin)</option>
                                    <option value="SF">CF (Comienzo-Fin)</option>
                                </select>
                            </td>
                            <td>
                                <input className="adp-inline-input" type="number" value={s.lag}
                                    onChange={(e: any) => {
                                        const sucIdx = activities.findIndex((x: any) => x.id === s.sucId);
                                        if (sucIdx >= 0) { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: sucIdx, predIdx: s.predIdx, updates: { lag: parseInt(e.target.value) || 0 } }); }
                                    }} />
                            </td>
                            <td className="adp-del-cell" onClick={() => removeSuc(s.sucId, s.predIdx)}>✕</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="adp-add-row" ref={acRef} style={{ position: 'relative' }}>
                <input className="adp-input" placeholder="+ Agregar sucesora (ID o nombre)..."
                    value={acTarget === 'suc' ? acFilter : ''}
                    onFocus={() => { setAcTarget('suc'); setAcFilter(''); setAcOpen(true); }}
                    onChange={(e: any) => { setAcFilter(e.target.value); setAcOpen(true); }} />
                {acOpen && acTarget === 'suc' && (
                    <div className="adp-ac-list">
                        {acItems().length === 0 && <div className="adp-ac-empty">Sin coincidencias</div>}
                        {(acItems() as Activity[]).slice(0, 20).map((x: Activity) => (
                            <div key={x.id} className="adp-ac-item" onMouseDown={(e: any) => { e.preventDefault(); addSuc(x.id); }}>
                                <span className="adp-ac-id">{x.id}</span>
                                <span className="adp-ac-nm">{x.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: Relaciones (side-by-side Pred / Suc panels)
   ════════════════════════════════════════════════════════════════ */
function TabRelaciones({ a: _a, activities, succs, preds, dispatch, selIdx, addPred, addSuc, removePred, removeSuc, acOpen, acTarget, acFilter, acRef, setAcOpen, setAcTarget, setAcFilter, acItems }: any) {
    const [selP, setSelP] = useState<number | null>(null);
    const [selS, setSelS] = useState<number | null>(null);

    const goTo = (actId: string) => {
        const idx = activities.findIndex((x: any) => x.id === actId);
        if (idx >= 0) dispatch({ type: 'SET_SELECTION', index: idx });
    };

    return (
        <div className="adp-rel-root">
            {/* ── Left: Predecesoras ── */}
            <div className="adp-rel-panel">
                <div className="adp-rel-header">
                    <span className="adp-rel-title" style={{ color: '#818cf8' }}>Predecesoras ({preds.length})</span>
                    <div className="adp-rel-btns">
                        <button className="adp-rel-btn" title="Asignar predecesora"
                            onClick={() => { setAcTarget('pred'); setAcFilter(''); setAcOpen(!acOpen || acTarget !== 'pred'); }}>＋ Asignar</button>
                        <button className="adp-rel-btn adp-rel-btn-del" title="Eliminar predecesora"
                            disabled={selP == null}
                            onClick={() => { if (selP != null) { removePred(selP); setSelP(null); } }}>✕ Eliminar</button>
                        <button className="adp-rel-btn" title="Ir a predecesora"
                            disabled={selP == null}
                            onClick={() => { if (selP != null && preds[selP]) goTo(preds[selP].id); }}>→ Ir a</button>
                    </div>
                </div>
                {/* Autocomplete for pred */}
                {acOpen && acTarget === 'pred' && (
                    <div className="adp-rel-ac" ref={acRef}>
                        <input className="adp-input" autoFocus placeholder="Buscar actividad (ID o nombre)..."
                            value={acFilter} onChange={(e: any) => setAcFilter(e.target.value)} />
                        <div className="adp-ac-list" style={{ position: 'relative' }}>
                            {acItems().length === 0 && <div className="adp-ac-empty">Sin coincidencias</div>}
                            {(acItems() as Activity[]).slice(0, 15).map((x: Activity) => (
                                <div key={x.id} className="adp-ac-item" onMouseDown={(e: any) => { e.preventDefault(); addPred(x.id); }}>
                                    <span className="adp-ac-id">{x.id}</span>
                                    <span className="adp-ac-nm">{x.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <table className="adp-tbl">
                    <thead><tr><th>ID</th><th>Nombre de Tarea</th><th>Tipo</th><th>Retardo</th><th>Comienzo</th><th>Fin</th></tr></thead>
                    <tbody>
                        {preds.map((p: any, i: number) => {
                            const pa = activities.find((x: any) => x.id === p.id);
                            return (
                                <tr key={i} className={selP === i ? 'adp-rel-sel' : ''} onClick={() => setSelP(i)}>
                                    <td>{p.id}</td>
                                    <td>{p.name}</td>
                                    <td>
                                        <select className="adp-inline-sel" value={p.type}
                                            onChange={(e: any) => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: selIdx, predIdx: p.pi, updates: { type: e.target.value } }); }}>
                                            <option value="FS">FC</option><option value="SS">CC</option><option value="FF">FF</option><option value="SF">CF</option>
                                        </select>
                                    </td>
                                    <td>
                                        <input className="adp-inline-input" type="number" value={p.lag} style={{ width: 40 }}
                                            onChange={(e: any) => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: selIdx, predIdx: p.pi, updates: { lag: parseInt(e.target.value) || 0 } }); }} />
                                    </td>
                                    <td>{pa?.ES ? fmtDate(pa.ES) : '—'}</td>
                                    <td>{pa?.EF ? fmtDate(addDays(pa.EF, -1)) : '—'}</td>
                                </tr>
                            );
                        })}
                        {preds.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', opacity: 0.5 }}>Sin predecesoras</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* ── Right: Sucesoras ── */}
            <div className="adp-rel-panel">
                <div className="adp-rel-header">
                    <span className="adp-rel-title" style={{ color: '#6ee7b7' }}>Sucesoras ({succs.length})</span>
                    <div className="adp-rel-btns">
                        <button className="adp-rel-btn" title="Asignar sucesora"
                            onClick={() => { setAcTarget('suc'); setAcFilter(''); setAcOpen(!acOpen || acTarget !== 'suc'); }}>＋ Asignar</button>
                        <button className="adp-rel-btn adp-rel-btn-del" title="Eliminar sucesora"
                            disabled={selS == null}
                            onClick={() => { if (selS != null && succs[selS]) { removeSuc(succs[selS].sucId, succs[selS].predIdx); setSelS(null); } }}>✕ Eliminar</button>
                        <button className="adp-rel-btn" title="Ir a sucesora"
                            disabled={selS == null}
                            onClick={() => { if (selS != null && succs[selS]) goTo(succs[selS].sucId); }}>→ Ir a</button>
                    </div>
                </div>
                {/* Autocomplete for suc */}
                {acOpen && acTarget === 'suc' && (
                    <div className="adp-rel-ac" ref={acRef}>
                        <input className="adp-input" autoFocus placeholder="Buscar actividad (ID o nombre)..."
                            value={acFilter} onChange={(e: any) => setAcFilter(e.target.value)} />
                        <div className="adp-ac-list" style={{ position: 'relative' }}>
                            {acItems().length === 0 && <div className="adp-ac-empty">Sin coincidencias</div>}
                            {(acItems() as Activity[]).slice(0, 15).map((x: Activity) => (
                                <div key={x.id} className="adp-ac-item" onMouseDown={(e: any) => { e.preventDefault(); addSuc(x.id); }}>
                                    <span className="adp-ac-id">{x.id}</span>
                                    <span className="adp-ac-nm">{x.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <table className="adp-tbl">
                    <thead><tr><th>ID</th><th>Nombre de Tarea</th><th>Tipo</th><th>Retardo</th><th>Comienzo</th><th>Fin</th></tr></thead>
                    <tbody>
                        {succs.map((s: any, i: number) => {
                            const sa = activities.find((x: any) => x.id === s.sucId);
                            return (
                                <tr key={i} className={selS === i ? 'adp-rel-sel' : ''} onClick={() => setSelS(i)}>
                                    <td>{s.sucId}</td>
                                    <td>{s.sucName}</td>
                                    <td>
                                        <select className="adp-inline-sel" value={s.type}
                                            onChange={(e: any) => {
                                                const sucIdx = activities.findIndex((x: any) => x.id === s.sucId);
                                                if (sucIdx >= 0) { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: sucIdx, predIdx: s.predIdx, updates: { type: e.target.value } }); }
                                            }}>
                                            <option value="FS">FC</option><option value="SS">CC</option><option value="FF">FF</option><option value="SF">CF</option>
                                        </select>
                                    </td>
                                    <td>
                                        <input className="adp-inline-input" type="number" value={s.lag} style={{ width: 40 }}
                                            onChange={(e: any) => {
                                                const sucIdx = activities.findIndex((x: any) => x.id === s.sucId);
                                                if (sucIdx >= 0) { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'UPDATE_PRED', actIdx: sucIdx, predIdx: s.predIdx, updates: { lag: parseInt(e.target.value) || 0 } }); }
                                            }} />
                                    </td>
                                    <td>{sa?.ES ? fmtDate(sa.ES) : '—'}</td>
                                    <td>{sa?.EF ? fmtDate(addDays(sa.EF, -1)) : '—'}</td>
                                </tr>
                            );
                        })}
                        {succs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', opacity: 0.5 }}>Sin sucesoras</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: Pasos (WBS Steps / Notes placeholder)
   ════════════════════════════════════════════════════════════════ */
function TabPasos({ a: _a }: { a: Activity }) {
    return (
        <div className="adp-table-tab">
            <div className="adp-section-title">Pasos de la actividad</div>
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 11 }}>
                <p>Los pasos permiten dividir una actividad en sub-tareas de seguimiento.</p>
                <p style={{ marginTop: 8, opacity: 0.6 }}>Funcionalidad pendiente de implementación.</p>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   TAB: Curva S
   ════════════════════════════════════════════════════════════════ */
function TabCurvaS({ activityId }: { activityId: string }) {
    const { state } = useGantt();
    const [mode, setMode] = useState<'all' | 'selected'>('all');

    // Left panel matches table width exactly → chart viewport aligns with the Gantt timeline
    const leftW = state.tableW;

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Left: mode selector – same width as GanttTable so chart aligns with timeline */}
            <div style={{ width: leftW, flexShrink: 0, padding: '12px 14px', borderRight: `1px solid ${state.lightMode ? '#e2e8f0' : '#334155'}`, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.6, marginBottom: 4 }}>Mostrar</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" name="adpScurveMode" checked={mode === 'all'} onChange={() => setMode('all')} />
                    Todas las actividades
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" name="adpScurveMode" checked={mode === 'selected'} onChange={() => setMode('selected')} />
                    Actividad seleccionada
                </label>
            </div>
            {/* Right: chart viewport aligns with the Gantt timeline, canvas scrolls to full width */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <SCurveChart
                    hideHeader
                    forcedActivityId={mode === 'selected' ? activityId : '__PROJECT__'}
                    exactWidth={state.totalDays * state.pxPerDay}
                />
            </div>
        </div>
    );
}
