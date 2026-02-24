// ═══════════════════════════════════════════════════════════════════
// Global Store – React Context + useReducer
// All state management matching HTML globals + actions
// ═══════════════════════════════════════════════════════════════════
import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { Activity, PoolResource, CalendarType, ColumnDef, ZoomLevel, VisibleRow, ProgressHistoryEntry, BaselineEntry, CustomCalendar, CustomFilter, MFPConfig } from '../types/gantt';
import { calcCPM, calcMultipleFloatPaths, traceChain, newActivity, isoDate, parseDate, addDays, calWorkDays, fmtDate } from '../utils/cpm';
import { autoId, computeOutlineNumbers, syncResFromString, deriveResString, distributeWork, strToPreds, predsToStr } from '../utils/helpers';

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
    { key: 'endDate', label: 'Fin', w: 90, edit: true, cls: 'tcell-date', visible: true },
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
    { key: 'FF', label: 'Holgura Libre', w: 75, edit: false, cls: 'tcell-dur', visible: false },
    { key: 'floatPath', label: 'Float Path', w: 70, edit: false, cls: 'tcell-num', visible: false },
    { key: 'actualStart', label: 'Comienzo Real', w: 95, edit: false, cls: 'tcell-date', visible: false },
    { key: 'actualFinish', label: 'Fin Real', w: 95, edit: false, cls: 'tcell-date', visible: false },
    { key: 'remStartDate', label: 'Inicio Trab. Rest.', w: 105, edit: false, cls: 'tcell-date', visible: false },
    { key: 'remEndDate', label: 'Fin Trab. Rest.', w: 105, edit: false, cls: 'tcell-date', visible: false },
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
    _cpmStatusDate: Date | null; // statusDate used in last CPM calc (for rendering)
    activities: Activity[];
    resourcePool: PoolResource[];
    visRows: VisibleRow[];
    selIdx: number;       // active row index in Gantt mode
    selIndices: Set<number>;  // multi-selection set of row indices
    zoom: ZoomLevel;
    pxPerDay: number;
    totalDays: number;
    timelineStart: Date;  // rendering origin (projStart - buffer)
    lightMode: boolean;
    showProjRow: boolean;
    showTodayLine: boolean;
    showStatusLine: boolean;
    showDependencies: boolean;
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
    clipboardMulti: Activity[];
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
    customCalendars: CustomCalendar[];
    calModalOpen: boolean;     // calendar manager modal
    activeCheckerFilter: string | null;
    checkerThresholds: { longLags: number; largeMargins: number; longDurations: number };
    checkModalOpen: boolean;
    customFilters: CustomFilter[];
    filtersMatchAll: boolean; // true = AND all selected, false = OR any selected
    filtersModalOpen: boolean;
    // Multiple Float Paths
    mfpConfig: MFPConfig;
    // Chain Trace (Trace Logic)
    chainTrace: { actId: string; dir: 'fwd' | 'bwd' | 'both' } | null;
    chainIds: Set<string>;  // computed set of activity IDs in the traced chain
}

// ─── Actions ────────────────────────────────────────────────────
export type Action =
    | { type: 'SET_ACTIVITIES'; activities: Activity[] }
    | { type: 'ADD_ACTIVITY'; activity: Activity; atIndex?: number }
    | { type: 'DELETE_ACTIVITY'; index: number }
    | { type: 'UPDATE_ACTIVITY'; index: number; updates: Partial<Activity> }
    | { type: 'COMMIT_EDIT'; index: number; key: string; value: string }
    | { type: 'SET_SELECTION'; index: number; shift?: boolean; ctrl?: boolean }
    | { type: 'SET_ZOOM'; zoom: ZoomLevel }
    | { type: 'SET_PX_PER_DAY'; px: number }
    | { type: 'TOGGLE_THEME' }
    | { type: 'TOGGLE_TODAY_LINE' }
    | { type: 'TOGGLE_STATUS_LINE' }
    | { type: 'TOGGLE_DEPENDENCIES' }
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
    | { type: 'SET_PROJECT_CONFIG'; config: Partial<{ projName: string; projStart: Date; defCal: CalendarType; statusDate: Date; customFilters: CustomFilter[]; filtersMatchAll: boolean }> }
    | { type: 'RECALC_CPM' }
    | { type: 'SET_RESOURCES'; resources: PoolResource[] }
    | { type: 'UNDO' }
    | { type: 'PUSH_UNDO' }
    | { type: 'SET_COLUMN_VISIBLE'; key: string; visible: boolean }
    | { type: 'SET_COLUMNS_ORDER'; columns: ColumnDef[]; colWidths: number[] }
    | { type: 'SET_COL_WIDTH'; index: number; width: number }
    | { type: 'SET_SHOW_PROJ_ROW'; show: boolean }
    | { type: 'INDENT'; dir: number }
    | { type: 'MOVE_ROW'; dir: number }
    | { type: 'CUT_ACTIVITY' }
    | { type: 'COPY_ACTIVITY' }
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
    | { type: 'DELETE_PROGRESS_ENTRY'; date: string }
    | { type: 'LOAD_PROGRESS_SNAPSHOT'; date: string }
    | { type: 'OPEN_CAL_MODAL' }
    | { type: 'CLOSE_CAL_MODAL' }
    | { type: 'SAVE_CALENDAR'; calendar: CustomCalendar }
    | { type: 'DELETE_CALENDAR'; id: string }
    | { type: 'SET_CHECKER_FILTER'; filter: string | null }
    | { type: 'SET_CHECKER_THRESHOLDS'; thresholds: { longLags: number; largeMargins: number; longDurations: number } }
    | { type: 'OPEN_CHECK_MODAL' }
    | { type: 'CLOSE_CHECK_MODAL' }
    | { type: 'SET_CUSTOM_FILTERS'; filters: CustomFilter[] }
    | { type: 'SET_FILTERS_MATCH_ALL'; matchAll: boolean }
    | { type: 'OPEN_FILTERS_MODAL' }
    | { type: 'CLOSE_FILTERS_MODAL' }
    | { type: 'SET_MFP_CONFIG'; config: Partial<MFPConfig> }
    | { type: 'TOGGLE_MFP' }
    | { type: 'SET_CHAIN_TRACE'; dir: 'fwd' | 'bwd' | 'both' }
    | { type: 'CLEAR_CHAIN_TRACE' };

// ─── Grouping / Filtering ─────────────────────────────────────────
function applyGroupFilter(rows: VisibleRow[], activities: Activity[], activeGroup: string, columns: ColumnDef[]): VisibleRow[] {
    if (activeGroup === 'none') return rows;
    if (activeGroup === 'critical') return rows.filter(vr => { const a = activities[vr._idx]; return a._isProjRow || a.type === 'summary' || a.crit; });
    if (activeGroup.startsWith('floatpath')) {
        const pathNum = parseInt(activeGroup.replace('floatpath', ''));
        if (!isNaN(pathNum)) return rows.filter(vr => { const a = activities[vr._idx]; return a._isProjRow || a.type === 'summary' || a._floatPath === pathNum; });
    }
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

function buildVisRows(
    activities: Activity[],
    collapsed: Set<string>,
    activeGroup: string,
    columns: ColumnDef[],
    currentView: string = 'gantt',
    expResources: Set<string> = new Set(),
    usageModes: string[] = ['Trabajo'],
    activeCheckerFilter: string | null = null,
    checkerThresholds: { longLags: number; largeMargins: number; longDurations: number } = { longLags: 20, largeMargins: 20, longDurations: 20 },
    statusDate: Date = new Date(),
    customFilters: CustomFilter[] = [],
    filtersMatchAll: boolean = true
): VisibleRow[] {
    const rows: VisibleRow[] = [];
    let skipLv = -999;

    let filteredSet = new Set<string>();
    let hasSystemFilter = !!activeCheckerFilter;

    // --- Checker Filter ---
    const { longLags, largeMargins, longDurations } = checkerThresholds;

    // Pre-calculate successors for "Malla Abierta"
    let hasSuccessor = new Set<string>();
    if (activeCheckerFilter === 'Malla Abierta') {
        activities.forEach(act => {
            if (act.preds) act.preds.forEach(p => hasSuccessor.add(p.id));
        });
    }

    activities.forEach(a => {
        if (a._isProjRow) { filteredSet.add(a.id); return; }
        let pass = false;
        switch (activeCheckerFilter) {
            case 'Malla Abierta':
                pass = a.type === 'task' && (a.pct || 0) < 100 && !hasSuccessor.has(a.id);
                break;
            case 'Sin Predecesora':
                pass = a.type === 'task' && (a.pct || 0) < 100 && (!a.preds || a.preds.length === 0);
                break;
            case 'Fechas no Válidas':
                if (a.type === 'task') {
                    if ((a.pct || 0) === 0 && a.ES && a.ES < statusDate) pass = true;
                    if ((a.pct || 0) > 0 && (a.pct || 0) < 100 && a.EF && a.EF < statusDate) pass = true;
                }
                break;
            case 'Tipo de Relación':
                pass = a.type === 'task' && !!(a.preds && a.preds.some(p => p.type !== 'FS'));
                break;
            case 'Demoras Negativas':
                pass = a.type === 'task' && !!(a.preds && a.preds.some(p => p.lag < 0));
                break;
            case 'Demoras Prolongadas':
                pass = a.type === 'task' && !!(a.preds && a.preds.some(p => p.lag >= longLags));
                break;
            case 'Duraciones Prolongadas':
                pass = a.type === 'task' && a.dur > longDurations;
                break;
            case 'Márgenes Grandes':
                pass = a.type === 'task' && (a.TF || 0) > largeMargins;
                break;
            case 'Restricciones Obligatorias':
                pass = a.type === 'task' && ['MFO', 'MSO', 'SNLT', 'FNLT'].includes(a.constraint || '');
                break;
            case 'Restricciones Flexibles':
                pass = a.type === 'task' && ['ASAP', 'ALAP', 'SNET', 'FNET'].includes(a.constraint || '');
                break;
            case 'Lógica Rota':
                // Actividades cuya relación con su predecesora no se cumple
                if (a.type === 'task' && a.preds && a.preds.length > 0) {
                    const aPct = a.pct || 0;
                    pass = a.preds.some(p => {
                        const pred = activities.find(x => x.id === p.id);
                        if (!pred) return false;
                        const pPct = pred.pct || 0;
                        switch (p.type) {
                            case 'FS': // Sucesora empezó pero predecesora no terminó
                                return aPct > 0 && pPct < 100;
                            case 'SS': // Sucesora empezó pero predecesora no empezó
                                return aPct > 0 && pPct === 0;
                            case 'FF': // Sucesora terminó pero predecesora no terminó
                                return aPct >= 100 && pPct < 100;
                            case 'SF': // Sucesora terminó pero predecesora no empezó
                                return aPct >= 100 && pPct === 0;
                            default:
                                return false;
                        }
                    });
                }
                break;
            case 'Avance Post. F. Estado':
                if (a.type === 'task' && (a.pct || 0) > 0 && a.actualStart) {
                    const as = new Date(a.actualStart);
                    pass = as.getTime() > statusDate.getTime();
                }
                break;
            case 'Sin Comienzo Real':
                pass = a.type === 'task' && (a.pct || 0) > 0 && !a.actualStart;
                break;
        }
        if (pass) filteredSet.add(a.id);
    });

    // --- Custom Filters ---
    const activeCustomFilters = customFilters.filter(f => f.active);
    if (activeCustomFilters.length > 0) {
        hasSystemFilter = true;
        // Si ya hay un CheckerFilter, solo procesamos los que ya pasaron
        const baseActivities = activeCheckerFilter ? activities.filter(a => filteredSet.has(a.id) || a._isProjRow) : activities;

        // Resolve the actual value for a field (handles computed columns)
        const resolveFieldValue = (a: any, field: string): any => {
            switch (field) {
                case 'dur': return a.type === 'milestone' ? 0 : ((a as any)._spanDur ?? a.dur ?? 0);
                case 'remDur': return a.type === 'milestone' ? 0 : (a.remDur ?? a.dur ?? 0);
                case 'pct': return a.pct ?? 0;
                case 'plannedPct': return a._plannedPct ?? a.pct ?? 0;
                case 'work': return a.work ?? 0;
                case 'TF': return (a.type === 'summary' || a._isProjRow) ? null : (a.TF ?? null);
                case 'FF': return (a.type === 'summary' || a._isProjRow) ? null : (a._freeFloat ?? null);
                case 'floatPath': return (a.type === 'summary' || a._isProjRow) ? null : (a._floatPath ?? null);
                case 'weight': return a.weight ?? null;
                case 'earnedValue': {
                    let ev: number;
                    if (a.type === 'summary' || a._isProjRow) {
                        ev = 0;
                        const startJ = a._isProjRow ? 1 : activities.indexOf(a) + 1;
                        for (let j = startJ; j < activities.length; j++) {
                            const ch = activities[j];
                            if (!a._isProjRow && ch.lv <= a.lv) break;
                            if (ch.type === 'summary') continue;
                            ev += (ch.work || 0) * (ch.pct || 0) / 100;
                        }
                    } else {
                        ev = (a.work || 0) * (a.pct || 0) / 100;
                    }
                    return Math.round(ev * 10) / 10;
                }
                case 'remainingWork': {
                    let ev: number;
                    if (a.type === 'summary' || a._isProjRow) {
                        ev = 0;
                        const startJ = a._isProjRow ? 1 : activities.indexOf(a) + 1;
                        for (let j = startJ; j < activities.length; j++) {
                            const ch = activities[j];
                            if (!a._isProjRow && ch.lv <= a.lv) break;
                            if (ch.type === 'summary') continue;
                            ev += (ch.work || 0) * (ch.pct || 0) / 100;
                        }
                    } else {
                        ev = (a.work || 0) * (a.pct || 0) / 100;
                    }
                    return Math.round(((a.work || 0) - ev) * 10) / 10;
                }
                case 'cal': return a.cal ?? '';
                case 'type': return a.type === 'milestone' ? 'Hito' : a.type === 'summary' ? 'Resumen' : 'Tarea';
                case 'lv': return a.lv;
                case 'outlineNum': return a.outlineNum ?? '';
                case 'startDate': return isoDate(a.ES ?? null);
                case 'endDate': return isoDate(a.EF ?? null);
                case 'actualStart': return a.actualStart ? isoDate(new Date(a.actualStart)) : '';
                case 'actualFinish': return a.actualFinish ? isoDate(new Date(a.actualFinish)) : '';
                case 'remStartDate': return isoDate(a._remES ?? null);
                case 'remEndDate': return isoDate(a._remEF ?? null);
                case 'blStart': return isoDate(a.blES ?? null);
                case 'blEnd': return isoDate(a.blEF ?? null);
                case 'constraintDate': return a.constraintDate ? isoDate(new Date(a.constraintDate)) : '';
                case 'predStr': {
                    if (!a.preds || a.preds.length === 0) return '';
                    return a.preds.map((p: any) => p.id + (p.type !== 'FS' ? ` ${p.type}` : '') + (p.lag ? ` +${p.lag}d` : '')).join(', ');
                }
                default: return a[field] ?? null;
            }
        };

        let customFilteredSet = new Set<string>();

        baseActivities.forEach(a => {
            if (a._isProjRow) { customFilteredSet.add(a.id); return; }

            let passCurrentFilterSet = false;
            let filterPasses: boolean[] = [];

            for (const filter of activeCustomFilters) {
                let conditionPasses: boolean[] = [];
                for (const cond of filter.conditions) {
                    let val = resolveFieldValue(a, cond.field);
                    // Use ?? instead of || so that 0 and false are preserved
                    let sVal = String(val ?? '').trim().toLowerCase();
                    // Strip common display suffixes (días, hrs, %) from user input
                    let tVal = cond.value.trim().toLowerCase()
                        .replace(/\s*(días|dias|d|hrs|h|%)$/, '');
                    let passCond = false;

                    // Detect ISO date strings (YYYY-MM-DD) so they aren't mistaken for numbers
                    const isoRx = /^\d{4}-\d{2}-\d{2}$/;
                    const bothDates = isoRx.test(sVal) && isoRx.test(tVal);

                    // For equals/not_equals, also try numeric comparison as fallback
                    const numVal = parseFloat(sVal);
                    const numTVal = parseFloat(tVal);
                    const bothNumeric = !bothDates && !isNaN(numVal) && !isNaN(numTVal) && tVal !== '';

                    switch (cond.operator) {
                        case 'equals':
                            if (bothDates) { passCond = sVal === tVal; }
                            else { passCond = sVal === tVal || (bothNumeric && numVal === numTVal); }
                            break;
                        case 'not_equals':
                            if (bothDates) { passCond = sVal !== tVal; }
                            else { passCond = bothNumeric ? numVal !== numTVal : sVal !== tVal; }
                            break;
                        case 'contains': passCond = sVal.includes(tVal); break;
                        case 'not_contains': passCond = !sVal.includes(tVal); break;
                        case 'is_empty': passCond = sVal === ''; break;
                        case 'is_not_empty': passCond = sVal !== ''; break;
                        case 'greater_than':
                        case 'greater_than_or_equal':
                        case 'less_than':
                        case 'less_than_or_equal': {
                            // Try date comparison first, then numeric
                            let dVal = parseDate(sVal);
                            let dTVal = parseDate(tVal);
                            if (dVal && dTVal) {
                                const dt = dVal.getTime(), tt = dTVal.getTime();
                                if (cond.operator === 'greater_than') passCond = dt > tt;
                                else if (cond.operator === 'greater_than_or_equal') passCond = dt >= tt;
                                else if (cond.operator === 'less_than') passCond = dt < tt;
                                else passCond = dt <= tt;
                            } else if (bothNumeric) {
                                if (cond.operator === 'greater_than') passCond = numVal > numTVal;
                                else if (cond.operator === 'greater_than_or_equal') passCond = numVal >= numTVal;
                                else if (cond.operator === 'less_than') passCond = numVal < numTVal;
                                else passCond = numVal <= numTVal;
                            }
                            break;
                        }
                    }
                    conditionPasses.push(passCond);
                }

                const filterPass = filter.matchAll
                    ? conditionPasses.every(p => p)
                    : (conditionPasses.length === 0 ? true : conditionPasses.some(p => p));

                filterPasses.push(filterPass);
            }

            if (filterPasses.length > 0) {
                passCurrentFilterSet = filtersMatchAll
                    ? filterPasses.every(p => p)
                    : filterPasses.some(p => p);
            } else {
                passCurrentFilterSet = true;
            }

            if (passCurrentFilterSet) customFilteredSet.add(a.id);
        });

        filteredSet = customFilteredSet;
    }

    if (hasSystemFilter) {
        // Add parents of filtered items so hierarchy is maintained
        let currentPath: Activity[] = [];
        for (let i = 0; i < activities.length; i++) {
            const a = activities[i];
            currentPath[a.lv] = a;
            if (filteredSet.has(a.id)) {
                for (let l = 0; l < a.lv; l++) {
                    if (currentPath[l]) filteredSet.add(currentPath[l].id);
                }
            }
        }
    }

    activities.forEach((a, i) => {
        if (hasSystemFilter && !filteredSet.has(a.id)) return;
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

function recalcInternal(state: GanttState, statusDate: Date | null): GanttState {
    let acts = ensureProjRow([...state.activities], state.showProjRow, state.projName, state.defCal);
    const result = calcCPM(acts, state.projStart, state.defCal, statusDate, state.projName, state.activeBaselineIdx, state.customCalendars);
    // Multiple Float Paths
    if (state.mfpConfig.enabled) {
        calcMultipleFloatPaths(result.activities, state.mfpConfig.endActivityId, state.mfpConfig.mode, state.mfpConfig.maxPaths, state.defCal);
    }
    computeOutlineNumbers(result.activities);
    const visRows = buildVisRows(result.activities, state.collapsed, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes, state.activeCheckerFilter, state.checkerThresholds, state.statusDate, state.customFilters, state.filtersMatchAll);
    // Auto-fit: pxPerDay based on PROJECT span (not totalDays) so project fills viewport
    // but totalDays extends beyond for scrollable buffer
    const timelineW = Math.max(400, (typeof window !== 'undefined' ? window.innerWidth : 1200) - state.tableW - 10);
    const fitPx = timelineW / result.projectDays;
    const pxPerDay = Math.max(0.5, Math.min(fitPx, 150));
    // Timeline rendering starts 30 days before project start
    const timelineStart = addDays(state.projStart, -30);
    return { ...state, activities: result.activities, totalDays: result.totalDays, visRows, pxPerDay, timelineStart, _cpmStatusDate: statusDate };
}

/** Recalc básico: forward/backward pass SIN retained logic. Usado en ediciones automáticas. */
function recalc(state: GanttState): GanttState {
    return recalcInternal(state, state._cpmStatusDate);
}

/** Recalc completo: forward/backward pass CON retained logic. Solo para botón "Calcular CPM". */
function recalcFull(state: GanttState): GanttState {
    return recalcInternal(state, state.statusDate);
}

/** Actualizar solo los datos sin recalcular CPM (para ediciones de avance, etc.) */
function refreshVisRows(state: GanttState): GanttState {
    let acts = ensureProjRow([...state.activities], state.showProjRow, state.projName, state.defCal);
    computeOutlineNumbers(acts);
    const visRows = buildVisRows(acts, state.collapsed, state.activeGroup, state.columns, state.currentView, state.expResources, state.usageModes, state.activeCheckerFilter, state.checkerThresholds, state.statusDate, state.customFilters, state.filtersMatchAll);
    return { ...state, activities: acts, visRows };
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
            // Support multi-selection: delete all selected rows
            const indices = state.selIndices.size > 1
                ? Array.from(state.selIndices).sort((a, b) => b - a) // descending to splice safely
                : [action.index];
            const acts = [...state.activities];
            const delIds = new Set<string>();
            for (const i of indices) {
                if (acts[i]?._isProjRow) continue;
                delIds.add(acts[i].id);
            }
            // Remove from highest index to lowest
            for (const i of indices) {
                if (acts[i]?._isProjRow) continue;
                acts.splice(i, 1);
            }
            // Remove references in predecessors
            acts.forEach(a => { if (a.preds) a.preds = a.preds.filter(p => !delIds.has(p.id)); });
            const newSel = Math.min(state.selIdx, acts.length - 1);
            return recalc({ ...state, activities: acts, selIdx: newSel, selIndices: new Set([newSel]) });
        }

        case 'UPDATE_ACTIVITY': {
            const acts = [...state.activities];
            const orig = acts[action.index];
            const updated = { ...orig, ...action.updates };
            // Track actualStart: when pct goes from 0 to >0, record the current start date
            const oldPct = orig.pct || 0;
            const newPct = updated.pct || 0;
            if (oldPct === 0 && newPct > 0 && !updated.actualStart) {
                if (orig.ES) {
                    updated.actualStart = isoDate(orig.ES);
                } else if (orig.constraintDate) {
                    updated.actualStart = orig.constraintDate;
                }
            }
            if (newPct === 0) {
                updated.actualStart = null;
                updated.actualFinish = null;
            }
            // Track actualFinish: when pct reaches 100, record the current EF
            if (newPct === 100 && !updated.actualFinish) {
                if (orig.EF) {
                    updated.actualFinish = isoDate(addDays(orig.EF, -1));
                }
            }
            if (newPct < 100) {
                updated.actualFinish = null;
            }
            acts[action.index] = updated;
            return recalc({ ...state, activities: acts });
        }

        case 'COMMIT_EDIT': {
            const acts = [...state.activities];
            const a = { ...acts[action.index] };
            if (a._isProjRow) return state;
            if (a.type === 'summary' && (action.key === 'work' || action.key === 'pct' || action.key === 'dur')) return state;
            const val = action.value;
            const { key } = action;

            // ── Early return: si el valor no cambió, NO recalcular ──
            const curVal = (() => {
                if (key === 'name') return a.name || '';
                if (key === 'id') return a.id || '';
                if (key === 'dur') return String(a._spanDur != null ? a._spanDur : (a.dur || 0));
                if (key === 'remDur') return String(a.remDur != null ? a.remDur : '');
                if (key === 'pct') return String(a.pct || 0);
                if (key === 'work') return String(a.work || 0);
                if (key === 'weight') return a.weight != null ? String(a.weight) : '';
                if (key === 'predStr') return predsToStr(a.preds);
                if (key === 'startDate') return a.ES ? fmtDate(a.ES) : '';
                if (key === 'endDate') return a.EF ? fmtDate(a.type === 'milestone' ? a.EF : addDays(a.EF, -1)) : '';
                if (key === 'cal') return String(a.cal || state.defCal);
                if (key === 'notes') return a.notes || '';
                if (key === 'res') return a.res || '';
                if (key.startsWith('txt')) return (a as any)[key] || '';
                return '';
            })();
            if (val === curVal) return state;
            if (key === 'name') a.name = val;
            else if (key === 'id') {
                const oldId = a.id; a.id = val;
                acts.forEach(x => { if (x.preds) x.preds.forEach(p => { if (p.id === oldId) p.id = val; }); });
            }
            else if (key === 'dur') {
                const n = parseInt(val); if (!isNaN(n)) {
                    const newDur = Math.max(0, n);
                    if (newDur === 0) a.type = 'milestone'; else if (a.type === 'milestone') a.type = 'task';
                    // Calcular delta respecto a lo que el usuario VE (_spanDur o dur)
                    const visualDur = a._spanDur != null ? a._spanDur : (a.dur || 0);
                    const delta = newDur - visualDur;
                    // Bidireccional: si tiene avance, ajustar remDur por el mismo delta
                    if ((a.pct || 0) > 0 && a.remDur != null) {
                        a.remDur = Math.max(0, a.remDur + delta);
                    } else if ((a.pct || 0) === 0) {
                        a.remDur = null;
                    }
                    // Ajustar dur modelo por el delta (no asignar newDur directo)
                    a.dur = Math.max(0, (a.dur || 0) + delta);
                }
            }
            else if (key === 'remDur') {
                const n = parseInt(val);
                if (!isNaN(n)) {
                    const newRemDur = Math.max(0, n);
                    // Bidireccional: ajustar dur por el mismo delta
                    if ((a.pct || 0) > 0) {
                        const delta = newRemDur - (a.remDur != null ? a.remDur : Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100));
                        a.dur = Math.max(0, (a.dur || 0) + delta);
                    } else {
                        a.dur = newRemDur;
                    }
                    a.remDur = newRemDur;
                }
                // Si se cambió dur (bidireccional), recalcular CPM
                acts[action.index] = a;
                if ((a.pct || 0) > 0) {
                    return recalc({ ...state, activities: acts });
                }
                return refreshVisRows({ ...state, activities: acts });
            }
            else if (key === 'predStr') {
                a.preds = strToPreds(val);
            }
            else if (key === 'startDate') {
                const d = parseDate(val);
                if (d) {
                    a.constraint = 'MSO'; a.constraintDate = isoDate(d); a.manual = true;
                    // Si tiene avance, actualizar también el Actual Start
                    if ((a.pct || 0) > 0) a.actualStart = isoDate(d);
                }
                else { a.constraint = ''; a.constraintDate = ''; a.manual = false; }
            }
            else if (key === 'endDate') {
                const d = parseDate(val);
                if (d) {
                    // Update duration based on new end date
                    if (a.ES) {
                        const newDur = calWorkDays(a.ES, d, a.cal || state.defCal);
                        a.dur = Math.max(0, newDur);
                    }
                }
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
                const oldPct = a.pct || 0;
                const newPct = Math.min(100, Math.max(0, parseInt(val) || 0));
                a.pct = newPct;
                // Cuando pasa de 0 a >0, guardar la fecha de inicio real
                if (oldPct === 0 && newPct > 0 && !a.actualStart) {
                    // Guardar la fecha de comienzo actual (ES o constraintDate) como Actual Start
                    if (a.ES) {
                        a.actualStart = isoDate(a.ES);
                    } else if (a.constraintDate) {
                        a.actualStart = a.constraintDate;
                    }
                }
                // Si vuelve a 0, limpiar actualStart y actualFinish
                if (newPct === 0) {
                    a.actualStart = null;
                    a.actualFinish = null;
                }
                // Track actualFinish: cuando llega a 100, guardar EF como Fin Real
                if (newPct === 100 && !a.actualFinish) {
                    if (a.EF) {
                        a.actualFinish = isoDate(addDays(a.EF, -1));
                    }
                }
                if (newPct < 100) {
                    a.actualFinish = null;
                }
                // Recalcular duración restante basado en el nuevo avance
                a.remDur = Math.round((a.dur || 0) * (100 - newPct) / 100);
                // Solo guardar — NO recalcular CPM. El usuario debe presionar "Calcular CPM"
                acts[action.index] = a;
                return refreshVisRows({ ...state, activities: acts });
            }
            else if (key === 'cal') {
                const calVal = parseInt(val);
                if (calVal === 5 || calVal === 6 || calVal === 7) {
                    a.cal = calVal as CalendarType;
                } else {
                    // Custom calendar ID (string)
                    a.cal = val as CalendarType;
                }
            }
            else if (key === 'notes') a.notes = val;
            else if (key.startsWith('txt')) (a as any)[key] = val;
            acts[action.index] = a;
            return recalc({ ...state, activities: acts });
        }

        case 'SET_SELECTION': {
            const idx = action.index;
            if (action.shift && state.selIdx >= 0) {
                // Shift: range selection from last selIdx to clicked index
                const lo = Math.min(state.selIdx, idx);
                const hi = Math.max(state.selIdx, idx);
                const next = new Set(state.selIndices);
                for (let i = lo; i <= hi; i++) next.add(i);
                return { ...state, selIndices: next };
            }
            if (action.ctrl) {
                // Ctrl: toggle individual
                const next = new Set(state.selIndices);
                if (next.has(idx)) next.delete(idx); else next.add(idx);
                return { ...state, selIdx: idx, selIndices: next };
            }
            // Normal click: single selection
            return { ...state, selIdx: idx, selIndices: new Set([idx]) };
        }

        case 'SET_ZOOM': {
            const timelineW = Math.max(400, (typeof window !== 'undefined' ? window.innerWidth : 1200) - state.tableW - 10);
            const fitPx = Math.max(0.5, Math.min(timelineW / state.totalDays, 150));
            return { ...state, zoom: action.zoom, pxPerDay: fitPx };
        }

        case 'SET_PX_PER_DAY':
            return { ...state, pxPerDay: action.px };

        case 'TOGGLE_THEME':
            return { ...state, lightMode: !state.lightMode };

        case 'TOGGLE_TODAY_LINE':
            return { ...state, showTodayLine: !state.showTodayLine };

        case 'TOGGLE_STATUS_LINE':
            return { ...state, showStatusLine: !state.showStatusLine };

        case 'TOGGLE_DEPENDENCIES':
            return { ...state, showDependencies: !state.showDependencies };

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
            return recalcFull(state);

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

        case 'SET_COLUMNS_ORDER': {
            return { ...state, columns: action.columns, colWidths: action.colWidths };
        }

        case 'SET_COL_WIDTH': {
            const cw = [...state.colWidths];
            cw[action.index] = Math.max(20, action.width);
            return { ...state, colWidths: cw };
        }

        case 'SET_SHOW_PROJ_ROW':
            return recalc({ ...state, showProjRow: action.show });

        case 'INDENT': {
            // Support multi-selection: indent all selected rows
            const indices = state.selIndices.size > 1
                ? Array.from(state.selIndices).sort((a, b) => a - b) // ascending order
                : (state.selIdx >= 0 ? [state.selIdx] : []);
            if (indices.length === 0) return state;
            const acts = [...state.activities];
            let changed = false;
            for (const si of indices) {
                if (acts[si]?._isProjRow) continue;
                const a = { ...acts[si] };
                const oldLv = a.lv;
                let maxLv = 5;
                if (action.dir > 0 && si > 0) {
                    maxLv = acts[si - 1].lv + 1;
                }
                const newLv = Math.max(0, Math.min(maxLv, oldLv + action.dir));
                if (newLv === oldLv) continue;
                a.lv = newLv;
                changed = true;
                // Auto-promote parent to summary
                if (action.dir > 0 && newLv > oldLv && si > 0) {
                    for (let j = si - 1; j >= 0; j--) {
                        if (acts[j].lv < newLv) {
                            acts[j] = { ...acts[j], type: 'summary' };
                            break;
                        }
                    }
                }
                // Auto-demote if no children remain
                if (action.dir < 0 && newLv < oldLv) {
                    for (let j = si - 1; j >= 0; j--) {
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
                acts[si] = a;
            }
            if (!changed) return state;
            return recalc({ ...state, activities: acts });
        }

        case 'MOVE_ROW': {
            // Support multi-selection: move all selected rows as a block
            const indices = state.selIndices.size > 1
                ? Array.from(state.selIndices).sort((a, b) => a - b)
                : (state.selIdx >= 0 ? [state.selIdx] : []);
            if (indices.length === 0) return state;
            const acts = [...state.activities];
            if (action.dir < 0) {
                // Move up: first selected can't go above 0 or into proj row
                const first = indices[0];
                if (first <= 0 || acts[first - 1]._isProjRow) return state;
                for (const si of indices) {
                    if (acts[si]._isProjRow) return state;
                }
                // Swap each upward in order
                for (const si of indices) {
                    const temp = acts[si - 1];
                    acts[si - 1] = acts[si];
                    acts[si] = temp;
                }
                const newIndices = new Set(indices.map(i => i - 1));
                const newSel = state.selIdx - 1;
                return recalc({ ...state, activities: acts, selIdx: newSel, selIndices: newIndices });
            } else {
                // Move down: last selected can't go past end or into proj row
                const last = indices[indices.length - 1];
                if (last >= acts.length - 1 || acts[last + 1]._isProjRow) return state;
                for (const si of indices) {
                    if (acts[si]._isProjRow) return state;
                }
                // Swap each downward in reverse order
                for (let j = indices.length - 1; j >= 0; j--) {
                    const si = indices[j];
                    const temp = acts[si + 1];
                    acts[si + 1] = acts[si];
                    acts[si] = temp;
                }
                const newIndices = new Set(indices.map(i => i + 1));
                const newSel = state.selIdx + 1;
                return recalc({ ...state, activities: acts, selIdx: newSel, selIndices: newIndices });
            }
        }

        case 'CUT_ACTIVITY': {
            // Support multi-selection: cut all selected rows
            const indices = state.selIndices.size > 1
                ? Array.from(state.selIndices).sort((a, b) => b - a) // descending for safe splice
                : (state.selIdx >= 0 ? [state.selIdx] : []);
            if (indices.length === 0) return state;
            const acts = [...state.activities];
            const cutItems: Activity[] = [];
            const delIds = new Set<string>();
            // Collect items to cut (ascending for clipboard order)
            for (const i of [...indices].reverse()) {
                if (acts[i]?._isProjRow) continue;
                cutItems.push({ ...acts[i] });
                delIds.add(acts[i].id);
            }
            if (cutItems.length === 0) return state;
            // Remove from highest to lowest
            for (const i of indices) {
                if (acts[i]?._isProjRow) continue;
                acts.splice(i, 1);
            }
            acts.forEach(a => { if (a.preds) a.preds = a.preds.filter(p => !delIds.has(p.id)); });
            const newSel = Math.min(state.selIdx, acts.length - 1);
            // Store first cut item in clipboard (for single paste), store all in clipboardMulti
            return recalc({ ...state, activities: acts, clipboard: cutItems[0], clipboardMulti: cutItems, selIdx: newSel, selIndices: new Set([newSel]) });
        }

        case 'COPY_ACTIVITY': {
            // Copy selected rows to clipboard without removing them
            const indices = state.selIndices.size > 1
                ? Array.from(state.selIndices).sort((a, b) => a - b)
                : (state.selIdx >= 0 ? [state.selIdx] : []);
            if (indices.length === 0) return state;
            const copyItems: Activity[] = [];
            for (const i of indices) {
                const a = state.activities[i];
                if (a && !a._isProjRow) copyItems.push({ ...a });
            }
            if (copyItems.length === 0) return state;
            return { ...state, clipboard: copyItems[0], clipboardMulti: copyItems };
        }

        case 'PASTE_ACTIVITY': {
            const items = state.clipboardMulti && state.clipboardMulti.length > 0
                ? state.clipboardMulti
                : state.clipboard ? [state.clipboard] : [];
            if (items.length === 0) return state;
            const acts = [...state.activities];
            const idx = state.selIdx >= 0 ? state.selIdx + 1 : acts.length;
            const pasted: Activity[] = [];
            for (const item of items) {
                const newItem = { ...item, id: autoId([...acts, ...pasted]) };
                pasted.push(newItem);
            }
            acts.splice(idx, 0, ...pasted);
            const lastIdx = idx + pasted.length - 1;
            return recalc({ ...state, activities: acts, selIdx: lastIdx, selIndices: new Set(pasted.map((_, i) => idx + i)) });
        }

        case 'SAVE_BASELINE': {
            if (!state.activities.length) return state;
            const blIdx = action.index != null ? action.index : state.activeBaselineIdx;
            const blName = action.name || `Línea Base ${blIdx}`;
            const blDesc = action.description || '';
            const now = new Date().toISOString();
            // Auto-activate the saved baseline
            const newActiveIdx = blIdx;
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
                // Always use the newly saved baseline as active fields
                const active = baselines[newActiveIdx];
                return {
                    ...a,
                    baselines,
                    blDur: active ? active.dur : null,
                    blES: active ? active.ES : null,
                    blEF: active ? active.EF : null,
                    blCal: active ? active.cal : null,
                };
            });
            return recalc({ ...state, activeBaselineIdx: newActiveIdx, activities: acts });
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
            return recalc({ ...state, activeBaselineIdx: blIdx, activities: acts });
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

        case 'OPEN_CAL_MODAL': return { ...state, calModalOpen: true };
        case 'CLOSE_CAL_MODAL': return { ...state, calModalOpen: false };
        case 'SAVE_CALENDAR': {
            const cals = [...state.customCalendars];
            const idx = cals.findIndex(c => c.id === action.calendar.id);
            if (idx >= 0) cals[idx] = action.calendar;
            else cals.push(action.calendar);
            // Persist to localStorage
            try { localStorage.setItem('gantt-cpm-custom-calendars', JSON.stringify(cals)); } catch { }
            return recalc({ ...state, customCalendars: cals });
        }
        case 'DELETE_CALENDAR': {
            const cals = state.customCalendars.filter(c => c.id !== action.id);
            // Revert any activities using deleted calendar back to defCal
            const acts = state.activities.map(a =>
                a.cal === action.id ? { ...a, cal: state.defCal } : a
            );
            try { localStorage.setItem('gantt-cpm-custom-calendars', JSON.stringify(cals)); } catch { }
            return recalc({ ...state, customCalendars: cals, activities: acts });
        }

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
            return recalcFull({ ...state, ...action.state });

        case 'SET_PROGRESS_HISTORY':
            return { ...state, progressHistory: action.history };

        case 'SAVE_PERIOD_PROGRESS': {
            const todayISO = isoDate(state.statusDate || new Date());
            const projAct = state.activities.find(a => a._isProjRow);
            const actualPct = projAct ? (projAct.pct || 0) : 0;
            const details: Record<string, number> = {};
            const snapshots: Record<string, any> = {};
            state.activities.forEach(a => {
                if (a._isProjRow) return;
                details[a.id] = a.pct ?? 0;
                snapshots[a.id] = {
                    pct: a.pct ?? 0,
                    dur: a.dur,
                    remDur: a.remDur,
                    work: a.work,
                    weight: a.weight,
                    res: a.res,
                    resources: JSON.parse(JSON.stringify(a.resources || [])),
                    manual: a.manual,
                    constraint: a.constraint,
                    constraintDate: a.constraintDate,
                    actualStart: a.actualStart,
                    actualFinish: a.actualFinish,
                };
            });
            const newEntry: ProgressHistoryEntry = { date: todayISO, actualPct, details, snapshots };
            const history = [...state.progressHistory];
            const existingIdx = history.findIndex(h => h.date === todayISO);
            if (existingIdx >= 0) history[existingIdx] = newEntry;
            else history.push(newEntry);
            history.sort((a, b) => a.date.localeCompare(b.date));
            return { ...state, progressHistory: history, progressModalOpen: false };
        }

        case 'LOAD_PROGRESS_SNAPSHOT': {
            const entry = state.progressHistory.find(h => h.date === action.date);
            if (!entry) return state;
            const d = parseDate(action.date);
            const newStatusDate = d || state.statusDate;
            // Restore activity data from snapshot
            const acts = state.activities.map(a => {
                if (a._isProjRow) return a;
                // Try full snapshot first, then legacy details
                const snap = entry.snapshots?.[a.id];
                if (snap) {
                    return {
                        ...a,
                        pct: snap.pct ?? a.pct,
                        dur: snap.dur ?? a.dur,
                        remDur: snap.remDur !== undefined ? snap.remDur : a.remDur,
                        work: snap.work ?? a.work,
                        weight: snap.weight !== undefined ? snap.weight : a.weight,
                        res: snap.res ?? a.res,
                        resources: snap.resources ? JSON.parse(JSON.stringify(snap.resources)) : a.resources,
                        manual: snap.manual ?? a.manual,
                        constraint: snap.constraint ?? a.constraint,
                        constraintDate: snap.constraintDate ?? a.constraintDate,
                        actualStart: snap.actualStart !== undefined ? snap.actualStart : a.actualStart,
                        actualFinish: snap.actualFinish !== undefined ? snap.actualFinish : a.actualFinish,
                    };
                }
                // Legacy: only pct from details
                const legacyPct = entry.details?.[a.id];
                if (legacyPct !== undefined) {
                    return { ...a, pct: legacyPct };
                }
                return a;
            });
            return recalcFull({ ...state, activities: acts, statusDate: newStatusDate, progressModalOpen: false });
        }

        case 'DELETE_PROGRESS_ENTRY': {
            const history = state.progressHistory.filter(h => h.date !== action.date);
            return { ...state, progressHistory: history };
        }

        case 'SET_CHECKER_FILTER':
            return recalc({ ...state, activeCheckerFilter: action.filter });

        case 'SET_CHECKER_THRESHOLDS':
            return recalc({ ...state, checkerThresholds: action.thresholds });

        case 'OPEN_CHECK_MODAL':
            return { ...state, checkModalOpen: true };

        case 'CLOSE_CHECK_MODAL':
            return { ...state, checkModalOpen: false };

        case 'SET_CUSTOM_FILTERS':
            return recalc({ ...state, customFilters: action.filters });

        case 'SET_FILTERS_MATCH_ALL':
            return recalc({ ...state, filtersMatchAll: action.matchAll });

        case 'OPEN_FILTERS_MODAL':
            return { ...state, filtersModalOpen: true };

        case 'CLOSE_FILTERS_MODAL':
            return { ...state, filtersModalOpen: false };

        case 'SET_MFP_CONFIG': {
            const newMfp = { ...state.mfpConfig, ...action.config };
            return recalc({ ...state, mfpConfig: newMfp });
        }

        case 'TOGGLE_MFP': {
            const newMfp = { ...state.mfpConfig, enabled: !state.mfpConfig.enabled };
            return recalc({ ...state, mfpConfig: newMfp });
        }

        case 'SET_CHAIN_TRACE': {
            const selAct = state.selIdx >= 0 ? state.activities[state.selIdx] : null;
            if (!selAct || selAct._isProjRow || selAct.type === 'summary') return state;
            const ids = traceChain(state.activities, selAct.id, action.dir);
            return { ...state, chainTrace: { actId: selAct.id, dir: action.dir }, chainIds: ids };
        }

        case 'CLEAR_CHAIN_TRACE':
            return { ...state, chainTrace: null, chainIds: new Set<string>() };

        default:
            return state;
    }
}

// ─── Initial State ──────────────────────────────────────────────
const now = new Date(); now.setHours(0, 0, 0, 0);

// Load custom calendars from localStorage
let _savedCalendars: CustomCalendar[] = [];
try {
    const raw = localStorage.getItem('gantt-cpm-custom-calendars');
    if (raw) {
        _savedCalendars = (JSON.parse(raw!) as any[]).map((c: any) => ({
            ...c,
            // Migrate old single-number hoursPerDay to per-day array
            hoursPerDay: Array.isArray(c.hoursPerDay)
                ? c.hoursPerDay
                : c.workDays.map((wd: boolean) => wd ? (c.hoursPerDay || 8) : 0),
        }));
    }
} catch { }


const initialState: GanttState = {
    projName: 'Mi Proyecto',
    projStart: now,
    defCal: 6,
    statusDate: now,
    _cpmStatusDate: null,
    activities: [],
    resourcePool: [],
    visRows: [],
    zoom: 'week',
    pxPerDay: 8,
    totalDays: 400,
    timelineStart: now,
    lightMode: false,
    showProjRow: true,
    showTodayLine: true,
    showStatusLine: true,
    showDependencies: true,
    currentView: 'gantt',
    collapsed: new Set(),
    expResources: new Set(),
    selIdx: -1,
    selIndices: new Set<number>(),
    tableW: 400,
    activeGroup: 'none',
    columns: DEFAULT_COLS,
    colWidths: DEFAULT_COLS.map(c => c.w),
    usageModes: ['Trabajo'],
    usageZoom: 'week',
    undoStack: [],
    clipboard: null,
    clipboardMulti: [],
    actModalOpen: false,
    projModalOpen: false,
    linkModalOpen: false,
    linkModalData: null,
    sbModalOpen: false,
    progressModalOpen: false,
    progressHistory: [],
    activeBaselineIdx: 0,
    blModalOpen: false,
    customCalendars: _savedCalendars,
    calModalOpen: false,
    activeCheckerFilter: null,
    checkerThresholds: { longLags: 20, largeMargins: 20, longDurations: 20 },
    checkModalOpen: false,
    customFilters: [],
    filtersMatchAll: true,
    filtersModalOpen: false,
    mfpConfig: { enabled: false, endActivityId: null, mode: 'totalFloat', maxPaths: 10 },
    chainTrace: null,
    chainIds: new Set<string>(),
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
