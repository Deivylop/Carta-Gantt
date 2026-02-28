// ═══════════════════════════════════════════════════════════════════
// ProjectsPage – Portfolio management panel (EPS tree + projects)
// Inspired by Primavera P6's project portfolio management
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { usePortfolio } from '../../store/PortfolioContext';
import type { ModuleId } from '../ModuleTabs';
import type { TreeNode, ProjectMeta } from '../../types/portfolio';
import {
    FolderOpen, FolderPlus, FilePlus, Trash2, ChevronRight, ChevronDown,
    Play, Briefcase, BarChart3, Clock, TrendingUp, Building2,
    Search, Edit3, Check, GanttChart
} from 'lucide-react';

interface Props {
    onNavigate: (id: ModuleId) => void;
    onOpenProject: (projectId: string) => void;
}

// ─── Inline Edit Component ──────────────────────────────────────
function InlineEdit({ value, onSave, onCancel, style }: { value: string; onSave: (v: string) => void; onCancel: () => void; style?: React.CSSProperties }) {
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
                borderRadius: 4, padding: '2px 6px', fontSize: 12, color: 'var(--text-primary)',
                outline: 'none', width: 200, ...style,
            }}
        />
    );
}

// ─── Status Badge ───────────────────────────────────────────────
function StatusBadge({ status }: { status: ProjectMeta['status'] }) {
    const colors: Record<string, { bg: string; text: string }> = {
        'Planificación': { bg: '#6366f118', text: '#6366f1' },
        'Ejecución': { bg: '#22c55e18', text: '#22c55e' },
        'Suspendido': { bg: '#f59e0b18', text: '#f59e0b' },
        'Completado': { bg: '#0ea5e918', text: '#0ea5e9' },
    };
    const c = colors[status] || colors['Planificación'];
    return (
        <span style={{
            background: c.bg, color: c.text, fontSize: 10, fontWeight: 600,
            padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
        }}>
            {status}
        </span>
    );
}

// ─── Progress Bar ───────────────────────────────────────────────
function ProgressBar({ value, color = '#6366f1' }: { value: number; color?: string }) {
    return (
        <div style={{ width: '100%', height: 6, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s ease' }} />
        </div>
    );
}

export default function ProjectsPage({ onOpenProject }: Props) {
    const { state: pState, dispatch: pDispatch, treeNodes } = usePortfolio();

    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; kind: 'eps' | 'project' } | null>(null);

    // ── Filter tree nodes by search ──
    const filteredNodes = useMemo(() => {
        if (!searchTerm.trim()) return treeNodes;
        const lower = searchTerm.toLowerCase();
        return treeNodes.filter(n => {
            if (n.kind === 'eps') return n.data.name.toLowerCase().includes(lower);
            return n.data.name.toLowerCase().includes(lower) || n.data.code.toLowerCase().includes(lower);
        });
    }, [treeNodes, searchTerm]);

    // ── Selected item details ──
    const selectedProject = useMemo(() => {
        if (!pState.selectedId) return null;
        return pState.projects.find(p => p.id === pState.selectedId) || null;
    }, [pState.selectedId, pState.projects]);

    const selectedEps = useMemo(() => {
        if (!pState.selectedId) return null;
        return pState.epsNodes.find(e => e.id === pState.selectedId) || null;
    }, [pState.selectedId, pState.epsNodes]);

    // ── Stats ──
    const totalProjects = pState.projects.length;
    const inExecution = pState.projects.filter(p => p.status === 'Ejecución').length;
    const totalActivities = pState.projects.reduce((sum, p) => sum + p.activityCount, 0);
    const avgProgress = totalProjects > 0
        ? Math.round(pState.projects.reduce((sum, p) => sum + p.globalPct, 0) / totalProjects * 10) / 10
        : 0;

    // ── Handlers ──
    const handleAddEps = useCallback(() => {
        const parentId = selectedEps ? selectedEps.id : null;
        pDispatch({ type: 'ADD_EPS', parentId, name: 'Nueva Carpeta EPS' });
    }, [selectedEps, pDispatch]);

    const handleAddProject = useCallback(() => {
        const epsId = selectedEps ? selectedEps.id : null;
        const code = 'PRY-' + String(pState.projects.length + 1).padStart(3, '0');
        pDispatch({ type: 'ADD_PROJECT', epsId, name: 'Nuevo Proyecto', code });
    }, [selectedEps, pState.projects.length, pDispatch]);

    const handleDelete = useCallback(() => {
        if (!pState.selectedId) return;
        const isEps = pState.epsNodes.some(e => e.id === pState.selectedId);
        if (isEps) {
            if (confirm('¿Eliminar esta carpeta EPS? Los proyectos dentro se moverán a la raíz.')) {
                pDispatch({ type: 'DELETE_EPS', id: pState.selectedId });
            }
        } else {
            if (confirm('¿Eliminar este proyecto y todos sus datos?')) {
                pDispatch({ type: 'DELETE_PROJECT', id: pState.selectedId });
            }
        }
    }, [pState.selectedId, pState.epsNodes, pDispatch]);

    const handleOpenProject = useCallback((projId: string) => {
        onOpenProject(projId);
    }, [onOpenProject]);

    const handleRename = useCallback((id: string, newName: string) => {
        const isEps = pState.epsNodes.some(e => e.id === id);
        if (isEps) {
            pDispatch({ type: 'RENAME_EPS', id, name: newName });
        } else {
            pDispatch({ type: 'UPDATE_PROJECT', id, updates: { name: newName } });
        }
        setEditingId(null);
    }, [pState.epsNodes, pDispatch]);

    const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string, kind: 'eps' | 'project') => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId, kind });
    }, []);

    // Close context menu on click outside
    useEffect(() => {
        if (!contextMenu) return;
        const handler = () => setContextMenu(null);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [contextMenu]);

    // ── Render Tree Row ──
    const renderTreeRow = (node: TreeNode) => {
        const isSelected = pState.selectedId === (node.kind === 'eps' ? node.data.id : node.data.id);
        const nodeId = node.kind === 'eps' ? node.data.id : node.data.id;
        const isActive = node.kind === 'project' && pState.activeProjectId === node.data.id;

        return (
            <div
                key={nodeId}
                onClick={() => pDispatch({ type: 'SELECT', id: nodeId })}
                onDoubleClick={() => {
                    if (node.kind === 'project') {
                        handleOpenProject(node.data.id);
                    } else {
                        pDispatch({ type: 'TOGGLE_EXPAND', id: node.data.id });
                    }
                }}
                onContextMenu={e => handleContextMenu(e, nodeId, node.kind)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    paddingLeft: 12 + node.depth * 20,
                    paddingRight: 12,
                    height: 32,
                    background: isSelected ? 'var(--bg-selected)' : isActive ? 'var(--color-indigo)08' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--color-indigo)' : '3px solid transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    flexShrink: 0,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isActive ? 'var(--color-indigo)08' : 'transparent'; }}
            >
                {/* Expand/collapse arrow for EPS */}
                {node.kind === 'eps' ? (
                    <span
                        onClick={e => { e.stopPropagation(); pDispatch({ type: 'TOGGLE_EXPAND', id: node.data.id }); }}
                        style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                        {node.hasChildren ? (
                            node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                        ) : <span style={{ width: 14 }} />}
                    </span>
                ) : (
                    <span style={{ width: 16, flexShrink: 0 }} />
                )}

                {/* Icon */}
                {node.kind === 'eps' ? (
                    <FolderOpen size={15} style={{ color: node.data.color || '#f59e0b', flexShrink: 0 }} />
                ) : (
                    <Briefcase size={15} style={{ color: isActive ? '#6366f1' : '#64748b', flexShrink: 0 }} />
                )}

                {/* Name */}
                {editingId === nodeId ? (
                    <InlineEdit
                        value={node.kind === 'eps' ? node.data.name : node.data.name}
                        onSave={v => handleRename(nodeId, v)}
                        onCancel={() => setEditingId(null)}
                    />
                ) : (
                    <span style={{
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: node.kind === 'eps' ? 600 : 400,
                    }}>
                        {node.kind === 'eps' ? node.data.name : node.data.name}
                    </span>
                )}

                {/* Project code badge */}
                {node.kind === 'project' && (
                    <span style={{
                        fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-input)',
                        padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                    }}>
                        {node.data.code}
                    </span>
                )}

                {/* Status badge for projects */}
                {node.kind === 'project' && (
                    <StatusBadge status={node.data.status} />
                )}

                {/* Active indicator */}
                {isActive && (
                    <span style={{
                        fontSize: 9, color: '#fff', background: '#6366f1',
                        padding: '1px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0,
                    }}>
                        ACTIVO
                    </span>
                )}
            </div>
        );
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-app)' }}>

            {/* ── Top Header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 24px', borderBottom: '1px solid var(--border-primary)',
                background: 'var(--bg-panel)', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Building2 size={22} style={{ color: '#6366f1' }} />
                    <div>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                            Cartera de Proyectos
                        </h1>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
                            Estructura Empresarial de Proyectos (EPS)
                        </p>
                    </div>
                </div>

                {/* Quick Stats */}
                <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                    {[
                        { label: 'Proyectos', value: totalProjects, color: '#6366f1', icon: <Briefcase size={14} /> },
                        { label: 'En Ejecución', value: inExecution, color: '#22c55e', icon: <Play size={14} /> },
                        { label: 'Actividades', value: totalActivities, color: '#0ea5e9', icon: <GanttChart size={14} /> },
                        { label: 'Avance Promedio', value: `${avgProgress}%`, color: '#f59e0b', icon: <TrendingUp size={14} /> },
                    ].map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: 6, background: s.color + '18',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color,
                            }}>
                                {s.icon}
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: 14 }}>{s.value}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 24px', borderBottom: '1px solid var(--border-primary)',
                background: 'var(--bg-ribbon)', flexShrink: 0,
            }}>
                <button onClick={handleAddEps} style={btnStyle} title="Agregar Carpeta EPS">
                    <FolderPlus size={14} /> EPS
                </button>
                <button onClick={handleAddProject} style={btnStyle} title="Agregar Proyecto">
                    <FilePlus size={14} /> Proyecto
                </button>
                <div style={{ width: 1, height: 20, background: 'var(--border-primary)', margin: '0 4px' }} />
                <button
                    onClick={() => {
                        if (selectedProject) handleOpenProject(selectedProject.id);
                    }}
                    disabled={!selectedProject}
                    style={{ ...btnStyle, opacity: selectedProject ? 1 : 0.4 }}
                    title="Abrir Proyecto"
                >
                    <Play size={14} /> Abrir
                </button>
                <button
                    onClick={() => { if (pState.selectedId) setEditingId(pState.selectedId); }}
                    disabled={!pState.selectedId}
                    style={{ ...btnStyle, opacity: pState.selectedId ? 1 : 0.4 }}
                    title="Renombrar"
                >
                    <Edit3 size={14} />
                </button>
                <button
                    onClick={handleDelete}
                    disabled={!pState.selectedId}
                    style={{ ...btnStyle, opacity: pState.selectedId ? 1 : 0.4, color: '#ef4444' }}
                    title="Eliminar"
                >
                    <Trash2 size={14} />
                </button>
                <div style={{ flex: 1 }} />
                {/* Search */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
                    borderRadius: 6, padding: '4px 10px',
                }}>
                    <Search size={13} style={{ color: 'var(--text-muted)' }} />
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar proyecto..."
                        style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            fontSize: 12, color: 'var(--text-primary)', width: 160,
                        }}
                    />
                </div>
            </div>

            {/* ── Main Content: Tree + Detail Panel ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Left: EPS Tree */}
                <div style={{
                    width: 420, flexShrink: 0, borderRight: '1px solid var(--border-primary)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                    {/* Tree header */}
                    <div style={{
                        padding: '8px 12px', borderBottom: '1px solid var(--border-primary)',
                        background: 'var(--bg-panel)', fontSize: 11, fontWeight: 600,
                        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                        Estructura EPS
                    </div>

                    {/* Tree body */}
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        {filteredNodes.length === 0 ? (
                            <div style={{
                                padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
                            }}>
                                <Building2 size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                                <p style={{ margin: 0, fontWeight: 600 }}>Sin proyectos</p>
                                <p style={{ margin: '6px 0 0', fontSize: 11 }}>
                                    Use los botones superiores para crear carpetas EPS y proyectos
                                </p>
                            </div>
                        ) : (
                            filteredNodes.map((node) => renderTreeRow(node))
                        )}
                    </div>
                </div>

                {/* Right: Detail Panel */}
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)', padding: 24 }}>
                    {selectedProject ? (
                        <ProjectDetailPanel
                            project={selectedProject}
                            onUpdate={(updates) => pDispatch({ type: 'UPDATE_PROJECT', id: selectedProject.id, updates })}
                            onOpen={() => handleOpenProject(selectedProject.id)}
                            isActive={pState.activeProjectId === selectedProject.id}
                        />
                    ) : selectedEps ? (
                        <EPSDetailPanel
                            eps={selectedEps}
                            projectCount={pState.projects.filter(p => p.epsId === selectedEps.id).length}
                            onRename={(name) => pDispatch({ type: 'RENAME_EPS', id: selectedEps.id, name })}
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                            <Building2 size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Seleccione un proyecto o carpeta EPS</p>
                            <p style={{ fontSize: 12, margin: '8px 0 0', opacity: 0.6 }}>
                                Doble clic en un proyecto para abrirlo
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Context Menu ── */}
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
                        background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
                        borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,.2)', padding: 4, minWidth: 180,
                    }}
                    onClick={() => setContextMenu(null)}
                >
                    {contextMenu.kind === 'project' && (
                        <CtxItem icon={<Play size={13} />} label="Abrir Proyecto"
                            onClick={() => handleOpenProject(contextMenu.nodeId)} />
                    )}
                    <CtxItem icon={<Edit3 size={13} />} label="Renombrar"
                        onClick={() => setEditingId(contextMenu.nodeId)} />
                    <CtxItem icon={<FolderPlus size={13} />} label="Nueva Carpeta EPS"
                        onClick={() => {
                            const parentId = contextMenu.kind === 'eps' ? contextMenu.nodeId : null;
                            pDispatch({ type: 'ADD_EPS', parentId, name: 'Nueva Carpeta EPS' });
                        }} />
                    <CtxItem icon={<FilePlus size={13} />} label="Nuevo Proyecto"
                        onClick={() => {
                            const epsId = contextMenu.kind === 'eps' ? contextMenu.nodeId : null;
                            const code = 'PRY-' + String(pState.projects.length + 1).padStart(3, '0');
                            pDispatch({ type: 'ADD_PROJECT', epsId, name: 'Nuevo Proyecto', code });
                        }} />
                    <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />
                    <CtxItem icon={<Trash2 size={13} />} label="Eliminar" color="#ef4444"
                        onClick={() => {
                            const isEps = contextMenu.kind === 'eps';
                            if (isEps) pDispatch({ type: 'DELETE_EPS', id: contextMenu.nodeId });
                            else pDispatch({ type: 'DELETE_PROJECT', id: contextMenu.nodeId });
                        }} />
                </div>
            )}
        </div>
    );
}

// ─── Context Menu Item ──────────────────────────────────────────
function CtxItem({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '6px 12px', background: 'transparent', border: 'none',
                borderRadius: 4, cursor: 'pointer', fontSize: 12,
                color: color || 'var(--text-primary)', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            {icon} {label}
        </button>
    );
}

// ─── Project Detail Panel ───────────────────────────────────────
function ProjectDetailPanel({ project, onUpdate, onOpen, isActive }: {
    project: ProjectMeta;
    onUpdate: (updates: Partial<ProjectMeta>) => void;
    onOpen: () => void;
    isActive: boolean;
}) {
    const devPct = Math.round((project.globalPct - project.plannedPct) * 10) / 10;
    const devColor = devPct > 0 ? '#22c55e' : devPct < 0 ? '#ef4444' : '#f59e0b';

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Briefcase size={22} style={{ color: '#6366f1' }} />
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                            {project.name}
                        </h2>
                        <StatusBadge status={project.status} />
                        {isActive && (
                            <span style={{
                                fontSize: 10, color: '#fff', background: '#6366f1',
                                padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                            }}>
                                PROYECTO ACTIVO
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Código: <strong>{project.code}</strong> · Prioridad: <strong>{project.priority}</strong>
                    </p>
                </div>
                <button
                    onClick={onOpen}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: '#6366f1', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    <Play size={14} /> Abrir Proyecto
                </button>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'Actividades', value: project.activityCount, icon: <GanttChart size={16} />, color: '#6366f1' },
                    { label: 'Completadas', value: project.completedCount, icon: <Check size={16} />, color: '#22c55e' },
                    { label: 'Ruta Crítica', value: project.criticalCount, icon: <BarChart3 size={16} />, color: '#ef4444' },
                    { label: 'Avance Real', value: `${project.globalPct}%`, icon: <TrendingUp size={16} />, color: '#0ea5e9' },
                    { label: 'Avance Prog.', value: `${project.plannedPct}%`, icon: <Clock size={16} />, color: '#8b5cf6' },
                    { label: 'Desviación', value: `${devPct > 0 ? '+' : ''}${devPct}%`, icon: <TrendingUp size={16} />, color: devColor },
                ].map((s, i) => (
                    <div key={i} style={{
                        background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
                        borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 6, background: s.color + '18',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color,
                        }}>
                            {s.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: i === 5 ? devColor : 'var(--text-heading)' }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Progress */}
            <div style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
                borderRadius: 8, padding: 16, marginBottom: 24,
            }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8 }}>Avance Global</div>
                <ProgressBar value={project.globalPct} color="#6366f1" />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Real: {project.globalPct}%</span>
                    <span>Programado: {project.plannedPct}%</span>
                </div>
            </div>

            {/* Properties Grid */}
            <div style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
                borderRadius: 8, padding: 16,
            }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 12 }}>Propiedades del Proyecto</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <PropField label="Nombre" value={project.name}
                        onChange={v => onUpdate({ name: v })} />
                    <PropField label="Código" value={project.code}
                        onChange={v => onUpdate({ code: v })} />
                    <PropField label="Prioridad" value={String(project.priority)} type="number"
                        onChange={v => onUpdate({ priority: parseInt(v) || 1 })} />
                    <PropField label="Estado" value={project.status} type="select"
                        options={['Planificación', 'Ejecución', 'Suspendido', 'Completado']}
                        onChange={v => onUpdate({ status: v as ProjectMeta['status'] })} />
                    <PropField label="Descripción" value={project.description}
                        onChange={v => onUpdate({ description: v })} full />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 12 }}>
                    Creado: {new Date(project.createdAt).toLocaleString()} · Actualizado: {new Date(project.updatedAt).toLocaleString()}
                </div>
            </div>
        </div>
    );
}

// ─── EPS Detail Panel ───────────────────────────────────────────
function EPSDetailPanel({ eps, projectCount, onRename }: {
    eps: { id: string; name: string };
    projectCount: number;
    onRename: (name: string) => void;
}) {
    const [name, setName] = useState(eps.name);
    useEffect(() => setName(eps.name), [eps.name]);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <FolderOpen size={22} style={{ color: '#f59e0b' }} />
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                    {eps.name}
                </h2>
            </div>
            <div style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
                borderRadius: 8, padding: 16,
            }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 12 }}>Propiedades</div>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onBlur={() => { if (name !== eps.name) onRename(name); }}
                        onKeyDown={e => { if (e.key === 'Enter' && name !== eps.name) onRename(name); }}
                        style={{
                            width: '100%', padding: '6px 10px', fontSize: 12,
                            background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
                            borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
                        }}
                    />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Proyectos en esta carpeta: <strong>{projectCount}</strong>
                </div>
            </div>
        </div>
    );
}

// ─── Property Field ─────────────────────────────────────────────
function PropField({ label, value, onChange, type = 'text', options, full }: {
    label: string; value: string; onChange: (v: string) => void;
    type?: 'text' | 'number' | 'select'; options?: string[]; full?: boolean;
}) {
    return (
        <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
            {type === 'select' && options ? (
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    style={{
                        width: '100%', padding: '6px 10px', fontSize: 12,
                        background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
                        borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
                    }}
                >
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    type={type}
                    style={{
                        width: '100%', padding: '6px 10px', fontSize: 12,
                        background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
                        borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
                    }}
                />
            )}
        </div>
    );
}

// ─── Shared Button Style ────────────────────────────────────────
const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
    borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500,
    color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap',
};
