import { useState, useEffect, useRef, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import type { ColumnDef } from '../types/gantt';
import { useResizable } from '../hooks/useResizable';

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
        keys: ['startDate', 'endDate', 'actualStart', 'remStartDate', 'remEndDate', 'constraint', 'constraintDate'],
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

/* ── Saved views persistence ── */
const VIEWS_STORAGE_KEY = 'gantt-cpm-column-views';

interface SavedView {
    name: string;
    columns: string[];   // ordered keys
    savedAt: string;     // ISO date
}

function loadViews(): SavedView[] {
    try {
        const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveViews(views: SavedView[]) {
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(views));
}

interface Props {
    onClose: () => void;
}

export default function ColumnPickerModal({ onClose }: Props) {
    const { state, dispatch } = useGantt();
    const { ref: resizeRef, style: resizeStyle } = useResizable({ initW: 680, minW: 450, minH: 350 });

    /* ── Tab state ── */
    const [activeTab, setActiveTab] = useState<'columns' | 'views'>('columns');

    /* Local state: selected keys (visible columns, ordered) and available grouped */
    const [selected, setSelected] = useState<string[]>(() =>
        state.columns.filter(c => c.visible && !INTERNAL_KEYS.has(c.key)).map(c => c.key)
    );
    const [selHighlight, setSelHighlight] = useState<string | null>(null);

    /* Expanded groups in left panel */
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(COLUMN_GROUPS.map(g => g.group)));

    /* Selected item in left panel */
    const [availHighlight, setAvailHighlight] = useState<string | null>(null);

    /* ── Views state ── */
    const [views, setViews] = useState<SavedView[]>(loadViews);
    const [newViewName, setNewViewName] = useState('');

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

    /* ── Views actions ── */
    const handleSaveView = () => {
        const name = newViewName.trim();
        if (!name) { alert('Ingrese un nombre para la vista.'); return; }
        const existing = views.find(v => v.name === name);
        if (existing) {
            if (!confirm(`Ya existe una vista "${name}". ¿Desea sobrescribirla?`)) return;
        }
        const newView: SavedView = {
            name,
            columns: [...selected],
            savedAt: new Date().toISOString(),
        };
        const updated = existing
            ? views.map(v => v.name === name ? newView : v)
            : [...views, newView];
        setViews(updated);
        saveViews(updated);
        setNewViewName('');
    };

    const handleLoadView = (view: SavedView) => {
        // Only load keys that actually exist in colMap
        const validKeys = view.columns.filter(k => colMap.current.has(k));
        setSelected(validKeys);
        setActiveTab('columns');
    };

    const handleDeleteView = (name: string) => {
        if (!confirm(`¿Eliminar la vista "${name}"?`)) return;
        const updated = views.filter(v => v.name !== name);
        setViews(updated);
        saveViews(updated);
    };

    /* Escape to close */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const avail = availableKeys();

    /* ── Tab styles ── */
    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '7px 18px', fontSize: 11, fontWeight: active ? 700 : 400,
        color: active ? '#a5b4fc' : '#94a3b8', background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
        cursor: 'pointer', marginBottom: -1,
    });

    return (
        <div className="col-picker-overlay" onClick={onClose}>
            <div className="col-picker-modal" ref={resizeRef} onClick={e => e.stopPropagation()} style={{ ...resizeStyle, maxWidth: '95vw', maxHeight: '92vh' }}>
                {/* Title bar */}
                <div className="col-picker-title">
                    <span>Columnas</span>
                    <button className="col-picker-close" onClick={onClose}>✕</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-primary, #1f2937)', background: 'var(--bg-ribbon, #0f172a)', padding: '0 16px' }}>
                    <button style={tabStyle(activeTab === 'columns')} onClick={() => setActiveTab('columns')}>
                        Columnas
                    </button>
                    <button style={tabStyle(activeTab === 'views')} onClick={() => setActiveTab('views')}>
                        📋 Vistas ({views.length})
                    </button>
                </div>

                {/* ═══ COLUMNS TAB ═══ */}
                {activeTab === 'columns' && (
                    <>
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
                    </>
                )}

                {/* ═══ VIEWS TAB ═══ */}
                {activeTab === 'views' && (
                    <>
                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Save new view */}
                            <div style={{ background: 'var(--bg-panel, #0c1220)', border: '1px solid var(--border-primary, #1f2937)', borderRadius: 6, padding: 12 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading, #f1f5f9)', marginBottom: 8 }}>
                                    💾 Guardar configuración actual como vista
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        value={newViewName}
                                        onChange={e => setNewViewName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); }}
                                        placeholder="Nombre de la vista..."
                                        style={{
                                            flex: 1, padding: '5px 10px', fontSize: 11, borderRadius: 4,
                                            border: '1px solid var(--border-secondary, #374151)',
                                            background: 'var(--bg-input, #1f2937)',
                                            color: 'var(--text-primary, #e5e7eb)',
                                            outline: 'none',
                                        }}
                                    />
                                    <button className="col-picker-btn primary" onClick={handleSaveView} style={{ padding: '5px 12px' }}>
                                        Guardar
                                    </button>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted, #6b7280)', marginTop: 6 }}>
                                    Se guardarán las {selected.length} columnas seleccionadas actualmente en la pestaña "Columnas".
                                </div>
                            </div>

                            {/* Saved views list */}
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading, #f1f5f9)' }}>
                                Vistas guardadas ({views.length})
                            </div>

                            {views.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted, #6b7280)', fontSize: 11, fontStyle: 'italic' }}>
                                    No hay vistas guardadas.<br />
                                    Configure sus columnas y guárdelas como una vista para acceder rápidamente.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {views.map(v => {
                                        const date = new Date(v.savedAt);
                                        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        const colLabels = v.columns.slice(0, 6).map(k => getLabel(k)).join(', ');
                                        const extra = v.columns.length > 6 ? ` +${v.columns.length - 6} más` : '';
                                        return (
                                            <div key={v.name} style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '10px 12px', borderRadius: 6,
                                                background: 'var(--bg-panel, #0c1220)',
                                                border: '1px solid var(--border-primary, #1f2937)',
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading, #f1f5f9)', marginBottom: 2 }}>
                                                        {v.name}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b7280)' }}>
                                                        {v.columns.length} columnas · {dateStr}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-secondary, #9ca3af)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {colLabels}{extra}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                    <button
                                                        className="col-picker-btn primary"
                                                        onClick={() => handleLoadView(v)}
                                                        style={{ padding: '4px 10px', fontSize: 10 }}
                                                    >
                                                        Cargar
                                                    </button>
                                                    <button
                                                        className="col-picker-btn"
                                                        onClick={() => handleDeleteView(v.name)}
                                                        style={{ padding: '4px 10px', fontSize: 10, color: '#f87171', borderColor: '#f87171' }}
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="col-picker-footer">
                            <button className="col-picker-btn primary" onClick={handleAccept}>✔ Aceptar</button>
                            <button className="col-picker-btn" onClick={onClose}>✖ Cancelar</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
