// ═══════════════════════════════════════════════════════════════════
// CalendarModal – P6-style custom calendar configuration
// Left panel: calendar list  |  Right panel: monthly view editor
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useMemo, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import { useResizable } from '../../hooks/useResizable';
import type { CustomCalendar } from '../../types/gantt';
import { ChevronLeft, ChevronRight, Plus, Trash2, Copy, X } from 'lucide-react';

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
    const resizeRef = useResizable({ initW: 780, initH: 540, minW: 640, minH: 400 });

    // Currently selected calendar ID for editing
    const [selId, setSelId] = useState<string | null>(null);
    // Draft state of the calendar being edited
    const [draft, setDraft] = useState<CustomCalendar | null>(null);
    // Month navigation
    const [viewYear, setViewYear] = useState(new Date().getFullYear());
    const [viewMonth, setViewMonth] = useState(new Date().getMonth());

    const allCals = useMemo(() => [...BUILT_IN, ...state.customCalendars], [state.customCalendars]);

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
        const dup = { ...draft, id: `cal_${Date.now()}`, name: draft.name + ' (copia)', workDays: [...draft.workDays] as any, exceptions: [...draft.exceptions] };
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

    // Toggle work day for a specific day of week
    const toggleWorkDay = (idx: number) => {
        if (!draft || isBuiltIn(draft.id)) return;
        const wd = [...draft.workDays] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
        wd[idx] = !wd[idx];
        const updated = { ...draft, workDays: wd };
        setDraft(updated);
    };

    // Toggle exception for a specific date
    const toggleException = (dateISO: string) => {
        if (!draft || isBuiltIn(draft.id)) return;
        const exs = [...draft.exceptions];
        const idx = exs.indexOf(dateISO);
        if (idx >= 0) exs.splice(idx, 1);
        else exs.push(dateISO);
        const updated = { ...draft, exceptions: exs };
        setDraft(updated);
    };

    // ─── Calendar grid for current month ───
    const monthDays = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1);
        const startDay = first.getDay(); // 0=Sun
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const cells: { day: number; date: Date; iso: string }[] = [];
        // Padding days
        for (let i = 0; i < startDay; i++) cells.push(null as any);
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

    const readOnly = !draft || isBuiltIn(draft.id);

    return (
        <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_CAL_MODAL' })}>
            <div
                ref={resizeRef}
                className="modal-content"
                style={{ width: 780, maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border-primary)' }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>📅 Calendarios del Proyecto</h3>
                    <button onClick={() => dispatch({ type: 'CLOSE_CAL_MODAL' })} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><X size={18} /></button>
                </div>

                {/* Body */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* LEFT – Calendar list */}
                    <div style={{ width: 220, borderRight: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '8px 10px', display: 'flex', gap: 4, borderBottom: '1px solid var(--border-primary)' }}>
                            <button className="rbtn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={handleAdd} title="Nuevo calendario">
                                <Plus size={12} /> Nuevo
                            </button>
                            <button className="rbtn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={handleDuplicate} disabled={!draft} title="Duplicar">
                                <Copy size={12} />
                            </button>
                            <button className="rbtn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={handleDelete} disabled={!selId || isBuiltIn(selId || '')} title="Eliminar">
                                <Trash2 size={12} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                            {/* Built-in label */}
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 10px', textTransform: 'uppercase' }}>Predeterminados</div>
                            {BUILT_IN.map(c => (
                                <div key={c.id}
                                    onClick={() => selectCal(c)}
                                    style={{
                                        padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                                        background: selId === c.id ? 'var(--sel-bg)' : 'transparent',
                                        color: selId === c.id ? 'var(--sel-fg)' : 'var(--text-primary)',
                                        borderLeft: selId === c.id ? '3px solid #3b82f6' : '3px solid transparent',
                                    }}>
                                    {c.name}
                                </div>
                            ))}
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', padding: '8px 10px 4px', textTransform: 'uppercase' }}>Personalizados</div>
                            {state.customCalendars.length === 0 && (
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 12px', fontStyle: 'italic' }}>Sin calendarios</div>
                            )}
                            {state.customCalendars.map(c => (
                                <div key={c.id}
                                    onClick={() => selectCal(c)}
                                    style={{
                                        padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                                        background: selId === c.id ? 'var(--sel-bg)' : 'transparent',
                                        color: selId === c.id ? 'var(--sel-fg)' : 'var(--text-primary)',
                                        borderLeft: selId === c.id ? '3px solid #3b82f6' : '3px solid transparent',
                                    }}>
                                    {c.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT – Editor */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!draft ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                                Seleccione un calendario para editar
                            </div>
                        ) : (
                            <>
                                {/* Name & hours */}
                                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-primary)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Nombre:</label>
                                        <input
                                            className="form-input"
                                            style={{ fontSize: 11, padding: '3px 6px', width: 180 }}
                                            value={draft.name}
                                            disabled={readOnly}
                                            onChange={e => setDraft({ ...draft, name: e.target.value })}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Horas/día:</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            min={1} max={24} step={0.5}
                                            style={{ fontSize: 11, padding: '3px 6px', width: 60 }}
                                            value={draft.hoursPerDay}
                                            disabled={readOnly}
                                            onChange={e => setDraft({ ...draft, hoursPerDay: parseFloat(e.target.value) || 8 })}
                                        />
                                    </div>
                                    {readOnly && (
                                        <span style={{ fontSize: 9, color: '#f59e0b', fontStyle: 'italic' }}>Solo lectura</span>
                                    )}
                                </div>

                                {/* Work day toggles */}
                                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-primary)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Días hábiles de la semana:</div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {DAY_NAMES.map((name, i) => (
                                            <button key={i}
                                                onClick={() => toggleWorkDay(i)}
                                                disabled={readOnly}
                                                style={{
                                                    width: 48, height: 32, borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                    border: '1px solid var(--border-primary)',
                                                    cursor: readOnly ? 'default' : 'pointer',
                                                    background: draft.workDays[i] ? '#22c55e' : '#ef4444',
                                                    color: '#fff',
                                                    opacity: readOnly ? 0.6 : 1,
                                                    transition: 'background 0.15s',
                                                }}>
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Monthly calendar view */}
                                <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
                                    {/* Month nav */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
                                        <button onClick={prevMonth} className="rbtn" style={{ padding: '2px 6px' }}><ChevronLeft size={14} /></button>
                                        <span style={{ fontSize: 12, fontWeight: 700, minWidth: 150, textAlign: 'center' }}>
                                            {MONTH_NAMES[viewMonth]} {viewYear}
                                        </span>
                                        <button onClick={nextMonth} className="rbtn" style={{ padding: '2px 6px' }}><ChevronRight size={14} /></button>
                                    </div>

                                    {/* Day headers */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
                                        {DAY_NAMES.map((n, i) => (
                                            <div key={i} style={{
                                                textAlign: 'center', fontSize: 9, fontWeight: 700,
                                                color: draft.workDays[i] ? '#22c55e' : '#ef4444',
                                                padding: '3px 0',
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
                                            // Effective: if exception → toggle the week rule
                                            const isWork = isException ? !isWorkByWeek : isWorkByWeek;
                                            const today = new Date();
                                            const isToday = cell.iso === today.toISOString().slice(0, 10);

                                            return (
                                                <div key={cell.iso}
                                                    onClick={() => { if (!readOnly) toggleException(cell.iso); }}
                                                    title={isException ? `Excepción: ${isWork ? 'día hábil' : 'no hábil'}` : (isWork ? 'Día hábil' : 'No hábil')}
                                                    style={{
                                                        textAlign: 'center',
                                                        padding: '6px 0',
                                                        fontSize: 11,
                                                        fontWeight: isToday ? 800 : 400,
                                                        borderRadius: 4,
                                                        cursor: readOnly ? 'default' : 'pointer',
                                                        background: isWork ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                                                        color: isWork ? '#22c55e' : '#ef4444',
                                                        border: isException ? '2px solid #f59e0b' : isToday ? '2px solid #3b82f6' : '1px solid transparent',
                                                        position: 'relative',
                                                    }}>
                                                    {cell.day}
                                                    {isException && (
                                                        <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 7, color: '#f59e0b' }}>●</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Legend */}
                                    <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 9, color: 'var(--text-muted)' }}>
                                        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(34,197,94,0.3)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Día hábil</span>
                                        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(239,68,68,0.2)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />No hábil</span>
                                        <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #f59e0b', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Excepción</span>
                                    </div>

                                    {/* Exceptions summary */}
                                    {draft.exceptions.length > 0 && (
                                        <div style={{ marginTop: 10 }}>
                                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                                Excepciones ({draft.exceptions.length}):
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 60, overflowY: 'auto' }}>
                                                {[...draft.exceptions].sort().map(ex => {
                                                    const d = new Date(ex + 'T00:00:00');
                                                    const dow = d.getDay();
                                                    const weekIsWork = draft.workDays[dow];
                                                    return (
                                                        <span key={ex} style={{
                                                            fontSize: 9, padding: '2px 6px', borderRadius: 3,
                                                            background: weekIsWork ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                                                            color: weekIsWork ? '#ef4444' : '#22c55e',
                                                            border: '1px solid',
                                                            borderColor: weekIsWork ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)',
                                                        }}>
                                                            {ex}
                                                            {!readOnly && (
                                                                <span
                                                                    onClick={e => { e.stopPropagation(); toggleException(ex); }}
                                                                    style={{ marginLeft: 4, cursor: 'pointer', fontWeight: 700 }}>×</span>
                                                            )}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                {!readOnly && (
                                    <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                        <button className="rbtn" style={{ fontSize: 11, padding: '5px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4 }}
                                            onClick={handleSave}>
                                            Guardar
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
