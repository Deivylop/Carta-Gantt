// ═══════════════════════════════════════════════════════════════════
// ProjectsPage – Portfolio management panel (EPS tree + Gantt timeline)
// Inspired by Primavera P6's project portfolio management
// Features: EPS hierarchy, cut/copy/paste/move, Supabase load,
//           project config modal, project-level Gantt timeline
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { usePortfolio } from '../../store/PortfolioContext';
import { useGantt } from '../../store/GanttContext';
import { supabase } from '../../lib/supabase';
import type { ModuleId } from '../ModuleTabs';
import type { TreeNode, ProjectMeta } from '../../types/portfolio';
import ProjectConfigModal from '../modals/ProjectConfigModal';
import {
    FolderOpen, FolderPlus, FilePlus, Trash2, ChevronRight, ChevronDown,
    Play, Briefcase, TrendingUp, Building2,
    Search, Edit3, GanttChart, Scissors, Copy, ClipboardPaste,
    ArrowRightLeft, Cloud, Settings, ChevronsRight, ChevronsLeft
} from 'lucide-react';

interface Props {
    onNavigate: (id: ModuleId) => void;
    onOpenProject: (projectId: string) => void;
}

// ─── Supabase Project List Item ─────────────────────────────────
interface SBProject {
    id: string;
    projname: string;
    projstart: string;
    created_at: string;
}

// ─── Inline Edit Component ──────────────────────────────────────
function InlineEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
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
                outline: 'none', width: '100%',
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

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function ProjectsPage({ onOpenProject }: Props) {
    const { state: pState, dispatch: pDispatch, treeNodes } = usePortfolio();
    const { state: ganttState } = useGantt();

    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; kind: 'eps' | 'project' } | null>(null);

    // Supabase load modal state
    const [sbModalOpen, setSbModalOpen] = useState(false);
    const [sbProjects, setSbProjects] = useState<SBProject[]>([]);
    const [sbSelected, setSbSelected] = useState<string | null>(null);
    const [sbStatus, setSbStatus] = useState('');

    // Project config modal state
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [configProject, setConfigProject] = useState<ProjectMeta | null>(null);
    const [configEpsId, setConfigEpsId] = useState<string | null>(null);

    // Move-to-EPS modal
    const [moveModalOpen, setMoveModalOpen] = useState(false);
    const [moveTargetEps, setMoveTargetEps] = useState<string | null>(null);

    // Scroll sync refs
    const tableBodyRef = useRef<HTMLDivElement>(null);
    const timelineBodyRef = useRef<HTMLDivElement>(null);

    // Sync vertical scroll between table body and timeline body
    useEffect(() => {
        const tbl = tableBodyRef.current;
        const tl = timelineBodyRef.current;
        if (!tbl || !tl) return;
        let syncing = false;
        const onTableScroll = () => {
            if (syncing) return;
            syncing = true;
            tl.scrollTop = tbl.scrollTop;
            syncing = false;
        };
        const onTimelineScroll = () => {
            if (syncing) return;
            syncing = true;
            tbl.scrollTop = tl.scrollTop;
            syncing = false;
        };
        tbl.addEventListener('scroll', onTableScroll);
        tl.addEventListener('scroll', onTimelineScroll);
        return () => {
            tbl.removeEventListener('scroll', onTableScroll);
            tl.removeEventListener('scroll', onTimelineScroll);
        };
    }, []);

    // ── Filter tree nodes by search ──
    const filteredNodes = useMemo(() => {
        if (!searchTerm.trim()) return treeNodes;
        const lower = searchTerm.toLowerCase();
        return treeNodes.filter(n => {
            if (n.kind === 'eps') return n.data.name.toLowerCase().includes(lower) || (n.data.epsCode || '').toLowerCase().includes(lower);
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
        setConfigProject(null);
        setConfigEpsId(epsId);
        setConfigModalOpen(true);
    }, [selectedEps]);

    const handleConfigSave = useCallback((data: {
        name: string; code: string; priority: number; status: ProjectMeta['status'];
        startDate: string; statusDate: string; calendar: string; description: string;
    }) => {
        if (configProject) {
            // Updating existing project
            pDispatch({
                type: 'UPDATE_PROJECT', id: configProject.id, updates: {
                    name: data.name,
                    code: data.code,
                    priority: data.priority,
                    status: data.status,
                    startDate: data.startDate || null,
                    statusDate: data.statusDate || null,
                    description: data.description,
                }
            });
        } else {
            // Creating new project via modal
            const code = data.code || ('PRY-' + String(pState.projects.length + 1).padStart(3, '0'));
            pDispatch({ type: 'ADD_PROJECT', epsId: configEpsId, name: data.name || 'Nuevo Proyecto', code });
        }
        setConfigModalOpen(false);
    }, [configProject, configEpsId, pState.projects.length, pDispatch]);

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

    // ── Clipboard handlers ──
    const handleCut = useCallback(() => {
        if (selectedProject) pDispatch({ type: 'CUT_PROJECT', id: selectedProject.id });
    }, [selectedProject, pDispatch]);

    const handleCopy = useCallback(() => {
        if (selectedProject) pDispatch({ type: 'COPY_PROJECT', id: selectedProject.id });
    }, [selectedProject, pDispatch]);

    const handlePaste = useCallback(() => {
        if (!pState.clipboard) return;
        const targetEpsId = selectedEps ? selectedEps.id : null;
        pDispatch({ type: 'PASTE_PROJECT', targetEpsId });
    }, [pState.clipboard, selectedEps, pDispatch]);

    const handleMoveOpen = useCallback(() => {
        if (!selectedProject) return;
        setMoveTargetEps(selectedProject.epsId);
        setMoveModalOpen(true);
    }, [selectedProject]);

    const handleMoveConfirm = useCallback(() => {
        if (selectedProject) {
            pDispatch({ type: 'MOVE_PROJECT', id: selectedProject.id, targetEpsId: moveTargetEps });
        }
        setMoveModalOpen(false);
    }, [selectedProject, moveTargetEps, pDispatch]);

    // ── Supabase handlers ──
    const handleLoadFromSupabase = useCallback(async () => {
        setSbModalOpen(true);
        setSbStatus('Cargando...');
        setSbSelected(null);
        try {
            const { data, error } = await supabase.from('gantt_projects').select('id,projname,projstart,created_at').order('created_at', { ascending: false });
            if (error) throw error;
            if (!data || !data.length) { setSbStatus('No hay proyectos en la nube'); setSbProjects([]); return; }
            setSbProjects(data);
            setSbStatus(data.length + ' proyecto(s) encontrado(s)');
        } catch (err: any) {
            setSbStatus('❌ ' + (err.message || 'Error al conectar'));
            setSbProjects([]);
        }
    }, []);

    const handleImportFromSupabase = useCallback(() => {
        if (!sbSelected) return;
        const sbProj = sbProjects.find(p => p.id === sbSelected);
        if (!sbProj) return;

        // Check if already linked
        const existingLinked = pState.projects.find(p => p.supabaseId === sbSelected);
        if (existingLinked) {
            handleOpenProject(existingLinked.id);
            setSbModalOpen(false);
            return;
        }

        // Create new portfolio project linked to Supabase
        const code = 'SB-' + String(pState.projects.length + 1).padStart(3, '0');
        const epsId = selectedEps ? selectedEps.id : null;
        pDispatch({ type: 'ADD_PROJECT', epsId, name: sbProj.projname || 'Proyecto Supabase', code });

        // Link via Supabase and trigger load
        localStorage.setItem('sb_current_project_id', sbSelected);
        window.dispatchEvent(new CustomEvent('sb-load-project', { detail: { projectId: sbSelected } }));

        setSbModalOpen(false);
    }, [sbSelected, sbProjects, pState.projects, selectedEps, pDispatch, handleOpenProject]);

    // Close context menu on click outside
    useEffect(() => {
        if (!contextMenu) return;
        const handler = () => setContextMenu(null);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [contextMenu]);

    // ══════════════════════════════════════════════════════════════
    // TIMELINE CALCULATIONS
    // ══════════════════════════════════════════════════════════════
    const timelineData = useMemo(() => {
        const projectsWithDates = pState.projects.filter(p => p.startDate || p.endDate);
        if (projectsWithDates.length === 0) return null;

        let minDate = Infinity;
        let maxDate = -Infinity;

        for (const p of pState.projects) {
            if (p.startDate) {
                const d = new Date(p.startDate).getTime();
                if (d < minDate) minDate = d;
                if (d > maxDate) maxDate = d;
            }
            if (p.endDate) {
                const d = new Date(p.endDate).getTime();
                if (d < minDate) minDate = d;
                if (d > maxDate) maxDate = d;
            }
        }

        if (!isFinite(minDate) || !isFinite(maxDate)) return null;

        // Add padding (10% or 30 days)
        const pad = (maxDate - minDate) * 0.1 || 30 * 86400000;
        const start = new Date(minDate - pad);
        const end = new Date(maxDate + pad);
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);

        // Generate month labels
        const months: { label: string; startX: number; width: number }[] = [];
        let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor < end) {
            const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            const mStart = Math.max(0, (cursor.getTime() - start.getTime()) / 86400000);
            const mEnd = Math.min(totalDays, (nextMonth.getTime() - start.getTime()) / 86400000);
            months.push({
                label: cursor.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' }),
                startX: mStart,
                width: mEnd - mStart,
            });
            cursor = nextMonth;
        }

        return { start, end, totalDays, months };
    }, [pState.projects]);

    // Compute EPS aggregated dates
    const epsDateRanges = useMemo(() => {
        const ranges: Record<string, { start: Date | null; end: Date | null }> = {};

        function getRange(epsId: string): { start: Date | null; end: Date | null } {
            if (ranges[epsId]) return ranges[epsId];

            let minD: Date | null = null;
            let maxD: Date | null = null;

            // Direct projects
            for (const p of pState.projects.filter(pr => pr.epsId === epsId)) {
                if (p.startDate) {
                    const d = new Date(p.startDate);
                    if (!minD || d < minD) minD = d;
                }
                if (p.endDate) {
                    const d = new Date(p.endDate);
                    if (!maxD || d > maxD) maxD = d;
                } else if (p.startDate) {
                    const d = new Date(p.startDate);
                    if (!maxD || d > maxD) maxD = d;
                }
            }

            // Child EPS nodes
            for (const child of pState.epsNodes.filter(e => e.parentId === epsId)) {
                const childRange = getRange(child.id);
                if (childRange.start && (!minD || childRange.start < minD)) minD = childRange.start;
                if (childRange.end && (!maxD || childRange.end > maxD)) maxD = childRange.end;
            }

            ranges[epsId] = { start: minD, end: maxD };
            return ranges[epsId];
        }

        for (const eps of pState.epsNodes) getRange(eps.id);
        return ranges;
    }, [pState.projects, pState.epsNodes]);

    const DAY_W = 3; // pixels per day in timeline

    // ── Render Tree Row ──
    const renderTreeRow = (node: TreeNode, index: number) => {
        const nodeId = node.kind === 'eps' ? node.data.id : node.data.id;
        const isSelected = pState.selectedId === nodeId;
        const isActive = node.kind === 'project' && pState.activeProjectId === node.data.id;
        const isCut = pState.clipboard?.mode === 'cut' && pState.clipboard.projectId === nodeId;

        return (
            <div
                key={nodeId}
                onClick={() => pDispatch({ type: 'SELECT', id: nodeId })}
                onDoubleClick={() => {
                    if (node.kind === 'project') handleOpenProject(node.data.id);
                    else pDispatch({ type: 'TOGGLE_EXPAND', id: node.data.id });
                }}
                onContextMenu={e => handleContextMenu(e, nodeId, node.kind)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: ROW_H,
                    background: isSelected ? 'var(--bg-selected)' : isActive ? 'var(--color-indigo)08' : index % 2 === 0 ? 'transparent' : 'var(--bg-input)08',
                    borderBottom: '1px solid var(--border-primary)',
                    borderLeft: isActive ? '3px solid var(--color-indigo)' : '3px solid transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    opacity: isCut ? 0.5 : 1,
                    flexShrink: 0,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isActive ? 'var(--color-indigo)08' : index % 2 === 0 ? 'transparent' : 'var(--bg-input)08'; }}
            >
                {/* Column 1: EPS ID / Project Code */}
                <div style={{
                    width: COL_ID_W, flexShrink: 0, paddingLeft: 8 + node.depth * 16,
                    display: 'flex', alignItems: 'center', gap: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    borderRight: '1px solid var(--border-primary)',
                    height: '100%',
                }}>
                    {/* Expand/collapse arrow for EPS */}
                    {node.kind === 'eps' ? (
                        <span
                            onClick={e => { e.stopPropagation(); pDispatch({ type: 'TOGGLE_EXPAND', id: node.data.id }); }}
                            style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                            {node.hasChildren ? (
                                node.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                            ) : <span style={{ width: 13 }} />}
                        </span>
                    ) : (
                        <span style={{ width: 14, flexShrink: 0 }} />
                    )}

                    {/* Icon */}
                    {node.kind === 'eps' ? (
                        <FolderOpen size={14} style={{ color: node.data.color || '#f59e0b', flexShrink: 0 }} />
                    ) : (
                        <Briefcase size={14} style={{ color: isActive ? '#6366f1' : '#64748b', flexShrink: 0 }} />
                    )}

                    <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {node.kind === 'eps' ? (node.data.epsCode || '—') : node.data.code}
                    </span>
                </div>

                {/* Column 2: Name */}
                <div style={{
                    flex: 1, minWidth: 0,
                    paddingLeft: 8, paddingRight: 8,
                    display: 'flex', alignItems: 'center', gap: 6,
                    overflow: 'hidden',
                    borderRight: '1px solid var(--border-primary)',
                    height: '100%',
                }}>
                    {editingId === nodeId ? (
                        <InlineEdit
                            value={node.data.name}
                            onSave={v => handleRename(nodeId, v)}
                            onCancel={() => setEditingId(null)}
                        />
                    ) : (
                        <span style={{
                            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontWeight: node.kind === 'eps' ? 600 : 400,
                        }}>
                            {node.data.name}
                        </span>
                    )}

                    {node.kind === 'project' && <StatusBadge status={node.data.status} />}

                    {isActive && (
                        <span style={{
                            fontSize: 9, color: '#fff', background: '#6366f1',
                            padding: '1px 5px', borderRadius: 3, fontWeight: 600, flexShrink: 0,
                        }}>
                            ACTIVO
                        </span>
                    )}
                </div>

                {/* Column 3: Activities */}
                <div style={{
                    width: COL_ACT_W, flexShrink: 0, textAlign: 'center',
                    fontSize: 11, color: 'var(--text-muted)',
                    borderRight: '1px solid var(--border-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%',
                }}>
                    {node.kind === 'project' ? node.data.activityCount : '—'}
                </div>

                {/* Column 4: % Avance */}
                <div style={{
                    width: COL_PCT_W, flexShrink: 0,
                    padding: '0 8px',
                    display: 'flex', alignItems: 'center', gap: 4,
                    borderRight: '1px solid var(--border-primary)',
                    height: '100%',
                }}>
                    {node.kind === 'project' ? (
                        <>
                            <div style={{ flex: 1 }}>
                                <ProgressBar value={node.data.globalPct} color="#6366f1" />
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 32, textAlign: 'right' }}>
                                {node.data.globalPct}%
                            </span>
                        </>
                    ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                    )}
                </div>
            </div>
        );
    };

    // ── Render Timeline Bar for a row ──
    const renderTimelineBar = (node: TreeNode) => {
        if (!timelineData) return null;
        const nodeId = node.kind === 'eps' ? node.data.id : node.data.id;
        const isSelected = pState.selectedId === nodeId;

        let startDate: Date | null = null;
        let endDate: Date | null = null;
        let barColor = '#6366f1';
        let barHeight = 10;

        if (node.kind === 'project') {
            startDate = node.data.startDate ? new Date(node.data.startDate) : null;
            endDate = node.data.endDate ? new Date(node.data.endDate) : startDate;
            barColor = node.data.status === 'Completado' ? '#0ea5e9'
                : node.data.status === 'Ejecución' ? '#22c55e'
                : node.data.status === 'Suspendido' ? '#f59e0b'
                : '#6366f1';
            barHeight = 10;
        } else {
            const range = epsDateRanges[node.data.id];
            if (range) {
                startDate = range.start;
                endDate = range.end;
            }
            barColor = node.data.color || '#f59e0b';
            barHeight = 14;
        }

        if (!startDate) return null;

        const x = ((startDate.getTime() - timelineData.start.getTime()) / 86400000) * DAY_W;
        const w = endDate
            ? Math.max(4, ((endDate.getTime() - startDate.getTime()) / 86400000) * DAY_W)
            : 4;

        return (
            <div
                style={{
                    position: 'absolute',
                    left: x,
                    top: (ROW_H - barHeight) / 2,
                    width: w,
                    height: barHeight,
                    background: barColor,
                    borderRadius: node.kind === 'eps' ? 2 : 4,
                    opacity: isSelected ? 1 : 0.8,
                    boxShadow: isSelected ? `0 0 0 2px ${barColor}44` : 'none',
                    cursor: 'pointer',
                }}
                title={`${node.data.name}: ${startDate.toLocaleDateString('es-CL')}${endDate ? ' → ' + endDate.toLocaleDateString('es-CL') : ''}`}
                onClick={() => pDispatch({ type: 'SELECT', id: nodeId })}
            />
        );
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-app)' }}>

            {/* ── Top Header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px', borderBottom: '1px solid var(--border-primary)',
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
                        { label: 'Avance Prom.', value: `${avgProgress}%`, color: '#f59e0b', icon: <TrendingUp size={14} /> },
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
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 24px', borderBottom: '1px solid var(--border-primary)',
                background: 'var(--bg-ribbon)', flexShrink: 0, flexWrap: 'wrap',
            }}>
                {/* EPS & Project Creation */}
                <button onClick={handleAddEps} style={btnStyle} title="Agregar Carpeta EPS">
                    <FolderPlus size={14} /> EPS
                </button>
                <button onClick={handleAddProject} style={btnStyle} title="Agregar Proyecto">
                    <FilePlus size={14} /> Proyecto
                </button>

                <Sep />

                {/* Open & Configure */}
                <button
                    onClick={() => { if (selectedProject) handleOpenProject(selectedProject.id); }}
                    disabled={!selectedProject}
                    style={{ ...btnStyle, opacity: selectedProject ? 1 : 0.4 }}
                    title="Abrir Proyecto"
                >
                    <Play size={14} /> Abrir
                </button>
                <button
                    onClick={() => {
                        if (selectedProject) {
                            setConfigProject(selectedProject);
                            setConfigEpsId(selectedProject.epsId);
                            setConfigModalOpen(true);
                        }
                    }}
                    disabled={!selectedProject}
                    style={{ ...btnStyle, opacity: selectedProject ? 1 : 0.4 }}
                    title="Configurar Proyecto"
                >
                    <Settings size={14} />
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

                <Sep />

                {/* Cut / Copy / Paste / Move */}
                <button onClick={handleCut} disabled={!selectedProject} style={{ ...btnStyle, opacity: selectedProject ? 1 : 0.4 }} title="Cortar Proyecto">
                    <Scissors size={14} /> Cortar
                </button>
                <button onClick={handleCopy} disabled={!selectedProject} style={{ ...btnStyle, opacity: selectedProject ? 1 : 0.4 }} title="Copiar Proyecto">
                    <Copy size={14} /> Copiar
                </button>
                <button onClick={handlePaste} disabled={!pState.clipboard} style={{ ...btnStyle, opacity: pState.clipboard ? 1 : 0.4 }}
                    title={pState.clipboard ? `Pegar (${pState.clipboard.mode === 'cut' ? 'Mover' : 'Duplicar'})` : 'Pegar'}>
                    <ClipboardPaste size={14} /> Pegar
                </button>
                <button onClick={handleMoveOpen} disabled={!selectedProject} style={{ ...btnStyle, opacity: selectedProject ? 1 : 0.4 }} title="Mover a otra EPS">
                    <ArrowRightLeft size={14} /> Mover
                </button>

                <Sep />

                {/* Supabase Cloud */}
                <button onClick={handleLoadFromSupabase} style={{ ...btnStyle, color: '#3b82f6' }} title="Cargar desde Supabase">
                    <Cloud size={14} /> Cargar Nube
                </button>

                <div style={{ flex: 1 }} />

                {/* Expand/Collapse */}
                <button onClick={() => pDispatch({ type: 'EXPAND_ALL' })} style={btnStyle} title="Expandir Todo">
                    <ChevronsRight size={14} />
                </button>
                <button onClick={() => pDispatch({ type: 'COLLAPSE_ALL' })} style={btnStyle} title="Contraer Todo">
                    <ChevronsLeft size={14} />
                </button>

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
                        placeholder="Buscar..."
                        style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            fontSize: 12, color: 'var(--text-primary)', width: 120,
                        }}
                    />
                </div>
            </div>

            {/* ── Main Content: Table + Timeline ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Left: EPS Table */}
                <div style={{
                    width: TABLE_W, flexShrink: 0, borderRight: '1px solid var(--border-primary)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                    {/* Table Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center',
                        borderBottom: '2px solid var(--border-primary)',
                        background: 'var(--bg-panel)', flexShrink: 0, height: HEADER_H,
                    }}>
                        <div style={{ ...colHeaderStyle, width: COL_ID_W }}>ID</div>
                        <div style={{ ...colHeaderStyle, flex: 1 }}>Nombre</div>
                        <div style={{ ...colHeaderStyle, width: COL_ACT_W, justifyContent: 'center' }}>Act.</div>
                        <div style={{ ...colHeaderStyle, width: COL_PCT_W, justifyContent: 'center' }}>% Avance</div>
                    </div>

                    {/* Table Body */}
                    <div ref={tableBodyRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
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
                            filteredNodes.map((node, i) => renderTreeRow(node, i))
                        )}
                    </div>
                </div>

                {/* Right: Gantt Timeline */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Timeline Header */}
                    <div style={{
                        height: HEADER_H, borderBottom: '2px solid var(--border-primary)',
                        background: 'var(--bg-panel)', overflow: 'hidden', flexShrink: 0,
                    }}>
                        {timelineData ? (
                            <div style={{
                                width: timelineData.totalDays * DAY_W,
                                height: '100%', display: 'flex', position: 'relative',
                            }}>
                                {timelineData.months.map((m, i) => (
                                    <div key={i} style={{
                                        position: 'absolute',
                                        left: m.startX * DAY_W,
                                        width: m.width * DAY_W,
                                        height: '100%',
                                        borderRight: '1px solid var(--border-primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                                        textTransform: 'capitalize',
                                        overflow: 'hidden', whiteSpace: 'nowrap',
                                    }}>
                                        {m.width * DAY_W > 30 ? m.label : ''}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 11, color: 'var(--text-muted)' }}>
                                Línea de Tiempo del Proyecto
                            </div>
                        )}
                    </div>

                    {/* Timeline Body */}
                    <div ref={timelineBodyRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                        {timelineData ? (
                            <div style={{ position: 'relative', width: timelineData.totalDays * DAY_W, minHeight: filteredNodes.length * ROW_H }}>
                                {/* Grid lines */}
                                {timelineData.months.map((m, i) => (
                                    <div key={'gl' + i} style={{
                                        position: 'absolute',
                                        left: m.startX * DAY_W,
                                        top: 0, bottom: 0,
                                        borderRight: '1px solid var(--border-primary)',
                                        width: 0,
                                    }} />
                                ))}

                                {/* Row backgrounds + bars */}
                                {filteredNodes.map((node, i) => (
                                    <div key={(node.kind === 'eps' ? node.data.id : node.data.id) + '-tl'} style={{
                                        position: 'absolute',
                                        left: 0, right: 0,
                                        top: i * ROW_H,
                                        height: ROW_H,
                                        borderBottom: '1px solid var(--border-primary)',
                                    }}>
                                        {renderTimelineBar(node)}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8, padding: 40 }}>
                                <GanttChart size={40} style={{ opacity: 0.15 }} />
                                <p style={{ fontSize: 12, margin: 0 }}>Abra proyectos para ver la línea de tiempo</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Context Menu ── */}
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
                        background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
                        borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,.2)', padding: 4, minWidth: 200,
                    }}
                    onClick={() => setContextMenu(null)}
                >
                    {contextMenu.kind === 'project' && (
                        <CtxItem icon={<Play size={13} />} label="Abrir Proyecto"
                            onClick={() => handleOpenProject(contextMenu.nodeId)} />
                    )}
                    {contextMenu.kind === 'project' && (
                        <CtxItem icon={<Settings size={13} />} label="Configurar Proyecto"
                            onClick={() => {
                                const proj = pState.projects.find(p => p.id === contextMenu.nodeId);
                                if (proj) {
                                    setConfigProject(proj);
                                    setConfigEpsId(proj.epsId);
                                    setConfigModalOpen(true);
                                }
                            }} />
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
                            setConfigProject(null);
                            setConfigEpsId(epsId);
                            setConfigModalOpen(true);
                        }} />
                    {contextMenu.kind === 'project' && (
                        <>
                            <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />
                            <CtxItem icon={<Scissors size={13} />} label="Cortar"
                                onClick={() => pDispatch({ type: 'CUT_PROJECT', id: contextMenu.nodeId })} />
                            <CtxItem icon={<Copy size={13} />} label="Copiar"
                                onClick={() => pDispatch({ type: 'COPY_PROJECT', id: contextMenu.nodeId })} />
                        </>
                    )}
                    {pState.clipboard && (
                        <CtxItem icon={<ClipboardPaste size={13} />} label="Pegar aquí"
                            onClick={() => {
                                const targetEpsId = contextMenu.kind === 'eps' ? contextMenu.nodeId : null;
                                pDispatch({ type: 'PASTE_PROJECT', targetEpsId });
                            }} />
                    )}
                    <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />
                    <CtxItem icon={<Trash2 size={13} />} label="Eliminar" color="#ef4444"
                        onClick={() => {
                            const isEps = contextMenu.kind === 'eps';
                            if (isEps) {
                                if (confirm('¿Eliminar esta carpeta EPS?')) pDispatch({ type: 'DELETE_EPS', id: contextMenu.nodeId });
                            } else {
                                if (confirm('¿Eliminar este proyecto?')) pDispatch({ type: 'DELETE_PROJECT', id: contextMenu.nodeId });
                            }
                        }} />
                </div>
            )}

            {/* ── Move-to-EPS Modal ── */}
            {moveModalOpen && (
                <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setMoveModalOpen(false); }}>
                    <div className="modal" style={{ width: 380 }}>
                        <h2>Mover Proyecto</h2>
                        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                            Seleccione la carpeta EPS destino para &ldquo;{selectedProject?.name}&rdquo;
                        </p>
                        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                            {/* Root option */}
                            <div
                                onClick={() => setMoveTargetEps(null)}
                                style={{
                                    padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: moveTargetEps === null ? 'var(--bg-selected)' : 'transparent',
                                    border: `1px solid ${moveTargetEps === null ? 'var(--color-indigo)' : 'transparent'}`,
                                    marginBottom: 4, fontSize: 12,
                                }}
                            >
                                <Building2 size={14} /> Raíz (Sin carpeta)
                            </div>
                            {pState.epsNodes.map(eps => (
                                <div
                                    key={eps.id}
                                    onClick={() => setMoveTargetEps(eps.id)}
                                    style={{
                                        padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        background: moveTargetEps === eps.id ? 'var(--bg-selected)' : 'transparent',
                                        border: `1px solid ${moveTargetEps === eps.id ? 'var(--color-indigo)' : 'transparent'}`,
                                        marginBottom: 4, fontSize: 12,
                                        paddingLeft: 12 + (eps.parentId ? 20 : 0),
                                    }}
                                >
                                    <FolderOpen size={14} style={{ color: eps.color || '#f59e0b' }} />
                                    <span>{eps.epsCode || ''} — {eps.name}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setMoveModalOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleMoveConfirm}>Mover</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Supabase Load Modal ── */}
            {sbModalOpen && (
                <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setSbModalOpen(false); }}>
                    <div className="modal" style={{ width: 440 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Cloud size={18} style={{ color: '#3b82f6' }} />
                            <h2 style={{ margin: 0 }}>Cargar Proyecto desde la Nube</h2>
                        </div>
                        <div style={{ fontSize: 11, color: sbStatus.startsWith('❌') ? '#f87171' : '#4ade80', marginBottom: 8 }}>
                            {sbStatus}
                        </div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                            {sbProjects.map(p => {
                                const isLinked = pState.projects.some(pp => pp.supabaseId === p.id);
                                const isSel = sbSelected === p.id;
                                return (
                                    <div key={p.id}
                                        onClick={() => setSbSelected(p.id)}
                                        style={{
                                            padding: '8px 12px', margin: '3px 0', cursor: 'pointer',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            borderRadius: 6,
                                            background: isLinked ? 'var(--color-indigo)08' : 'var(--bg-input)',
                                            border: `1px solid ${isSel ? 'var(--color-indigo)' : 'var(--border-secondary)'}`,
                                        }}
                                    >
                                        <div>
                                            <strong style={{ color: 'var(--text-heading)', fontSize: 12 }}>
                                                {isLinked ? '🔗 ' : ''}{p.projname}
                                            </strong>
                                            <br />
                                            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                                Inicio: {p.projstart || '?'} | {new Date(p.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {isLinked && (
                                            <span style={{ fontSize: 9, color: '#6366f1', fontWeight: 600 }}>VINCULADO</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setSbModalOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleImportFromSupabase} disabled={!sbSelected}>
                                Importar a Cartera
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Project Config Modal ── */}
            <ProjectConfigModal
                open={configModalOpen}
                project={configProject}
                epsId={configEpsId}
                onSave={handleConfigSave}
                onClose={() => setConfigModalOpen(false)}
                customCalendars={ganttState.customCalendars || []}
            />
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

// ─── Separator ──────────────────────────────────────────────────
function Sep() {
    return <div style={{ width: 1, height: 20, background: 'var(--border-primary)', margin: '0 2px' }} />;
}

// ─── Constants ──────────────────────────────────────────────────
const ROW_H = 30;
const HEADER_H = 32;
const TABLE_W = 580;
const COL_ID_W = 130;
const COL_ACT_W = 50;
const COL_PCT_W = 100;

// ─── Shared Styles ──────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
    borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 500,
    color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap',
};

const colHeaderStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.5,
    padding: '0 8px',
    borderRight: '1px solid var(--border-primary)',
    display: 'flex', alignItems: 'center',
    height: '100%',
};
