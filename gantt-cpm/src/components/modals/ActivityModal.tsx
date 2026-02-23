// ═══════════════════════════════════════════════════════════════════
// Activity Detail Modal – matches HTML #act-modal-overlay exactly
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { isoDate, fmtDate, addDays } from '../../utils/cpm';

export default function ActivityModal() {
    const { state, dispatch } = useGantt();
    const a = state.selIdx >= 0 ? state.activities[state.selIdx] : null;
    const [form, setForm] = useState<any>({});

    useEffect(() => {
        if (a && state.actModalOpen) {
            setForm({
                id: a.id, lv: a.lv, name: a.name || '', type: a.type || 'task',
                dur: a.dur || 0, remDur: a.remDur != null ? a.remDur : Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100),
                cal: a.cal || state.defCal, pct: a.pct || 0,
                res: a.res || '', work: a.work || 0,
                weight: (a.weight != null && a.weight > 0) ? a.weight : '',
                constraint: a.constraint || '', constraintDate: a.constraintDate || '',
                notes: a.notes || '',
            });
        }
    }, [a, state.actModalOpen]);

    if (!state.actModalOpen || !a) return null;

    const badge = a._isProjRow
        ? { text: 'PROYECTO', bg: '#312e81', color: '#c4b5fd' }
        : a.type === 'milestone'
            ? { text: 'HITO', bg: '#78350f', color: '#fde68a' }
            : a.type === 'summary'
                ? { text: 'RESUMEN', bg: '#312e81', color: '#c4b5fd' }
                : { text: 'TAREA', bg: '#1e3a5f', color: '#93c5fd' };

    const save = () => {
        if (!a || a._isProjRow) { dispatch({ type: 'CLOSE_ACT_MODAL' }); return; }
        dispatch({ type: 'PUSH_UNDO' });
        const updates: any = {
            lv: parseInt(form.lv), name: form.name.trim(), type: form.type,
            dur: form.type === 'milestone' ? 0 : Math.max(0, parseInt(form.dur) || 0),
            remDur: Math.max(0, parseInt(form.remDur) || 0),
            cal: isNaN(parseInt(form.cal)) ? form.cal : (parseInt(form.cal) || state.defCal),
            pct: Math.min(100, Math.max(0, parseInt(form.pct) || 0)),
            res: form.res.trim(), work: Math.max(0, parseFloat(form.work) || 0),
            weight: parseFloat(form.weight) > 0 ? parseFloat(form.weight) : null,
            constraint: form.constraint, constraintDate: form.constraintDate,
            notes: form.notes.trim(),
        };
        dispatch({ type: 'UPDATE_ACTIVITY', index: state.selIdx, updates });
        dispatch({ type: 'CLOSE_ACT_MODAL' });
    };

    const del = () => {
        if (a._isProjRow) { alert('No se puede eliminar la fila resumen del proyecto.'); return; }
        if (!confirm('¿Eliminar actividad ' + a.id + '?')) return;
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'DELETE_ACTIVITY', index: state.selIdx });
        dispatch({ type: 'CLOSE_ACT_MODAL' });
    };

    const close = () => dispatch({ type: 'CLOSE_ACT_MODAL' });
    const F = (key: string, val: any) => setForm((f: any) => ({ ...f, [key]: val }));

    return (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="modal">
                <h2>Información de Actividad <span className="act-type-badge" style={{ background: badge.bg, color: badge.color }}>{badge.text}</span></h2>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">Activity ID</label><input className="form-input" value={form.id || ''} readOnly style={{ opacity: 0.7 }} /></div>
                    <div className="form-group"><label className="form-label">WBS / Nivel</label>
                        <select className="form-input" value={form.lv} onChange={e => F('lv', e.target.value)}>
                            {[0, 1, 2, 3, 4, 5].map(v => <option key={v} value={v}>Nivel {v}{v === 0 ? ' (Raíz)' : ''}</option>)}
                        </select>
                    </div>
                </div>
                <div className="form-group"><label className="form-label">Nombre de la Actividad</label><input className="form-input" value={form.name} onChange={e => F('name', e.target.value)} /></div>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">Tipo de tarea</label>
                        <select className="form-input" value={form.type} onChange={e => F('type', e.target.value)}>
                            <option value="task">Tarea</option><option value="milestone">Hito (0 días)</option><option value="summary">Resumen</option>
                        </select>
                    </div>
                    <div className="form-group"><label className="form-label">Duración (días háb.)</label><input className="form-input" type="number" min={0} value={form.dur} onChange={e => F('dur', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Dur. Restante</label><input className="form-input" type="number" min={0} value={form.remDur} onChange={e => F('remDur', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Calendario</label>
                        <select className="form-input" value={form.cal} onChange={e => F('cal', e.target.value)}>
                            <option value={5}>5d (Lun-Vie)</option><option value={6}>6d (Lun-Sáb)</option><option value={7}>7d (continuo)</option>
                            {state.customCalendars.map(cc => (
                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">% Avance</label><input className="form-input" type="number" min={0} max={100} value={form.pct} onChange={e => F('pct', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Recursos</label><input className="form-input" value={form.res} onChange={e => F('res', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Trabajo (hrs)</label><input className="form-input" type="number" min={0} step={0.5} value={form.work} onChange={e => F('work', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Peso Ponderado</label><input className="form-input" type="number" min={0} step={0.1} placeholder="Auto (=Trabajo)" value={form.weight} onChange={e => F('weight', e.target.value)} />
                        <span style={{ fontSize: '9px', color: '#6b7280', display: 'block', marginTop: 2 }}>Vacío = auto (usa Trabajo). Se muestra como % de hermanos.</span>
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">Restricción</label>
                        <select className="form-input" value={form.constraint} onChange={e => F('constraint', e.target.value)}>
                            <option value="">Sin restricción</option>
                            <option value="SNET">No iniciar antes de (SNET)</option>
                            <option value="SNLT">No iniciar después de (SNLT)</option>
                            <option value="MSO">Debe iniciar el (MSO)</option>
                            <option value="MFO">Debe finalizar el (MFO)</option>
                            <option value="FNET">No finalizar antes de (FNET)</option>
                            <option value="FNLT">No finalizar después de (FNLT)</option>
                        </select>
                    </div>
                    <div className="form-group"><label className="form-label">Fecha restricción</label><input className="form-input" type="date" value={form.constraintDate} onChange={e => F('constraintDate', e.target.value)} /></div>
                </div>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">Inicio temprano (ES)</label><input className="form-input" readOnly style={{ opacity: 0.6 }} value={a.ES ? fmtDate(a.ES) + ' (' + isoDate(a.ES) + ')' : ''} /></div>
                    <div className="form-group"><label className="form-label">Fin temprano (EF)</label><input className="form-input" readOnly style={{ opacity: 0.6 }} value={a.EF ? fmtDate(addDays(a.EF, -1)) + ' (' + isoDate(addDays(a.EF, -1)) + ')' : ''} /></div>
                    <div className="form-group"><label className="form-label">Holgura Total (TF)</label><input className="form-input" readOnly style={{ opacity: 0.6 }} value={a.crit ? '0 — RUTA CRÍTICA' : (a.TF != null ? a.TF + ' días' : '')} /></div>
                </div>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">Inicio Real</label><input className="form-input" readOnly style={{ opacity: 0.6, color: a.actualStart ? '#34d399' : undefined }} value={a.actualStart ? fmtDate(new Date(a.actualStart)) + ' (' + a.actualStart + ')' : '—'} /></div>
                    <div className="form-group"><label className="form-label">Fin Real</label><input className="form-input" readOnly style={{ opacity: 0.6, color: a.actualFinish ? '#34d399' : undefined }} value={a.actualFinish ? fmtDate(new Date(a.actualFinish)) + ' (' + a.actualFinish + ')' : '—'} /></div>
                </div>
                <hr style={{ borderColor: '#1f2937', margin: '10px 0' }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' }}>
                    Líneas Base (Activa: LB {state.activeBaselineIdx})
                </div>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">Dur. LB activa</label><input className="form-input" readOnly style={{ opacity: 0.6 }} value={a.blDur != null ? a.blDur + ' días' : '—'} /></div>
                    <div className="form-group"><label className="form-label">Inicio LB activa</label><input className="form-input" readOnly style={{ opacity: 0.6 }} value={a.blES ? fmtDate(a.blES) + ' (' + isoDate(a.blES) + ')' : '—'} /></div>
                    <div className="form-group"><label className="form-label">Fin LB activa</label><input className="form-input" readOnly style={{ opacity: 0.6 }} value={a.blEF ? fmtDate(addDays(a.blEF, -1)) + ' (' + isoDate(addDays(a.blEF, -1)) + ')' : '—'} /></div>
                </div>
                {/* All baselines table */}
                {a.baselines && a.baselines.some((b: any) => b) && (
                    <div style={{ marginTop: 6, maxHeight: 150, overflowY: 'auto', border: '1px solid #1f2937', borderRadius: 4 }}>
                        <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'rgba(30,41,59,.5)' }}>
                                    <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>#</th>
                                    <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Nombre</th>
                                    <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Duración</th>
                                    <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Inicio</th>
                                    <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Fin</th>
                                    <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Guardada</th>
                                    <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Descripción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {a.baselines.map((bl: any, idx: number) => {
                                    if (!bl) return null;
                                    const isActive = idx === state.activeBaselineIdx;
                                    return (
                                        <tr key={idx} style={{
                                            background: isActive ? 'rgba(37,99,235,.15)' : 'transparent',
                                            borderBottom: '1px solid #1f2937',
                                        }}>
                                            <td style={{ padding: '3px 6px', fontWeight: isActive ? 700 : 400, color: isActive ? '#60a5fa' : '#cbd5e1' }}>
                                                LB {idx}{isActive ? ' ◄' : ''}
                                            </td>
                                            <td style={{ padding: '3px 6px', color: '#e2e8f0', fontWeight: 500 }}>{bl.name || `Línea Base ${idx}`}</td>
                                            <td style={{ padding: '3px 6px', color: '#cbd5e1' }}>{bl.dur} días</td>
                                            <td style={{ padding: '3px 6px', color: '#cbd5e1' }}>{bl.ES ? fmtDate(bl.ES) : '—'}</td>
                                            <td style={{ padding: '3px 6px', color: '#cbd5e1' }}>{bl.EF ? fmtDate(addDays(bl.EF, -1)) : '—'}</td>
                                            <td style={{ padding: '3px 6px', color: '#6b7280', fontSize: 9 }}>{bl.savedAt ? new Date(bl.savedAt).toLocaleDateString('es-CL') : ''}</td>
                                            <td style={{ padding: '3px 6px', color: '#94a3b8', fontSize: 9, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={bl.description || ''}>
                                                {bl.description || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="form-group"><label className="form-label">Notas / Supuestos</label><textarea className="form-input" rows={2} value={form.notes} onChange={e => F('notes', e.target.value)} /></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 14 }}>
                    <button className="btn btn-danger" style={{ fontSize: 10 }} onClick={del}>🗑️ Eliminar</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost" onClick={close}>Cancelar</button>
                        <button className="btn btn-primary" onClick={save}>Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
