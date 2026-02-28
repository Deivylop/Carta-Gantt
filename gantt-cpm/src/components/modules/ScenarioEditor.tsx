// ═══════════════════════════════════════════════════════════════════
// ScenarioEditor – GanttTable-equivalent for What-If scenarios
// Same columns, selection, context menu, and column picker as the
// main Gantt table, but edits apply to the isolated scenario copy.
// Changed cells are highlighted in amber vs the master schedule.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import { fmtDate, addDays, isoDate, parseDate } from '../../utils/cpm';
import { predsToStr, getWeightPct, strToPreds } from '../../utils/helpers';
import ColumnPickerModal from '../ColumnPickerModal';
import ScenarioAlertModal, {
  type ScenarioAlert,
  validateProgressDataDate,
  validateOutOfSequence,
  validateScenarioForMerge,
} from './ScenarioAlertModal';
import type { WhatIfScenario, Activity } from '../../types/gantt';
import { RefreshCw, ArrowRightLeft } from 'lucide-react';

/* ═══════════════════ Editable cells (same as GanttTable) ═══════════════════ */

const EditableNumberCell = ({ rawValue, displayValue, onUpdate, onFocus, isRowSelected, step, min, max }: {
  rawValue: string; displayValue: string; onUpdate: (val: string) => void;
  onFocus: () => void; isRowSelected: boolean; step?: number; min?: number; max?: number;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(rawValue);
  const wasSelectedRef = useRef(false);
  useEffect(() => { setVal(rawValue); }, [rawValue]);
  useEffect(() => { wasSelectedRef.current = isRowSelected; }, [isRowSelected]);
  useEffect(() => { if (!isRowSelected && isEditing) { setIsEditing(false); onUpdate(val); } }, [isRowSelected]);

  const enterEdit = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); onFocus(); };

  if (isEditing) return (
    <div style={{ width: '100%', height: '100%', display: 'flex' }}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      <input type="number" step={step} min={min} max={max}
        style={{ background: 'transparent', outline: 'none', border: '1px solid #3b82f6', color: 'inherit', padding: 0, margin: 0, width: '100%', height: '100%', fontSize: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box', textAlign: 'inherit' }}
        autoFocus value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { setIsEditing(false); onUpdate(val); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setIsEditing(false); }}
        onFocus={onFocus}
        onContextMenu={e => { e.preventDefault(); setIsEditing(false); }}
      />
    </div>
  );
  return (
    <span style={{ cursor: 'text', display: 'flex', alignItems: 'center', justifyContent: 'inherit', width: '100%', height: '100%' }}
      onMouseDown={e => { if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return; if (isRowSelected || wasSelectedRef.current) { enterEdit(e); return; } wasSelectedRef.current = true; }}
      onDoubleClick={e => { if (!isEditing) enterEdit(e); }}
      onClick={e => { if ((isRowSelected || wasSelectedRef.current) && !e.ctrlKey && !e.metaKey && !e.shiftKey) e.stopPropagation(); }}>
      {displayValue}
    </span>
  );
};

const EditableDateCell = ({ dateValue, displayValue, onUpdate, onFocus, isRowSelected }: {
  dateValue: Date | null | undefined; displayValue: string; onUpdate: (val: string) => void;
  onFocus: () => void; isRowSelected: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const wasSelectedRef = useRef(false);
  const toIso = (d: Date | null | undefined) => { if (!d) return ''; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const [val, setVal] = useState(toIso(dateValue));
  useEffect(() => { setVal(toIso(dateValue)); }, [dateValue]);
  useEffect(() => { wasSelectedRef.current = isRowSelected; }, [isRowSelected]);
  useEffect(() => { if (!isRowSelected && isEditing) { setIsEditing(false); onUpdate(val); } }, [isRowSelected]);

  const enterEdit = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); onFocus(); };

  if (isEditing) return (
    <div style={{ width: '100%', height: '100%', display: 'flex' }}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      <input type="date"
        style={{ background: 'transparent', outline: 'none', border: 'none', color: 'inherit', padding: 0, margin: 0, width: '100%', height: '100%', fontSize: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box' }}
        autoFocus value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { setIsEditing(false); onUpdate(val); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setIsEditing(false); }}
        onFocus={onFocus}
        onContextMenu={e => { e.preventDefault(); setIsEditing(false); }}
      />
    </div>
  );
  return (
    <span style={{ cursor: 'text', display: 'flex', alignItems: 'center', justifyContent: 'inherit', width: '100%', height: '100%' }}
      onMouseDown={e => { if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return; if (isRowSelected || wasSelectedRef.current) { enterEdit(e); return; } wasSelectedRef.current = true; }}
      onDoubleClick={e => { if (!isEditing) enterEdit(e); }}
      onClick={e => { if ((isRowSelected || wasSelectedRef.current) && !e.ctrlKey && !e.metaKey && !e.shiftKey) e.stopPropagation(); }}>
      {displayValue}
    </span>
  );
};

/* ═══════════════════ Constants ═══════════════════ */

const FILL_DOWN_KEYS = new Set(['name', 'dur', 'remDur', 'pct', 'work', 'weight', 'predStr', 'startDate', 'endDate', 'cal', 'notes', 'res']);

interface Props { scenario: WhatIfScenario; }

/* ═══════════════════ Main Component ═══════════════════ */

export default function ScenarioEditor({ scenario }: Props) {
  const { state, dispatch } = useGantt();
  const { columns, colWidths, lightMode, defCal } = state;
  const activities = scenario.activities;

  /* ── Local selection ── */
  const [selIdx, setSelIdx] = useState(-1);
  const [selIndices, setSelIndices] = useState<Set<number>>(new Set());
  const touchedRowsRef = useRef<Set<number>>(new Set());

  /* ── Column resize ── */
  const [colResize, setColResize] = useState<{ idx: number; startX: number; startW: number } | null>(null);
  const [colPickerOpen, setColPickerOpen] = useState(false);

  /* ── Context menu ── */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxColKey, setCtxColKey] = useState<string | null>(null);

  /* ── Alert modal for validation ── */
  const [alert, setAlert] = useState<ScenarioAlert | null>(null);
  const pendingPctRef = useRef<{ idx: number; val: number } | null>(null);

  /* ── Collapse ── */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  /* ── Master map for change detection ── */
  const masterMap = useMemo(() => {
    const m = new Map<string, Activity>();
    state.activities.forEach(a => m.set(a.id, a));
    return m;
  }, [state.activities]);

  /* ── Visible rows (with collapse) ── */
  const visRows = useMemo(() => {
    const rows: { _idx: number }[] = [];
    let skip = -1;
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      if (skip >= 0 && a.lv > skip) continue;
      skip = -1;
      rows.push({ _idx: i });
      if (a.type === 'summary' && collapsed.has(a.id)) skip = a.lv;
    }
    return rows;
  }, [activities, collapsed]);

  const visCols = columns.filter(c => c.visible);
  const totalW = visCols.reduce((s, c) => s + colWidths[columns.indexOf(c)], 0);

  /* ── Scroll sync ── */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const handler = () => { if (headerRef.current) headerRef.current.scrollLeft = body.scrollLeft; };
    body.addEventListener('scroll', handler);
    return () => body.removeEventListener('scroll', handler);
  }, []);

  /* ── Column resize handler ── */
  useEffect(() => {
    if (!colResize) return;
    const onMove = (e: MouseEvent) => {
      const newW = Math.max(20, colResize.startW + (e.clientX - colResize.startX));
      dispatch({ type: 'SET_COL_WIDTH', index: colResize.idx, width: newW });
    };
    const onUp = () => { setColResize(null); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [colResize, dispatch]);

  /* ══════════════ getCellValue (mirrors GanttTable) ══════════════ */
  const getCellValue = useCallback((a: any, c: any, vi: number): string => {
    if (c.key === '_num') return String(vi + 1);
    if (c.key === '_mode') {
      if (a.type === 'summary') return collapsed.has(a.id) ? '▶' : '▼';
      return '';
    }
    if (c.key === '_info') return 'ⓘ';
    if (c.key === 'outlineNum') return a.outlineNum || '';
    if (c.key === 'id') return a.id || '';
    if (c.key === 'name') return a.name || '';
    if (c.key === 'dur') {
      if (a.type === 'milestone') return '0 días';
      const dd = a._spanDur != null ? a._spanDur : (a.dur || 0);
      return dd + ' días';
    }
    if (c.key === 'remDur') return a.type === 'milestone' ? '0 días' : (a.remDur != null ? a.remDur : (a.dur || 0)) + ' días';
    if (c.key === 'startDate') return a.ES ? fmtDate(a.ES) : '';
    if (c.key === 'endDate') return a.EF ? fmtDate(a.type === 'milestone' ? a.EF : addDays(a.EF, -1)) : '';
    if (c.key === 'predStr') return predsToStr(a.preds);
    if (c.key === 'pct') return Number(a.pct || 0).toFixed(1) + '%';
    if (c.key === 'plannedPct') return Number(a._plannedPct != null ? a._plannedPct : (a.pct || 0)).toFixed(1) + '%';
    if (c.key === 'res') return a.res || '';
    if (c.key === 'work') return a.type === 'milestone' ? '0 hrs' : ((a.work || 0) + ' hrs');
    if (c.key === 'earnedValue' || c.key === 'remainingWork') {
      let ev = 0;
      if (a.type === 'summary' || a._isProjRow) {
        const startJ = a._isProjRow ? 1 : activities.indexOf(a) + 1;
        for (let j = startJ; j < activities.length; j++) {
          const ch = activities[j];
          if (!a._isProjRow && ch.lv <= a.lv) break;
          if (ch.type === 'summary') continue;
          ev += (ch.work || 0) * (ch.pct || 0) / 100;
        }
      } else { ev = (a.work || 0) * (a.pct || 0) / 100; }
      ev = Math.round(ev * 10) / 10;
      if (c.key === 'earnedValue') return ev + ' hrs';
      return Math.round(((a.work || 0) - ev) * 10) / 10 + ' hrs';
    }
    if (c.key === 'weight') return getWeightPct(a, activities);
    if (c.key === 'cal') {
      const cal = a.cal || defCal;
      if (typeof cal === 'string') { const cc = state.customCalendars.find((x: any) => x.id === cal); return cc ? cc.name : String(cal); }
      return cal + 'd';
    }
    if (c.key === 'TF') { if (a.type === 'summary' || a._isProjRow) return ''; return a.TF != null ? a.TF + 'd' : ''; }
    if (c.key === 'FF') { if (a.type === 'summary' || a._isProjRow) return ''; return a._freeFloat != null ? a._freeFloat + 'd' : ''; }
    if (c.key === 'floatPath') { if (a.type === 'summary' || a._isProjRow) return ''; return a._floatPath != null ? String(a._floatPath) : ''; }
    if (c.key === 'crit') { if (a.type === 'summary' || a._isProjRow) return ''; return a.crit ? 'Sí' : 'No'; }
    if (c.key === 'activityCount') {
      if (a._isProjRow) return String(activities.filter((x: any) => x.type !== 'summary').length);
      if (a.type !== 'summary') return '1';
      const si = activities.findIndex((x: any) => x.id === a.id);
      if (si < 0) return '';
      let cnt = 0;
      for (let j = si + 1; j < activities.length; j++) { if ((activities[j] as any).lv <= a.lv) break; if (activities[j].type !== 'summary') cnt++; }
      return String(cnt);
    }
    if (c.key === 'type') return a.type === 'milestone' ? 'Hito' : a.type === 'summary' ? 'Resumen' : 'Tarea';
    if (c.key === 'lv') return String(a.lv + 1);
    if (c.key === 'actualStart') return a.actualStart ? fmtDate(new Date(a.actualStart)) : '';
    if (c.key === 'actualFinish') return a.actualFinish ? fmtDate(new Date(a.actualFinish)) : '';
    if (c.key === 'suspendDate') return a.suspendDate ? fmtDate(new Date(a.suspendDate)) : '';
    if (c.key === 'resumeDate') return a.resumeDate ? fmtDate(new Date(a.resumeDate)) : '';
    if (c.key === 'remStartDate') return a._remES ? fmtDate(a._remES) : '';
    if (c.key === 'remEndDate') return a._remEF ? fmtDate(addDays(a._remEF, -1)) : '';
    if (c.key === 'blDur') return a.blDur != null ? a.blDur + ' días' : '';
    if (c.key === 'blStart') return a.blES ? fmtDate(a.blES) : '';
    if (c.key === 'blEnd') return a.blEF ? fmtDate(addDays(a.blEF, -1)) : '';
    if (c.key === 'constraint') return a.constraint || '';
    if (c.key === 'constraintDate') return a.constraintDate || '';
    if (c.key === 'notes') return (a.notes || '').substring(0, 40);
    if (c.key === 'encargado') return a.encargado || '';
    if (c.key === 'lpEstado') { const p = a.pct || 0; return p === 100 ? 'Completada' : p > 0 ? 'En curso' : 'Pendiente'; }
    return a[c.key] != null ? String(a[c.key]) : '';
  }, [activities, defCal, collapsed, state.customCalendars]);

  /* ── getRawValue ── */
  const getRawValue = useCallback((a: any, key: string): string => {
    if (key === 'dur') return String(a._spanDur != null ? a._spanDur : (a.dur || 0));
    if (key === 'remDur') return String(a.remDur != null ? a.remDur : '');
    if (key === 'pct') return String(a.pct || 0);
    if (key === 'work') return String(a.work || 0);
    if (key === 'weight') return a.weight != null ? String(a.weight) : '';
    if (key === 'startDate') return a.ES ? fmtDate(a.ES) : '';
    if (key === 'predStr') return predsToStr(a.preds);
    return a[key] != null ? String(a[key]) : '';
  }, []);

  /* ══════════════ Commit edit → dispatch to scenario ══════════════ */
  const handleBlur = useCallback((actIdx: number, key: string, val: string) => {
    const a = activities[actIdx];
    if (!a || a._isProjRow) return;
    if (a.type === 'summary' && ['work', 'pct', 'dur'].includes(key)) return;
    const raw = val.trim();
    const updates: Partial<Activity> = {};

    if (key === 'name') updates.name = raw;
    else if (key === 'dur') {
      const n = parseInt(raw); if (!isNaN(n)) {
        const newDur = Math.max(0, n);
        if (newDur === 0) updates.type = 'milestone'; else if (a.type === 'milestone') updates.type = 'task';
        // Bidirectional: same logic as main Gantt COMMIT_EDIT
        const visualDur = (a as any)._spanDur != null ? (a as any)._spanDur : (a.dur || 0);
        const delta = newDur - visualDur;
        if ((a.pct || 0) > 0 && a.remDur != null) {
          updates.remDur = Math.max(0, a.remDur + delta);
        } else if ((a.pct || 0) === 0) {
          updates.remDur = null as any;
        }
        updates.dur = Math.max(0, (a.dur || 0) + delta);
      }
    } else if (key === 'remDur') {
      const n = parseInt(raw); if (!isNaN(n)) {
        const newRemDur = Math.max(0, n);
        // Bidirectional: adjust dur by the same delta
        if ((a.pct || 0) > 0) {
          const oldRemDur = a.remDur != null ? a.remDur : Math.round((a.dur || 0) * (100 - (a.pct || 0)) / 100);
          const delta = newRemDur - oldRemDur;
          updates.dur = Math.max(0, (a.dur || 0) + delta);
        } else {
          updates.dur = newRemDur;
        }
        updates.remDur = newRemDur;
      }
    } else if (key === 'pct') {
      const n = Math.min(100, Math.max(0, parseInt(raw) || 0));

      // ── Validation 1: Data Date check (Avance Improcedente) ──
      const ddAlert = validateProgressDataDate(a, n, state.statusDate, fmtDate);
      if (ddAlert) { setAlert(ddAlert); return; }

      // ── Validation 2: Out-of-sequence check (Lógica Rota) ──
      const oosAlert = validateOutOfSequence(a, n, activities);
      if (oosAlert) {
        // Store pending edit; user can proceed from modal
        pendingPctRef.current = { idx: actIdx, val: n };
        setAlert(oosAlert);
        return;
      }

      // Apply actualStart logic (same as main Gantt COMMIT_EDIT)
      const oldPct = a.pct || 0;
      if (oldPct === 0 && n > 0 && !a.actualStart) {
        if (a.ES) updates.actualStart = isoDate(a.ES);
        else if (a.constraintDate) updates.actualStart = a.constraintDate;
      }
      if (n === 0) { updates.actualStart = null as any; updates.actualFinish = null as any; }
      if (n === 100 && !a.actualFinish && a.EF) updates.actualFinish = isoDate(addDays(a.EF, -1));
      if (n < 100) updates.actualFinish = null as any;

      updates.pct = n; updates.remDur = Math.round((a.dur || 0) * (100 - n) / 100);
    } else if (key === 'predStr') { updates.preds = strToPreds(raw); }
    else if (key === 'startDate') {
      const d = parseDate(raw);
      if (d) { updates.constraintDate = isoDate(d); (updates as any).manual = true; }
      else { updates.constraintDate = ''; (updates as any).manual = false; }
    } else if (key === 'endDate') {
      const d = parseDate(raw);
      if (d && a.ES) { updates.dur = Math.max(1, Math.round((d.getTime() - a.ES.getTime()) / 86400000) + 1); }
    } else if (key === 'work') { const n = parseFloat(raw); if (!isNaN(n)) updates.work = Math.max(0, n); }
    else if (key === 'weight') {
      const n = parseFloat(raw.replace('%', '').trim());
      (updates as any).weight = (!isNaN(n) && n > 0) ? n : null;
    } else if (key === 'constraint') {
      const valid = ['', 'SNET', 'SNLT', 'MSO', 'MFO', 'FNET', 'FNLT'];
      const v = raw.toUpperCase(); if (valid.includes(v)) updates.constraint = v as any;
    } else if (key === 'cal') {
      const cv = parseInt(raw);
      if ([5, 6, 7].includes(cv)) updates.cal = cv as any; else updates.cal = raw as any;
    } else if (key === 'notes') updates.notes = raw;
    else if (key === 'res') updates.res = raw;
    else if (key.startsWith('txt')) (updates as any)[key] = raw;

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'UPDATE_SCENARIO_ACTIVITY', scenarioId: scenario.id, activityIndex: actIdx, updates });
      setTimeout(() => dispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id }), 50);
    }
  }, [activities, scenario.id, dispatch]);

  /* ── Selection ── */
  const handleSelect = useCallback((idx: number, shift?: boolean, ctrl?: boolean) => {
    if (shift && selIdx >= 0) {
      const lo = Math.min(selIdx, idx), hi = Math.max(selIdx, idx);
      const next = new Set(selIndices);
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelIndices(next);
    } else if (ctrl) {
      const next = new Set(selIndices);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      setSelIdx(idx); setSelIndices(next);
    } else { setSelIdx(idx); setSelIndices(new Set([idx])); }
  }, [selIdx, selIndices]);

  /* ── Change detection ── */
  const isChanged = useCallback((a: Activity, key: string): boolean => {
    const m = masterMap.get(a.id);
    if (!m) return false;
    if (key === 'dur') return a.dur !== m.dur;
    if (key === 'pct') return (a.pct || 0) !== (m.pct || 0);
    if (key === 'preds' || key === 'predStr') return JSON.stringify(a.preds || []) !== JSON.stringify(m.preds || []);
    if (key === 'constraint') return (a.constraint || '') !== (m.constraint || '');
    if (key === 'name') return a.name !== m.name;
    if (key === 'work') return (a.work || 0) !== (m.work || 0);
    if (key === 'res') return (a.res || '') !== (m.res || '');
    if (key === 'ES' || key === 'startDate') return isoDate(a.ES) !== isoDate(m.ES);
    if (key === 'EF' || key === 'endDate') return isoDate(a.EF) !== isoDate(m.EF);
    if (key === 'TF') return a.TF !== m.TF;
    if (key === 'crit') return a.crit !== m.crit;
    return false;
  }, [masterMap]);

  /* ── Fill Down / Up ── */
  const handleFillDown = useCallback((colKey: string) => {
    if (!colKey || !FILL_DOWN_KEYS.has(colKey) || selIndices.size < 2) return;
    const src = activities[selIdx];
    if (!src || src._isProjRow) return;
    const sv = getRawValue(src, colKey);
    Array.from(selIndices).sort((a, b) => a - b).filter(i => i !== selIdx).forEach(i => {
      if (!activities[i] || activities[i]._isProjRow) return;
      handleBlur(i, colKey, sv);
    });
  }, [activities, selIdx, selIndices, getRawValue, handleBlur]);

  const handleFillUp = useCallback((colKey: string) => {
    if (!colKey || !FILL_DOWN_KEYS.has(colKey) || selIndices.size < 2) return;
    const sorted = Array.from(selIndices).sort((a, b) => a - b);
    const srcIdx = sorted[sorted.length - 1];
    const src = activities[srcIdx];
    if (!src || src._isProjRow) return;
    const sv = getRawValue(src, colKey);
    sorted.slice(0, -1).forEach(i => { if (!activities[i] || activities[i]._isProjRow) return; handleBlur(i, colKey, sv); });
  }, [activities, selIndices, getRawValue, handleBlur]);

  /* ── Keyboard shortcuts (Ctrl+D / Ctrl+U) ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); if (ctxColKey) handleFillDown(ctxColKey); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); if (ctxColKey) handleFillUp(ctxColKey); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ctxColKey, handleFillDown, handleFillUp]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); (e.target as HTMLElement).blur(); }
  }, []);

  /* ── Recalc / Merge ── */
  const handleRecalc = useCallback(() => dispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id }), [dispatch, scenario.id]);

  const handleMerge = useCallback(() => {
    // ── Sandbox validation: check integrity before allowing merge ──
    const mergeAlert = validateScenarioForMerge(activities, state.statusDate, fmtDate);
    if (mergeAlert) {
      // If there are blocking errors, show the modal and prevent merge
      if (mergeAlert.mergeErrors && mergeAlert.mergeErrors.length > 0) {
        setAlert(mergeAlert);
        return;
      }
      // Warnings only: show but allow proceed
      if (mergeAlert.mergeWarnings && mergeAlert.mergeWarnings.length > 0) {
        // Still block and force user to acknowledge
        setAlert(mergeAlert);
        return;
      }
    }
    if (confirm('¿Aplicar los cambios de este escenario al programa maestro? Esta acción no se puede deshacer fácilmente.'))
      dispatch({ type: 'MERGE_SCENARIO', scenarioId: scenario.id });
  }, [activities, state.statusDate, dispatch, scenario.id]);

  /** Handle "proceed anyway" from lógica-rota warning */
  const handleAlertProceed = useCallback(() => {
    const pending = pendingPctRef.current;
    if (pending) {
      const a = activities[pending.idx];
      if (a) {
        const updates: Partial<Activity> = {};
        const oldPct = a.pct || 0;
        const n = pending.val;
        if (oldPct === 0 && n > 0 && !a.actualStart) {
          if (a.ES) updates.actualStart = isoDate(a.ES);
          else if (a.constraintDate) updates.actualStart = a.constraintDate;
        }
        if (n === 0) { updates.actualStart = null as any; updates.actualFinish = null as any; }
        if (n === 100 && !a.actualFinish && a.EF) updates.actualFinish = isoDate(addDays(a.EF, -1));
        if (n < 100) updates.actualFinish = null as any;
        updates.pct = n;
        updates.remDur = Math.round((a.dur || 0) * (100 - n) / 100);
        dispatch({ type: 'UPDATE_SCENARIO_ACTIVITY', scenarioId: scenario.id, activityIndex: pending.idx, updates });
        setTimeout(() => dispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: scenario.id }), 50);
      }
      pendingPctRef.current = null;
    }
  }, [activities, scenario.id, dispatch]);

  /* ── TF coloring ── */
  const getTFColor = (a: any): string | undefined => {
    if (a.TF === 0) return '#ef4444';
    if (a.TF != null && a.TF <= 3) return '#f59e0b';
    if (a.TF != null) return '#22c55e';
    return undefined;
  };

  /* ══════════════════════════ RENDER ══════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Scenario Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-panel)', flexShrink: 0,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: scenario.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', flex: 1 }}>{scenario.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {scenario.changes.length} cambio{scenario.changes.length !== 1 ? 's' : ''}
        </span>
        <button onClick={handleRecalc} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11,
          background: 'var(--bg-input)', color: 'var(--text-primary)',
          border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer',
        }}><RefreshCw size={12} /> Recalcular CPM</button>
        <button onClick={handleMerge} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11,
          background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
        }}><ArrowRightLeft size={12} /> Aplicar al Maestro</button>
      </div>

      {/* ── Column Header ── */}
      <div ref={headerRef} style={{ display: 'flex', flexShrink: 0, overflowX: 'hidden', minWidth: '100%' }}>
        {visCols.map(c => {
          const ci = columns.indexOf(c);
          return (
            <div key={c.key} className="col-hdr" style={{ width: colWidths[ci] }}
              onContextMenu={e => { e.preventDefault(); setColPickerOpen(true); }}>
              {c.label}
              <div className="col-rsz" onMouseDown={e => { e.stopPropagation(); setColResize({ idx: ci, startX: e.clientX, startW: colWidths[ci] }); }} />
            </div>
          );
        })}
      </div>

      {/* ── Body ── */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <div style={{ width: totalW }}>
          {visRows.map((vr, vi) => {
            const a = activities[vr._idx];
            const isProj = a._isProjRow;
            const isSummary = a.type === 'summary';
            const rowCls = `trow ${isProj ? 'trow-proj' : `trow-lv${Math.min(a.lv, 2)}`} ${!isProj && isSummary ? 'trow-summary' : ''} ${selIndices.has(vr._idx) ? 'sel' : ''}`;

            return (
              <div key={vi} className={rowCls} style={{ width: totalW }}
                onMouseDown={() => { (document.activeElement as HTMLElement)?.blur?.(); }}
                onClick={e => { touchedRowsRef.current = new Set([vr._idx]); handleSelect(vr._idx, e.shiftKey, e.ctrlKey || e.metaKey); }}
                onContextMenu={e => {
                  e.preventDefault();
                  const cell = (e.target as HTMLElement).closest('[data-colkey]') as HTMLElement | null;
                  setCtxColKey(cell?.dataset?.colkey ?? null);
                  if (!selIndices.has(vr._idx)) handleSelect(vr._idx);
                  setCtxMenu({ x: e.clientX, y: e.clientY });
                }}>
                {visCols.map(c => {
                  const ci = columns.indexOf(c);
                  const val = getCellValue(a, c, vi);
                  const changed = isChanged(a, c.key);
                  const style: React.CSSProperties = { width: colWidths[ci], position: 'relative' };

                  // Change highlight
                  if (changed) { style.color = '#f59e0b'; style.fontWeight = 600; style.background = 'rgba(245,158,11,0.06)'; }

                  // Name indent
                  if (c.key === 'name') style.paddingLeft = 2 + Math.max(0, a.lv) * 14;
                  if (isSummary || isProj) style.fontWeight = 700;

                  // TF coloring (only if not changed)
                  if (c.key === 'TF' && !changed) { const tc = getTFColor(a); if (tc) style.color = tc; }
                  if (c.key === 'weight' && a.weight != null && a.weight > 0 && !changed) style.color = '#fbbf24';

                  // ── Crit column ──
                  if (c.key === 'crit') {
                    const isCrit = a.crit === true;
                    const critVal = (a.type === 'summary' || a._isProjRow) ? '' : (isCrit ? 'Sí' : 'No');
                    return (
                      <div key={c.key} data-colkey={c.key} className={`tcell ${c.cls}`}
                        style={{ ...style, textAlign: 'center', fontWeight: isCrit ? 700 : 400,
                          color: changed ? '#f59e0b' : (isCrit ? '#ef4444' : '#6b7280') }}>
                        {changed && <span style={{ marginRight: 2 }}>●</span>}{critVal}
                      </div>
                    );
                  }

                  // ── _mode column (collapse) ──
                  if (c.key === '_mode' && isSummary) {
                    return (
                      <div key={c.key} data-colkey={c.key} className={`tcell ${c.cls}`} style={{ ...style, cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); setCollapsed(prev => { const n = new Set(prev); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; }); }}>
                        {val}
                      </div>
                    );
                  }

                  // ── Calendar dropdown ──
                  if (c.key === 'cal' && c.edit === 'select') {
                    return (
                      <div key={c.key} data-colkey={c.key} className={`tcell ${c.cls}`} style={style}>
                        <select className="fp-cell-edit"
                          style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', color: 'inherit', fontSize: 11, outline: 'none', cursor: 'pointer' }}
                          value={a.cal || defCal}
                          onFocus={() => handleSelect(vr._idx)}
                          onChange={e => handleBlur(vr._idx, 'cal', e.target.value)}>
                          <option value={5} style={{ background: lightMode ? '#fff' : '#1f2937' }}>5d</option>
                          <option value={6} style={{ background: lightMode ? '#fff' : '#1f2937' }}>6d</option>
                          <option value={7} style={{ background: lightMode ? '#fff' : '#1f2937' }}>7d</option>
                          {state.customCalendars.map(cc => (
                            <option key={cc.id} value={cc.id} style={{ background: lightMode ? '#fff' : '#1f2937' }}>{cc.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  // ── Editable cells ──
                  if (c.edit === true) {
                    const readOnly = isProj || (isSummary && ['work', 'pct', 'dur'].includes(c.key));
                    if (readOnly) return <div key={c.key} className={`tcell ${c.cls}`} style={{ ...style, opacity: 0.7 }}>{val}</div>;

                    // Number cells
                    if (['dur', 'remDur', 'pct', 'work', 'weight'].includes(c.key)) {
                      return (
                        <div key={c.key} data-colkey={c.key} className={`tcell ${c.cls}`} style={style}>
                          {changed && <span style={{ position: 'absolute', left: 1, top: 1, fontSize: 8, color: '#f59e0b', lineHeight: 1 }}>●</span>}
                          <EditableNumberCell
                            rawValue={getRawValue(a, c.key)} displayValue={val}
                            onUpdate={nv => handleBlur(vr._idx, c.key, nv)}
                            onFocus={() => handleSelect(vr._idx)}
                            isRowSelected={selIndices.has(vr._idx)}
                            step={c.key === 'pct' ? 5 : undefined}
                            min={c.key === 'pct' ? 0 : undefined}
                            max={c.key === 'pct' ? 100 : undefined}
                          />
                        </div>
                      );
                    }

                    // Date cells
                    if (['startDate', 'endDate'].includes(c.key)) {
                      const isEnd = c.key === 'endDate';
                      const dateVal = isEnd ? (a.EF ? (a.type === 'milestone' ? a.EF : addDays(a.EF, -1)) : null) : a.ES;
                      return (
                        <div key={c.key} data-colkey={c.key} className={`tcell ${c.cls}`} style={style}>
                          {changed && <span style={{ position: 'absolute', left: 1, top: 1, fontSize: 8, color: '#f59e0b', lineHeight: 1 }}>●</span>}
                          <EditableDateCell dateValue={dateVal} displayValue={val}
                            onUpdate={nv => handleBlur(vr._idx, c.key, nv)}
                            onFocus={() => handleSelect(vr._idx)}
                            isRowSelected={selIndices.has(vr._idx)} />
                        </div>
                      );
                    }

                    // contentEditable text cells
                    return (
                      <div key={c.key} data-colkey={c.key} className={`tcell ${c.cls}`}
                        style={style} contentEditable suppressContentEditableWarning spellCheck={false}
                        onMouseDown={e => {
                          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); return; }
                          const alreadySel = selIndices.has(vr._idx) || touchedRowsRef.current.has(vr._idx);
                          if (!alreadySel) { e.preventDefault(); touchedRowsRef.current = new Set([vr._idx]); }
                        }}
                        onContextMenu={e => { e.preventDefault(); e.currentTarget.blur(); }}
                        onFocus={() => handleSelect(vr._idx)}
                        onBlur={e => handleBlur(vr._idx, c.key, e.currentTarget.textContent || '')}
                        onKeyDown={handleKeyDown}
                        dangerouslySetInnerHTML={{ __html: c.key === 'name' ? val : getRawValue(a, c.key) || val }}
                      />
                    );
                  }

                  // ── Read-only cell ──
                  return (
                    <div key={c.key} data-colkey={c.key} className={`tcell ${c.cls}`} style={style}>
                      {changed && <span style={{ marginRight: 2, color: '#f59e0b' }}>●</span>}{val}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Visual empty rows */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={`empty-${i}`} className="trow empty-row" style={{ width: totalW, opacity: 0.15 }}>
              {visCols.map(c => {
                const ci = columns.indexOf(c);
                return <div key={c.key} className={`tcell ${c.cls}`} style={{ width: colWidths[ci] }}>
                  {c.key === '_num' ? visRows.length + 1 + i : ''}
                </div>;
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Column picker ── */}
      {colPickerOpen && <ColumnPickerModal onClose={() => setColPickerOpen(false)} />}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ScenarioContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onOpenColumns={() => setColPickerOpen(true)}
          colKey={ctxColKey}
          selCount={selIndices.size}
          onFillDown={() => { if (ctxColKey) handleFillDown(ctxColKey); }}
          onFillUp={() => { if (ctxColKey) handleFillUp(ctxColKey); }}
          onRecalc={handleRecalc}
          onMerge={handleMerge}
          onExpandAll={() => setCollapsed(new Set())}
          onCollapseAll={() => { const ids = new Set<string>(); activities.forEach(a => { if (a.type === 'summary') ids.add(a.id); }); setCollapsed(ids); }}
        />
      )}

      {/* ── Validation Alert Modal ── */}
      <ScenarioAlertModal
        alert={alert}
        onClose={() => { setAlert(null); pendingPctRef.current = null; }}
        onProceed={handleAlertProceed}
      />
    </div>
  );
}

/* ═══════════════════ Scenario Context Menu ═══════════════════ */
/* Same visual style as RowContextMenu but with scenario-specific actions */

function ScenarioContextMenu({ x, y, onClose, onOpenColumns, colKey, selCount, onFillDown, onFillUp, onRecalc, onMerge, onExpandAll, onCollapseAll }: {
  x: number; y: number; onClose: () => void; onOpenColumns: () => void;
  colKey: string | null; selCount: number;
  onFillDown: () => void; onFillUp: () => void;
  onRecalc: () => void; onMerge: () => void;
  onExpandAll: () => void; onCollapseAll: () => void;
}) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.row-ctx-menu')) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const act = (fn: () => void) => { fn(); onClose(); };
  const canFill = colKey && FILL_DOWN_KEYS.has(colKey) && selCount > 1;

  return (
    <div className="row-ctx-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}>
      {/* Fill Down / Up */}
      <div className={`row-ctx-item${!canFill ? ' disabled' : ''}`}
        onClick={() => canFill && act(onFillDown)}>
        <span className="row-ctx-label">Rellenar abajo</span>
        <span className="row-ctx-shortcut">Ctrl+D</span>
      </div>
      <div className={`row-ctx-item${!canFill ? ' disabled' : ''}`}
        onClick={() => canFill && act(onFillUp)}>
        <span className="row-ctx-label">Rellenar arriba</span>
        <span className="row-ctx-shortcut">Ctrl+U</span>
      </div>

      <div className="row-ctx-sep" />

      {/* Scenario actions */}
      <div className="row-ctx-item" onClick={() => act(onRecalc)}>
        <span className="row-ctx-label">Recalcular CPM</span>
      </div>
      <div className="row-ctx-item" onClick={() => act(onMerge)}>
        <span className="row-ctx-label">Aplicar al Maestro</span>
      </div>

      <div className="row-ctx-sep" />

      {/* Columns */}
      <div className="row-ctx-item" onClick={() => act(onOpenColumns)}>
        <span className="row-ctx-label">Columnas...</span>
      </div>

      <div className="row-ctx-sep" />

      {/* Expand / Collapse */}
      <div className="row-ctx-item" onClick={() => act(onExpandAll)}>
        <span className="row-ctx-label">Ampliar todo</span>
      </div>
      <div className="row-ctx-item" onClick={() => act(onCollapseAll)}>
        <span className="row-ctx-label">Reducir todo</span>
      </div>
    </div>
  );
}
