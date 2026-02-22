// ═══════════════════════════════════════════════════════════════════
// CalendarModal – P6-style custom calendar configuration
// Independent modal matching SaveProgressModal style
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import { useResizable } from '../../hooks/useResizable';
import type { CustomCalendar } from '../../types/gantt';
import { ChevronLeft, ChevronRight, Plus, Trash2, Copy } from 'lucide-react';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function newCalendar(id?: string): CustomCalendar {
    return {
        id: id || `cal_${Date.now()}`,
        name: 'Nuevo Calendario',
        workDays: [false, true, true, true, true, true, false],
        hoursPerDay: 8,
        exceptions: [],
    };
}

/** Built-in calendars (read-only, cannot delete) */
const BUILT_IN: CustomCalendar[] = [
    { id: '__5d', name: '5 días (Lun-Vie)', workDays: [false, true, true, true, true, true, false], hoursPerDay: 8, exceptions: [] },
    { id: '__6d', name: '6 días (Lun-Sáb)', workDays: [false, true, true, true, true, true, true], hoursPerDay: 8, exceptions: [] },
    { id: '__7d', name: '7 días (Todos)', workDays: [true, true, true, true, true, true, true], hoursPerDay: 8, exceptions: [] },
];

export default function CalendarModal() {
    const { state, dispatch } = useGantt();
    const { ref: resizeRef, style: resizeStyle } = useResizable({ initW: 780, initH: 560, minW: 600, minH: 400 });

    const [selId, setSelId] = useState<string | null>(null);
    const [draft, setDraft] = useState<CustomCalendar | null>(null);
    const [viewYear, setViewYear] = useState(new Date().getFullYear());
    const [viewMonth, setViewMonth] = useState(new Date().getMonth());

    const isBuiltIn = (id: string) => id.startsWith('__');

    const selectCal = useCallback((cal: CustomCalendar) => {
        setSelId(cal.id);
        setDraft({ ...cal, workDays: [...cal.workDays] as any, exceptions: [...cal.exceptions] });
    }, []);

    const handleAdd = () => {
        const cal = newCalendar();
        dispatch({ type: 'SAVE_CALENDAR', calendar: cal });
        selectCal(cal);
    };

    const handleDuplicate = () => {
        if (!draft) return;
        const dup: CustomCalendar = { ...draft, id: `cal_${Date.now()}`, name: draft.name + ' (copia)', workDays: [...draft.workDays] as any, exceptions: [...draft.exceptions] };
        dispatch({ type: 'SAVE_CALENDAR', calendar: dup });
        selectCal(dup);
    };

    const handleDelete = () => {
        if (!selId || isBuiltIn(selId)) return;
        if (!confirm(`¿Eliminar calendario "${draft?.name}"?`)) return;
        dispatch({ type: 'DELETE_CALENDAR', id: selId });
        setSelId(null);
        setDraft(null);
    };

    const handleSave = () => {
        if (!draft || isBuiltIn(draft.id)) return;
        dispatch({ type: 'SAVE_CALENDAR', calendar: draft });
    };

    const toggleWorkDay = (idx: number) => {
        if (!draft || isBuiltIn(draft.id)) return;
        const wd = [...draft.workDays] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
        wd[idx] = !wd[idx];
        setDraft({ ...draft, workDays: wd });
    };

    const toggleException = (dateISO: string) => {
        if (!draft || isBuiltIn(draft.id)) return;
        const exs = [...draft.exceptions];
        const idx = exs.indexOf(dateISO);
        if (idx >= 0) exs.splice(idx, 1);
        else exs.push(dateISO);
        setDraft({ ...draft, exceptions: exs });
    };

    const monthDays = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1);
        const startDay = first.getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const cells: ({ day: number; date: Date; iso: string } | null)[] = [];
        for (let i = 0; i < startDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(viewYear, viewMonth, d);
            cells.push({ day: d, date: dt, iso: dt.toISOString().slice(0, 10) });
        }
        return cells;
    }, [viewYear, viewMonth]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
        else setViewMonth(viewMonth - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
        else setViewMonth(viewMonth + 1);
    };

    if (!state.calModalOpen) return null;

    const close = () => dispatch({ type: 'CLOSE_CAL_MODAL' });
    const readOnly = !draft || isBuiltIn(draft.id);
    const light = state.lightMode;
    const mutedColor = light ? '#64748b' : '#94a3b8';
    const bgPanel = light ? '#f1f5f9' : '#1e293b';
    const borderColor = light ? '#e2e8f0' : '#334155';

    return (
        <div className="modal-overlay open" onMouseDown={close}>
            <div className="modal" ref={resizeRef} onMouseDown={e => e.stopPropagation()}
                style={{ ...resizeStyle, maxHeight: '92vh', maxWidth: '95vw', display: 'flex', flexDirection: 'column', padding: 0 }}>

                {/* Header */}
                <div className="modal-header" style={{ padding: '12px 18px', borderBottom: `1px solid ${borderColor}` }}>
                    <h2 style={{ margin: 0, fontSize: 15 }}>📅 Calendarios del Proyecto</h2>
                    <button className="modal-close" onClick={close}>✕</button>
                </div>

                {/* Body = left list + right editor */}
                <div className="modal-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', padding: 0 }}>
                    {/* ─── LEFT: Calendar list ─── */}
                    <div style={{ width: 210, borderRight: `1px solid ${borderColor}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        {/* Toolbar */}
                        <div style={{ padding: '8px 10px', display: 'flex', gap: 4, borderBottom: `1px solid ${borderColor}` }}>
                            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 3 }} onClick={handleAdd}>
                                <Plus size={12} /> Nuevo
                            </button>
                            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={handleDuplicate} disabled={!draft} title="Duplicar">
                                <Copy size={12} />
                            </button>
                            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={handleDelete} disabled={!selId || isBuiltIn(selId || '')} title="Eliminar">
                                <Trash2 size={12} />
                            </button>
                        </div>

                        {/* List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: mutedColor, padding: '6px 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Predeterminados</div>
                            {BUILT_IN.map(c => (
                                <div key={c.id} onClick={() => selectCal(c)}
                                    style={{
                                        padding: '7px 14px', fontSize: 11, cursor: 'pointer',
                                        background: selId === c.id ? (light ? '#dbeafe' : '#1e3a5f') : 'transparent',
                                        color: selId === c.id ? (light ? '#1e40af' : '#93c5fd') : 'inherit',
                                        borderLeft: selId === c.id ? '3px solid #3b82f6' : '3px solid transparent',
                                        fontWeight: selId === c.id ? 600 : 400,
                                    }}>
                                    {c.name}
                                </div>
                            ))}

                            <div style={{ fontSize: 9, fontWeight: 700, color: mutedColor, padding: '10px 12px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Personalizados</div>
                            {state.customCalendars.length === 0 && (
                                <div style={{ fontSize: 10, color: mutedColor, padding: '4px 14px', fontStyle: 'italic' }}>Sin calendarios</div>
                            )}
                            {state.customCalendars.map(c => (
                                <div key={c.id} onClick={() => selectCal(c)}
                                    style={{
                                        padding: '7px 14px', fontSize: 11, cursor: 'pointer',
                                        background: selId === c.id ? (light ? '#dbeafe' : '#1e3a5f') : 'transparent',
                                        color: selId === c.id ? (light ? '#1e40af' : '#93c5fd') : 'inherit',
                                        borderLeft: selId === c.id ? '3px solid #3b82f6' : '3px solid transparent',
                                        fontWeight: selId === c.id ? 600 : 400,
                                    }}>
                                    {c.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ─── RIGHT: Editor ─── */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!draft ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: mutedColor, fontSize: 12, fontStyle: 'italic' }}>
                                Seleccione un calendario para editar
                            </div>
                        ) : (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                                {/* Name & hours */}
                                <div style={{ background: bgPanel, padding: 12, borderRadius: 6, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
                                        <label style={{ fontSize: 11, fontWeight: 600 }}>Nombre:</label>
                                        <input className="form-input" style={{ fontSize: 11, padding: '4px 8px', flex: 1 }}
                                            value={draft.name} disabled={readOnly}
                                            onChange={e => setDraft({ ...draft, name: e.target.value })} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <label style={{ fontSize: 11, fontWeight: 600 }}>Horas/día:</label>
                                        <input className="form-input" type="number" min={1} max={24} step={0.5}
                                            style={{ fontSize: 11, padding: '4px 8px', width: 60 }}
                                            value={draft.hoursPerDay} disabled={readOnly}
                                            onChange={e => setDraft({ ...draft, hoursPerDay: parseFloat(e.target.value) || 8 })} />
                                    </div>
                                    {readOnly && (
                                        <span style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic' }}>🔒 Solo lectura</span>
                                    )}
                                </div>

                                {/* Work day toggles */}
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Días hábiles de la semana:</div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {DAY_NAMES.map((name, i) => (
                                            <button key={i} onClick={() => toggleWorkDay(i)} disabled={readOnly}
                                                style={{
                                                    flex: 1, height: 34, borderRadius: 5, fontSize: 11, fontWeight: 600,
                                                    border: 'none', cursor: readOnly ? 'default' : 'pointer',
                                                    background: draft.workDays[i] ? '#22c55e' : '#ef4444',
                                                    color: '#fff', opacity: readOnly ? 0.6 : 1,
                                                    transition: 'background 0.15s, transform 0.1s',
                                                }}>
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Monthly calendar */}
                                <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 10 }}>
                                        <button className="btn btn-secondary" style={{ padding: '2px 8px' }} onClick={prevMonth}><ChevronLeft size={14} /></button>
                                        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 160, textAlign: 'center' }}>
                                            {MONTH_NAMES[viewMonth]} {viewYear}
                                        </span>
                                        <button className="btn btn-secondary" style={{ padding: '2px 8px' }} onClick={nextMonth}><ChevronRight size={14} /></button>
                                    </div>

                                    {/* Day of week headers */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
                                        {DAY_NAMES.map((n, i) => (
                                            <div key={i} style={{
                                                textAlign: 'center', fontSize: 10, fontWeight: 700, padding: '3px 0',
                                                color: draft.workDays[i] ? '#22c55e' : '#ef4444',
                                            }}>{n}</div>
                                        ))}
                                    </div>

                                    {/* Day cells */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                                        {monthDays.map((cell, idx) => {
                                            if (!cell) return <div key={`pad-${idx}`} />;
                                            const dow = cell.date.getDay();
                                            const isWorkByWeek = draft.workDays[dow];
                                            const isException = draft.exceptions.includes(cell.iso);
                                            const isWork = isException ? !isWorkByWeek : isWorkByWeek;
                                            const todayISO = new Date().toISOString().slice(0, 10);
                                            const isToday = cell.iso === todayISO;

                                            return (
                                                <div key={cell.iso}
                                                    onClick={() => { if (!readOnly) toggleException(cell.iso); }}
                                                    title={isException ? `Excepción: ${isWork ? 'hábil' : 'no hábil'}` : (isWork ? 'Día hábil' : 'No hábil')}
                                                    style={{
                                                        textAlign: 'center', padding: '5px 0', fontSize: 11, borderRadius: 4,
                                                        cursor: readOnly ? 'default' : 'pointer', position: 'relative',
                                                        fontWeight: isToday ? 800 : 400,
                                                        background: isWork ? 'rgba(34,197,94,0.13)' : 'rgba(239,68,68,0.10)',
                                                        color: isWork ? '#22c55e' : '#ef4444',
                                                        border: isException ? '2px solid #f59e0b' : isToday ? '2px solid #3b82f6' : '1px solid transparent',
                                                    }}>
                                                    {cell.day}
                                                    {isException && <span style={{ position: 'absolute', top: 0, right: 2, fontSize: 6, color: '#f59e0b' }}>●</span>}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Legend */}
                                    <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 9, color: mutedColor }}>
                                        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(34,197,94,0.25)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Hábil</span>
                                        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(239,68,68,0.18)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />No hábil</span>
                                        <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #f59e0b', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Excepción</span>
                                        {!readOnly && <span style={{ fontStyle: 'italic' }}>Clic en un día para marcar excepción</span>}
                                    </div>
                                </div>

                                {/* Exceptions summary */}
                                {draft.exceptions.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                                            Excepciones ({draft.exceptions.length}):
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 65, overflowY: 'auto' }}>
                                            {[...draft.exceptions].sort().map(ex => {
                                                const d = new Date(ex + 'T00:00:00');
                                                const dow = d.getDay();
                                                const weekIsWork = draft.workDays[dow];
                                                return (
                                                    <span key={ex} style={{
                                                        fontSize: 10, padding: '2px 7px', borderRadius: 4,
                                                        background: weekIsWork ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                                        color: weekIsWork ? '#ef4444' : '#22c55e',
                                                        border: `1px solid ${weekIsWork ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                                                    }}>
                                                        {ex}
                                                        {!readOnly && (
                                                            <span onClick={e => { e.stopPropagation(); toggleException(ex); }}
                                                                style={{ marginLeft: 4, cursor: 'pointer', fontWeight: 700 }}>×</span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="modal-footer" style={{ borderTop: `1px solid ${borderColor}`, padding: '10px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={close}>Cancelar</button>
                    {draft && !readOnly && (
                        <button className="btn btn-primary" onClick={handleSave}>Guardar Calendario</button>
                    )}
                </div>
            </div>
        </div>
    );
}
