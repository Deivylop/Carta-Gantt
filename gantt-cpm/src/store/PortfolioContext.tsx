// ═══════════════════════════════════════════════════════════════════
// PortfolioContext – State management for EPS / multi-project
// Persists to localStorage under 'gantt-cpm-portfolio'
// Individual project states under 'gantt-cpm-project-{id}'
// ═══════════════════════════════════════════════════════════════════
import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type { EPSNode, ProjectMeta, PortfolioState, TreeNode } from '../types/portfolio';
import { listSupabaseProjects, savePortfolioToSupabase, loadPortfolioFromSupabase, createSupabaseProject, fetchProjectSummaries } from '../utils/supabaseSync';

const STORAGE_KEY = 'gantt-cpm-portfolio';
const PROJECT_PREFIX = 'gantt-cpm-project-';

// ─── Helpers ────────────────────────────────────────────────────
function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowISO(): string {
    return new Date().toISOString();
}

// ─── Build flat list of TreeNodes for rendering ─────────────────
export function buildTree(eps: EPSNode[], projects: ProjectMeta[], expanded: Set<string>): TreeNode[] {
    const result: TreeNode[] = [];

    // Build eps children map
    const epsChildren = new Map<string | null, EPSNode[]>();
    eps.forEach(e => {
        const key = e.parentId;
        if (!epsChildren.has(key)) epsChildren.set(key, []);
        epsChildren.get(key)!.push(e);
    });

    // Build project children map  (epsId → projects)
    const projChildren = new Map<string | null, ProjectMeta[]>();
    projects.forEach(p => {
        const key = p.epsId;
        if (!projChildren.has(key)) projChildren.set(key, []);
        projChildren.get(key)!.push(p);
    });

    function walk(parentId: string | null, depth: number) {
        // EPS folders first
        const folders = epsChildren.get(parentId) || [];
        folders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
        for (const folder of folders) {
            const hasKids = epsChildren.has(folder.id) || projChildren.has(folder.id);
            const isExpanded = expanded.has(folder.id);
            result.push({ kind: 'eps', data: folder, depth, hasChildren: hasKids, expanded: isExpanded });
            if (isExpanded) {
                walk(folder.id, depth + 1);
            }
        }
        // Then projects at this level
        const projs = projChildren.get(parentId) || [];
        projs.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
        for (const p of projs) {
            result.push({ kind: 'project', data: p, depth });
        }
    }

    walk(null, 0);
    return result;
}

// ─── Actions ────────────────────────────────────────────────────
type PortfolioAction =
    | { type: 'LOAD'; state: { epsNodes: EPSNode[]; projects: ProjectMeta[]; expandedIds: string[]; activeProjectId: string | null } }
    | { type: 'ADD_EPS'; parentId: string | null; name: string; epsCode?: string }
    | { type: 'RENAME_EPS'; id: string; name: string }
    | { type: 'UPDATE_EPS'; id: string; updates: Partial<EPSNode> }
    | { type: 'DELETE_EPS'; id: string }
    | { type: 'ADD_PROJECT'; epsId: string | null; name: string; code: string; initialData?: Partial<ProjectMeta> }
    | { type: 'UPDATE_PROJECT'; id: string; updates: Partial<ProjectMeta> }
    | { type: 'DELETE_PROJECT'; id: string }
    | { type: 'TOGGLE_EXPAND'; id: string }
    | { type: 'SELECT'; id: string | null }
    | { type: 'SET_ACTIVE_PROJECT'; id: string | null }
    | { type: 'EXPAND_ALL' }
    | { type: 'COLLAPSE_ALL' }
    | { type: 'CUT_PROJECT'; id: string }
    | { type: 'COPY_PROJECT'; id: string }
    | { type: 'PASTE_PROJECT'; targetEpsId: string | null }
    | { type: 'MOVE_PROJECT'; id: string; targetEpsId: string | null }
    | { type: 'INDENT'; id: string }
    | { type: 'OUTDENT'; id: string }
    | { type: 'MOVE_EPS_UP'; id: string }
    | { type: 'MOVE_EPS_DOWN'; id: string }
    | { type: 'SYNC_FROM_SUPABASE'; supabaseProjects: { id: string; projName: string; projStart: string | null; statusDate: string | null; defCal: number }[] }
    | { type: 'REFRESH_SUMMARIES'; summaries: Record<string, Partial<ProjectMeta>> };

// ─── Initial State ──────────────────────────────────────────────
const initialState: PortfolioState = {
    epsNodes: [],
    projects: [],
    expandedIds: new Set<string>(),
    selectedId: null,
    activeProjectId: null,
    clipboard: null,
};

/** Read portfolio from localStorage synchronously (used as lazy initializer) */
function loadInitialState(): PortfolioState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            const epsNodes = (data.epsNodes || []).map((e: any, i: number) => ({
                ...e,
                epsCode: e.epsCode || ('EPS-' + String(i + 1).padStart(3, '0')),
                order: e.order ?? i,
            }));
            return {
                epsNodes,
                projects: data.projects || [],
                expandedIds: new Set(data.expandedIds || []),
                selectedId: null,
                activeProjectId: data.activeProjectId || null,
                clipboard: null,
            };
        }
    } catch (e) {
        console.warn('Failed to load portfolio from localStorage', e);
    }
    return initialState;
}

// ─── Reducer ────────────────────────────────────────────────────
function portfolioReducer(state: PortfolioState, action: PortfolioAction): PortfolioState {
    switch (action.type) {
        case 'LOAD': {
            // Backward compat: ensure epsCode exists on old EPS nodes
            const epsNodes = (action.state.epsNodes || []).map((e, i) => ({
                ...e,
                epsCode: e.epsCode || ('EPS-' + String(i + 1).padStart(3, '0')),
                order: e.order ?? i,
            }));
            return {
                ...state,
                epsNodes,
                projects: action.state.projects,
                expandedIds: new Set(action.state.expandedIds),
                activeProjectId: action.state.activeProjectId,
            };
        }

        case 'ADD_EPS': {
            const epsCount = state.epsNodes.length + 1;
            const maxOrder = state.epsNodes.filter(e => e.parentId === action.parentId).reduce((m, e) => Math.max(m, e.order ?? 0), -1);
            const node: EPSNode = {
                id: 'eps_' + uid(),
                name: action.name,
                epsCode: action.epsCode || ('EPS-' + String(epsCount).padStart(3, '0')),
                parentId: action.parentId,
                type: 'eps',
                order: maxOrder + 1,
            };
            const expanded = new Set(state.expandedIds);
            if (action.parentId) expanded.add(action.parentId);
            return { ...state, epsNodes: [...state.epsNodes, node], expandedIds: expanded, selectedId: node.id };
        }

        case 'RENAME_EPS': {
            return {
                ...state,
                epsNodes: state.epsNodes.map(e => e.id === action.id ? { ...e, name: action.name } : e),
            };
        }

        case 'UPDATE_EPS': {
            return {
                ...state,
                epsNodes: state.epsNodes.map(e => e.id === action.id ? { ...e, ...action.updates } : e),
            };
        }

        case 'DELETE_EPS': {
            // Recursively collect EPS ids to delete
            const toDelete = new Set<string>();
            function collect(id: string) {
                toDelete.add(id);
                state.epsNodes.filter(e => e.parentId === id).forEach(e => collect(e.id));
            }
            collect(action.id);
            // Also delete projects inside those EPS folders → move to root
            const updatedProjects = state.projects.map(p =>
                p.epsId && toDelete.has(p.epsId) ? { ...p, epsId: null } : p
            );
            return {
                ...state,
                epsNodes: state.epsNodes.filter(e => !toDelete.has(e.id)),
                projects: updatedProjects,
                selectedId: state.selectedId && toDelete.has(state.selectedId) ? null : state.selectedId,
            };
        }

        case 'ADD_PROJECT': {
            const now = nowISO();
            const proj: ProjectMeta = {
                id: 'proj_' + uid(),
                epsId: action.epsId,
                name: action.name,
                code: action.code,
                priority: state.projects.length + 1,
                description: '',
                status: 'Planificación',
                startDate: null,
                endDate: null,
                statusDate: null,
                activityCount: 0,
                completedCount: 0,
                criticalCount: 0,
                globalPct: 0,
                plannedPct: 0,
                createdAt: now,
                updatedAt: now,
                supabaseId: null,
                duration: 0,
                remainingDur: 0,
                work: 0,
                actualWork: 0,
                remainingWork: 0,
                pctProg: 0,
                weight: null,
                resources: '',
                ...(action.initialData || {}),
            };
            // If no endDate but startDate exists, set endDate = startDate so bar doesn't extend
            if (!proj.endDate && proj.startDate) proj.endDate = proj.startDate;
            const expanded = new Set(state.expandedIds);
            if (action.epsId) expanded.add(action.epsId);
            return { ...state, projects: [...state.projects, proj], expandedIds: expanded, selectedId: proj.id };
        }

        case 'UPDATE_PROJECT': {
            return {
                ...state,
                projects: state.projects.map(p =>
                    p.id === action.id ? { ...p, ...action.updates, updatedAt: nowISO() } : p
                ),
            };
        }

        case 'DELETE_PROJECT': {
            // Also remove saved project state from localStorage
            try { localStorage.removeItem(PROJECT_PREFIX + action.id); } catch { }
            return {
                ...state,
                projects: state.projects.filter(p => p.id !== action.id),
                selectedId: state.selectedId === action.id ? null : state.selectedId,
                activeProjectId: state.activeProjectId === action.id ? null : state.activeProjectId,
            };
        }

        case 'TOGGLE_EXPAND': {
            const expanded = new Set(state.expandedIds);
            if (expanded.has(action.id)) expanded.delete(action.id);
            else expanded.add(action.id);
            return { ...state, expandedIds: expanded };
        }

        case 'SELECT':
            return { ...state, selectedId: action.id };

        case 'SET_ACTIVE_PROJECT':
            return { ...state, activeProjectId: action.id };

        case 'EXPAND_ALL': {
            const all = new Set(state.epsNodes.map(e => e.id));
            return { ...state, expandedIds: all };
        }

        case 'COLLAPSE_ALL':
            return { ...state, expandedIds: new Set<string>() };

        case 'CUT_PROJECT':
            return { ...state, clipboard: { mode: 'cut', projectId: action.id } };

        case 'COPY_PROJECT':
            return { ...state, clipboard: { mode: 'copy', projectId: action.id } };

        case 'PASTE_PROJECT': {
            if (!state.clipboard) return state;
            const src = state.projects.find(p => p.id === state.clipboard!.projectId);
            if (!src) return { ...state, clipboard: null };

            if (state.clipboard.mode === 'cut') {
                // Move the project to the target EPS
                return {
                    ...state,
                    projects: state.projects.map(p =>
                        p.id === src.id ? { ...p, epsId: action.targetEpsId, updatedAt: nowISO() } : p
                    ),
                    clipboard: null,
                };
            } else {
                // Copy: create a duplicate with new ID
                const copy: ProjectMeta = {
                    ...src,
                    id: 'proj_' + uid(),
                    epsId: action.targetEpsId,
                    name: src.name + ' (Copia)',
                    code: src.code + '-C',
                    createdAt: nowISO(),
                    updatedAt: nowISO(),
                    supabaseId: null,
                };
                const expanded = new Set(state.expandedIds);
                if (action.targetEpsId) expanded.add(action.targetEpsId);
                return {
                    ...state,
                    projects: [...state.projects, copy],
                    expandedIds: expanded,
                    selectedId: copy.id,
                    clipboard: null,
                };
            }
        }

        case 'MOVE_PROJECT': {
            return {
                ...state,
                projects: state.projects.map(p =>
                    p.id === action.id ? { ...p, epsId: action.targetEpsId, updatedAt: nowISO() } : p
                ),
            };
        }

        case 'INDENT': {
            // Make the selected node a child of the nearest sibling EPS above it
            const tree = buildTree(state.epsNodes, state.projects, state.expandedIds);
            const idx = tree.findIndex(n => (n.kind === 'eps' ? n.data.id : n.data.id) === action.id);
            if (idx <= 0) return state;
            const node = tree[idx];
            let targetEps: string | null = null;
            for (let i = idx - 1; i >= 0; i--) {
                if (tree[i].kind === 'eps' && tree[i].depth === node.depth) {
                    targetEps = tree[i].data.id;
                    break;
                }
            }
            if (!targetEps) return state;
            const isEps = state.epsNodes.some(e => e.id === action.id);
            const expanded = new Set(state.expandedIds);
            expanded.add(targetEps);
            if (isEps) {
                return { ...state, epsNodes: state.epsNodes.map(e => e.id === action.id ? { ...e, parentId: targetEps } : e), expandedIds: expanded };
            } else {
                return { ...state, projects: state.projects.map(p => p.id === action.id ? { ...p, epsId: targetEps } : p), expandedIds: expanded };
            }
        }

        case 'OUTDENT': {
            const isEps = state.epsNodes.some(e => e.id === action.id);
            if (isEps) {
                const node = state.epsNodes.find(e => e.id === action.id);
                if (!node || !node.parentId) return state;
                const parent = state.epsNodes.find(e => e.id === node.parentId);
                return { ...state, epsNodes: state.epsNodes.map(e => e.id === action.id ? { ...e, parentId: parent?.parentId || null } : e) };
            } else {
                const proj = state.projects.find(p => p.id === action.id);
                if (!proj || !proj.epsId) return state;
                const parentEps = state.epsNodes.find(e => e.id === proj.epsId);
                return { ...state, projects: state.projects.map(p => p.id === action.id ? { ...p, epsId: parentEps?.parentId || null } : p) };
            }
        }

        case 'MOVE_EPS_UP': {
            const node = state.epsNodes.find(e => e.id === action.id);
            if (!node) return state;
            const siblings = state.epsNodes.filter(e => e.parentId === node.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const idx = siblings.findIndex(e => e.id === node.id);
            if (idx <= 0) return state;
            const prev = siblings[idx - 1];
            return { ...state, epsNodes: state.epsNodes.map(e => e.id === node.id ? { ...e, order: prev.order ?? 0 } : e.id === prev.id ? { ...e, order: node.order ?? 0 } : e) };
        }

        case 'MOVE_EPS_DOWN': {
            const node = state.epsNodes.find(e => e.id === action.id);
            if (!node) return state;
            const siblings = state.epsNodes.filter(e => e.parentId === node.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const idx = siblings.findIndex(e => e.id === node.id);
            if (idx < 0 || idx >= siblings.length - 1) return state;
            const next = siblings[idx + 1];
            return { ...state, epsNodes: state.epsNodes.map(e => e.id === node.id ? { ...e, order: next.order ?? 0 } : e.id === next.id ? { ...e, order: node.order ?? 0 } : e) };
        }

        case 'SYNC_FROM_SUPABASE': {
            // Full bidirectional sync with Supabase:
            // 1. Remove local projects whose supabaseId no longer exists in Supabase
            // 2. Add Supabase projects not yet in the local portfolio
            const supabaseIds = new Set(action.supabaseProjects.map(sp => sp.id));
            const existingSupaIds = new Set(state.projects.map(p => p.supabaseId).filter(Boolean));

            // Prune: remove projects whose supabaseId was deleted from Supabase
            let projects = state.projects.filter(p => {
                if (!p.supabaseId) return true; // local-only projects stay
                return supabaseIds.has(p.supabaseId); // keep only if still in Supabase
            });

            // Add: new Supabase projects not yet tracked locally
            const currentSupaIds = new Set(projects.map(p => p.supabaseId).filter(Boolean));
            const newProjects = action.supabaseProjects.filter(sp => !currentSupaIds.has(sp.id));

            if (newProjects.length === 0 && projects.length === state.projects.length) return state;

            // Ensure at least one EPS exists — create a default if empty
            let epsNodes = [...state.epsNodes];
            let defaultEpsId: string;
            if (epsNodes.length > 0) {
                // Use the first root EPS
                const rootEps = epsNodes.filter(e => !e.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                defaultEpsId = rootEps.length > 0 ? rootEps[0].id : epsNodes[0].id;
            } else {
                // Create a default EPS
                defaultEpsId = 'eps_' + uid();
                epsNodes.push({
                    id: defaultEpsId,
                    name: 'Proyectos',
                    epsCode: 'EPS-001',
                    parentId: null,
                    type: 'eps',
                    order: 0,
                });
            }

            const now = nowISO();
            const baseCount = projects.length;
            newProjects.forEach((sp, i) => {
                const prjCode = 'PRY-' + String(baseCount + i + 1).padStart(3, '0');
                projects.push({
                    id: 'proj_' + uid(),
                    epsId: defaultEpsId,
                    name: sp.projName,
                    code: prjCode,
                    priority: baseCount + i + 1,
                    description: '',
                    status: 'Planificación',
                    startDate: sp.projStart,
                    endDate: sp.projStart, // same as start until opened
                    statusDate: sp.statusDate,
                    activityCount: 0,
                    completedCount: 0,
                    criticalCount: 0,
                    globalPct: 0,
                    plannedPct: 0,
                    createdAt: now,
                    updatedAt: now,
                    supabaseId: sp.id,
                    duration: 0,
                    remainingDur: 0,
                    work: 0,
                    actualWork: 0,
                    remainingWork: 0,
                    pctProg: 0,
                    weight: null,
                    resources: '',
                });
            });

            const expanded = new Set(state.expandedIds);
            expanded.add(defaultEpsId);

            // Clean up activeProjectId if the active project was deleted
            const activeProjectId = state.activeProjectId && projects.some(p => p.id === state.activeProjectId)
                ? state.activeProjectId
                : null;

            return { ...state, epsNodes, projects, expandedIds: expanded, activeProjectId };
        }

        case 'REFRESH_SUMMARIES': {
            // Update projects with summary data fetched from Supabase activities
            // summaries is keyed by supabaseId
            let changed = false;
            const updatedProjects = state.projects.map(p => {
                if (!p.supabaseId || !action.summaries[p.supabaseId]) return p;
                changed = true;
                return { ...p, ...action.summaries[p.supabaseId], updatedAt: nowISO() };
            });
            return changed ? { ...state, projects: updatedProjects } : state;
        }

        default:
            return state;
    }
}

// ─── Context ────────────────────────────────────────────────────
interface PortfolioContextValue {
    state: PortfolioState;
    dispatch: React.Dispatch<PortfolioAction>;
    treeNodes: TreeNode[];
    savePortfolio: () => void;
    saveProjectState: (projectId: string, ganttState: any) => void;
    loadProjectState: (projectId: string) => any | null;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function usePortfolio() {
    const ctx = useContext(PortfolioContext);
    if (!ctx) throw new Error('usePortfolio must be inside PortfolioProvider');
    return ctx;
}

// ─── Provider ───────────────────────────────────────────────────

/** Serialize portfolio state for localStorage */
function serializePortfolio(state: PortfolioState): string {
    return JSON.stringify({
        epsNodes: state.epsNodes,
        projects: state.projects,
        expandedIds: Array.from(state.expandedIds),
        activeProjectId: state.activeProjectId,
    });
}

// Stamp to prevent re-loading our own writes from the storage event
let _lastWriteStamp = 0;

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
    // Synchronous init from localStorage — first render has correct data
    const [state, dispatch] = useReducer(portfolioReducer, undefined as any, loadInitialState);

    // ── IMMEDIATE save on every state change (no debounce) ──────
    // This runs after every render where epsNodes/projects/expanded/active changed.
    // No setTimeout means no cleanup can cancel it in StrictMode.
    useEffect(() => {
        try {
            _lastWriteStamp = Date.now();
            localStorage.setItem(STORAGE_KEY, serializePortfolio(state));
        } catch (e) {
            console.error('Failed to save portfolio', e);
        }
    }, [state.epsNodes, state.projects, state.expandedIds, state.activeProjectId]);

    // ── Load portfolio from Supabase on mount (source of truth) ──
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // 1. Try loading full portfolio structure from Supabase
                const sbPortfolio = await loadPortfolioFromSupabase();
                if (cancelled) return;

                if (sbPortfolio && (sbPortfolio.epsNodes.length > 0 || sbPortfolio.projects.length > 0)) {
                    // Supabase has portfolio data → load it (source of truth)
                    dispatch({
                        type: 'LOAD',
                        state: {
                            epsNodes: sbPortfolio.epsNodes,
                            projects: sbPortfolio.projects,
                            expandedIds: sbPortfolio.expandedIds,
                            activeProjectId: sbPortfolio.activeProjectId,
                        },
                    });
                }
                // 2. Always sync with gantt_projects to pick up any newly created ones
                const sbProjects = await listSupabaseProjects();
                if (cancelled || sbProjects.length === 0) return;
                dispatch({ type: 'SYNC_FROM_SUPABASE', supabaseProjects: sbProjects });

                // 3. Fetch activity-level summaries (duration, work, % avance, etc.)
                const projectIds = sbProjects.map(p => p.id);
                const summaries = await fetchProjectSummaries(projectIds);
                if (cancelled) return;
                if (Object.keys(summaries).length > 0) {
                    dispatch({ type: 'REFRESH_SUMMARIES', summaries });
                }
            } catch (e) {
                console.warn('Could not load portfolio from Supabase:', e);
                // Fallback: try syncing just the project list + summaries
                try {
                    const sbProjects = await listSupabaseProjects();
                    if (cancelled || sbProjects.length === 0) return;
                    dispatch({ type: 'SYNC_FROM_SUPABASE', supabaseProjects: sbProjects });
                    const projectIds = sbProjects.map(p => p.id);
                    const summaries = await fetchProjectSummaries(projectIds);
                    if (cancelled) return;
                    if (Object.keys(summaries).length > 0) {
                        dispatch({ type: 'REFRESH_SUMMARIES', summaries });
                    }
                } catch { /* ignore */ }
            }
        })();
        return () => { cancelled = true; };
    }, []); // run once on mount

    // ── Debounced save portfolio to Supabase on state changes ──
    const sbSaveTimeoutRef = useRef<number | null>(null);
    useEffect(() => {
        if (sbSaveTimeoutRef.current) clearTimeout(sbSaveTimeoutRef.current);
        sbSaveTimeoutRef.current = window.setTimeout(async () => {
            try {
                await savePortfolioToSupabase({
                    epsNodes: state.epsNodes,
                    projects: state.projects,
                    expandedIds: Array.from(state.expandedIds),
                    activeProjectId: state.activeProjectId,
                });
            } catch (e) {
                console.warn('Failed to save portfolio to Supabase:', e);
            }
        }, 2000);
        return () => { if (sbSaveTimeoutRef.current) clearTimeout(sbSaveTimeoutRef.current); };
    }, [state.epsNodes, state.projects, state.expandedIds, state.activeProjectId]);

    // ── Auto-create Supabase project for any project without supabaseId ──
    const creatingRef = useRef(new Set<string>());
    useEffect(() => {
        const unlinked = state.projects.filter(p => !p.supabaseId && !creatingRef.current.has(p.id));
        if (unlinked.length === 0) return;
        let cancelled = false;
        (async () => {
            for (const proj of unlinked) {
                if (cancelled) return;
                creatingRef.current.add(proj.id);
                try {
                    const sbId = await createSupabaseProject(proj.name, proj.startDate, undefined, proj.statusDate);
                    if (cancelled) return;
                    dispatch({ type: 'UPDATE_PROJECT', id: proj.id, updates: { supabaseId: sbId } });
                } catch (e) {
                    console.warn('Failed to auto-create Supabase project for', proj.name, e);
                    creatingRef.current.delete(proj.id); // allow retry
                }
            }
        })();
        return () => { cancelled = true; };
    }, [state.projects]);

    // ── Cross-tab sync via storage event ────────────────────────
    // Fires ONLY when a DIFFERENT tab writes to our localStorage key.
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key !== STORAGE_KEY || !e.newValue) return;
            // Ignore our own writes (within last 500ms)
            if (Date.now() - _lastWriteStamp < 500) return;
            try {
                const data = JSON.parse(e.newValue);
                dispatch({
                    type: 'LOAD',
                    state: {
                        epsNodes: data.epsNodes || [],
                        projects: data.projects || [],
                        expandedIds: data.expandedIds || [],
                        activeProjectId: data.activeProjectId || null,
                    },
                });
            } catch { /* ignore malformed data */ }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    // ── beforeunload backup (last resort) ───────────────────────
    useEffect(() => {
        const handleBeforeUnload = () => {
            try {
                localStorage.setItem(STORAGE_KEY, serializePortfolio(state));
            } catch { /* ignore */ }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [state]);

    // ── Public savePortfolio (for explicit / external calls) ────
    const savePortfolio = useCallback(() => {
        try {
            _lastWriteStamp = Date.now();
            localStorage.setItem(STORAGE_KEY, serializePortfolio(state));
        } catch (e) {
            console.error('Failed to save portfolio', e);
        }
    }, [state]);

    // Save an individual project's gantt state
    const saveProjectState = useCallback((projectId: string, ganttState: any) => {
        try {
            localStorage.setItem(PROJECT_PREFIX + projectId, JSON.stringify(ganttState));
        } catch (e) {
            console.error('Failed to save project state', e);
        }
    }, []);

    // Load an individual project's gantt state
    const loadProjectState = useCallback((projectId: string): any | null => {
        try {
            const raw = localStorage.getItem(PROJECT_PREFIX + projectId);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error('Failed to load project state', e);
            return null;
        }
    }, []);

    // Build tree for rendering
    const treeNodes = React.useMemo(
        () => buildTree(state.epsNodes, state.projects, state.expandedIds),
        [state.epsNodes, state.projects, state.expandedIds]
    );

    return (
        <PortfolioContext.Provider value={{ state, dispatch, treeNodes, savePortfolio, saveProjectState, loadProjectState }}>
            {children}
        </PortfolioContext.Provider>
    );
}
