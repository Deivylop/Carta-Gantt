import { useState, useEffect, useRef, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import type { ColumnDef } from '../types/gantt';

/* ── Column groupings (P6-style categories) ── */
const COLUMN_GROUPS: { group: string; keys: string[] }[] = [
    {
        group: 'General',
        keys: ['outlineNum', 'id', 'name', 'type', 'lv', 'notes'],
    },
    {
        group: 'Duraciones',
        keys: ['dur', 'remDur'],
    },
    {
        group: 'Fechas',
        keys: ['startDate', 'endDate', 'constraint', 'constraintDate'],
    },
    {
        group: 'Relaciones',
        keys: ['predStr'],
    },
    {
        group: 'Avance',
        keys: ['pct', 'plannedPct'],
    },
    {
        group: 'Recursos',
        keys: ['res', 'cal'],
    },
    {
        group: 'Trabajo / EVM',
        keys: ['work', 'earnedValue', 'remainingWork', 'weight'],
    },
    {
        group: 'Línea Base',
        keys: ['blDur', 'blStart', 'blEnd'],
    },
    {
        group: 'Holguras',
        keys: ['TF'],
    },
    {
        group: 'Personalizado',
        keys: ['txt1', 'txt2', 'txt3', 'txt4', 'txt5'],
    },
];

/* Hidden internal columns that never show in picker */
const INTERNAL_KEYS = new Set(['_num', '_info', '_mode']);

interface Props {
    onClose: () => void;
}

export default function ColumnPickerModal({ onClose }: Props) {
    const { state, dispatch } = useGantt();
    const modalRef = useRef<HTMLDivElement>(null);

    /* Local state: selected keys (visible columns, ordered) and available grouped */
    const [selected, setSelected] = useState<string[]>(() =>
        state.columns.filter(c => c.visible && !INTERNAL_KEYS.has(c.key)).map(c => c.key)
    );
    const [selHighlight, setSelHighlight] = useState<string | null>(null);

    /* Expanded groups in left panel */
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(COLUMN_GROUPS.map(g => g.group)));

    /* Selected item in left panel */
    const [availHighlight, setAvailHighlight] = useState<string | null>(null);

    /* Column lookup – initialise synchronously so first render has labels */
    const colMap = useRef<Map<string, ColumnDef>>(new Map(state.columns.map(c => [c.key, c])));
    useEffect(() => {
        colMap.current = new Map(state.columns.map(c => [c.key, c]));
    }, [state.columns]);

    const getLabel = useCallback((key: string) => {
        return colMap.current.get(key)?.label || key;
    }, []);

    /* Available columns = all non-internal, non-selected */
    const availableKeys = useCallback(() => {
        const selSet = new Set(selected);
        return COLUMN_GROUPS.map(g => ({
            ...g,
            keys: g.keys.filter(k => !selSet.has(k) && colMap.current.has(k)),
        })).filter(g => g.keys.length > 0);
    }, [selected]);

    const toggleGroup = (group: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
        });
    };

    /* ── Arrow actions ── */
    const moveRight = () => {
        if (!availHighlight) return;
        if (!selected.includes(availHighlight)) {
            setSelected(prev => [...prev, availHighlight]);
        }
        setAvailHighlight(null);
    };

    const moveAllRight = () => {
        const avail = availableKeys();
        const allKeys = avail.flatMap(g => g.keys);
        setSelected(prev => [...prev, ...allKeys.filter(k => !prev.includes(k))]);
        setAvailHighlight(null);
    };

    const moveLeft = () => {
        if (!selHighlight) return;
        setSelected(prev => prev.filter(k => k !== selHighlight));
        setSelHighlight(null);
    };

    const moveAllLeft = () => {
        setSelected([]);
        setSelHighlight(null);
    };

    /* ── Up/Down ── */
    const moveUp = () => {
        if (!selHighlight) return;
        setSelected(prev => {
            const idx = prev.indexOf(selHighlight);
            if (idx <= 0) return prev;
            const next = [...prev];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            return next;
        });
    };

    const moveDown = () => {
        if (!selHighlight) return;
        setSelected(prev => {
            const idx = prev.indexOf(selHighlight);
            if (idx < 0 || idx >= prev.length - 1) return prev;
            const next = [...prev];
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            return next;
        });
    };

    /* ── Apply ── */
    const applyChanges = useCallback(() => {
        const selSet = new Set(selected);

        // Build new columns array: internals first (keep order), then selected, then remaining hidden
        const internals = state.columns.filter(c => INTERNAL_KEYS.has(c.key));
        const selectedCols = selected.map(k => {
            const orig = colMap.current.get(k)!;
            return { ...orig, visible: true };
        });
        const hiddenCols = state.columns
            .filter(c => !INTERNAL_KEYS.has(c.key) && !selSet.has(c.key))
            .map(c => ({ ...c, visible: false }));

        const newCols = [...internals, ...selectedCols, ...hiddenCols];
        const newWidths = newCols.map(c => {
            const origIdx = state.columns.findIndex(oc => oc.key === c.key);
            return origIdx >= 0 ? state.colWidths[origIdx] : c.w;
        });

        dispatch({ type: 'SET_COLUMNS_ORDER', columns: newCols, colWidths: newWidths });
    }, [selected, state.columns, state.colWidths, dispatch]);

    const handleAccept = () => { applyChanges(); onClose(); };

    /* ── Default (reset) ── */
    const handleDefault = () => {
        const defaultVisible = ['outlineNum', 'id', 'name', 'dur', 'remDur', 'startDate', 'endDate', 'predStr', 'pct', 'plannedPct', 'res', 'work', 'earnedValue', 'remainingWork', 'weight', 'cal', 'TF'];
        setSelected(defaultVisible);
    };

    /* Escape to close */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const avail = availableKeys();

    return (
        <div className="col-picker-overlay" onClick={onClose}>
            <div className="col-picker-modal" ref={modalRef} onClick={e => e.stopPropagation()}>
                {/* Title bar */}
                <div className="col-picker-title">
                    <span>Columnas</span>
                    <button className="col-picker-close" onClick={onClose}>✕</button>
                </div>

                {/* Content area */}
                <div className="col-picker-body">
                    {/* Left panel: available options */}
                    <div className="col-picker-panel">
                        <div className="col-picker-panel-title">Opciones disponibles</div>
                        <div className="col-picker-list">
                            {avail.map(g => (
                                <div key={g.group}>
                                    <div className="col-picker-group"
                                        onClick={() => toggleGroup(g.group)}>
                                        <span className="col-picker-tree-icon">
                                            {expanded.has(g.group) ? '▾' : '▸'}
                                        </span>
                                        <span className="col-picker-group-label">{g.group}</span>
                                    </div>
                                    {expanded.has(g.group) && g.keys.map(k => (
                                        <div key={k}
                                            className={`col-picker-item${availHighlight === k ? ' highlighted' : ''}`}
                                            onClick={() => setAvailHighlight(k)}
                                            onDoubleClick={() => {
                                                if (!selected.includes(k)) setSelected(prev => [...prev, k]);
                                            }}>
                                            {getLabel(k)}
                                        </div>
                                    ))}
                                </div>
                            ))}
                            {avail.length === 0 && (
                                <div className="col-picker-empty">Todas las columnas están seleccionadas</div>
                            )}
                        </div>
                    </div>

                    {/* Center arrows */}
                    <div className="col-picker-arrows">
                        <button onClick={moveRight} disabled={!availHighlight} title="Agregar">▶</button>
                        <button onClick={moveAllRight} title="Agregar todo">▶▶</button>
                        <button onClick={moveLeft} disabled={!selHighlight} title="Quitar">◀</button>
                        <button onClick={moveAllLeft} title="Quitar todo">◀◀</button>
                    </div>

                    {/* Right panel: selected options */}
                    <div className="col-picker-panel">
                        <div className="col-picker-panel-title">Opciones seleccionadas</div>
                        <div className="col-picker-list">
                            {selected.map(k => (
                                <div key={k}
                                    className={`col-picker-item${selHighlight === k ? ' highlighted' : ''}`}
                                    onClick={() => setSelHighlight(k)}
                                    onDoubleClick={() => {
                                        setSelected(prev => prev.filter(x => x !== k));
                                    }}>
                                    {getLabel(k)}
                                </div>
                            ))}
                            {selected.length === 0 && (
                                <div className="col-picker-empty">Sin columnas seleccionadas</div>
                            )}
                        </div>
                    </div>

                    {/* Right-side buttons: up/down + action buttons */}
                    <div className="col-picker-side-btns">
                        <button onClick={moveUp} disabled={!selHighlight} title="Subir">▲</button>
                        <button onClick={moveDown} disabled={!selHighlight} title="Bajar">▼</button>
                    </div>
                </div>

                {/* Footer buttons */}
                <div className="col-picker-footer">
                    <button className="col-picker-btn primary" onClick={handleAccept}>✔ Aceptar</button>
                    <button className="col-picker-btn" onClick={onClose}>✖ Cancelar</button>
                    <div style={{ flex: 1 }} />
                    <button className="col-picker-btn" onClick={handleDefault}>Por defecto</button>
                </div>
            </div>
        </div>
    );
}
