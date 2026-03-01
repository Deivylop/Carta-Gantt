// ═══════════════════════════════════════════════════════════════════
// ProjectsPage – P6-style Portfolio EPS + Gantt timeline
// Columns mirror the Carta Gantt table (WBS 0 data per project)
// EPS = summary bars aggregating nested project ranges & metrics
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { usePortfolio } from '../../store/PortfolioContext';
import { useGantt } from '../../store/GanttContext';
import { supabase } from '../../lib/supabase';
import type { ModuleId } from '../ModuleTabs';
import type { TreeNode, ProjectMeta, EPSNode } from '../../types/portfolio';
import type { ZoomLevel } from '../../types/gantt';
import ProjectConfigModal from '../modals/ProjectConfigModal';
import EPSModal from '../modals/EPSModal';
import ColumnPickerModal from '../ColumnPickerModal';
import ProjectDetailPanel from './ProjectDetailPanel';
import {
    FolderOpen, FolderPlus, FilePlus, Trash2, ChevronRight, ChevronDown,
    Play, Briefcase, Building2,
    Search, Edit3, GanttChart, Scissors, Copy, ClipboardPaste,
    ArrowRightLeft, Cloud, Settings, ChevronsRight, ChevronsLeft,
    ArrowRight, ArrowLeft, Network, PanelBottomOpen, PanelBottomClose,
    ArrowUp, ArrowDown, Columns3, ZoomIn, ZoomOut, CalendarDays,
    GripVertical,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────
const ROW_H = 28;
const HEADER_H = 30;
const HEADER_H_DAY = 50;
const COL_STORAGE_KEY = 'gantt-cpm-portfolio-columns';

// ─── All possible Column Definitions ─────────────────────────────
interface ColDef { key: string; label: string; w: number; align: 'left' | 'center' | 'right' }
const ALL_COLUMNS: ColDef[] = [
    { key: 'i',        label: '#',              w: 28,  align: 'center' },
    { key: 'id',       label: 'ID',             w: 90,  align: 'left' },
    { key: 'name',     label: 'Nombre de tarea', w: 220, align: 'left' },
    { key: 'dur',      label: 'Duración',       w: 70,  align: 'right' },
    { key: 'remDur',   label: 'Dur. Resta',     w: 70,  align: 'right' },
    { key: 'start',    label: 'Comienzo',       w: 85,  align: 'center' },
    { key: 'end',      label: 'Fin',            w: 85,  align: 'center' },
    { key: 'pctAvance',label: '% Avance',       w: 65,  align: 'right' },
    { key: 'pctProg',  label: '% Prog.',        w: 65,  align: 'right' },
    { key: 'work',     label: 'Trabajo',        w: 80,  align: 'right' },
    { key: 'actual',   label: 'Valor Ganado',   w: 95,  align: 'right' },
    { key: 'remaining',label: 'Trab. Restante', w: 95,  align: 'right' },
    { key: 'weight',   label: 'Peso %',         w: 55,  align: 'right' },
    { key: 'res',      label: 'Recursos',       w: 100, align: 'left' },
    { key: 'act',      label: 'ACT.',           w: 40,  align: 'center' },
    { key: 'status',   label: 'Estado',         w: 85,  align: 'center' },
    { key: 'statusDt', label: 'F. Corte',       w: 85,  align: 'center' },
];
const DEFAULT_VISIBLE = ['i', 'id', 'name', 'dur', 'remDur', 'statusDt', 'start', 'end', 'pctAvance', 'pctProg', 'work', 'actual', 'remaining', 'res', 'act'];
const PORTFOLIO_COL_GROUPS = [
    { group: 'General',   keys: ['i', 'id', 'name', 'status', 'statusDt'] },
    { group: 'Duraciones', keys: ['dur', 'remDur'] },
    { group: 'Fechas',     keys: ['start', 'end'] },
    { group: 'Avance',     keys: ['pctAvance', 'pctProg'] },
    { group: 'Trabajo',    keys: ['work', 'actual', 'remaining', 'weight'] },
    { group: 'Recursos',   keys: ['res'] },
    { group: 'Resumen',    keys: ['act'] },
];

function loadSavedCols(): string[] {
    try { const r = localStorage.getItem(COL_STORAGE_KEY); return r ? JSON.parse(r) : DEFAULT_VISIBLE; } catch { return DEFAULT_VISIBLE; }
}
function saveCols(keys: string[]) { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(keys)); }

// ─── Helpers ────────────────────────────────────────────────────
function fmtDt(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtHrs(h: number): string {
    if (!h) return '0 hrs';
    return h.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' hrs';
}

// ─── Supabase Project List Item ─────────────────────────────────
interface SBProject { id: string; projname: string; projstart: string; created_at: string; }

// ─── Inline Edit Component ──────────────────────────────────────
function InlineEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
    const [text, setText] = useState(value);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.select(); }, []);
    return (
        <input ref={ref} value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSave(text); if (e.key === 'Escape') onCancel(); }}
            onBlur={() => onSave(text)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--color-indigo)', borderRadius: 3, padding: '1px 4px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', width: '100%' }}
        />
    );
}

// ─── EPS Aggregated Data ────────────────────────────────────────
interface EpsAgg {
    startDate: string | null; endDate: string | null;
    duration: number; remainingDur: number;
    work: number; actualWork: number; remainingWork: number;
    pctAvance: number; pctProg: number;
    activityCount: number; weight: number | null;
}

interface Props { onNavigate: (id: ModuleId) => void; onOpenProject: (projectId: string) => void; }

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function ProjectsPage({ onOpenProject }: Props) {
    const { state: pState, dispatch: pDispatch, treeNodes } = usePortfolio();
    const { state: ganttState } = useGantt();

    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; kind: 'eps' | 'project' } | null>(null);

    // Supabase modal
    const [sbModalOpen, setSbModalOpen] = useState(false);
    const [sbProjects, setSbProjects] = useState<SBProject[]>([]);
    const [sbSelected, setSbSelected] = useState<string | null>(null);
    const [sbStatus, setSbStatus] = useState('');

    // Config modal
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [configProject, setConfigProject] = useState<ProjectMeta | null>(null);
    const [configEpsId, setConfigEpsId] = useState<string | null>(null);

    // Move modal
    const [moveModalOpen, setMoveModalOpen] = useState(false);
    const [moveTargetEps, setMoveTargetEps] = useState<string | null>(null);

    // EPS modal / detail panel
    const [epsModalOpen, setEpsModalOpen] = useState(false);
    const [detailPanelOpen, setDetailPanelOpen] = useState(true);
    const [detailH, setDetailH] = useState(220);
    const [draggingDetail, setDraggingDetail] = useState(false);

    // Column picker modal
    const [colPickerOpen, setColPickerOpen] = useState(false);
    const [visibleColKeys, setVisibleColKeys] = useState<string[]>(loadSavedCols);
    const COLUMNS = useMemo(() => visibleColKeys.map(k => ALL_COLUMNS.find(c => c.key === k)!).filter(Boolean), [visibleColKeys]);
    const TOTAL_W = useMemo(() => COLUMNS.reduce((s, c) => s + c.w, 0), [COLUMNS]);

    // Column drag reorder
    const [dragColKey, setDragColKey] = useState<string | null>(null);
    const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

    // Timeline zoom
    const [zoom, setZoom] = useState<ZoomLevel>('month');
    const hdrH = zoom === 'day' ? HEADER_H_DAY : HEADER_H;

    // Timeline
    const [timelineWidth, setTimelineWidth] = useState(600);
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const tableBodyRef = useRef<HTMLDivElement>(null);
    const timelineBodyRef = useRef<HTMLDivElement>(null);
    const mainContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = timelineContainerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(entries => { if (entries[0]) setTimelineWidth(entries[0].contentRect.width); });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // Scroll sync
    useEffect(() => {
        const tbl = tableBodyRef.current, tl = timelineBodyRef.current;
        if (!tbl || !tl) return;
        let s = false;
        const a = () => { if (s) return; s = true; tl.scrollTop = tbl.scrollTop; s = false; };
        const b = () => { if (s) return; s = true; tbl.scrollTop = tl.scrollTop; s = false; };
        tbl.addEventListener('scroll', a); tl.addEventListener('scroll', b);
        return () => { tbl.removeEventListener('scroll', a); tl.removeEventListener('scroll', b); };
    }, []);

    // Ctrl+Wheel zoom (passive: false for preventDefault)
    useEffect(() => {
        const el = timelineContainerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setZoom(z => {
                    if (e.deltaY < 0) return z === 'month' ? 'week' : z === 'week' ? 'day' : 'day';
                    return z === 'day' ? 'week' : z === 'week' ? 'month' : 'month';
                });
            }
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, []);

    // Detail panel drag-resize
    useEffect(() => {
        if (!draggingDetail) return;
        const onMove = (e: MouseEvent) => {
            if (!mainContainerRef.current) return;
            const rect = mainContainerRef.current.getBoundingClientRect();
            setDetailH(Math.max(80, Math.min(rect.bottom - e.clientY, 500)));
        };
        const onUp = () => { setDraggingDetail(false); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [draggingDetail]);

    // Column drag-and-drop handlers
    const handleColDragStart = useCallback((key: string) => setDragColKey(key), []);
    const handleColDragOver = useCallback((key: string) => setDragOverColKey(key), []);
    const handleColDrop = useCallback((targetKey: string) => {
        if (!dragColKey || dragColKey === targetKey) { setDragColKey(null); setDragOverColKey(null); return; }
        setVisibleColKeys(prev => {
            const arr = [...prev];
            const fromIdx = arr.indexOf(dragColKey);
            const toIdx = arr.indexOf(targetKey);
            if (fromIdx < 0 || toIdx < 0) return prev;
            arr.splice(fromIdx, 1);
            arr.splice(toIdx, 0, dragColKey);
            saveCols(arr);
            return arr;
        });
        setDragColKey(null); setDragOverColKey(null);
    }, [dragColKey]);

    // Column picker callbacks
    const handleColPickerApply = useCallback((keys: string[]) => { setVisibleColKeys(keys); saveCols(keys); setColPickerOpen(false); }, []);

    // ── Filter
    const filteredNodes = useMemo(() => {
        if (!searchTerm.trim()) return treeNodes;
        const lower = searchTerm.toLowerCase();
        return treeNodes.filter(n => n.kind === 'eps'
            ? n.data.name.toLowerCase().includes(lower) || (n.data.epsCode || '').toLowerCase().includes(lower)
            : n.data.name.toLowerCase().includes(lower) || n.data.code.toLowerCase().includes(lower));
    }, [treeNodes, searchTerm]);

    // ── Selected
    const selectedProject = useMemo(() => pState.selectedId ? pState.projects.find(p => p.id === pState.selectedId) || null : null, [pState.selectedId, pState.projects]);
    const selectedEps = useMemo(() => pState.selectedId ? pState.epsNodes.find(e => e.id === pState.selectedId) || null : null, [pState.selectedId, pState.epsNodes]);

    // ══════════════════════════════════════════════════════════════
    // EPS AGGREGATION (sum metrics from child projects)
    // ══════════════════════════════════════════════════════════════
    const epsAggMap = useMemo(() => {
        const map: Record<string, EpsAgg> = {};
        function agg(epsId: string): EpsAgg {
            if (map[epsId]) return map[epsId];
            let sD: number | null = null, eD: number | null = null;
            let dur = 0, remDur = 0, work = 0, actual = 0, remaining = 0, acts = 0;
            let sumWeightedPct = 0, sumWeightedProg = 0, sumWeight = 0;

            for (const p of pState.projects.filter(pr => pr.epsId === epsId)) {
                if (p.startDate) { const t = new Date(p.startDate).getTime(); if (sD == null || t < sD) sD = t; }
                if (p.endDate) { const t = new Date(p.endDate).getTime(); if (eD == null || t > eD) eD = t; }
                else if (p.startDate) { const t = new Date(p.startDate).getTime() + 90 * 86400000; if (eD == null || t > eD) eD = t; }
                dur = Math.max(dur, p.duration || 0);
                remDur = Math.max(remDur, p.remainingDur || 0);
                const pw = p.work || 0;
                work += pw; actual += p.actualWork || 0; remaining += p.remainingWork || 0;
                acts += p.activityCount;
                // Weight by total work for accurate EPS aggregation
                const w = pw > 0 ? pw : 1; // fallback weight=1 if no work
                sumWeightedPct += w * (p.globalPct || 0);
                sumWeightedProg += w * (p.pctProg || 0);
                sumWeight += w;
            }
            for (const child of pState.epsNodes.filter(e => e.parentId === epsId)) {
                const ca = agg(child.id);
                if (ca.startDate) { const t = new Date(ca.startDate).getTime(); if (sD == null || t < sD) sD = t; }
                if (ca.endDate) { const t = new Date(ca.endDate).getTime(); if (eD == null || t > eD) eD = t; }
                dur = Math.max(dur, ca.duration); remDur = Math.max(remDur, ca.remainingDur);
                const cw = ca.work || 0;
                work += cw; actual += ca.actualWork; remaining += ca.remainingWork;
                acts += ca.activityCount;
                const w = cw > 0 ? cw : 1;
                sumWeightedPct += w * (ca.pctAvance || 0);
                sumWeightedProg += w * (ca.pctProg || 0);
                sumWeight += w;
            }
            const avgPct = sumWeight > 0 ? Math.round(sumWeightedPct / sumWeight * 10) / 10 : 0;
            const avgProg = sumWeight > 0 ? Math.round(sumWeightedProg / sumWeight * 10) / 10 : 0;

            map[epsId] = {
                startDate: sD ? new Date(sD).toISOString() : null,
                endDate: eD ? new Date(eD).toISOString() : null,
                duration: dur, remainingDur: remDur,
                work, actualWork: actual, remainingWork: remaining,
                pctAvance: avgPct, pctProg: avgProg,
                activityCount: acts, weight: null,
            };
            return map[epsId];
        }
        for (const eps of pState.epsNodes) agg(eps.id);
        return map;
    }, [pState.projects, pState.epsNodes]);

    // ══════════════════════════════════════════════════════════════
    // HANDLERS
    // ══════════════════════════════════════════════════════════════
    const handleAddEps = useCallback(() => {
        pDispatch({ type: 'ADD_EPS', parentId: selectedEps ? selectedEps.id : null, name: 'Nueva Carpeta EPS' });
    }, [selectedEps, pDispatch]);

    const handleAddProject = useCallback(() => {
        setConfigProject(null); setConfigEpsId(selectedEps ? selectedEps.id : null); setConfigModalOpen(true);
    }, [selectedEps]);

    const handleConfigSave = useCallback((data: {
        name: string; code: string; priority: number; status: ProjectMeta['status'];
        startDate: string; statusDate: string; calendar: string; description: string;
    }) => {
        if (configProject) {
            pDispatch({ type: 'UPDATE_PROJECT', id: configProject.id, updates: { name: data.name, code: data.code, priority: data.priority, status: data.status, startDate: data.startDate || null, statusDate: data.statusDate || null, description: data.description } });
        } else {
            const code = data.code || ('PRY-' + String(pState.projects.length + 1).padStart(3, '0'));
            pDispatch({ type: 'ADD_PROJECT', epsId: configEpsId, name: data.name || 'Nuevo Proyecto', code, initialData: { startDate: data.startDate || null, statusDate: data.statusDate || null, description: data.description || '', priority: 1, status: data.status || 'Planificación' } });
        }
        setConfigModalOpen(false);
    }, [configProject, configEpsId, pState.projects.length, pDispatch]);

    const handleDelete = useCallback(() => {
        if (!pState.selectedId) return;
        const isEps = pState.epsNodes.some(e => e.id === pState.selectedId);
        if (isEps) { if (confirm('¿Eliminar esta carpeta EPS?')) pDispatch({ type: 'DELETE_EPS', id: pState.selectedId }); }
        else { if (confirm('¿Eliminar este proyecto?')) pDispatch({ type: 'DELETE_PROJECT', id: pState.selectedId }); }
    }, [pState.selectedId, pState.epsNodes, pDispatch]);

    const handleOpenProject = useCallback((id: string) => onOpenProject(id), [onOpenProject]);
    const handleRename = useCallback((id: string, v: string) => {
        if (pState.epsNodes.some(e => e.id === id)) pDispatch({ type: 'RENAME_EPS', id, name: v });
        else pDispatch({ type: 'UPDATE_PROJECT', id, updates: { name: v } });
        setEditingId(null);
    }, [pState.epsNodes, pDispatch]);
    const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string, kind: 'eps' | 'project') => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, nodeId, kind }); }, []);

    const handleCut = useCallback(() => { if (selectedProject) pDispatch({ type: 'CUT_PROJECT', id: selectedProject.id }); }, [selectedProject, pDispatch]);
    const handleCopy = useCallback(() => { if (selectedProject) pDispatch({ type: 'COPY_PROJECT', id: selectedProject.id }); }, [selectedProject, pDispatch]);
    const handlePaste = useCallback(() => { if (!pState.clipboard) return; pDispatch({ type: 'PASTE_PROJECT', targetEpsId: selectedEps ? selectedEps.id : null }); }, [pState.clipboard, selectedEps, pDispatch]);
    const handleMoveOpen = useCallback(() => { if (!selectedProject) return; setMoveTargetEps(selectedProject.epsId); setMoveModalOpen(true); }, [selectedProject]);
    const handleMoveConfirm = useCallback(() => { if (selectedProject) pDispatch({ type: 'MOVE_PROJECT', id: selectedProject.id, targetEpsId: moveTargetEps }); setMoveModalOpen(false); }, [selectedProject, moveTargetEps, pDispatch]);
    const handleIndent = useCallback(() => { if (pState.selectedId) pDispatch({ type: 'INDENT', id: pState.selectedId }); }, [pState.selectedId, pDispatch]);
    const handleOutdent = useCallback(() => { if (pState.selectedId) pDispatch({ type: 'OUTDENT', id: pState.selectedId }); }, [pState.selectedId, pDispatch]);

    // Move Up / Down in flat order
    const handleMoveUp = useCallback(() => {
        if (!pState.selectedId) return;
        const isEps = pState.epsNodes.some(e => e.id === pState.selectedId);
        if (isEps) {
            pDispatch({ type: 'MOVE_EPS_UP', id: pState.selectedId });
        } else {
            const proj = pState.projects.find(p => p.id === pState.selectedId);
            if (proj) {
                const siblings = pState.projects.filter(p => p.epsId === proj.epsId).sort((a, b) => a.priority - b.priority);
                const idx = siblings.findIndex(p => p.id === proj.id);
                if (idx > 0) {
                    const prev = siblings[idx - 1];
                    pDispatch({ type: 'UPDATE_PROJECT', id: proj.id, updates: { priority: prev.priority } });
                    pDispatch({ type: 'UPDATE_PROJECT', id: prev.id, updates: { priority: proj.priority } });
                }
            }
        }
    }, [pState.selectedId, pState.epsNodes, pState.projects, pDispatch]);

    const handleMoveDown = useCallback(() => {
        if (!pState.selectedId) return;
        const isEps = pState.epsNodes.some(e => e.id === pState.selectedId);
        if (isEps) {
            pDispatch({ type: 'MOVE_EPS_DOWN', id: pState.selectedId });
        } else {
            const proj = pState.projects.find(p => p.id === pState.selectedId);
            if (proj) {
                const siblings = pState.projects.filter(p => p.epsId === proj.epsId).sort((a, b) => a.priority - b.priority);
                const idx = siblings.findIndex(p => p.id === proj.id);
                if (idx < siblings.length - 1) {
                    const next = siblings[idx + 1];
                    pDispatch({ type: 'UPDATE_PROJECT', id: proj.id, updates: { priority: next.priority } });
                    pDispatch({ type: 'UPDATE_PROJECT', id: next.id, updates: { priority: proj.priority } });
                }
            }
        }
    }, [pState.selectedId, pState.epsNodes, pState.projects, pDispatch]);

    // ── Supabase
    const handleLoadFromSupabase = useCallback(async () => {
        setSbModalOpen(true); setSbStatus('Cargando...'); setSbSelected(null);
        try {
            const { data, error } = await supabase.from('gantt_projects').select('id,projname,projstart,created_at').order('created_at', { ascending: false });
            if (error) throw error;
            if (!data || !data.length) { setSbStatus('No hay proyectos en la nube'); setSbProjects([]); return; }
            setSbProjects(data); setSbStatus(data.length + ' proyecto(s) encontrado(s)');
        } catch (err: any) { setSbStatus('❌ ' + (err.message || 'Error')); setSbProjects([]); }
    }, []);
    const handleImportFromSupabase = useCallback(() => {
        if (!sbSelected) return;
        const sbProj = sbProjects.find(p => p.id === sbSelected);
        if (!sbProj) return;
        const linked = pState.projects.find(p => p.supabaseId === sbSelected);
        if (linked) { handleOpenProject(linked.id); setSbModalOpen(false); return; }
        const code = 'SB-' + String(pState.projects.length + 1).padStart(3, '0');
        pDispatch({ type: 'ADD_PROJECT', epsId: selectedEps?.id || null, name: sbProj.projname || 'Proyecto Supabase', code });
        localStorage.setItem('sb_current_project_id', sbSelected);
        window.dispatchEvent(new CustomEvent('sb-load-project', { detail: { projectId: sbSelected } }));
        setSbModalOpen(false);
    }, [sbSelected, sbProjects, pState.projects, selectedEps, pDispatch, handleOpenProject]);

    useEffect(() => { if (!contextMenu) return; const h = () => setContextMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [contextMenu]);

    // ══════════════════════════════════════════════════════════════
    // TIMELINE (supports day / week / month zoom)
    // ══════════════════════════════════════════════════════════════
    const timelineData = useMemo(() => {
        let minDate = Infinity, maxDate = -Infinity;
        const now = Date.now();
        const allDates: number[] = [];

        for (const p of pState.projects) {
            const sd = p.startDate ? new Date(p.startDate).getTime() : null;
            const ed = p.endDate ? new Date(p.endDate).getTime() : null;
            const cd = p.createdAt ? new Date(p.createdAt).getTime() : null;
            const effectiveStart = sd || cd || now;
            const effectiveEnd = ed || (sd ? sd + (p.duration || 90) * 86400000 : effectiveStart + 90 * 86400000);
            allDates.push(effectiveStart, effectiveEnd);
        }
        if (allDates.length === 0) return null;
        for (const d of allDates) { if (d < minDate) minDate = d; if (d > maxDate) maxDate = d; }
        if (!isFinite(minDate) || !isFinite(maxDate)) return null;

        const pad = Math.max((maxDate - minDate) * 0.1, 15 * 86400000);
        const start = new Date(minDate - pad);
        const end = new Date(maxDate + pad);
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);

        // Month headers (for month/week/day top row)
        const months: { label: string; startX: number; width: number }[] = [];
        let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor < end) {
            const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            const mS = Math.max(0, (cursor.getTime() - start.getTime()) / 86400000);
            const mE = Math.min(totalDays, (next.getTime() - start.getTime()) / 86400000);
            months.push({ label: cursor.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' }), startX: mS, width: mE - mS });
            cursor = next;
        }

        // Week headers
        const weeks: { label: string; startX: number; width: number }[] = [];
        if (zoom === 'week' || zoom === 'day') {
            let w = new Date(start);
            w.setDate(w.getDate() - w.getDay()); // Start of week (Sunday)
            while (w < end) {
                const wEnd = new Date(w); wEnd.setDate(wEnd.getDate() + 7);
                const wS = Math.max(0, (w.getTime() - start.getTime()) / 86400000);
                const wE = Math.min(totalDays, (wEnd.getTime() - start.getTime()) / 86400000);
                weeks.push({ label: 'S ' + String(w.getDate()).padStart(2, '0') + '/' + String(w.getMonth() + 1).padStart(2, '0'), startX: wS, width: wE - wS });
                w = wEnd;
            }
        }

        // Day headers
        const days: { label: string; letter: string; startX: number; isWeekend: boolean }[] = [];
        if (zoom === 'day') {
            const dayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
            let d = new Date(start);
            let dayIdx = 0;
            while (d < end) {
                const x = dayIdx;
                const isWe = d.getDay() === 0 || d.getDay() === 6;
                days.push({ label: String(d.getDate()), letter: dayNames[d.getDay()], startX: x, isWeekend: isWe });
                d = new Date(d.getTime() + 86400000);
                dayIdx++;
            }
        }

        return { start, end, totalDays, months, weeks, days };
    }, [pState.projects, zoom]);

    const DAY_W = useMemo(() => {
        if (!timelineData || timelineWidth <= 0) return 3;
        if (zoom === 'day') return Math.max(14, (timelineWidth - 10) / Math.min(60, timelineData.totalDays));
        if (zoom === 'week') return Math.max(3, (timelineWidth - 10) / Math.min(180, timelineData.totalDays));
        return Math.max(1, (timelineWidth - 10) / timelineData.totalDays);
    }, [timelineData, timelineWidth, zoom]);

    // ══════════════════════════════════════════════════════════════
    // GET ROW DATA (project or EPS aggregated)
    // ══════════════════════════════════════════════════════════════
    const getRowData = useCallback((node: TreeNode) => {
        if (node.kind === 'project') {
            const p = node.data;
            return {
                id: p.code, name: p.name,
                dur: p.duration ? p.duration + ' días' : '',
                remDur: p.remainingDur ? p.remainingDur + ' días' : '',
                start: fmtDt(p.startDate), end: fmtDt(p.endDate),
                pctAvance: p.globalPct + '%', pctProg: p.pctProg + '%',
                work: fmtHrs(p.work), actual: fmtHrs(p.actualWork),
                remaining: fmtHrs(p.remainingWork),
                weight: p.weight != null ? String(p.weight) : '',
                res: p.resources || '',
                act: String(p.activityCount),
                status: p.status, statusDt: fmtDt(p.statusDate),
            };
        }
        const a = epsAggMap[node.data.id];
        if (!a) return { id: node.data.epsCode || '', name: node.data.name, dur: '', remDur: '', start: '', end: '', pctAvance: '', pctProg: '', work: '', actual: '', remaining: '', weight: '', res: '', act: '', status: '', statusDt: '' };
        return {
            id: node.data.epsCode || '', name: node.data.name,
            dur: a.duration ? a.duration + ' días' : '',
            remDur: a.remainingDur ? a.remainingDur + ' días' : '',
            start: fmtDt(a.startDate), end: fmtDt(a.endDate),
            pctAvance: a.pctAvance + '%', pctProg: a.pctProg + '%',
            work: fmtHrs(a.work), actual: fmtHrs(a.actualWork),
            remaining: fmtHrs(a.remainingWork), weight: '', res: '',
            act: String(a.activityCount), status: '', statusDt: '',
        };
    }, [epsAggMap]);

    // ══════════════════════════════════════════════════════════════
    // RENDER ROW
    // ══════════════════════════════════════════════════════════════
    const renderRow = (node: TreeNode, index: number) => {
        const nodeId = node.data.id;
        const isSelected = pState.selectedId === nodeId;
        const isActive = node.kind === 'project' && pState.activeProjectId === nodeId;
        const isCut = pState.clipboard?.mode === 'cut' && pState.clipboard.projectId === nodeId;
        const isEps = node.kind === 'eps';
        const data = getRowData(node);

        return (
            <div key={nodeId}
                onClick={() => pDispatch({ type: 'SELECT', id: nodeId })}
                onDoubleClick={() => { if (node.kind === 'project') handleOpenProject(nodeId); else pDispatch({ type: 'TOGGLE_EXPAND', id: nodeId }); }}
                onContextMenu={e => handleContextMenu(e, nodeId, node.kind)}
                style={{
                    display: 'flex', alignItems: 'center', height: ROW_H, flexShrink: 0,
                    background: isSelected ? 'rgba(99,102,241,.15)' : index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
                    borderBottom: '1px solid var(--border-primary)',
                    borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                    cursor: 'pointer', userSelect: 'none', fontSize: 11,
                    color: isEps ? '#e2e8f0' : 'var(--text-primary)',
                    fontWeight: isEps ? 600 : 400,
                    opacity: isCut ? 0.45 : 1,
                    minWidth: TOTAL_W,
                }}
            >
                {COLUMNS.map(col => {
                    const cellStyle: React.CSSProperties = {
                        width: col.w, flexShrink: 0, padding: '0 4px',
                        display: 'flex', alignItems: 'center', height: '100%',
                        justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start',
                        borderRight: '1px solid var(--border-primary)',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    };

                    if (col.key === 'i') {
                        return <div key={col.key} style={{ ...cellStyle, color: 'var(--text-muted)', fontSize: 10 }}>
                            {isEps ? (
                                <span onClick={e => { e.stopPropagation(); pDispatch({ type: 'TOGGLE_EXPAND', id: nodeId }); }} style={{ display: 'flex', alignItems: 'center' }}>
                                    {node.hasChildren ? (node.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
                                </span>
                            ) : (
                                <span>{index + 1}</span>
                            )}
                        </div>;
                    }

                    if (col.key === 'id') {
                        return <div key={col.key} style={{ ...cellStyle, paddingLeft: 4 + node.depth * 14 }}>
                            {isEps
                                ? <FolderOpen size={13} style={{ color: (node.data as EPSNode).color || '#f59e0b', marginRight: 4, flexShrink: 0 }} />
                                : <Briefcase size={12} style={{ color: isActive ? '#6366f1' : '#64748b', marginRight: 4, flexShrink: 0 }} />}
                            <span style={{ color: isEps ? '#f59e0b' : '#6366f1', fontWeight: 600, fontSize: 10 }}>{data.id}</span>
                            {isActive && <span style={{ fontSize: 8, color: '#fff', background: '#6366f1', padding: '0 3px', borderRadius: 2, marginLeft: 4, fontWeight: 700 }}>●</span>}
                        </div>;
                    }

                    if (col.key === 'name') {
                        return <div key={col.key} style={cellStyle}>
                            {editingId === nodeId
                                ? <InlineEdit value={data.name} onSave={v => handleRename(nodeId, v)} onCancel={() => setEditingId(null)} />
                                : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</span>}
                        </div>;
                    }

                    // Data columns
                    const val = (data as any)[col.key] || '';
                    return <div key={col.key} style={cellStyle}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: col.key === 'pctAvance' || col.key === 'pctProg' ? '#6366f1' : undefined }}>{val}</span>
                    </div>;
                })}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════
    // RENDER TIMELINE BAR (Gantt-style summary bars for EPS)
    // ══════════════════════════════════════════════════════════════
    const renderTimelineBar = (node: TreeNode) => {
        if (!timelineData) return null;
        const isSelected = pState.selectedId === node.data.id;
        const isEps = node.kind === 'eps';

        let sDate: Date | null = null, eDate: Date | null = null;
        let pct = 0;

        if (isEps) {
            const a = epsAggMap[node.data.id];
            if (a?.startDate) sDate = new Date(a.startDate);
            if (a?.endDate) eDate = new Date(a.endDate);
            pct = a?.pctAvance || 0;
        } else {
            const p = node.data as ProjectMeta;
            sDate = p.startDate ? new Date(p.startDate) : p.createdAt ? new Date(p.createdAt) : null;
            eDate = p.endDate ? new Date(p.endDate) : null;
            // If no endDate, use duration or default to startDate (don't add 90 days artificially)
            if (!eDate && sDate) eDate = p.duration ? new Date(sDate.getTime() + p.duration * 86400000) : new Date(sDate);
            pct = p.globalPct;
        }
        if (!sDate) return null;
        if (!eDate) eDate = new Date(sDate);

        const x = ((sDate.getTime() - timelineData.start.getTime()) / 86400000) * DAY_W;
        const w = Math.max(6, ((eDate.getTime() - sDate.getTime()) / 86400000) * DAY_W);

        if (isEps) {
            // Summary bar: thin bar with inverted triangle ends (like Gantt)
            const sy = 6, sh = 6, brkH = 10;
            const color = (node.data as EPSNode).color || '#f59e0b';
            return (
                <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: ROW_H, pointerEvents: 'none' }}>
                    <rect x={x} y={sy} width={w} height={sh} fill={color} rx={1} />
                    {/* Left triangle */}
                    <polygon points={`${x},${sy} ${x + 6},${sy} ${x},${sy + brkH}`} fill={color} />
                    {/* Right triangle */}
                    <polygon points={`${x + w},${sy} ${x + w - 6},${sy} ${x + w},${sy + brkH}`} fill={color} />
                    {/* Progress fill */}
                    {pct > 0 && <rect x={x} y={sy} width={w * pct / 100} height={sh} fill="#22c55ecc" rx={1} />}
                    {/* Label */}
                    <text x={x + 4} y={sy + sh + 12} fontSize="9" fontWeight="bold" fill="var(--text-muted)" fontFamily="Segoe UI, sans-serif">
                        {Math.round(w / DAY_W)}d {pct ? pct + '%' : ''}
                    </text>
                </svg>
            );
        }

        // Project bar: solid rounded bar with progress fill
        const p = node.data as ProjectMeta;
        const barColor = p.status === 'Completado' ? '#0ea5e9' : p.status === 'Ejecución' ? '#22c55e' : p.status === 'Suspendido' ? '#f59e0b' : '#6366f1';
        const by = 5, bh = ROW_H - 10;
        return (
            <div style={{ position: 'absolute', left: x, top: by, width: w, height: bh, borderRadius: 3, overflow: 'hidden', cursor: 'pointer', boxShadow: isSelected ? `0 0 0 2px ${barColor}66` : 'none' }}
                title={`${p.name}: ${fmtDt(p.startDate)} → ${fmtDt(p.endDate)}`}
                onClick={() => pDispatch({ type: 'SELECT', id: node.data.id })}>
                {/* Background bar */}
                <div style={{ position: 'absolute', inset: 0, background: barColor, opacity: 0.35 }} />
                {/* Progress fill */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: barColor }} />
                {/* Label */}
                {w > 50 && (
                    <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
                        {p.duration ? p.duration + 'd' : ''} {pct ? pct + '%' : ''}
                    </span>
                )}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════
    return (
        <div ref={mainContainerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-app)' }}>

            {/* ── Toolbar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 12px', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-ribbon)', flexShrink: 0, flexWrap: 'wrap' }}>
                {/* INSERTAR */}
                <BtnGroup label="INSERTAR">
                    <Btn icon={<FolderPlus size={13} />} text="EPS" onClick={handleAddEps} />
                    <Btn icon={<FilePlus size={13} />} text="Proyecto" onClick={handleAddProject} />
                    <Btn icon={<Trash2 size={13} />} text="Eliminar" onClick={handleDelete} disabled={!pState.selectedId} color="#ef4444" />
                </BtnGroup>

                <Sep />

                {/* ESQUEMA */}
                <BtnGroup label="ESQUEMA">
                    <Btn icon={<ArrowRight size={13} />} text="Indentar" onClick={handleIndent} disabled={!pState.selectedId} />
                    <Btn icon={<ArrowLeft size={13} />} text="Des-indentar" onClick={handleOutdent} disabled={!pState.selectedId} />
                    <Btn icon={<ArrowUp size={13} />} onClick={handleMoveUp} disabled={!pState.selectedId} />
                    <Btn icon={<ArrowDown size={13} />} onClick={handleMoveDown} disabled={!pState.selectedId} />
                </BtnGroup>

                <Sep />

                {/* EDICIÓN */}
                <BtnGroup label="EDICIÓN">
                    <Btn icon={<Play size={13} />} text="Abrir" onClick={() => { if (selectedProject) handleOpenProject(selectedProject.id); }} disabled={!selectedProject} />
                    <Btn icon={<Settings size={13} />} onClick={() => { if (selectedProject) { setConfigProject(selectedProject); setConfigEpsId(selectedProject.epsId); setConfigModalOpen(true); } }} disabled={!selectedProject} />
                    <Btn icon={<Edit3 size={13} />} onClick={() => { if (pState.selectedId) setEditingId(pState.selectedId); }} disabled={!pState.selectedId} />
                    <Btn icon={<Scissors size={13} />} text="Cortar" onClick={handleCut} disabled={!selectedProject} />
                    <Btn icon={<Copy size={13} />} text="Copiar" onClick={handleCopy} disabled={!selectedProject} />
                    <Btn icon={<ClipboardPaste size={13} />} text="Pegar" onClick={handlePaste} disabled={!pState.clipboard} />
                    <Btn icon={<ArrowRightLeft size={13} />} text="Mover" onClick={handleMoveOpen} disabled={!selectedProject} />
                </BtnGroup>

                <Sep />

                {/* VISTA */}
                <BtnGroup label="VISTA">
                    <Btn icon={<Columns3 size={13} />} text="Columnas" onClick={() => setColPickerOpen(true)} />
                    <Btn icon={<CalendarDays size={13} />} text={zoom === 'day' ? 'Día' : zoom === 'week' ? 'Sem' : 'Mes'} onClick={() => setZoom(z => z === 'month' ? 'week' : z === 'week' ? 'day' : 'month')} />
                    <Btn icon={<ZoomIn size={13} />} onClick={() => setZoom(z => z === 'month' ? 'week' : 'day')} disabled={zoom === 'day'} />
                    <Btn icon={<ZoomOut size={13} />} onClick={() => setZoom(z => z === 'day' ? 'week' : 'month')} disabled={zoom === 'month'} />
                </BtnGroup>

                <Sep />

                {/* PROPIEDADES */}
                <BtnGroup label="PROPIEDADES">
                    <Btn icon={<Network size={13} />} text="EPS" onClick={() => setEpsModalOpen(true)} color="#f59e0b" />
                    <Btn icon={<Cloud size={13} />} text="Nube" onClick={handleLoadFromSupabase} color="#3b82f6" />
                    <Btn icon={detailPanelOpen ? <PanelBottomClose size={13} /> : <PanelBottomOpen size={13} />} text="Info" onClick={() => setDetailPanelOpen(!detailPanelOpen)} />
                </BtnGroup>

                <div style={{ flex: 1 }} />

                <Btn icon={<ChevronsRight size={13} />} onClick={() => pDispatch({ type: 'EXPAND_ALL' })} />
                <Btn icon={<ChevronsLeft size={13} />} onClick={() => pDispatch({ type: 'COLLAPSE_ALL' })} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 5, padding: '3px 8px' }}>
                    <Search size={12} style={{ color: 'var(--text-muted)' }} />
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..."
                        style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text-primary)', width: 100 }} />
                </div>
            </div>

            {/* ── Main Content ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                    {/* Left: Table */}
                    <div style={{ flexShrink: 0, borderRight: '2px solid var(--border-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Header (draggable columns) */}
                        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--border-primary)', background: 'var(--bg-panel)', flexShrink: 0, height: hdrH, minWidth: TOTAL_W }}>
                            {COLUMNS.map(col => (
                                <div key={col.key}
                                    draggable={col.key !== 'i'}
                                    onDragStart={() => handleColDragStart(col.key)}
                                    onDragOver={e => { e.preventDefault(); handleColDragOver(col.key); }}
                                    onDrop={() => handleColDrop(col.key)}
                                    onDragEnd={() => { setDragColKey(null); setDragOverColKey(null); }}
                                    style={{
                                        width: col.w, flexShrink: 0, fontSize: 9, fontWeight: 700,
                                        color: 'var(--text-muted)', letterSpacing: 0.3,
                                        padding: '0 4px', display: 'flex', alignItems: 'center', height: '100%',
                                        justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start',
                                        borderRight: '1px solid var(--border-primary)',
                                        whiteSpace: 'nowrap', overflow: 'hidden',
                                        cursor: col.key !== 'i' ? 'grab' : 'default',
                                        background: dragOverColKey === col.key ? 'rgba(99,102,241,.15)' : 'transparent',
                                        gap: 2,
                                    }}>
                                    {col.key !== 'i' && <GripVertical size={8} style={{ opacity: 0.3, flexShrink: 0 }} />}
                                    {col.label}
                                </div>
                            ))}
                        </div>
                        {/* Body */}
                        <div ref={tableBodyRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                            {filteredNodes.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, minWidth: TOTAL_W }}>
                                    <Building2 size={36} style={{ opacity: 0.2, marginBottom: 8 }} />
                                    <p style={{ margin: 0, fontWeight: 600 }}>Sin proyectos</p>
                                    <p style={{ margin: '4px 0 0', fontSize: 11 }}>Use la barra de herramientas para crear EPS y proyectos</p>
                                </div>
                            ) : filteredNodes.map((node, i) => renderRow(node, i))}
                        </div>
                    </div>

                    {/* Right: Timeline */}
                    <div ref={timelineContainerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ height: hdrH, borderBottom: '2px solid var(--border-primary)', background: 'var(--bg-panel)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                            {timelineData ? (
                                <div style={{ width: timelineData.totalDays * DAY_W, height: '100%', position: 'relative' }}>
                                    {/* Top row: months */}
                                    {timelineData.months.map((m, i) => (
                                        <div key={i} style={{
                                            position: 'absolute', left: m.startX * DAY_W, width: m.width * DAY_W,
                                            height: zoom === 'day' ? 17 : zoom === 'week' ? 15 : '100%',
                                            borderRight: '1px solid var(--border-primary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'capitalize',
                                            overflow: 'hidden', whiteSpace: 'nowrap',
                                            borderBottom: zoom !== 'month' ? '1px solid var(--border-primary)' : undefined,
                                        }}>
                                            {m.width * DAY_W > 30 ? m.label : ''}
                                        </div>
                                    ))}
                                    {/* Week row (for week zoom) */}
                                    {zoom === 'week' && timelineData.weeks.map((w, i) => (
                                        <div key={'w' + i} style={{
                                            position: 'absolute', left: w.startX * DAY_W, width: w.width * DAY_W,
                                            top: 15, height: 15,
                                            borderRight: '1px solid var(--border-primary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 8, color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap',
                                        }}>
                                            {w.width * DAY_W > 35 ? w.label : ''}
                                        </div>
                                    ))}
                                    {/* Day rows (for day zoom) */}
                                    {zoom === 'day' && timelineData.days.map((d, i) => (
                                        <React.Fragment key={'d' + i}>
                                            <div style={{
                                                position: 'absolute', left: d.startX * DAY_W, width: DAY_W,
                                                top: 17, height: 16,
                                                borderRight: '1px solid var(--border-primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 9, color: d.isWeekend ? '#64748b' : 'var(--text-muted)',
                                                background: d.isWeekend ? 'rgba(100,116,139,.08)' : 'transparent',
                                            }}>
                                                {DAY_W >= 14 ? d.label : ''}
                                            </div>
                                            <div style={{
                                                position: 'absolute', left: d.startX * DAY_W, width: DAY_W,
                                                top: 33, height: 17,
                                                borderRight: '1px solid var(--border-primary)',
                                                borderTop: '1px solid var(--border-primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 8, fontWeight: 600, color: d.isWeekend ? '#64748b' : 'var(--text-muted)',
                                                background: d.isWeekend ? 'rgba(100,116,139,.08)' : 'transparent',
                                            }}>
                                                {DAY_W >= 10 ? d.letter : ''}
                                            </div>
                                        </React.Fragment>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 10, color: 'var(--text-muted)' }}>
                                    Línea de Tiempo
                                </div>
                            )}
                        </div>
                        <div ref={timelineBodyRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                            {timelineData ? (
                                <div style={{ position: 'relative', width: timelineData.totalDays * DAY_W, minHeight: filteredNodes.length * ROW_H }}>
                                    {/* Month gridlines (always) */}
                                    {timelineData.months.map((m, i) => (
                                        <div key={'gl' + i} style={{ position: 'absolute', left: m.startX * DAY_W, top: 0, bottom: 0, borderRight: '1px solid var(--border-primary)', width: 0 }} />
                                    ))}
                                    {/* Week gridlines (week/day zoom) */}
                                    {zoom !== 'month' && timelineData.weeks.map((w, i) => (
                                        <div key={'wl' + i} style={{ position: 'absolute', left: w.startX * DAY_W, top: 0, bottom: 0, borderRight: '1px dashed rgba(100,116,139,.15)', width: 0 }} />
                                    ))}
                                    {/* Day gridlines (day zoom) */}
                                    {zoom === 'day' && timelineData.days.map((d, i) => (
                                        <div key={'dl' + i} style={{ position: 'absolute', left: d.startX * DAY_W, top: 0, bottom: 0, borderRight: d.isWeekend ? '1px solid rgba(100,116,139,.12)' : '1px dotted rgba(100,116,139,.08)', width: 0 }} />
                                    ))}
                                    {/* Weekend shading (day zoom) */}
                                    {zoom === 'day' && timelineData.days.filter(d => d.isWeekend).map((d, i) => (
                                        <div key={'we' + i} style={{ position: 'absolute', left: d.startX * DAY_W, top: 0, bottom: 0, width: DAY_W, background: 'rgba(100,116,139,.04)', pointerEvents: 'none' }} />
                                    ))}
                                    {/* Status date line (fecha de corte) */}
                                    {(() => {
                                        // Use the active project's statusDate, or the first project with a statusDate
                                        const activeProj = pState.activeProjectId ? pState.projects.find(p => p.id === pState.activeProjectId) : null;
                                        const sd = activeProj?.statusDate || pState.projects.find(p => p.statusDate)?.statusDate;
                                        if (!sd) return null;
                                        const sdTime = new Date(sd).getTime();
                                        const sdX = ((sdTime - timelineData.start.getTime()) / 86400000) * DAY_W;
                                        if (sdX < 0 || sdX > timelineData.totalDays * DAY_W) return null;
                                        return (
                                            <div key="status-line" style={{
                                                position: 'absolute', left: sdX, top: 0, bottom: 0, width: 0,
                                                borderRight: '2px dashed #f59e0b', zIndex: 5, pointerEvents: 'none',
                                            }}>
                                                <div style={{
                                                    position: 'absolute', top: 0, left: -20, width: 40,
                                                    fontSize: 8, textAlign: 'center', color: '#f59e0b', fontWeight: 700,
                                                    background: 'rgba(0,0,0,.6)', borderRadius: 2, padding: '1px 3px',
                                                }}>
                                                    F.Corte
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {filteredNodes.map((node, i) => (
                                        <div key={node.data.id + '-tl'} style={{ position: 'absolute', left: 0, right: 0, top: i * ROW_H, height: ROW_H, borderBottom: '1px solid var(--border-primary)' }}>
                                            {renderTimelineBar(node)}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 6, padding: 30 }}>
                                    <GanttChart size={36} style={{ opacity: 0.12 }} />
                                    <p style={{ fontSize: 11, margin: 0 }}>Abra proyectos para ver la línea de tiempo</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Bottom: Detail Panel (resizable) ── */}
                {detailPanelOpen && selectedProject && (
                    <>
                        {/* Drag handle */}
                        <div
                            onMouseDown={e => { e.preventDefault(); setDraggingDetail(true); }}
                            style={{
                                height: 5, flexShrink: 0, cursor: 'row-resize',
                                background: 'var(--border-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <div style={{ width: 40, height: 2, borderRadius: 1, background: 'var(--text-muted)', opacity: 0.4 }} />
                        </div>
                        <div style={{ height: detailH, flexShrink: 0, overflow: 'hidden' }}>
                            <ProjectDetailPanel projectId={selectedProject.id} customCalendars={ganttState.customCalendars || []} />
                        </div>
                    </>
                )}
            </div>

            {/* ── Context Menu ── */}
            {contextMenu && (
                <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999, background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.25)', padding: 3, minWidth: 180 }}
                    onClick={() => setContextMenu(null)}>
                    {contextMenu.kind === 'project' && <CtxItem icon={<Play size={12} />} label="Abrir Proyecto" onClick={() => handleOpenProject(contextMenu.nodeId)} />}
                    {contextMenu.kind === 'project' && <CtxItem icon={<Settings size={12} />} label="Configurar" onClick={() => { const proj = pState.projects.find(p => p.id === contextMenu.nodeId); if (proj) { setConfigProject(proj); setConfigEpsId(proj.epsId); setConfigModalOpen(true); } }} />}
                    <CtxItem icon={<Edit3 size={12} />} label="Renombrar" onClick={() => setEditingId(contextMenu.nodeId)} />
                    <CtxItem icon={<FolderPlus size={12} />} label="Nueva EPS" onClick={() => pDispatch({ type: 'ADD_EPS', parentId: contextMenu.kind === 'eps' ? contextMenu.nodeId : null, name: 'Nueva EPS' })} />
                    <CtxItem icon={<FilePlus size={12} />} label="Nuevo Proyecto" onClick={() => { setConfigProject(null); setConfigEpsId(contextMenu.kind === 'eps' ? contextMenu.nodeId : null); setConfigModalOpen(true); }} />
                    {contextMenu.kind === 'project' && <><div style={{ height: 1, background: 'var(--border-primary)', margin: '3px 0' }} />
                        <CtxItem icon={<Scissors size={12} />} label="Cortar" onClick={() => pDispatch({ type: 'CUT_PROJECT', id: contextMenu.nodeId })} />
                        <CtxItem icon={<Copy size={12} />} label="Copiar" onClick={() => pDispatch({ type: 'COPY_PROJECT', id: contextMenu.nodeId })} /></>}
                    {pState.clipboard && <CtxItem icon={<ClipboardPaste size={12} />} label="Pegar aquí" onClick={() => pDispatch({ type: 'PASTE_PROJECT', targetEpsId: contextMenu.kind === 'eps' ? contextMenu.nodeId : null })} />}
                    <div style={{ height: 1, background: 'var(--border-primary)', margin: '3px 0' }} />
                    <CtxItem icon={<ArrowUp size={12} />} label="Subir" onClick={() => {
                        pDispatch({ type: 'SELECT', id: contextMenu.nodeId });
                        const isEps = pState.epsNodes.some(e => e.id === contextMenu.nodeId);
                        if (isEps) pDispatch({ type: 'MOVE_EPS_UP', id: contextMenu.nodeId });
                        else { const pr = pState.projects.find(p => p.id === contextMenu.nodeId); if (pr) { const sibs = pState.projects.filter(p => p.epsId === pr.epsId); const idx = sibs.findIndex(p => p.id === pr.id); if (idx > 0) { pDispatch({ type: 'UPDATE_PROJECT', id: pr.id, updates: { priority: sibs[idx - 1].priority } }); pDispatch({ type: 'UPDATE_PROJECT', id: sibs[idx - 1].id, updates: { priority: pr.priority } }); } } }
                    }} />
                    <CtxItem icon={<ArrowDown size={12} />} label="Bajar" onClick={() => {
                        pDispatch({ type: 'SELECT', id: contextMenu.nodeId });
                        const isEps = pState.epsNodes.some(e => e.id === contextMenu.nodeId);
                        if (isEps) pDispatch({ type: 'MOVE_EPS_DOWN', id: contextMenu.nodeId });
                        else { const pr = pState.projects.find(p => p.id === contextMenu.nodeId); if (pr) { const sibs = pState.projects.filter(p => p.epsId === pr.epsId); const idx = sibs.findIndex(p => p.id === pr.id); if (idx >= 0 && idx < sibs.length - 1) { pDispatch({ type: 'UPDATE_PROJECT', id: pr.id, updates: { priority: sibs[idx + 1].priority } }); pDispatch({ type: 'UPDATE_PROJECT', id: sibs[idx + 1].id, updates: { priority: pr.priority } }); } } }
                    }} />
                    <div style={{ height: 1, background: 'var(--border-primary)', margin: '3px 0' }} />
                    <CtxItem icon={<Columns3 size={12} />} label="Columnas..." onClick={() => setColPickerOpen(true)} />
                    <div style={{ height: 1, background: 'var(--border-primary)', margin: '3px 0' }} />
                    <CtxItem icon={<Trash2 size={12} />} label="Eliminar" color="#ef4444" onClick={() => {
                        if (contextMenu.kind === 'eps') { if (confirm('¿Eliminar EPS?')) pDispatch({ type: 'DELETE_EPS', id: contextMenu.nodeId }); }
                        else { if (confirm('¿Eliminar proyecto?')) pDispatch({ type: 'DELETE_PROJECT', id: contextMenu.nodeId }); }
                    }} />
                </div>
            )}

            {/* ── Move Modal ── */}
            {moveModalOpen && (
                <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setMoveModalOpen(false); }}>
                    <div className="modal" style={{ width: 380 }}>
                        <h2>Mover Proyecto</h2>
                        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Destino para "{selectedProject?.name}"</p>
                        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                            <MoveRow label="Raíz (Sin carpeta)" icon={<Building2 size={13} />} selected={moveTargetEps === null} onClick={() => setMoveTargetEps(null)} />
                            {pState.epsNodes.map(eps => (
                                <MoveRow key={eps.id} label={`${eps.epsCode || ''} — ${eps.name}`}
                                    icon={<FolderOpen size={13} style={{ color: eps.color || '#f59e0b' }} />}
                                    selected={moveTargetEps === eps.id} onClick={() => setMoveTargetEps(eps.id)}
                                    indent={eps.parentId ? 20 : 0} />
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setMoveModalOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleMoveConfirm}>Mover</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Supabase Modal ── */}
            {sbModalOpen && (
                <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setSbModalOpen(false); }}>
                    <div className="modal" style={{ width: 440 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Cloud size={18} style={{ color: '#3b82f6' }} /><h2 style={{ margin: 0 }}>Cargar desde Nube</h2></div>
                        <div style={{ fontSize: 11, color: sbStatus.startsWith('❌') ? '#f87171' : '#4ade80', marginBottom: 8 }}>{sbStatus}</div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                            {sbProjects.map(p => {
                                const isLinked = pState.projects.some(pp => pp.supabaseId === p.id);
                                return (
                                    <div key={p.id} onClick={() => setSbSelected(p.id)}
                                        style={{ padding: '8px 12px', margin: '3px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 6, background: isLinked ? 'rgba(99,102,241,.05)' : 'var(--bg-input)', border: `1px solid ${sbSelected === p.id ? '#6366f1' : 'var(--border-secondary)'}` }}>
                                        <div><strong style={{ color: 'var(--text-heading)', fontSize: 12 }}>{isLinked ? '🔗 ' : ''}{p.projname}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Inicio: {p.projstart || '?'}</span></div>
                                        {isLinked && <span style={{ fontSize: 9, color: '#6366f1', fontWeight: 600 }}>VINCULADO</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setSbModalOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleImportFromSupabase} disabled={!sbSelected}>Importar</button>
                        </div>
                    </div>
                </div>
            )}

            <ProjectConfigModal open={configModalOpen} project={configProject} epsId={configEpsId} onSave={handleConfigSave} onClose={() => setConfigModalOpen(false)} customCalendars={ganttState.customCalendars || []} />
            <EPSModal open={epsModalOpen} onClose={() => setEpsModalOpen(false)} />
            {colPickerOpen && (
                <ColumnPickerModal
                    onClose={() => setColPickerOpen(false)}
                    externalColumns={ALL_COLUMNS.map(c => ({ key: c.key, label: c.label }))}
                    externalSelected={visibleColKeys}
                    onExternalApply={handleColPickerApply}
                    customGroups={PORTFOLIO_COL_GROUPS}
                />
            )}
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────
function CtxItem({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string }) {
    return (<button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 10px', background: 'transparent', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, color: color || 'var(--text-primary)', textAlign: 'left' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{icon} {label}</button>);
}

function Sep() { return <div style={{ width: 1, height: 28, background: 'var(--border-primary)', margin: '0 4px' }} />; }

function Btn({ icon, text, onClick, disabled, color }: { icon: React.ReactNode; text?: string; onClick: () => void; disabled?: boolean; color?: string }) {
    return (
        <button onClick={onClick} disabled={disabled}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '3px 6px', background: 'transparent', border: 'none', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1, color: color || 'var(--text-primary)', fontSize: 9, fontWeight: 500, whiteSpace: 'nowrap', minWidth: text ? 40 : 24 }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title={text}>
            {icon}
            {text && <span>{text}</span>}
        </button>
    );
}

function BtnGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>{children}</div>
            <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
        </div>
    );
}

function MoveRow({ label, icon, selected, onClick, indent = 0 }: { label: string; icon: React.ReactNode; selected: boolean; onClick: () => void; indent?: number }) {
    return (
        <div onClick={onClick} style={{ padding: '7px 12px', cursor: 'pointer', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 6, background: selected ? 'var(--bg-selected)' : 'transparent', border: `1px solid ${selected ? '#6366f1' : 'transparent'}`, marginBottom: 3, fontSize: 11, paddingLeft: 12 + indent }}>
            {icon} <span>{label}</span>
        </div>
    );
}
