// ═══════════════════════════════════════════════════════════════════
// App.tsx – Main application layout with resize handles,
// keyboard shortcuts, and modal integration
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback } from 'react';
import { GanttProvider, useGantt } from './store/GanttContext';
import Ribbon from './components/Ribbon';
import GanttTable from './components/GanttTable';
import GanttTimeline from './components/GanttTimeline';
import TaskForm from './components/TaskForm';
import ActivityDetailPanel from './components/ActivityDetailPanel';
import ResourceSheet from './components/ResourceSheet';
import ActivityModal from './components/modals/ActivityModal';
import ProjectModal from './components/modals/ProjectModal';
import LinkModal from './components/modals/LinkModal';
import SupabaseModal from './components/modals/SupabaseModal';
import SaveProgressModal from './components/modals/SaveProgressModal';
import BaselineModal from './components/modals/BaselineModal';
import CalendarModal from './components/modals/CalendarModal';
import CheckThresholdsModal from './components/modals/CheckThresholdsModal';
import FilterModal from './components/modals/FilterModal';
import SCurveChart from './components/SCurveChart';
import TaskUsageGrid from './components/TaskUsageGrid';
import ResourceUsageTable from './components/ResourceUsageTable';
import ResourceUsageGrid from './components/ResourceUsageGrid';
import ResourceForm from './components/ResourceForm';
import ModuleTabs, { type ModuleId } from './components/ModuleTabs';
import InicioPage from './components/modules/InicioPage';
import LookAheadPage from './components/modules/LookAheadPage';
import DashboardPage from './components/modules/DashboardPage';
import ConfigPage from './components/modules/ConfigPage';
import WhatIfPage from './components/modules/WhatIfPage';
import ProjectsPage from './components/modules/ProjectsPage';
import { PortfolioProvider, usePortfolio } from './store/PortfolioContext';
import { newActivity } from './utils/cpm';
import { autoId } from './utils/helpers';
import { saveToSupabase, loadFromSupabase } from './utils/supabaseSync';

/** Restore ISO-string dates back to Date objects in a saved project snapshot */
function restoreDatesFromSaved(saved: any): any {
  if (saved.projStart && typeof saved.projStart === 'string') saved.projStart = new Date(saved.projStart);
  if (saved.statusDate && typeof saved.statusDate === 'string') saved.statusDate = new Date(saved.statusDate);
  if (saved.activities) {
    saved.activities = saved.activities.map((a: any) => ({
      ...a,
      ES: a.ES ? new Date(a.ES) : null,
      EF: a.EF ? new Date(a.EF) : null,
      LS: a.LS ? new Date(a.LS) : null,
      LF: a.LF ? new Date(a.LF) : null,
      blES: a.blES ? new Date(a.blES) : null,
      blEF: a.blEF ? new Date(a.blEF) : null,
      _remES: a._remES ? new Date(a._remES) : null,
      _remEF: a._remEF ? new Date(a._remEF) : null,
      collapsed: undefined,
      baselines: (a.baselines || []).map((bl: any) => bl ? {
        ...bl,
        ES: bl.ES ? new Date(bl.ES) : null,
        EF: bl.EF ? new Date(bl.EF) : null,
      } : null),
    }));
  }
  return saved;
}

/** Serialize GanttState to a plain JSON-safe object for localStorage */
function serializeGanttState(state: any): any {
  return {
    projName: state.projName,
    projStart: state.projStart instanceof Date ? state.projStart.toISOString() : state.projStart,
    defCal: state.defCal,
    statusDate: state.statusDate instanceof Date ? state.statusDate.toISOString() : state.statusDate,
    activities: state.activities.map((a: any) => ({
      ...a,
      ES: a.ES ? (a.ES instanceof Date ? a.ES.toISOString() : a.ES) : null,
      EF: a.EF ? (a.EF instanceof Date ? a.EF.toISOString() : a.EF) : null,
      LS: a.LS ? (a.LS instanceof Date ? a.LS.toISOString() : a.LS) : null,
      LF: a.LF ? (a.LF instanceof Date ? a.LF.toISOString() : a.LF) : null,
      blES: a.blES ? (a.blES instanceof Date ? a.blES.toISOString() : a.blES) : null,
      blEF: a.blEF ? (a.blEF instanceof Date ? a.blEF.toISOString() : a.blEF) : null,
      _remES: a._remES ? (a._remES instanceof Date ? a._remES.toISOString() : a._remES) : null,
      _remEF: a._remEF ? (a._remEF instanceof Date ? a._remEF.toISOString() : a._remEF) : null,
      baselines: (a.baselines || []).map((bl: any) => bl ? {
        ...bl,
        ES: bl.ES ? (bl.ES instanceof Date ? bl.ES.toISOString() : bl.ES) : null,
        EF: bl.EF ? (bl.EF instanceof Date ? bl.EF.toISOString() : bl.EF) : null,
      } : null),
    })),
    resourcePool: state.resourcePool,
    progressHistory: state.progressHistory,
    ppcHistory: state.ppcHistory,
    leanRestrictions: state.leanRestrictions,
    scenarios: state.scenarios ? state.scenarios.map((sc: any) => ({
      ...sc,
      activities: (sc.activities || []).map((a: any) => ({
        ...a,
        ES: a.ES ? (a.ES instanceof Date ? a.ES.toISOString() : a.ES) : null,
        EF: a.EF ? (a.EF instanceof Date ? a.EF.toISOString() : a.EF) : null,
        LS: a.LS ? (a.LS instanceof Date ? a.LS.toISOString() : a.LS) : null,
        LF: a.LF ? (a.LF instanceof Date ? a.LF.toISOString() : a.LF) : null,
        blES: a.blES ? (a.blES instanceof Date ? a.blES.toISOString() : a.blES) : null,
        blEF: a.blEF ? (a.blEF instanceof Date ? a.blEF.toISOString() : a.blEF) : null,
      })),
    })) : [],
    customCalendars: state.customCalendars,
    customFilters: state.customFilters,
    filtersMatchAll: state.filtersMatchAll,
    activeBaselineIdx: state.activeBaselineIdx,
    showProjRow: state.showProjRow,
  };
}

function AppInner() {
  const { state, dispatch } = useGantt();
  const { state: pState, dispatch: pDispatch, saveProjectState, loadProjectState } = usePortfolio();
  const [formH, setFormH] = useState(200);
  const [resizing, setResizing] = useState<'v' | 'h' | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    const saved = localStorage.getItem('gantt_active_module');
    const valid: ModuleId[] = ['inicio', 'projects', 'gantt', 'lookAhead', 'dashboard', 'whatIf', 'config'];
    return saved && valid.includes(saved as ModuleId) ? saved as ModuleId : 'projects';
  });

  const hasActiveProject = !!pState.activeProjectId;
  const containerRef = useRef<HTMLDivElement>(null);

  // Theme toggle on body
  useEffect(() => {
    const html = document.documentElement;
    if (state.lightMode) html.classList.add('light');
    else html.classList.remove('light');
  }, [state.lightMode]);

  const loadDemoData = useCallback(() => {
    const d = state.defCal;
    const acts = [
      { ...newActivity('PROY', d), name: 'Mi Proyecto', type: 'summary' as const, lv: -1, _isProjRow: true },
      { ...newActivity('A1000', d), name: 'Resumen', type: 'summary' as const, lv: 0, dur: 0 },
      { ...newActivity('A1010', d), name: 'Excavación', type: 'task' as const, lv: 1, dur: 10, remDur: null, res: 'Panexero', work: 500 },
      { ...newActivity('A1020', d), name: 'Excavación', type: 'task' as const, lv: 1, dur: 6, remDur: null, preds: [{ id: 'A1010', type: 'FS' as const, lag: 0 }], res: 'Panexero; Carpintero', work: 1500 },
      { ...newActivity('A1030', d), name: 'Actividad 3', type: 'task' as const, lv: 1, dur: 21, remDur: null, preds: [{ id: 'A1010', type: 'SS' as const, lag: 0 }], res: 'Carpintero; Marinero', work: 0 },
      { ...newActivity('A1040', d), name: 'Resumen 2', type: 'summary' as const, lv: 0, dur: 0 },
      { ...newActivity('A1050', d), name: 'Actividad 4', type: 'task' as const, lv: 1, dur: 5, remDur: null, preds: [{ id: 'A1000', type: 'FS' as const, lag: 0 }], res: 'Deivy', work: 2000 },
      { ...newActivity('A1060', d), name: 'Actividad 5', type: 'task' as const, lv: 1, dur: 5, remDur: null, preds: [{ id: 'A1000', type: 'FS' as const, lag: 0 }, { id: 'A1010', type: 'FS' as const, lag: 0 }], res: 'Alexander', work: 700 },
    ];
    dispatch({ type: 'SET_ACTIVITIES', activities: acts });
  }, [state.defCal, dispatch]);

  const saveTimeoutRef = useRef<number | null>(null);

  // 1. Initial Load – restore active project from localStorage or Supabase
  useEffect(() => {
    const initApp = async () => {
      // Try Supabase first (if a remote project is linked)
      const pid = typeof window !== 'undefined' ? localStorage.getItem('sb_current_project_id') : null;
      if (pid) {
        try {
          const data = await loadFromSupabase(pid);
          if (data.projName) dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: data.projName, projStart: data.projStart, defCal: data.defCal, statusDate: data.statusDate || undefined, customFilters: data.customFilters || [], filtersMatchAll: data.filtersMatchAll !== undefined ? data.filtersMatchAll : true } });
          if (data.resourcePool) dispatch({ type: 'SET_RESOURCES', resources: data.resourcePool });
          if (data.activities && data.activities.length) dispatch({ type: 'SET_ACTIVITIES', activities: data.activities });
          if (data.progressHistory) dispatch({ type: 'SET_PROGRESS_HISTORY', history: data.progressHistory });
          if (data.ppcHistory && data.ppcHistory.length) dispatch({ type: 'SET_PPC_HISTORY', history: data.ppcHistory });
          if (data.leanRestrictions && data.leanRestrictions.length) dispatch({ type: 'SET_LEAN_RESTRICTIONS', restrictions: data.leanRestrictions });
          if ((data as any).scenarios && (data as any).scenarios.length) dispatch({ type: 'SET_SCENARIOS', scenarios: (data as any).scenarios });
          return;
        } catch (err) {
          console.warn('Could not auto-load from Supabase, starting fresh', err);
        }
      }
      // Try loading active project from local portfolio (pState is already synchronously loaded)
      const activeId = pState.activeProjectId;
      if (activeId) {
        const saved = loadProjectState(activeId);
        if (saved) {
          restoreDatesFromSaved(saved);
          dispatch({ type: 'LOAD_STATE', state: saved });
          console.log('Restored project from local storage:', activeId);
          return;
        }
        // No local state — check if project has a Supabase link
        const proj = pState.projects.find(p => p.id === activeId);
        if (proj?.supabaseId) {
          try {
            const data = await loadFromSupabase(proj.supabaseId);
            if (data.projName) dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: data.projName, projStart: data.projStart, defCal: data.defCal, statusDate: data.statusDate || undefined, customFilters: data.customFilters || [], filtersMatchAll: data.filtersMatchAll !== undefined ? data.filtersMatchAll : true } });
            if (data.resourcePool) dispatch({ type: 'SET_RESOURCES', resources: data.resourcePool });
            if (data.activities && data.activities.length) dispatch({ type: 'SET_ACTIVITIES', activities: data.activities });
            if (data.progressHistory) dispatch({ type: 'SET_PROGRESS_HISTORY', history: data.progressHistory });
            if (data.ppcHistory && data.ppcHistory.length) dispatch({ type: 'SET_PPC_HISTORY', history: data.ppcHistory });
            if (data.leanRestrictions && data.leanRestrictions.length) dispatch({ type: 'SET_LEAN_RESTRICTIONS', restrictions: data.leanRestrictions });
            if ((data as any).scenarios && (data as any).scenarios.length) dispatch({ type: 'SET_SCENARIOS', scenarios: (data as any).scenarios });
            localStorage.setItem('sb_current_project_id', proj.supabaseId);
            console.log('Restored project from Supabase:', proj.supabaseId);
            return;
          } catch (err) {
            console.warn('Could not load project from Supabase:', err);
          }
        }
      }
      // Fallback: demo data (only if no portfolio project exists at all)
      if (pState.projects.length === 0) {
        loadDemoData();
      }
    };
    initApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — pState is synchronously available

  // 2. Auto-save on state changes (only if a project is already connected)
  useEffect(() => {
    if (!state.activities.length) return;
    const pid = localStorage.getItem('sb_current_project_id');
    if (!pid) return; // No auto-create — user must create/load a project first
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(async () => {
      const currentPid = localStorage.getItem('sb_current_project_id');
      if (!currentPid) return;
      try {
        const newId = await saveToSupabase(state, currentPid);
        if (newId && newId !== currentPid) localStorage.setItem('sb_current_project_id', newId);
        console.log('Auto-saved to Supabase');
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 800);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [state.activities, state.resourcePool, state.projName, state.projStart, state.defCal, state.statusDate, state.ppcHistory, state.leanRestrictions, state.progressHistory, state.scenarios]);

  // 3. Listen to Supabase Events
  useEffect(() => {
    const handleLoad = async (e: any) => {
      const pid = e.detail?.projectId;
      if (!pid) return;
      try {
        const data = await loadFromSupabase(pid);
        dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: data.projName, projStart: data.projStart, defCal: data.defCal, statusDate: data.statusDate || undefined, customFilters: data.customFilters || [], filtersMatchAll: data.filtersMatchAll !== undefined ? data.filtersMatchAll : true } });
        dispatch({ type: 'SET_RESOURCES', resources: data.resourcePool || [] });
        dispatch({ type: 'SET_ACTIVITIES', activities: data.activities || [] });
        dispatch({ type: 'SET_PROGRESS_HISTORY', history: data.progressHistory || [] });
        if (data.ppcHistory && data.ppcHistory.length) dispatch({ type: 'SET_PPC_HISTORY', history: data.ppcHistory });
        if (data.leanRestrictions && data.leanRestrictions.length) dispatch({ type: 'SET_LEAN_RESTRICTIONS', restrictions: data.leanRestrictions });
        if ((data as any).scenarios && (data as any).scenarios.length) dispatch({ type: 'SET_SCENARIOS', scenarios: (data as any).scenarios });
        localStorage.setItem('sb_current_project_id', pid);
        alert('Proyecto cargado exitosamente');
      } catch (err: any) {
        alert('Error al cargar proyecto: ' + err.message);
      }
    };
    const handleForceSave = async (e?: any) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      const silent = e?.detail?.silent === true;
      const pid = localStorage.getItem('sb_current_project_id');
      if (!pid) {
        if (!silent) alert('No hay proyecto conectado. Cree o cargue un proyecto primero desde Configuración.');
        return;
      }
      try {
        const newId = await saveToSupabase(state, pid);
        if (newId && newId !== pid) localStorage.setItem('sb_current_project_id', newId);
        if (!silent) alert('Proyecto guardado exitosamente');
        else console.log('Silent save to Supabase completed');
      } catch (err: any) {
        if (!silent) alert('Error al guardar: ' + err.message);
        else console.error('Silent save error:', err);
      }
    };
    window.addEventListener('sb-load-project', handleLoad as any);
    window.addEventListener('sb-force-save', handleForceSave as any);
    return () => {
      window.removeEventListener('sb-load-project', handleLoad as any);
      window.removeEventListener('sb-force-save', handleForceSave as any);
    };
  }, [state, dispatch]);

  // Vertical resize (table ↔ chart)
  useEffect(() => {
    if (resizing !== 'v') return;
    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dispatch({ type: 'SET_TABLE_W', width: Math.max(200, Math.min(e.clientX - rect.left, window.innerWidth - 200)) });
    };
    const handleUp = () => { setResizing(null); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
  }, [resizing]);

  // Horizontal resize (gantt ↔ form)
  useEffect(() => {
    if (resizing !== 'h') return;
    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setFormH(Math.max(60, Math.min(rect.bottom - e.clientY, 500)));
    };
    const handleUp = () => { setResizing(null); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
  }, [resizing]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check if editing contenteditable or input
    const tgt = e.target as HTMLElement;
    if (tgt.isContentEditable || tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT') {
      return;
    }
    if (e.key === 'Delete') {
      if (state.selIdx >= 0 && !state.activities[state.selIdx]?._isProjRow) {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'DELETE_ACTIVITY', index: state.selIdx });
      }
    } else if (e.key === 'Insert') {
      dispatch({ type: 'PUSH_UNDO' });
      const a = newActivity(autoId(state.activities), state.defCal);
      a.name = 'Nueva Actividad';
      dispatch({ type: 'ADD_ACTIVITY', activity: a, atIndex: state.selIdx >= 0 ? state.selIdx + 1 : undefined });
    } else if (e.ctrlKey && e.key === 'z') {
      e.preventDefault(); dispatch({ type: 'UNDO' });
    } else if (e.ctrlKey && e.key === 'x') {
      e.preventDefault(); dispatch({ type: 'CUT_ACTIVITY' });
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault(); dispatch({ type: 'COPY_ACTIVITY' });
    } else if (e.ctrlKey && e.key === 'v') {
      e.preventDefault(); dispatch({ type: 'PASTE_ACTIVITY' });
    } else if (e.ctrlKey && e.key === 'ArrowUp') {
      e.preventDefault(); dispatch({ type: 'MOVE_ROW', dir: -1 });
    } else if (e.ctrlKey && e.key === 'ArrowDown') {
      e.preventDefault(); dispatch({ type: 'MOVE_ROW', dir: 1 });
    } else if (e.key === 'ArrowUp' && !e.ctrlKey) {
      if (state.selIdx > 0) { e.preventDefault(); dispatch({ type: 'SET_SELECTION', index: state.selIdx - 1 }); }
    } else if (e.key === 'ArrowDown' && !e.ctrlKey) {
      if (state.selIdx < state.activities.length - 1) { e.preventDefault(); dispatch({ type: 'SET_SELECTION', index: state.selIdx + 1 }); }
    } else if (e.key === 'Escape') {
      dispatch({ type: 'CLOSE_ACT_MODAL' });
      dispatch({ type: 'CLOSE_PROJ_MODAL' });
      dispatch({ type: 'CLOSE_LINK_MODAL' });
      dispatch({ type: 'CLOSE_SB_MODAL' });
      dispatch({ type: 'CLOSE_CAL_MODAL' });
    }
  }, [state.selIdx, state.activities, state.defCal, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-save active portfolio project on window close / refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pState.activeProjectId && state.activities.length > 0) {
        const snapshot = serializeGanttState(state);
        try { localStorage.setItem('gantt-cpm-project-' + pState.activeProjectId, JSON.stringify(snapshot)); } catch { }
        // Update project metadata
        const tasks = state.activities.filter(a => (a.type === 'task' || a.type === 'milestone') && !a._isProjRow);
        const projRow = state.activities.find(a => a._isProjRow);
        const latestEF = tasks.reduce<Date | null>((max, a) => {
          if (a.EF && (!max || a.EF > max)) return a.EF;
          return max;
        }, null);
        const tw = projRow?.work || 0;
        const ew = tw * (projRow?.pct || 0) / 100;
        const meta = pState.projects.map(p => p.id === pState.activeProjectId ? {
          ...p, name: state.projName,
          activityCount: tasks.length,
          completedCount: tasks.filter(a => a.pct === 100).length,
          criticalCount: tasks.filter(a => a.crit).length,
          globalPct: state.progressHistory && state.progressHistory.length > 0
            ? Math.round((state.progressHistory[state.progressHistory.length - 1].actualPct || 0) * 10) / 10
            : (projRow ? Math.round((projRow.pct || 0) * 10) / 10 : 0),
          plannedPct: projRow ? Math.round((projRow._plannedPct || 0) * 10) / 10 : 0,
          startDate: state.projStart ? state.projStart.toISOString() : (p.startDate || null),
          endDate: latestEF ? latestEF.toISOString() : (state.projStart ? state.projStart.toISOString() : (p.endDate || null)),
          statusDate: state.statusDate ? state.statusDate.toISOString() : (p.statusDate || null),
          duration: projRow?.dur || p.duration || 0,
          remainingDur: projRow?.remDur || p.remainingDur || 0,
          work: tw || p.work || 0,
          actualWork: Math.round(ew) || p.actualWork || 0,
          remainingWork: Math.round(tw - ew) || p.remainingWork || 0,
          pctProg: projRow ? Math.round((projRow._plannedPct || 0) * 10) / 10 : p.pctProg || 0,
          weight: projRow?.weight ?? p.weight ?? null,
          resources: projRow?.res || p.resources || '',
          updatedAt: new Date().toISOString(),
        } : p);
        try {
          const portfolioData = {
            epsNodes: pState.epsNodes,
            projects: meta,
            expandedIds: Array.from(pState.expandedIds),
            activeProjectId: pState.activeProjectId,
          };
          localStorage.setItem('gantt-cpm-portfolio', JSON.stringify(portfolioData));
        } catch { }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pState, state]);

  const handleModuleChange = useCallback((m: ModuleId) => {
    // Auto-save current project state when navigating away from gantt modules
    if (pState.activeProjectId && state.activities.length > 0) {
      const snapshot = serializeGanttState(state);
      saveProjectState(pState.activeProjectId, snapshot);
      // Update project metadata
      const tasks = state.activities.filter(a => (a.type === 'task' || a.type === 'milestone') && !a._isProjRow);
      const projRow = state.activities.find(a => a._isProjRow);
      const latestEF = tasks.reduce<Date | null>((max, a) => {
        if (a.EF && (!max || a.EF > max)) return a.EF;
        return max;
      }, null);
      const totalWork = projRow?.work || 0;
      const earnedWork = totalWork * (projRow?.pct || 0) / 100;
      pDispatch({
        type: 'UPDATE_PROJECT', id: pState.activeProjectId, updates: {
          name: state.projName,
          activityCount: tasks.length,
          completedCount: tasks.filter(a => a.pct === 100).length,
          criticalCount: tasks.filter(a => a.crit).length,
          globalPct: state.progressHistory && state.progressHistory.length > 0
            ? Math.round((state.progressHistory[state.progressHistory.length - 1].actualPct || 0) * 10) / 10
            : (projRow ? Math.round((projRow.pct || 0) * 10) / 10 : 0),
          plannedPct: projRow ? Math.round((projRow._plannedPct || 0) * 10) / 10 : 0,
          startDate: state.projStart ? state.projStart.toISOString() : null,
          endDate: latestEF ? latestEF.toISOString() : (state.projStart ? state.projStart.toISOString() : null),
          statusDate: state.statusDate ? state.statusDate.toISOString() : null,
          supabaseId: localStorage.getItem('sb_current_project_id') || null,
          duration: projRow?.dur || 0,
          remainingDur: projRow?.remDur || 0,
          work: totalWork,
          actualWork: Math.round(earnedWork),
          remainingWork: Math.round(totalWork - earnedWork),
          pctProg: projRow ? Math.round((projRow._plannedPct || 0) * 10) / 10 : 0,
          weight: projRow?.weight ?? null,
          resources: projRow?.res || '',
        }
      });
    }
    setActiveModule(m);
    localStorage.setItem('gantt_active_module', m);
  }, [pState.activeProjectId, state, saveProjectState, pDispatch]);

  // ── Open a project from the portfolio ──
  const handleOpenProject = useCallback(async (projectId: string) => {
    // Save current project first if any
    if (pState.activeProjectId && pState.activeProjectId !== projectId && state.activities.length > 0) {
      const snapshot = serializeGanttState(state);
      saveProjectState(pState.activeProjectId, snapshot);
    }

    const proj = pState.projects.find(p => p.id === projectId);

    // Load the target project
    const saved = loadProjectState(projectId);
    if (saved) {
      restoreDatesFromSaved(saved);
      dispatch({ type: 'LOAD_STATE', state: saved });
      // Restore Supabase project ID link if available
      if (proj?.supabaseId) {
        localStorage.setItem('sb_current_project_id', proj.supabaseId);
      } else {
        localStorage.removeItem('sb_current_project_id');
      }
    } else if (proj?.supabaseId) {
      // No local state but project exists in Supabase — load from there
      try {
        const data = await loadFromSupabase(proj.supabaseId);
        if (data.projName) dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: data.projName, projStart: data.projStart, defCal: data.defCal, statusDate: data.statusDate || undefined, customFilters: data.customFilters || [], filtersMatchAll: data.filtersMatchAll !== undefined ? data.filtersMatchAll : true } });
        if (data.resourcePool) dispatch({ type: 'SET_RESOURCES', resources: data.resourcePool });
        if (data.activities && data.activities.length) dispatch({ type: 'SET_ACTIVITIES', activities: data.activities });
        if (data.progressHistory) dispatch({ type: 'SET_PROGRESS_HISTORY', history: data.progressHistory });
        if (data.ppcHistory && data.ppcHistory.length) dispatch({ type: 'SET_PPC_HISTORY', history: data.ppcHistory });
        if (data.leanRestrictions && data.leanRestrictions.length) dispatch({ type: 'SET_LEAN_RESTRICTIONS', restrictions: data.leanRestrictions });
        if ((data as any).scenarios && (data as any).scenarios.length) dispatch({ type: 'SET_SCENARIOS', scenarios: (data as any).scenarios });
        localStorage.setItem('sb_current_project_id', proj.supabaseId);
        console.log('Loaded project from Supabase:', proj.supabaseId);
      } catch (err) {
        console.error('Failed to load from Supabase, starting fresh:', err);
        const freshActs = [
          { ...newActivity('PROY', state.defCal), name: proj?.name || 'Nuevo Proyecto', type: 'summary' as const, lv: -1, _isProjRow: true },
        ];
        dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: proj?.name || 'Nuevo Proyecto', projStart: new Date(), defCal: 6 as any, statusDate: new Date() } });
        dispatch({ type: 'SET_ACTIVITIES', activities: freshActs });
        localStorage.removeItem('sb_current_project_id');
      }
    } else {
      // No saved state and no Supabase link — start fresh with project name
      const freshActs = [
        { ...newActivity('PROY', state.defCal), name: proj?.name || 'Nuevo Proyecto', type: 'summary' as const, lv: -1, _isProjRow: true },
      ];
      dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: proj?.name || 'Nuevo Proyecto', projStart: new Date(), defCal: 6 as any, statusDate: new Date() } });
      dispatch({ type: 'SET_ACTIVITIES', activities: freshActs });
      localStorage.removeItem('sb_current_project_id');
    }

    pDispatch({ type: 'SET_ACTIVE_PROJECT', id: projectId });
    setActiveModule('gantt');
    localStorage.setItem('gantt_active_module', 'gantt');
  }, [pState.activeProjectId, pState.projects, state, saveProjectState, loadProjectState, dispatch, pDispatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── Module Tabs ── */}
      <ModuleTabs active={activeModule} onChange={handleModuleChange} activeProjectName={pState.activeProjectId ? (pState.projects.find(p => p.id === pState.activeProjectId)?.name || null) : null} hasActiveProject={hasActiveProject} />

      {/* ── Module: Inicio ── */}
      {activeModule === 'inicio' && <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' }}><InicioPage onNavigate={handleModuleChange} /></div>}

      {/* ── Module: Proyectos (Portfolio) ── */}
      {activeModule === 'projects' && <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' }}><ProjectsPage onNavigate={handleModuleChange} onOpenProject={handleOpenProject} /></div>}

      {/* ── Module: Look Ahead ── */}
      {activeModule === 'lookAhead' && <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' }}><LookAheadPage /></div>}

      {/* ── Module: Dashboard ── */}
      {activeModule === 'dashboard' && <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' }}><DashboardPage /></div>}

      {/* ── Module: Configuración ── */}
      {activeModule === 'config' && <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' }}><ConfigPage /></div>}

      {/* ── Module: What-If Scenarios ── */}
      {activeModule === 'whatIf' && <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' }}><WhatIfPage /></div>}

      {/* ── Module: Carta Gantt (existing) ── */}
      {activeModule === 'gantt' && (<>
      <Ribbon />

      {state.currentView === 'resources' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ResourceSheet />
        </div>
      ) : state.currentView === 'scurve' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <SCurveChart />
        </div>
      ) : state.currentView === 'usage' ? (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Usage Area (Table | Resize | Grid) */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Table */}
            <div style={{ width: state.tableW, flexShrink: 0, overflow: 'hidden' }}>
              <GanttTable />
            </div>

            {/* Vertical Resize Handle */}
            <div className={`v-resize ${resizing === 'v' ? 'rsz' : ''}`}
              onMouseDown={() => setResizing('v')} />

            {/* Usage Grid */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TaskUsageGrid />
            </div>
          </div>

          {/* Horizontal Resize Handle */}
          <div className={`h-resize ${resizing === 'h' ? 'rsz' : ''}`}
            onMouseDown={() => setResizing('h')} />

          {/* Form Panel */}
          <div style={{ height: formH, flexShrink: 0, overflow: 'hidden' }}>
            <TaskForm />
          </div>
        </div>
      ) : state.currentView === 'resUsage' ? (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Resource Usage Area (Table | Resize | Grid) */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Table */}
            <div style={{ width: state.tableW, flexShrink: 0, overflow: 'hidden' }}>
              <ResourceUsageTable />
            </div>

            {/* Vertical Resize Handle */}
            <div className={`v-resize ${resizing === 'v' ? 'rsz' : ''}`}
              onMouseDown={() => setResizing('v')} />

            {/* Usage Grid */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ResourceUsageGrid />
            </div>
          </div>

          {/* Horizontal Resize Handle */}
          <div className={`h-resize ${resizing === 'h' ? 'rsz' : ''}`}
            onMouseDown={() => setResizing('h')} />

          {/* Form Panel */}
          <div style={{ height: formH, flexShrink: 0, overflow: 'hidden' }}>
            <ResourceForm />
          </div>
        </div>
      ) : (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Gantt Area (Table | Resize | Timeline) */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Table */}
            <div style={{ width: state.tableW, flexShrink: 0, overflow: 'hidden' }}>
              <GanttTable />
            </div>

            {/* Vertical Resize Handle */}
            <div className={`v-resize ${resizing === 'v' ? 'rsz' : ''}`}
              onMouseDown={() => setResizing('v')} />

            {/* Timeline */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <GanttTimeline />
            </div>
          </div>

          {/* Horizontal Resize Handle */}
          <div className={`h-resize ${resizing === 'h' ? 'rsz' : ''}`}
            onMouseDown={() => setResizing('h')} />

          {/* Form Panel */}
          <div style={{ height: formH, flexShrink: 0, overflow: 'hidden' }}>
            <ActivityDetailPanel />
          </div>
        </div>
      )}
      </>)}

      {/* Modals */}
      <ActivityModal />
      <ProjectModal />
      {/* Suppress LinkModal when a what-if scenario is active — WhatIfPage renders its own inside ScenarioGanttProvider */}
      {!(activeModule === 'whatIf' && state.activeScenarioId) && <LinkModal />}
      <SupabaseModal />
      <SaveProgressModal />
      <BaselineModal />
      <CalendarModal />
      <CheckThresholdsModal />
      <FilterModal />
    </div>
  );
}

export default function App() {
  return (
    <PortfolioProvider>
      <GanttProvider>
        <AppInner />
      </GanttProvider>
    </PortfolioProvider>
  );
}
