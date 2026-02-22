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
import ResourceSheet from './components/ResourceSheet';
import ActivityModal from './components/modals/ActivityModal';
import ProjectModal from './components/modals/ProjectModal';
import LinkModal from './components/modals/LinkModal';
import SupabaseModal from './components/modals/SupabaseModal';
import SaveProgressModal from './components/modals/SaveProgressModal';
import SCurveChart from './components/SCurveChart';
import TaskUsageGrid from './components/TaskUsageGrid';
import ResourceUsageTable from './components/ResourceUsageTable';
import ResourceUsageGrid from './components/ResourceUsageGrid';
import ResourceForm from './components/ResourceForm';
import { newActivity } from './utils/cpm';
import { autoId } from './utils/helpers';
import { saveToSupabase, loadFromSupabase } from './utils/supabaseSync';

function AppInner() {
  const { state, dispatch } = useGantt();
  const [formH, setFormH] = useState(200);
  const [resizing, setResizing] = useState<'v' | 'h' | null>(null);
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

  // 1. Initial Load & Auto-load from Supabase
  useEffect(() => {
    const initApp = async () => {
      const pid = typeof window !== 'undefined' ? localStorage.getItem('sb_current_project_id') : null;
      if (pid) {
        try {
          const data = await loadFromSupabase(pid);
          if (data.projName) dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: data.projName, projStart: data.projStart, defCal: data.defCal, statusDate: data.statusDate || undefined } });
          if (data.resourcePool) dispatch({ type: 'SET_RESOURCES', resources: data.resourcePool });
          if (data.activities && data.activities.length) dispatch({ type: 'SET_ACTIVITIES', activities: data.activities });
          if (data.progressHistory) dispatch({ type: 'SET_PROGRESS_HISTORY', history: data.progressHistory });
          return;
        } catch (err) {
          console.warn('Could not auto-load from Supabase, starting fresh', err);
        }
      }
      loadDemoData();
    };
    initApp();
  }, [dispatch]); // run once

  // 2. Auto-save on state changes
  useEffect(() => {
    if (!state.activities.length) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(async () => {
      const pid = localStorage.getItem('sb_current_project_id');
      try {
        const newId = await saveToSupabase(state, pid);
        if (newId && newId !== pid) localStorage.setItem('sb_current_project_id', newId);
        console.log('Auto-saved to Supabase');
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 3000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [state.activities, state.resourcePool, state.projName, state.projStart, state.defCal, state.statusDate]);

  // 3. Listen to Supabase Events
  useEffect(() => {
    const handleLoad = async (e: any) => {
      const pid = e.detail?.projectId;
      if (!pid) return;
      try {
        const data = await loadFromSupabase(pid);
        dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: data.projName, projStart: data.projStart, defCal: data.defCal, statusDate: data.statusDate || undefined } });
        dispatch({ type: 'SET_RESOURCES', resources: data.resourcePool || [] });
        dispatch({ type: 'SET_ACTIVITIES', activities: data.activities || [] });
        dispatch({ type: 'SET_PROGRESS_HISTORY', history: data.progressHistory || [] });
        localStorage.setItem('sb_current_project_id', pid);
        alert('Proyecto cargado exitosamente');
      } catch (err: any) {
        alert('Error al cargar proyecto: ' + err.message);
      }
    };
    const handleForceSave = async () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      const pid = localStorage.getItem('sb_current_project_id');
      try {
        const newId = await saveToSupabase(state, pid);
        if (newId && newId !== pid) localStorage.setItem('sb_current_project_id', newId);
        alert('Proyecto guardado exitosamente');
      } catch (err: any) {
        alert('Error al guardar: ' + err.message);
      }
    };
    window.addEventListener('sb-load-project', handleLoad as any);
    window.addEventListener('sb-force-save', handleForceSave);
    return () => {
      window.removeEventListener('sb-load-project', handleLoad as any);
      window.removeEventListener('sb-force-save', handleForceSave);
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
    }
  }, [state.selIdx, state.activities, state.defCal, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
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
            <TaskForm />
          </div>
        </div>
      )}

      {/* Modals */}
      <ActivityModal />
      <ProjectModal />
      <LinkModal />
      <SupabaseModal />
      <SaveProgressModal />
    </div>
  );
}

export default function App() {
  return (
    <GanttProvider>
      <AppInner />
    </GanttProvider>
  );
}
