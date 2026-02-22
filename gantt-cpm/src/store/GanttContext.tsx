// ═══════════════════════════════════════════════════════════════════
// Global Store – React Context + useReducer
// All state management matching HTML globals + actions
// ═══════════════════════════════════════════════════════════════════
import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { Activity, PoolResource, CalendarType, ColumnDef, ZoomLevel, VisibleRow, ProgressHistoryEntry, BaselineEntry } from '../types/gantt';
import { calcCPM, newActivity, isoDate, parseDate, addDays } from '../utils/cpm';
import { autoId, computeOutlineNumbers, syncResFromString, deriveResString, distributeWork, strToPreds } from '../utils/helpers';

// ─── Column Definitions ─────────────────────────────────────────
export const DEFAULT_COLS: ColumnDef[] = [
    { key: '_num', label: '#', w: 30, edit: false, cls: 'tcell-num', visible: true },
    { key: '_info', label: 'ℹ', w: 24, edit: false, cls: 'tcell-info', visible: true },
    { key: '_mode', label: '', w: 22, edit: false, cls: 'tcell-num', visible: true },
    { key: 'outlineNum', label: 'EDT', w: 55, edit: false, cls: 'tcell-num', visible: true },
    { key: 'id', label: 'ID', w: 65, edit: true, cls: 'tcell-id', visible: true },
    { key: 'name', label: 'Nombre de tarea', w: 220, edit: true, cls: 'tcell-name', visible: true },
    { key: 'dur', label: 'Duración', w: 70, edit: true, cls: 'tcell-dur', visible: true },
    { key: 'remDur', label: 'Dur. Resta', w: 70, edit: true, cls: 'tcell-dur', visible: true },
    { key: 'startDate', label: 'Comienzo', w: 90, edit: true, cls: 'tcell-date', visible: true },
    { key: 'endDate', label: 'Fin', w: 90, edit: false, cls: 'tcell-date', visible: true },
    { key: 'predStr', label: 'Predecesoras', w: 100, edit: true, cls: 'tcell-pred', visible: true },
    { key: 'pct', label: '% Avance', w: 60, edit: true, cls: 'tcell-pct', visible: true },
    { key: 'plannedPct', label: '% Prog.', w: 65, edit: false, cls: 'tcell-pct', visible: true },
    { key: 'res', label: 'Recursos', w: 110, edit: true, cls: 'tcell-res', visible: true },
    { key: 'work', label: 'Trabajo', w: 70, edit: true, cls: 'tcell-dur', visible: true },
    { key: 'earnedValue', label: 'Valor Ganado', w: 85, edit: false, cls: 'tcell-dur', visible: true },
    { key: 'remainingWork', label: 'Trab. Restante', w: 90, edit: false, cls: 'tcell-dur', visible: true },
    { key: 'weight', label: 'Peso %', w: 65, edit: true, cls: 'tcell-pct', visible: true },
    { key: 'cal', label: 'Calendario', w: 60, edit: 'select', cls: 'tcell-cal', visible: true },
    { key: 'TF', label: 'Holgura Total', w: 75, edit: false, cls: 'tcell-dur', visible: true },
    { key: 'blDur', label: 'Dur. LB', w: 60, edit: false, cls: 'tcell-dur', visible: false },
    { key: 'blStart', label: 'Inicio LB', w: 90, edit: false, cls: 'tcell-date', visible: false },
    { key: 'blEnd', label: 'Fin LB', w: 90, edit: false, cls: 'tcell-date', visible: false },
    { key: 'type', label: 'Tipo', w: 70, edit: false, cls: 'tcell-num', visible: false },
    { key: 'lv', label: 'WBS/Nivel', w: 50, edit: false, cls: 'tcell-num', visible: false },
    { key: 'constraint', label: 'Restricción', w: 80, edit: false, cls: 'tcell-date', visible: false },
    { key: 'constraintDate', label: 'Fecha Restr.', w: 90, edit: false, cls: 'tcell-date', visible: false },
    { key: 'notes', label: 'Notas', w: 120, edit: true, cls: 'tcell-name', visible: false },
    { key: 'txt1', label: 'Texto 1', w: 100, edit: true, cls: 'tcell-name', visible: false },
    { key: 'txt2', label: 'Texto 2', w: 100, edit: true, cls: 'tcell-name', visible: false },
    { key: 'txt3', label: 'Texto 3', w: 100, edit: true, cls: 'tcell-name', visible: false },
    { key: 'txt4', label: 'Texto 4', w: 100, edit: true, cls: 'tcell-name', visible: false },
    { key: 'txt5', label: 'Texto 5', w: 100, edit: true, cls: 'tcell-name', visible: false },
];

// ─── State Shape ────────────────────────────────────────────────
export interface GanttState {
    projName: string;
    projStart: Date;
    defCal: CalendarType;
    statusDate: Date;
    activities: Activity[];
    resourcePool: PoolResource[];
    visRows: VisibleRow[];
    selIdx: number;       // active row index in Gantt mode
    zoom: ZoomLevel;
    pxPerDay: number;
    totalDays: number;
    timelineStart: Date;  // rendering origin (projStart - buffer)
    lightMode: boolean;
    showProjRow: boolean;
    // View state
    currentView: 'gantt' | 'resources' | 'scurve' | 'usage' | 'resUsage';
    collapsed: Set<string>;
    expResources: Set<string>;
    tableW: number;       // Global table width
    activeGroup: string;
    columns: ColumnDef[];
    colWidths: number[];
    usageModes: string[];  // multi-select: which metrics to show as sub-rows
    usageZoom: 'day' | 'week' | 'month';
    undoStack: string[];
    clipboard: Activity | null;
    // Modal state
    actModalOpen: boolean;
    projModalOpen: boolean;
    linkModalOpen: boolean;
    linkModalData: { fromId: string; toId: string; type: string; lag: number; isEdit: boolean; sucIdx: number; predIdx: number } | null;
    sbModalOpen: boolean;
    progressModalOpen: boolean;
    progressHistory: ProgressHistoryEntry[];
    activeBaselineIdx: number; // 0-10, which baseline is displayed
    blModalOpen: boolean;      // baseline manager modal
}

// ─── Actions ────────────────────────────────────────────────────
export type Action =
    | { type: 'SET_ACTIVITIES'; activities: Activity[] }
    | { type: 'ADD_ACTIVITY'; activity: Activity; atIndex?: number }
    | { type: 'DELETE_ACTIVITY'; index: number }
    | { type: 'UPDATE_ACTIVITY'; index: number; updates: Partial<Activity> }
    | { type: 'COMMIT_EDIT'; index: number; key: string; value: string }
    | { type: 'SET_SELECTION'; index: number }
    | { type: 'SET_ZOOM'; zoom: ZoomLevel }
    | { type: 'SET_PX_PER_DAY'; px: number }
    | { type: 'TOGGLE_THEME' }
    | { type: 'SET_VIEW'; view: 'gantt' | 'resources' | 'scurve' | 'usage' | 'resUsage' }
    | { type: 'SET_TABLE_W', width: number }
    | { type: 'TOGGLE_USAGE_MODE'; mode: string }
    | { type: 'SET_USAGE_ZOOM'; zoom: GanttState['usageZoom'] }
    | { type: 'TOGGLE_COLLAPSE'; id: string }
    | { type: 'TOGGLE_RES_COLLAPSE'; id: string }
    | { type: 'COLLAPSE_ALL' }
    | { type: 'EXPAND_ALL' }
    | { type: 'COLLAPSE_TO_LEVEL'; level: number }
    | { type: 'SET_GROUP'; group: string }
    | { type: 'SET_PROJECT_CONFIG'; config: Partial<{ projName: string; projStart: Date; defCal: CalendarType; statusDate: Date }> }
    | { type: 'RECALC_CPM' }
    | { type: 'SET_RESOURCES'; resources: PoolResource[] }
    | { type: 'UNDO' }
    | { type: 'PUSH_UNDO' }
    | { type: 'SET_COLUMN_VISIBLE'; key: string; visible: boolean }
    | { type: 'SET_COL_WIDTH'; index: number; width: number }
    | { type: 'SET_SHOW_PROJ_ROW'; show: boolean }
    | { type: 'INDENT'; dir: number }
    | { type: 'MOVE_ROW'; dir: number }
    | { type: 'CUT_ACTIVITY' }
    | { type: 'PASTE_ACTIVITY' }
    | { type: 'SAVE_BASELINE'; index?: number; name?: string; description?: string }
    | { type: 'SET_ACTIVE_BASELINE'; index: number }
    | { type: 'CLEAR_BASELINE'; index: number }
    | { type: 'OPEN_ACT_MODAL' }
    | { type: 'CLOSE_ACT_MODAL' }
    | { type: 'OPEN_PROJ_MODAL' }
    | { type: 'CLOSE_PROJ_MODAL' }
    | { type: 'OPEN_LINK_MODAL'; data: GanttState['linkModalData'] }
    | { type: 'CLOSE_LINK_MODAL' }
    | { type: 'OPEN_SB_MODAL' }
    | { type: 'CLOSE_SB_MODAL' }
    | { type: 'OPEN_PROGRESS_MODAL' }
    | { type: 'CLOSE_PROGRESS_MODAL' }
    | { type: 'OPEN_BL_MODAL' }
    | { type: 'CLOSE_BL_MODAL' }
    | { type: 'ADD_PRED'; actIdx: number; pred: { id: string; type: string; lag: number } }
    | { type: 'UPDATE_PRED'; actIdx: number; predIdx: number; updates: Partial<{ type: any; lag: number }> }
    | { type: 'REMOVE_PRED'; actIdx: number; predIdx: number }
    | { type: 'ADD_SUC'; fromIdx: number; sucIdx: number; linkType: string; lag: number }
    | { type: 'REMOVE_SUC'; sucId: string; predIdx: number }
    | { type: 'ADD_RESOURCE_TO_ACT'; actIdx: number; rid: number; name: string; units: string; work: number }
    | { type: 'REMOVE_RESOURCE_FROM_ACT'; actIdx: number; resIdx: number }
    | { type: 'EDIT_ACT_RESOURCE'; actIdx: number; resIdx: number; field: string; value: any }
    | { type: 'ADD_TO_POOL'; resource: PoolResource }
    | { type: 'LOAD_STATE'; state: Partial<GanttState> }
    | { type: 'SAVE_PERIOD_PROGRESS' }
    | { type: 'SET_PROGRESS_HISTORY'; history: ProgressHistoryEntry[] }
    | { type: 'DELETE_PROGRESS_ENTRY'; date: string };

// ─── Grouping / Filtering ─────────────────────────────────────────
function applyGroupFilter(rows: VisibleRow[], activities: Activity[], activeGroup: string, columns: ColumnDef[]): VisibleRow[] {
    if (activeGroup === 'none') return rows;
    if (activeGroup === 'critical') return rows.filter(vr => { const a = activities[vr._idx]; return a._isProjRow || a.type === 'summary' || a.crit; });
    if (activeGroup === 'inprogress') return rows.filter(vr => { const a = activities[vr._idx]; return a._isProjRow || a.type === 'summary' || ((a.pct || 0) > 0 && (a.pct || 0) < 100 && a.type === 'task'); });
    if (activeGroup === 'notstarted') return rows.filter(vr => { const a = activities[vr._idx]; return a._isProjRow || a.type === 'summary' || ((a.pct || 0) === 0 && a.type === 'task'); });
    if (activeGroup === 'completed') return rows.filter(vr => { const a = activities[vr._idx]; return a._isProjRow || a.type === 'summary' || (a.pct || 0) >= 100; });
    if (activeGroup.startsWith('txt')) {
        const field = activeGroup;
        const special: VisibleRow[] = [], tasks: VisibleRow[] = [];
        rows.forEach(vr => { const a = activities[vr._idx]; if (a._isProjRow) special.push(vr); else tasks.push(vr); });
        const groups = new Map<string, VisibleRow[]>();
        tasks.forEach(vr => {
            const a = activities[vr._idx];
            const val = String((a as any)[field] || '').trim() || '(Sin valor)';
            if (!groups.has(val)) groups.set(val, []);
            groups.get(val)!.push(vr);
        });
        const result: VisibleRow[] = [...special];
        const colLabel = columns.find(c => c.key === field);
        const fieldLabel = colLabel ? colLabel.label : field;
        for (const [val, grpRows] of groups) {
            result.push({ _isGroupHeader: true, _groupLabel: fieldLabel + ': ' + val, _groupCount: grpRows.length, id: '__grp_' + val } as any);
            grpRows.forEach(vr => result.push(vr));
        }
        return result;
    }
    return rows;
}

function buildVisRows(activities: Activity[], collapsed: Set<string>, activeGroup: string, columns: ColumnDef[], currentView: string = 'gantt', expResources: Set<string> = new Set(), usageModes: string[] = ['Trabajo']): VisibleRow[] {
    const rows: VisibleRow[] = [];
    let skipLv = -999;
    activities.forEach((a, i) => {
        if (skipLv > -999) {
            if (a.lv > skipLv) return;
            else skipLv = -999;
        }
        if (collapsed.has(a.id) && a.type === 'summary') {
            rows.push({ ...a, _idx: i });
            // Even for collapsed summaries, add metric sub-rows in usage view
            if (currentView === 'usage' && usageModes.length > 0 && a.type !== 'summary') {
                // no metric rows for collapsed summaries
            }
            skipLv = a.lv;
            return;
        }
        rows.push({ ...a, _idx: i });

        // Generate resource pseudo-rows for Task Usage view (only if activity is expanded)
        if (currentView === 'usage' && a.resources && a.resources.length > 0 && expResources.has(a.id)) {
            a.resources.forEach((r, rIdx) => {
                rows.push({
                    id: `res_${a.id}_${r.rid}_${rIdx}`,
                    name: r.name,
                    type: 'task',
                    _isResourceAssignment: true,
                    _parentTaskId: a.id,
                    res: String(r.rid),
                    work: r.work,
                    lv: a.lv + 1,
                    _idx: i,
                } as any);
            });
        }
    });
    return applyGroupFilter(rows, activities, activeGroup, columns);
}

function ensureProjRow(activities: Activity[], showProjRow: boolean, projName: string, defCal: CalendarType): Activity[] {
    let acts = [...activities];
    if (!showProjRow) {
        acts = acts.filter(a => !a._isProjRow);
        return acts;
    }
    if (acts.length && acts[0]._isProjRow) return acts;
    const pr = newActivity('PROY', defCal);
    pr.name = projName || 'Mi Proyecto';
    pr.type = 'summary';
    pr.lv = -1;
    pr._isProjRow = true;
    acts.unshift(pr);
    return acts;
}

function recalc(state: GanttState): GanttState {
    let acts = ensureProjRow([...state.activities], state.showProjRow, state.projName, state.defCal);
    const result = calcCPM(acts, state.projStart, state.defCal, state.statusDate, state.projName, state.activeBaselineIdx);
    computeOutlineNumbers(result.activities);
    const visRows = buildVisRows(result.activities, state.collapsed, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes);
    // Auto-fit: pxPerDay based on PROJECT span (not totalDays) so project fills viewport
    // but totalDays extends beyond for scrollable buffer
    const timelineW = Math.max(400, (typeof window !== 'undefined' ? window.innerWidth : 1200) - state.tableW - 10);
    const fitPx = timelineW / result.projectDays;
    const pxPerDay = Math.max(0.5, Math.min(fitPx, 150));
    // Timeline rendering starts 30 days before project start
    const timelineStart = addDays(state.projStart, -30);
    return { ...state, activities: result.activities, totalDays: result.totalDays, visRows, pxPerDay, timelineStart };
}


// ─── Reducer ────────────────────────────────────────────────────
function reducer(state: GanttState, action: Action): GanttState {
    switch (action.type) {
        case 'SET_ACTIVITIES':
            return recalc({ ...state, activities: action.activities });

        case 'ADD_ACTIVITY': {
            const acts = [...state.activities];
            const idx = action.atIndex !== undefined ? action.atIndex : acts.length;
            acts.splice(idx, 0, action.activity);
            return recalc({ ...state, activities: acts, selIdx: idx });
        }

        case 'DELETE_ACTIVITY': {
            if (state.activities[action.index]?._isProjRow) return state;
            const acts = [...state.activities];
            const delId = acts[action.index].id;
            acts.splice(action.index, 1);
            // Remove references in predecessors
            acts.forEach(a => { if (a.preds) a.preds = a.preds.filter(p => p.id !== delId); });
            const newSel = Math.min(state.selIdx, acts.length - 1);
            return recalc({ ...state, activities: acts, selIdx: newSel });
        }

        case 'UPDATE_ACTIVITY': {
            const acts = [...state.activities];
            acts[action.index] = { ...acts[action.index], ...action.updates };
            return recalc({ ...state, activities: acts });
        }

        case 'COMMIT_EDIT': {
            const acts = [...state.activities];
            const a = { ...acts[action.index] };
            if (a._isProjRow) return state;
            if (a.type === 'summary' && (action.key === 'work' || action.key === 'pct' || action.key === 'dur')) return state;
            const val = action.value;
            const { key } = action;
            if (key === 'name') a.name = val;
            else if (key === 'id') {
                const oldId = a.id; a.id = val;
                acts.forEach(x => { if (x.preds) x.preds.forEach(p => { if (p.id === oldId) p.id = val; }); });
            }
            else if (key === 'dur') {
                const n = parseInt(val); if (!isNaN(n)) { a.dur = Math.max(0, n); if (n === 0) a.type = 'milestone'; else if (a.type === 'milestone') a.type = 'task'; }
                a.remDur = null;
            }
            else if (key === 'remDur') { const n = parseInt(val); if (!isNaN(n)) a.remDur = Math.max(0, n); }
            else if (key === 'predStr') {
                a.preds = strToPreds(val);
            }
            else if (key === 'startDate') {
                const d = parseDate(val);
                if (d) { a.constraint = 'MSO'; a.constraintDate = isoDate(d); a.manual = true; }
                else { a.constraint = ''; a.constraintDate = ''; a.manual = false; }
            }
            else if (key === 'res') {
                a.res = val;
                const pool = [...state.resourcePool];
                syncResFromString(a, pool);
                acts[action.index] = a;
                return recalc({ ...state, activities: acts, resourcePool: pool });
            }
            else if (key === 'work') { const n = parseFloat(val); if (!isNaN(n)) { a.work = Math.max(0, n); distributeWork(a); } }
            else if (key === 'weight') {
                const cleaned = String(val).replace('%', '').trim();
                const n = parseFloat(cleaned);
                if (!isNaN(n) && n > 0) a.weight = n; else a.weight = null;
            }
            else if (key === 'pct') {
                a.pct = Math.min(100, Math.max(0, parseInt(val) || 0));
                if (a.remDur === null || a.remDur === undefined) {
                    a.remDur = Math.round((a.dur || 0) * (100 - a.pct) / 100);
                }
                if (!a.constraint && a.ES) { a.constraint = 'MSO'; a.constraintDate = isoDate(a.ES); a.manual = true; }
            }
            else if (key === 'cal') {
                const calVal = parseInt(val);
                if (calVal === 5 || calVal === 6 || calVal === 7) {
                    a.cal = calVal as CalendarType;
                }
            }
            else if (key === 'notes') a.notes = val;
            else if (key.startsWith('txt')) (a as any)[key] = val;
            acts[action.index] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'SET_SELECTION':
            return { ...state, selIdx: action.index };

        case 'SET_ZOOM': {
            const timelineW = Math.max(400, (typeof window !== 'undefined' ? window.innerWidth : 1200) - state.tableW - 10);
            const fitPx = Math.max(0.5, Math.min(timelineW / state.totalDays, 150));
            return { ...state, zoom: action.zoom, pxPerDay: fitPx };
        }

        case 'SET_PX_PER_DAY':
            return { ...state, pxPerDay: action.px };

        case 'TOGGLE_THEME':
            return { ...state, lightMode: !state.lightMode };

        case 'SET_VIEW': {
            const visRows = buildVisRows(state.activities, state.collapsed, state.activeGroup, state.columns, action.view, state.expResources, state.usageModes);
            return { ...state, currentView: action.view, visRows };
        }
        case 'TOGGLE_USAGE_MODE': {
            const modes = [...state.usageModes];
            const idx = modes.indexOf(action.mode);
            if (idx >= 0) modes.splice(idx, 1);
            else modes.push(action.mode);
            const visRows = buildVisRows(state.activities, state.collapsed, state.activeGroup, state.columns, state.currentView, state.expResources, modes);
            return { ...state, usageModes: modes, visRows };
        }
        case 'SET_USAGE_ZOOM': return { ...state, usageZoom: action.zoom };
        case 'TOGGLE_COLLAPSE': {
            const c = new Set(state.collapsed);
            c.has(action.id) ? c.delete(action.id) : c.add(action.id);
            const visRows = buildVisRows(state.activities, c, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes);
            return { ...state, collapsed: c, visRows };
        }
        case 'TOGGLE_RES_COLLAPSE': {
            const c = new Set(state.expResources);
            c.has(action.id) ? c.delete(action.id) : c.add(action.id);
            const visRows = buildVisRows(state.activities, state.collapsed, state.activeGroup, state.columns, state.currentView, c, state.usageModes);
            return { ...state, expResources: c, visRows };
        }

        case 'COLLAPSE_ALL': {
            const c = new Set<string>();
            state.activities.forEach(a => { if (a.type === 'summary') c.add(a.id); });
            const visRows = buildVisRows(state.activities, c, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes);
            return { ...state, collapsed: c, visRows };
        }

        case 'EXPAND_ALL': {
            const visRows = buildVisRows(state.activities, new Set(), state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes);
            return { ...state, collapsed: new Set(), visRows };
        }

        case 'COLLAPSE_TO_LEVEL': {
            const lvl = action.level as number;
            const c = new Set<string>();
            state.activities.forEach(a => {
                if (a.type === 'summary' && a.lv >= lvl - 1) {
                    c.add(a.id);
                }
            });
            const visRows = buildVisRows(state.activities, c, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes);
            return { ...state, collapsed: c, visRows };
        }

        case 'SET_GROUP': {
            const visRows = buildVisRows(state.activities, state.collapsed, action.group, state.columns, state.currentView, state.expResources, state.usageModes);
            return { ...state, activeGroup: action.group, visRows };
        }

        case 'SET_PROJECT_CONFIG': {
            const newState = { ...state, ...action.config };
            const acts = ensureProjRow([...newState.activities], newState.showProjRow, newState.projName, newState.defCal);
            const visRows = buildVisRows(acts, newState.collapsed, newState.activeGroup, newState.columns, newState.currentView, newState.expResources, newState.usageModes || state.usageModes);
            return { ...newState, activities: acts, visRows };
        }

        case 'RECALC_CPM':
            return recalc(state);

        case 'SET_RESOURCES':
            return { ...state, resourcePool: action.resources };

        case 'PUSH_UNDO': {
            const stack = [...state.undoStack, JSON.stringify(state.activities.map(a => ({ ...a, ES: a.ES ? isoDate(a.ES) : null, EF: a.EF ? isoDate(a.EF) : null, LS: null, LF: null, blES: a.blES ? isoDate(a.blES) : null, blEF: a.blEF ? isoDate(a.blEF) : null })))];
            if (stack.length > 40) stack.shift();
            return { ...state, undoStack: stack };
        }

        case 'UNDO': {
            if (!state.undoStack.length) return state;
            const stack = [...state.undoStack];
            const last = stack.pop()!;
            const acts = JSON.parse(last).map((a: any) => {
                const na = { ...newActivity(), ...a };
                if (a.ES) na.ES = new Date(a.ES); if (a.EF) na.EF = new Date(a.EF);
                if (a.blES) na.blES = new Date(a.blES); if (a.blEF) na.blEF = new Date(a.blEF);
                return na;
            }) as Activity[];
            return recalc({ ...state, activities: acts, undoStack: stack });
        }

        case 'SET_COLUMN_VISIBLE': {
            const cols = state.columns.map(c => c.key === action.key ? { ...c, visible: action.visible } : c);
            return { ...state, columns: cols };
        }

        case 'SET_COL_WIDTH': {
            const cw = [...state.colWidths];
            cw[action.index] = Math.max(20, action.width);
            return { ...state, colWidths: cw };
        }

        case 'SET_SHOW_PROJ_ROW':
            return recalc({ ...state, showProjRow: action.show });

        case 'INDENT': {
            if (state.selIdx < 0 || state.activities[state.selIdx]?._isProjRow) return state;
            const acts = [...state.activities];
            const a = { ...acts[state.selIdx] };
            const oldLv = a.lv;
            let maxLv = 5;
            if (action.dir > 0 && state.selIdx > 0) {
                maxLv = acts[state.selIdx - 1].lv + 1;
            }
            const newLv = Math.max(0, Math.min(maxLv, oldLv + action.dir));
            if (newLv === oldLv) return state;
            a.lv = newLv;
            // Auto-promote parent to summary
            if (action.dir > 0 && newLv > oldLv && state.selIdx > 0) {
                for (let j = state.selIdx - 1; j >= 0; j--) {
                    if (acts[j].lv < newLv) {
                        acts[j] = { ...acts[j], type: 'summary' };
                        break;
                    }
                }
            }
            // Auto-demote if no children remain
            if (action.dir < 0 && newLv < oldLv) {
                for (let j = state.selIdx - 1; j >= 0; j--) {
                    if (acts[j].lv < oldLv) {
                        let hasChildren = false;
                        for (let k = j + 1; k < acts.length; k++) {
                            if (acts[k].lv <= acts[j].lv) break;
                            if (acts[k].lv > acts[j].lv) { hasChildren = true; break; }
                        }
                        if (!hasChildren && acts[j].type === 'summary') acts[j] = { ...acts[j], type: 'task' };
                        break;
                    }
                }
            }
            acts[state.selIdx] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'MOVE_ROW': {
            if (state.selIdx < 0) return state;
            const newIdx = state.selIdx + action.dir;
            if (newIdx < 0 || newIdx >= state.activities.length) return state;
            if (state.activities[state.selIdx]._isProjRow || state.activities[newIdx]._isProjRow) return state;
            const acts = [...state.activities];
            const temp = acts[state.selIdx];
            acts[state.selIdx] = acts[newIdx];
            acts[newIdx] = temp;
            return recalc({ ...state, activities: acts, selIdx: newIdx });
        }

        case 'CUT_ACTIVITY': {
            if (state.selIdx < 0 || state.activities[state.selIdx]._isProjRow) return state;
            const acts = [...state.activities];
            const cut = { ...acts[state.selIdx] };
            const delId = cut.id;
            acts.splice(state.selIdx, 1);
            acts.forEach(a => { if (a.preds) a.preds = a.preds.filter(p => p.id !== delId); });
            return recalc({ ...state, activities: acts, clipboard: cut, selIdx: Math.min(state.selIdx, acts.length - 1) });
        }

        case 'PASTE_ACTIVITY': {
            if (!state.clipboard) return state;
            const acts = [...state.activities];
            const pasted = { ...state.clipboard, id: autoId(acts) };
            const idx = state.selIdx >= 0 ? state.selIdx + 1 : acts.length;
            acts.splice(idx, 0, pasted);
            return recalc({ ...state, activities: acts, selIdx: idx });
        }

        case 'SAVE_BASELINE': {
            if (!state.activities.length) return state;
            const blIdx = action.index != null ? action.index : state.activeBaselineIdx;
            const blName = action.name || `Línea Base ${blIdx}`;
            const blDesc = action.description || '';
            const now = new Date().toISOString();
            const acts = state.activities.map(a => {
                const baselines = [...(a.baselines || [])];
                // Ensure array has slots up to blIdx
                while (baselines.length <= blIdx) baselines.push(null as any);
                baselines[blIdx] = {
                    dur: a.dur,
                    ES: a.ES ? new Date(a.ES) : null,
                    EF: a.EF ? new Date(a.EF) : null,
                    cal: a.cal,
                    savedAt: now,
                    name: blName,
                    description: blDesc,
                    pct: a.pct || 0,
                    work: a.work || 0,
                    weight: a.weight != null ? a.weight : null,
                    statusDate: state.statusDate ? state.statusDate.toISOString() : now,
                } as BaselineEntry;
                // Set active baseline fields from the currently displayed baseline
                const active = baselines[state.activeBaselineIdx] || baselines[blIdx];
                return {
                    ...a,
                    baselines,
                    blDur: active ? active.dur : null,
                    blES: active ? active.ES : null,
                    blEF: active ? active.EF : null,
                    blCal: active ? active.cal : null,
                };
            });
            return { ...state, activities: acts, visRows: buildVisRows(acts, state.collapsed, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes) };
        }

        case 'SET_ACTIVE_BASELINE': {
            const blIdx = action.index;
            const acts = state.activities.map(a => {
                const bl = (a.baselines || [])[blIdx];
                return {
                    ...a,
                    blDur: bl ? bl.dur : null,
                    blES: bl ? bl.ES : null,
                    blEF: bl ? bl.EF : null,
                    blCal: bl ? bl.cal : null,
                };
            });
            return { ...state, activeBaselineIdx: blIdx, activities: acts, visRows: buildVisRows(acts, state.collapsed, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes) };
        }

        case 'CLEAR_BASELINE': {
            const blIdx = action.index;
            const acts = state.activities.map(a => {
                const baselines = [...(a.baselines || [])];
                if (baselines[blIdx]) baselines[blIdx] = null as any;
                // If clearing the active baseline, clear active fields
                const isActive = blIdx === state.activeBaselineIdx;
                return {
                    ...a,
                    baselines,
                    ...(isActive ? { blDur: null, blES: null, blEF: null, blCal: null } : {}),
                };
            });
            return { ...state, activities: acts, visRows: buildVisRows(acts, state.collapsed, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes) };
        }

        // Modal toggles
        case 'OPEN_ACT_MODAL': return { ...state, actModalOpen: true };
        case 'CLOSE_ACT_MODAL': return { ...state, actModalOpen: false };
        case 'OPEN_PROJ_MODAL': return { ...state, projModalOpen: true };
        case 'CLOSE_PROJ_MODAL': return { ...state, projModalOpen: false };
        case 'OPEN_LINK_MODAL': return { ...state, linkModalOpen: true, linkModalData: action.data };
        case 'CLOSE_LINK_MODAL': return { ...state, linkModalOpen: false, linkModalData: null };
        case 'OPEN_SB_MODAL': return { ...state, sbModalOpen: true, actModalOpen: false, projModalOpen: false, linkModalOpen: false, progressModalOpen: false };
        case 'CLOSE_SB_MODAL': return { ...state, sbModalOpen: false };

        case 'SET_TABLE_W': return { ...state, tableW: action.width };

        case 'OPEN_PROGRESS_MODAL': return { ...state, progressModalOpen: true, actModalOpen: false, projModalOpen: false, linkModalOpen: false, sbModalOpen: false };
        case 'CLOSE_PROGRESS_MODAL': return { ...state, progressModalOpen: false };
        case 'OPEN_BL_MODAL': return { ...state, blModalOpen: true };
        case 'CLOSE_BL_MODAL': return { ...state, blModalOpen: false };

        case 'ADD_PRED': {
            const acts = [...state.activities];
            const a = { ...acts[action.actIdx] };
            if (!a.preds) a.preds = [];
            a.preds = a.preds.filter(p => p.id !== action.pred.id);
            a.preds.push(action.pred as any);
            acts[action.actIdx] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'UPDATE_PRED': {
            const acts = [...state.activities];
            const a = { ...acts[action.actIdx] };
            if (!a.preds || !a.preds[action.predIdx]) return state;
            a.preds = [...a.preds];
            a.preds[action.predIdx] = { ...a.preds[action.predIdx], ...action.updates };
            acts[action.actIdx] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'REMOVE_PRED': {
            const acts = [...state.activities];
            const a = { ...acts[action.actIdx] };
            a.preds = [...(a.preds || [])];
            a.preds.splice(action.predIdx, 1);
            acts[action.actIdx] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'ADD_SUC': {
            const acts = [...state.activities];
            const suc = { ...acts[action.sucIdx] };
            if (!suc.preds) suc.preds = [];
            suc.preds = suc.preds.filter(p => p.id !== acts[action.fromIdx].id);
            suc.preds.push({ id: acts[action.fromIdx].id, type: action.linkType as any, lag: action.lag });
            acts[action.sucIdx] = suc;
            return recalc({ ...state, activities: acts });
        }

        case 'REMOVE_SUC': {
            const acts = [...state.activities];
            const suc = acts.find(a => a.id === action.sucId);
            if (suc && suc.preds) {
                const idx = acts.indexOf(suc);
                acts[idx] = { ...suc, preds: [...suc.preds] };
                acts[idx].preds.splice(action.predIdx, 1);
            }
            return recalc({ ...state, activities: acts });
        }

        case 'ADD_RESOURCE_TO_ACT': {
            const acts = [...state.activities];
            const a = { ...acts[action.actIdx] };
            if (!a.resources) a.resources = [];
            if (a.resources.find(r => r.rid === action.rid)) return state;
            a.resources = [...a.resources, { rid: action.rid, name: action.name, units: action.units, work: action.work }];
            a.work = a.resources.reduce((s, r) => s + (r.work || 0), 0);
            deriveResString(a, state.resourcePool);
            acts[action.actIdx] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'REMOVE_RESOURCE_FROM_ACT': {
            const acts = [...state.activities];
            const a = { ...acts[action.actIdx] };
            if (!a.resources) return state;
            a.resources = [...a.resources];
            a.resources.splice(action.resIdx, 1);
            a.work = a.resources.reduce((s, r) => s + (r.work || 0), 0);
            deriveResString(a, state.resourcePool);
            acts[action.actIdx] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'EDIT_ACT_RESOURCE': {
            const acts = [...state.activities];
            const a = { ...acts[action.actIdx] };
            if (!a.resources || !a.resources[action.resIdx]) return state;
            a.resources = [...a.resources];
            a.resources[action.resIdx] = { ...a.resources[action.resIdx], [action.field]: action.value };
            a.work = a.resources.reduce((s, r) => s + (r.work || 0), 0);
            deriveResString(a, state.resourcePool);
            acts[action.actIdx] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'ADD_TO_POOL': {
            return { ...state, resourcePool: [...state.resourcePool, action.resource] };
        }

        case 'LOAD_STATE':
            return recalc({ ...state, ...action.state });

        case 'SET_PROGRESS_HISTORY':
            return { ...state, progressHistory: action.history };

        case 'SAVE_PERIOD_PROGRESS': {
            const todayISO = isoDate(state.statusDate || new Date());
            const projAct = state.activities.find(a => a._isProjRow);
            const actualPct = projAct ? (projAct.pct || 0) : 0;
            const details: Record<string, number> = {};
            state.activities.forEach(a => {
                if (a.pct !== undefined && a.pct !== null) {
                    details[a.id] = a.pct;
                }
            });
            const newEntry: ProgressHistoryEntry = { date: todayISO, actualPct, details };
            const history = [...state.progressHistory];
            const existingIdx = history.findIndex(h => h.date === todayISO);
            if (existingIdx >= 0) history[existingIdx] = newEntry;
            else history.push(newEntry);
            history.sort((a, b) => a.date.localeCompare(b.date));
            return { ...state, progressHistory: history, progressModalOpen: false };
        }

        case 'DELETE_PROGRESS_ENTRY': {
            const history = state.progressHistory.filter(h => h.date !== action.date);
            return { ...state, progressHistory: history };
        }

        default:
            return state;
    }
}

// ─── Initial State ──────────────────────────────────────────────
const now = new Date(); now.setHours(0, 0, 0, 0);

const initialState: GanttState = {
    projName: 'Mi Proyecto',
    projStart: now,
    defCal: 6,
    statusDate: now,
    activities: [],
    resourcePool: [],
    visRows: [],
    zoom: 'week',
    pxPerDay: 8,
    totalDays: 400,
    timelineStart: now,
    lightMode: false,
    showProjRow: true,
    currentView: 'gantt',
    collapsed: new Set(),
    expResources: new Set(),
    selIdx: -1,
    tableW: 400,
    activeGroup: 'none',
    columns: DEFAULT_COLS,
    colWidths: DEFAULT_COLS.map(c => c.w),
    usageModes: ['Trabajo'],
    usageZoom: 'week',
    undoStack: [],
    clipboard: null,
    actModalOpen: false,
    projModalOpen: false,
    linkModalOpen: false,
    linkModalData: null,
    sbModalOpen: false,
    progressModalOpen: false,
    progressHistory: [],
    activeBaselineIdx: 0,
    blModalOpen: false,
};

// ─── Context ────────────────────────────────────────────────────
interface GanttContextType {
    state: GanttState;
    dispatch: React.Dispatch<Action>;
}

const GanttContext = createContext<GanttContextType | null>(null);

export function GanttProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    return <GanttContext.Provider value={{ state, dispatch }}>{children}</GanttContext.Provider>;
}

export function useGantt() {
    const ctx = useContext(GanttContext);
    if (!ctx) throw new Error('useGantt must be used within GanttProvider');
    return ctx;
}
