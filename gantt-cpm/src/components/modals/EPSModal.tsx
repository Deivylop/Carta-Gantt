// ═══════════════════════════════════════════════════════════════════
// EPSModal – P6-style EPS management dialog
// Tree view with EPS ID & Name columns, sidebar with
// Cerrar, Agregar, Suprimir, Cortar, Copiar, Pegar buttons
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '../../store/PortfolioContext';
import type { EPSNode } from '../../types/portfolio';
import {
    FolderOpen, FolderPlus, Trash2, Scissors, Copy,
    ClipboardPaste, ChevronRight, ChevronDown,
    ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
} from 'lucide-react';

interface Props {
    open: boolean;
    onClose: () => void;
}

// ─── Inline Edit ──────────────────────────────────────────────
function InlineEdit({ value, onSave, onCancel, style }: {
    value: string; onSave: (v: string) => void; onCancel: () => void; style?: React.CSSProperties;
}) {
    const [text, setText] = useState(value);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.select(); }, []);
    return (
        <input
            ref={ref}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
                if (e.key === 'Enter') onSave(text);
                if (e.key === 'Escape') onCancel();
            }}
            onBlur={() => onSave(text)}
            style={{
                background: 'var(--bg-input)', border: '1px solid var(--color-indigo)',
                borderRadius: 3, padding: '2px 6px', fontSize: 11, color: 'var(--text-primary)',
                outline: 'none', width: '100%', ...style,
            }}
        />
    );
}

export default function EPSModal({ open, onClose }: Props) {
    const { state, dispatch } = usePortfolio();

    const [selectedEpsId, setSelectedEpsId] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<{ id: string; field: 'epsCode' | 'name' } | null>(null);
    const [clipboard, setClipboard] = useState<{ mode: 'cut' | 'copy'; epsId: string } | null>(null);

    if (!open) return null;

    const selectedEps = state.epsNodes.find(e => e.id === selectedEpsId) || null;

    // ── Build flat EPS tree ──
    type FlatEps = { data: EPSNode; depth: number; hasChildren: boolean; expanded: boolean };
    const flatTree: FlatEps[] = [];
    const childMap = new Map<string | null, EPSNode[]>();
    state.epsNodes.forEach(e => {
        const key = e.parentId;
        if (!childMap.has(key)) childMap.set(key, []);
        childMap.get(key)!.push(e);
    });

    function walk(parentId: string | null, depth: number) {
        const children = childMap.get(parentId) || [];
        children.sort((a, b) => a.name.localeCompare(b.name));
        for (const eps of children) {
            const hasKids = childMap.has(eps.id);
            const isExpanded = state.expandedIds.has(eps.id);
            flatTree.push({ data: eps, depth, hasChildren: hasKids, expanded: isExpanded });
            if (isExpanded) walk(eps.id, depth + 1);
        }
    }
    walk(null, 0);

    // ── Handlers ──
    const handleAdd = () => {
        dispatch({ type: 'ADD_EPS', parentId: selectedEpsId, name: 'Nueva EPS' });
    };

    const handleDelete = () => {
        if (!selectedEpsId) return;
        if (!confirm('¿Eliminar esta carpeta EPS y reubicar sus proyectos?')) return;
        dispatch({ type: 'DELETE_EPS', id: selectedEpsId });
        setSelectedEpsId(null);
    };

    const handleCut = () => {
        if (selectedEpsId) setClipboard({ mode: 'cut', epsId: selectedEpsId });
    };

    const handleCopy = () => {
        if (selectedEpsId) setClipboard({ mode: 'copy', epsId: selectedEpsId });
    };

    const handlePaste = () => {
        if (!clipboard) return;
        const src = state.epsNodes.find(e => e.id === clipboard.epsId);
        if (!src) { setClipboard(null); return; }

        if (clipboard.mode === 'cut') {
            // Move EPS under selected (or root)
            dispatch({ type: 'UPDATE_EPS', id: src.id, updates: { parentId: selectedEpsId } });
        } else {
            // Copy: create a duplicate
            dispatch({
                type: 'ADD_EPS',
                parentId: selectedEpsId,
                name: src.name + ' (Copia)',
                epsCode: src.epsCode + '-C',
            });
        }
        setClipboard(null);
    };

    const handleIndent = () => {
        if (!selectedEpsId) return;
        dispatch({ type: 'INDENT', id: selectedEpsId });
    };

    const handleOutdent = () => {
        if (!selectedEpsId) return;
        dispatch({ type: 'OUTDENT', id: selectedEpsId });
    };

    const handleMoveUp = () => {
        if (!selectedEpsId) return;
        const eps = state.epsNodes.find(e => e.id === selectedEpsId);
        if (!eps) return;
        const siblings = (childMap.get(eps.parentId) || []).sort((a, b) => a.name.localeCompare(b.name));
        const idx = siblings.findIndex(e => e.id === eps.id);
        if (idx > 0) {
            const prev = siblings[idx - 1];
            dispatch({ type: 'RENAME_EPS', id: eps.id, name: prev.name });
            dispatch({ type: 'RENAME_EPS', id: prev.id, name: eps.name });
        }
    };

    const handleMoveDown = () => {
        if (!selectedEpsId) return;
        const eps = state.epsNodes.find(e => e.id === selectedEpsId);
        if (!eps) return;
        const siblings = (childMap.get(eps.parentId) || []).sort((a, b) => a.name.localeCompare(b.name));
        const idx = siblings.findIndex(e => e.id === eps.id);
        if (idx >= 0 && idx < siblings.length - 1) {
            const next = siblings[idx + 1];
            dispatch({ type: 'RENAME_EPS', id: eps.id, name: next.name });
            dispatch({ type: 'RENAME_EPS', id: next.id, name: eps.name });
        }
    };

    const handleSaveField = (id: string, field: 'epsCode' | 'name', value: string) => {
        if (field === 'name') {
            dispatch({ type: 'RENAME_EPS', id, name: value });
        } else {
            dispatch({ type: 'UPDATE_EPS', id, updates: { epsCode: value } });
        }
        setEditingField(null);
    };

    const isCut = (id: string) => clipboard?.mode === 'cut' && clipboard.epsId === id;

    // ── Side button style ──
    const sideBtnStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: '7px 14px', fontSize: 11, fontWeight: 500,
        background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
        borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
    };

    return (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal" style={{ width: 640, maxWidth: '95vw', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    🏢 Estructura Empresarial de Proyectos (EPS)
                </h2>

                <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
                    {/* ── Left: EPS Tree Table ── */}
                    <div style={{
                        flex: 1, border: '1px solid var(--border-primary)', borderRadius: 8,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', borderBottom: '2px solid var(--border-primary)',
                            background: 'var(--bg-panel)', flexShrink: 0,
                        }}>
                            <div style={{
                                width: 120, padding: '6px 10px', fontSize: 10, fontWeight: 700,
                                color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
                                borderRight: '1px solid var(--border-primary)',
                            }}>
                                EPS ID
                            </div>
                            <div style={{
                                flex: 1, padding: '6px 10px', fontSize: 10, fontWeight: 700,
                                color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
                            }}>
                                Nombre de EPS
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {flatTree.length === 0 ? (
                                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                                    No hay carpetas EPS.<br />
                                    <span style={{ fontSize: 11 }}>Use "Agregar" para crear una.</span>
                                </div>
                            ) : (
                                flatTree.map(item => {
                                    const isSel = selectedEpsId === item.data.id;
                                    return (
                                        <div
                                            key={item.data.id}
                                            onClick={() => setSelectedEpsId(item.data.id)}
                                            onDoubleClick={() => setEditingField({ id: item.data.id, field: 'name' })}
                                            style={{
                                                display: 'flex', alignItems: 'center', height: 30,
                                                background: isSel ? 'var(--bg-selected)' : 'transparent',
                                                borderBottom: '1px solid var(--border-primary)',
                                                cursor: 'pointer', fontSize: 12,
                                                color: 'var(--text-primary)',
                                                opacity: isCut(item.data.id) ? 0.5 : 1,
                                            }}
                                            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            {/* EPS ID column */}
                                            <div style={{
                                                width: 120, paddingLeft: 8 + item.depth * 16,
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                borderRight: '1px solid var(--border-primary)',
                                                height: '100%', overflow: 'hidden',
                                            }}>
                                                <span
                                                    onClick={e => { e.stopPropagation(); dispatch({ type: 'TOGGLE_EXPAND', id: item.data.id }); }}
                                                    style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                >
                                                    {item.hasChildren ? (
                                                        item.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                                                    ) : <span style={{ width: 12 }} />}
                                                </span>
                                                <FolderOpen size={13} style={{ color: item.data.color || '#f59e0b', flexShrink: 0 }} />
                                                {editingField?.id === item.data.id && editingField.field === 'epsCode' ? (
                                                    <InlineEdit
                                                        value={item.data.epsCode}
                                                        onSave={v => handleSaveField(item.data.id, 'epsCode', v)}
                                                        onCancel={() => setEditingField(null)}
                                                        style={{ width: 60 }}
                                                    />
                                                ) : (
                                                    <span
                                                        onDoubleClick={e => { e.stopPropagation(); setEditingField({ id: item.data.id, field: 'epsCode' }); }}
                                                        style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                    >
                                                        {item.data.epsCode}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Name column */}
                                            <div style={{
                                                flex: 1, padding: '0 10px',
                                                display: 'flex', alignItems: 'center',
                                                overflow: 'hidden', height: '100%',
                                            }}>
                                                {editingField?.id === item.data.id && editingField.field === 'name' ? (
                                                    <InlineEdit
                                                        value={item.data.name}
                                                        onSave={v => handleSaveField(item.data.id, 'name', v)}
                                                        onCancel={() => setEditingField(null)}
                                                    />
                                                ) : (
                                                    <span style={{
                                                        fontWeight: 600, overflow: 'hidden',
                                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>
                                                        {item.data.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* ── Right: Sidebar Buttons ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 120, flexShrink: 0 }}>
                        <button onClick={onClose} style={{ ...sideBtnStyle, fontWeight: 700 }}>
                            Cerrar
                        </button>
                        <div style={{ height: 8 }} />
                        <button onClick={handleAdd} style={sideBtnStyle}>
                            <FolderPlus size={13} /> Agregar
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={!selectedEpsId}
                            style={{ ...sideBtnStyle, opacity: selectedEpsId ? 1 : 0.4, color: '#ef4444' }}
                        >
                            <Trash2 size={13} /> Suprimir
                        </button>
                        <div style={{ height: 8 }} />
                        <button
                            onClick={handleCut}
                            disabled={!selectedEpsId}
                            style={{ ...sideBtnStyle, opacity: selectedEpsId ? 1 : 0.4 }}
                        >
                            <Scissors size={13} /> Cortar
                        </button>
                        <button
                            onClick={handleCopy}
                            disabled={!selectedEpsId}
                            style={{ ...sideBtnStyle, opacity: selectedEpsId ? 1 : 0.4 }}
                        >
                            <Copy size={13} /> Copiar
                        </button>
                        <button
                            onClick={handlePaste}
                            disabled={!clipboard}
                            style={{ ...sideBtnStyle, opacity: clipboard ? 1 : 0.4 }}
                        >
                            <ClipboardPaste size={13} /> Pegar
                        </button>
                        <div style={{ height: 8 }} />
                        <button
                            onClick={handleIndent}
                            disabled={!selectedEpsId}
                            style={{ ...sideBtnStyle, opacity: selectedEpsId ? 1 : 0.4 }}
                        >
                            <ArrowRight size={13} /> Indentar
                        </button>
                        <button
                            onClick={handleOutdent}
                            disabled={!selectedEpsId}
                            style={{ ...sideBtnStyle, opacity: selectedEpsId ? 1 : 0.4 }}
                        >
                            <ArrowLeft size={13} /> Des-indentar
                        </button>
                        <div style={{ height: 8 }} />
                        <button
                            onClick={handleMoveUp}
                            disabled={!selectedEpsId}
                            style={{ ...sideBtnStyle, opacity: selectedEpsId ? 1 : 0.4 }}
                        >
                            <ArrowUp size={13} /> Subir
                        </button>
                        <button
                            onClick={handleMoveDown}
                            disabled={!selectedEpsId}
                            style={{ ...sideBtnStyle, opacity: selectedEpsId ? 1 : 0.4 }}
                        >
                            <ArrowDown size={13} /> Bajar
                        </button>
                    </div>
                </div>

                {/* ── Bottom Info ── */}
                <div style={{
                    marginTop: 12, padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)',
                    background: 'var(--bg-input)', borderRadius: 6,
                }}>
                    {state.epsNodes.length} carpeta(s) EPS • Doble-clic para editar
                    {clipboard && (
                        <span style={{ marginLeft: 12, color: '#6366f1' }}>
                            📋 {clipboard.mode === 'cut' ? 'Cortado' : 'Copiado'}: {state.epsNodes.find(e => e.id === clipboard.epsId)?.name || '?'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
