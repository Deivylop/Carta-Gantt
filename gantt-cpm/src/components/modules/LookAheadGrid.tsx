// ═══════════════════════════════════════════════════════════════════
// LookAheadGrid – Weekly planning grid (Last Planner System)
// Features: inline editing · column reorder/resize/hide · % Progr.
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useRef, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { isoDate, fmtDate, parseDate, addDays, getExactElapsedRatio, getExactWorkDays } from '../../utils/cpm';
import { predsToStr } from '../../utils/helpers';
import type { Activity, LeanRestriction, RestrictionCategory, RestrictionStatus } from '../../types/gantt';
import { AlertTriangle, CheckCircle2, Clock, User, ShieldAlert, Settings2, Ruler, CalendarCheck2, Network, Layers } from 'lucide-react';
import ColumnPickerModal from '../ColumnPickerModal';
import RowContextMenu from '../RowContextMenu';

/* ── constants ── */
const WEEK_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const RESTR_CATS: RestrictionCategory[] = [
  'Sin Restricción',
  'Material','Mano de Obra','Equipos','Información','Espacio',
  'Actividad Previa','Permisos','Diseño','Subcontrato','Calidad','Seguridad','Otro',
];
const RESTR_STATUSES: RestrictionStatus[] = ['Pendiente','En Gestión','Liberada','No Liberada'];
const STATUS_COLORS: Record<RestrictionStatus, string> = {
  'Pendiente': '#ef4444', 'En Gestión': '#f59e0b', 'Liberada': '#22c55e', 'No Liberada': '#64748b',
};

let _uid = 0;
const uid = () => `rg_${Date.now()}_${++_uid}`;

/* ── column definitions ── */
interface ColDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align: 'left' | 'center';
}
const COL_DEFS: ColDef[] = [
  /* ── Originales Look Ahead ── */
  { key: 'id',        label: 'ID',          defaultWidth: 50,  minWidth: 35,  align: 'left'   },
  { key: 'name',      label: 'Actividad',   defaultWidth: 180, minWidth: 100, align: 'left'   },
  /* ── Last Planner ── */
  { key: 'encargado', label: 'Encargado',   defaultWidth: 100, minWidth: 60,  align: 'left'   },
  { key: 'pct',       label: 'Avance',      defaultWidth: 60,  minWidth: 40,  align: 'center' },
  { key: 'pctProgr',  label: '% Progr. LH', defaultWidth: 75,  minWidth: 50,  align: 'center' },
  { key: 'estado',    label: 'Estado',      defaultWidth: 70,  minWidth: 50,  align: 'center' },
  { key: 'tipoRestr', label: 'Tipo Restr.', defaultWidth: 100, minWidth: 70,  align: 'left'   },
  { key: 'estRestr',  label: 'Est. Restr.', defaultWidth: 80,  minWidth: 55,  align: 'center' },
  { key: 'dias',      label: 'Días',        defaultWidth: 45,  minWidth: 30,  align: 'center' },
  { key: 'fPrevista', label: 'F. Prevista', defaultWidth: 85,  minWidth: 65,  align: 'center' },
  { key: 'fLiberado', label: 'F. Liberado', defaultWidth: 85,  minWidth: 65,  align: 'center' },
  /* ── General (Carta Gantt) ── */
  { key: 'outlineNum',label: 'EDT',         defaultWidth: 55,  minWidth: 35,  align: 'left'   },
  { key: 'type',      label: 'Tipo',        defaultWidth: 70,  minWidth: 50,  align: 'center' },
  { key: 'lv',        label: 'WBS/Nivel',   defaultWidth: 50,  minWidth: 30,  align: 'center' },
  { key: 'notes',     label: 'Notas',       defaultWidth: 120, minWidth: 60,  align: 'left'   },
  /* ── Duraciones ── */
  { key: 'dur',       label: 'Duración',    defaultWidth: 70,  minWidth: 45,  align: 'center' },
  { key: 'remDur',    label: 'Dur. Resta',  defaultWidth: 70,  minWidth: 45,  align: 'center' },
  /* ── Fechas ── */
  { key: 'startDate', label: 'Comienzo',    defaultWidth: 90,  minWidth: 65,  align: 'center' },
  { key: 'endDate',   label: 'Fin',         defaultWidth: 90,  minWidth: 65,  align: 'center' },
  { key: 'actualStart', label: 'Comienzo Real', defaultWidth: 95, minWidth: 65, align: 'center' },
  { key: 'actualFinish',label: 'Fin Real',  defaultWidth: 95,  minWidth: 65,  align: 'center' },
  { key: 'constraint', label: 'Restricción',defaultWidth: 80,  minWidth: 50,  align: 'center' },
  { key: 'constraintDate', label: 'Fecha Restr.', defaultWidth: 90, minWidth: 65, align: 'center' },
  /* ── Relaciones ── */
  { key: 'predStr',   label: 'Predecesoras',defaultWidth: 100, minWidth: 60,  align: 'left'   },
  /* ── Avance ── */
  { key: 'plannedPct',label: '% Prog.',     defaultWidth: 65,  minWidth: 45,  align: 'center' },
  /* ── Recursos ── */
  { key: 'res',       label: 'Recursos',    defaultWidth: 110, minWidth: 60,  align: 'left'   },
  { key: 'cal',       label: 'Calendario',  defaultWidth: 60,  minWidth: 40,  align: 'center' },
  /* ── Trabajo / EVM ── */
  { key: 'work',      label: 'Trabajo',     defaultWidth: 70,  minWidth: 45,  align: 'center' },
  { key: 'earnedValue',label: 'Valor Ganado',defaultWidth: 85,  minWidth: 55,  align: 'center' },
  { key: 'remainingWork',label: 'Trab. Restante', defaultWidth: 90, minWidth: 55, align: 'center' },
  { key: 'weight',    label: 'Peso %',      defaultWidth: 65,  minWidth: 40,  align: 'center' },
  /* ── Línea Base ── */
  { key: 'blDur',     label: 'Dur. LB',     defaultWidth: 60,  minWidth: 40,  align: 'center' },
  { key: 'blStart',   label: 'Inicio LB',   defaultWidth: 90,  minWidth: 65,  align: 'center' },
  { key: 'blEnd',     label: 'Fin LB',      defaultWidth: 90,  minWidth: 65,  align: 'center' },
  /* ── Holguras ── */
  { key: 'TF',        label: 'Holgura Total',defaultWidth: 75,  minWidth: 45,  align: 'center' },
  { key: 'FF',        label: 'Holgura Libre',defaultWidth: 75,  minWidth: 45,  align: 'center' },
  { key: 'floatPath', label: 'Float Path',  defaultWidth: 70,  minWidth: 45,  align: 'center' },
  /* ── CPM ── */
  { key: 'crit',      label: 'Crítico',     defaultWidth: 55,  minWidth: 35,  align: 'center' },
  { key: 'activityCount', label: 'Recuento',defaultWidth: 70,  minWidth: 45,  align: 'center' },
  /* ── Personalizado ── */
  { key: 'txt1',      label: 'Texto 1',     defaultWidth: 100, minWidth: 60,  align: 'left'   },
  { key: 'txt2',      label: 'Texto 2',     defaultWidth: 100, minWidth: 60,  align: 'left'   },
  { key: 'txt3',      label: 'Texto 3',     defaultWidth: 100, minWidth: 60,  align: 'left'   },
  { key: 'txt4',      label: 'Texto 4',     defaultWidth: 100, minWidth: 60,  align: 'left'   },
  { key: 'txt5',      label: 'Texto 5',     defaultWidth: 100, minWidth: 60,  align: 'left'   },
];
const COL_MAP = Object.fromEntries(COL_DEFS.map(c => [c.key, c])) as Record<string, ColDef>;

/* Default visible columns for Look Ahead */
const DEFAULT_LA_VISIBLE = new Set([
  'id', 'name', 'encargado', 'pct', 'pctProgr', 'estado', 'tipoRestr', 'estRestr', 'dias', 'fPrevista', 'fLiberado',
]);

/* Column groups for the Look Ahead Column Modal */
const LA_COLUMN_GROUPS: { group: string; keys: string[] }[] = [
  { group: 'General', keys: ['outlineNum', 'id', 'name', 'type', 'lv', 'notes'] },
  { group: 'Last Planner', keys: ['encargado', 'estado', 'tipoRestr', 'estRestr', 'dias', 'fPrevista', 'fLiberado'] },
  { group: 'Duraciones', keys: ['dur', 'remDur'] },
  { group: 'Fechas', keys: ['startDate', 'endDate', 'actualStart', 'actualFinish', 'constraint', 'constraintDate'] },
  { group: 'Relaciones', keys: ['predStr'] },
  { group: 'Avance', keys: ['pct', 'pctProgr', 'plannedPct'] },
  { group: 'Recursos', keys: ['res', 'cal'] },
  { group: 'Trabajo / EVM', keys: ['work', 'earnedValue', 'remainingWork', 'weight'] },
  { group: 'Línea Base', keys: ['blDur', 'blStart', 'blEnd'] },
  { group: 'Holguras', keys: ['TF', 'FF', 'floatPath'] },
  { group: 'CPM', keys: ['crit', 'activityCount'] },
  { group: 'Personalizado', keys: ['txt1', 'txt2', 'txt3', 'txt4', 'txt5'] },
];

/* ── types ── */
interface Props { windowStart: Date; windowEnd: Date; }
type ActEx = Activity & { _start: Date; _end: Date };

/* ═══════════════════════════════════════════════════════════════════ */
export default function LookAheadGrid({ windowStart, windowEnd }: Props) {
  const { state, dispatch } = useGantt();

  /** Trigger a silent immediate save to Supabase after restriction mutations */
  const triggerSave = () => {
    setTimeout(() => window.dispatchEvent(new CustomEvent('sb-force-save', { detail: { silent: true } })), 500);
  };

  /* inline-edit state */
  const [editingEncargado, setEditingEncargado] = useState<string | null>(null);
  const [encargadoVal, setEncargadoVal] = useState('');
  const [editCell, setEditCell] = useState<{ actId: string; field: string } | null>(null);
  const [editVal, setEditVal] = useState('');

  /* ── row selection & right-click context menu ── */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxColKey, setCtxColKey] = useState<string | null>(null);

  /* ── WBS toggle: show/hide summary rows ── */
  const [showWBS, setShowWBS] = useState(false);
  /* ── column management state ── */
  const [colOrder, setColOrder] = useState<string[]>(COL_DEFS.map(c => c.key));
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    Object.fromEntries(COL_DEFS.map(c => [c.key, c.defaultWidth])),
  );
  const [colHidden, setColHidden] = useState<Set<string>>(
    () => new Set(COL_DEFS.filter(c => !DEFAULT_LA_VISIBLE.has(c.key)).map(c => c.key)),
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  const visibleCols = useMemo(
    () => colOrder.filter(k => !colHidden.has(k)),
    [colOrder, colHidden],
  );

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  /* measure container width for auto-fit day columns */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── data memos ── */
  const days = useMemo(() => {
    const result: { date: Date; iso: string; dayName: string; isWeekend: boolean }[] = [];
    const cur = new Date(windowStart);
    while (cur <= windowEnd) {
      result.push({
        date: new Date(cur), iso: isoDate(cur),
        dayName: WEEK_DAYS[cur.getDay()],
        isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [windowStart, windowEnd]);

  /* compute day-column width so all days fill the remaining space */
  const fixedColsWidth = useMemo(
    () => visibleCols.reduce((sum, k) => sum + colWidths[k], 0),
    [visibleCols, colWidths],
  );
  const dayColWidth = useMemo(() => {
    if (!days.length) return 28;
    const available = containerW - fixedColsWidth - 2; // 2px safety
    const w = Math.floor(available / days.length);
    return Math.max(w, 20); // never smaller than 20px
  }, [containerW, fixedColsWidth, days.length]);

  const activitiesInWindow = useMemo<ActEx[]>(() => {
    const defCal = state.defCal || 5;
    const activeBlIdx = state.activeBaselineIdx;
    // Target date = end of windowEnd (start of next day, so windowEnd is fully inclusive)
    const targetDate = addDays(windowEnd, 1);

    return state.activities
      .filter(a => {
        if (a._isProjRow) return false;
        if (!showWBS && a.type === 'summary') return false;
        if (!a.ES || !a.EF) return false;
        return a.ES <= windowEnd && a.EF >= windowStart;
      })
      .map(a => {
        // EF is exclusive (day after last work day) for non-milestone tasks → subtract 1 day for visual end
        const visualEnd = a.type === 'milestone' ? a.EF! : addDays(a.EF!, -1);

        // ── Calculate % Progr. LH: programmed progress at end of Look Ahead window ──
        const activeBl = (a.baselines || [])[activeBlIdx] || null;
        const start = a.blES || a.ES;
        const end = a.blEF || a.EF;
        let pctProgrLH = 0;
        if (start && end) {
          const stObj = new Date(start); stObj.setHours(0, 0, 0, 0);
          const endObj = new Date(end); endObj.setHours(0, 0, 0, 0);
          if (targetDate <= stObj) {
            pctProgrLH = 0;
          } else if (targetDate >= endObj) {
            pctProgrLH = 100;
          } else if (activeBl && activeBl.pct != null && activeBl.statusDate) {
            // Two-segment interpolation using baseline saved progress
            const blStatusEnd = new Date(activeBl.statusDate);
            blStatusEnd.setHours(0, 0, 0, 0);
            blStatusEnd.setDate(blStatusEnd.getDate() + 1);
            const blPct = activeBl.pct;
            if (blPct === 0) {
              pctProgrLH = getExactElapsedRatio(start, end, targetDate, a.cal || defCal) * 100;
            } else if (targetDate <= blStatusEnd) {
              const totalWdSeg1 = getExactWorkDays(stObj, blStatusEnd, a.cal || defCal);
              const elapsedWd = getExactWorkDays(stObj, targetDate <= stObj ? stObj : new Date(targetDate), a.cal || defCal);
              const ratioSeg1 = totalWdSeg1 > 0 ? elapsedWd / totalWdSeg1 : 1;
              pctProgrLH = ratioSeg1 * blPct;
            } else {
              const totalWdSeg2 = getExactWorkDays(blStatusEnd, endObj, a.cal || defCal);
              const elapsedWd = getExactWorkDays(blStatusEnd, new Date(targetDate), a.cal || defCal);
              const ratioSeg2 = totalWdSeg2 > 0 ? elapsedWd / totalWdSeg2 : 1;
              pctProgrLH = blPct + ratioSeg2 * (100 - blPct);
            }
          } else {
            pctProgrLH = getExactElapsedRatio(start, end, targetDate, a.cal || defCal) * 100;
          }
        }

        const act = { ...a, _start: a.ES!, _end: visualEnd } as ActEx;
        (act as any)._pctProgrLH = pctProgrLH;
        return act;
      })
      .sort((a, b) => {
        // When WBS is shown, keep the original structure order (outline)
        if (showWBS) {
          const ai = state.activities.findIndex(x => x.id === a.id);
          const bi = state.activities.findIndex(x => x.id === b.id);
          return ai - bi;
        }
        return a._start.getTime() - b._start.getTime();
      });
  }, [state.activities, windowStart, windowEnd, state.defCal, state.activeBaselineIdx, showWBS]);

  const primaryRestriction = useMemo(() => {
    const map: Record<string, LeanRestriction> = {};
    const byAct: Record<string, LeanRestriction[]> = {};
    state.leanRestrictions.forEach(r => {
      if (!byAct[r.activityId]) byAct[r.activityId] = [];
      byAct[r.activityId].push(r);
    });
    for (const [actId, list] of Object.entries(byAct)) {
      const pending = list.find(r => r.status !== 'Liberada');
      map[actId] = pending || list[0];
    }
    return map;
  }, [state.leanRestrictions]);

  const restrictionCounts = useMemo(() => {
    const map: Record<string, { total: number; pending: number }> = {};
    state.leanRestrictions.forEach(r => {
      if (!map[r.activityId]) map[r.activityId] = { total: 0, pending: 0 };
      map[r.activityId].total++;
      if (r.status !== 'Liberada') map[r.activityId].pending++;
    });
    return map;
  }, [state.leanRestrictions]);

  const stats = useMemo(() => {
    const starting = activitiesInWindow.filter(a => a._start >= windowStart && a._start <= windowEnd).length;
    const ending = activitiesInWindow.filter(a => a._end >= windowStart && a._end <= windowEnd).length;
    const critical = activitiesInWindow.filter(a => a.crit).length;
    const inProgress = activitiesInWindow.filter(a => (a.pct || 0) > 0 && (a.pct || 0) < 100).length;
    const withRestrictions = activitiesInWindow.filter(a => restrictionCounts[a.id]?.pending > 0).length;
    return { total: activitiesInWindow.length, starting, ending, critical, inProgress, withRestrictions };
  }, [activitiesInWindow, windowStart, windowEnd, restrictionCounts]);

  const weekGroups = useMemo(() => {
    const groups: { label: string; span: number }[] = [];
    let currentWeek = -1;
    days.forEach(d => {
      const week = Math.floor((d.date.getTime() - windowStart.getTime()) / (7 * 86400000));
      if (week !== currentWeek) { currentWeek = week; groups.push({ label: `Semana ${week + 1}`, span: 0 }); }
      groups[groups.length - 1].span++;
    });
    return groups;
  }, [days, windowStart]);

  const knownEncargados = useMemo(() => {
    const set = new Set<string>();
    state.activities.forEach(a => { if (a.encargado) set.add(a.encargado); });
    return Array.from(set).sort();
  }, [state.activities]);

  /* ── Auto-create default "Sin Restricción" + "Liberada" restrictions ── */
  useEffect(() => {
    const existingActIds = new Set(state.leanRestrictions.map(r => r.activityId));
    const missing = activitiesInWindow.filter(a => !existingActIds.has(a.id));
    if (missing.length === 0) return;
    missing.forEach(a => {
      const r: LeanRestriction = {
        id: uid(), activityId: a.id, category: 'Sin Restricción', description: '',
        responsible: '', plannedReleaseDate: null, actualReleaseDate: null,
        status: 'Liberada', notes: '', createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_RESTRICTION', restriction: r });
    });
  }, [activitiesInWindow, state.leanRestrictions, dispatch]);

  /* ── encargado edit ── */
  const commitEncargado = (actId: string) => {
    const idx = state.activities.findIndex(a => a.id === actId);
    if (idx >= 0) dispatch({ type: 'UPDATE_ACTIVITY', index: idx, updates: { encargado: encargadoVal } });
    setEditingEncargado(null);
  };

  /* ── restriction inline editing ── */
  const ensureRestriction = (actId: string): string => {
    const existing = primaryRestriction[actId];
    if (existing) return existing.id;
    const r: LeanRestriction = {
      id: uid(), activityId: actId, category: 'Sin Restricción', description: '',
      responsible: '', plannedReleaseDate: null, actualReleaseDate: null,
      status: 'Liberada', notes: '', createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_RESTRICTION', restriction: r });
    return r.id;
  };

  const startEdit = (actId: string, field: string, currentVal: string) => {
    ensureRestriction(actId);
    setEditCell({ actId, field });
    setEditVal(currentVal);
  };

  const commitEdit = () => {
    if (!editCell) return;
    const r = primaryRestriction[editCell.actId];
    if (!r) { setEditCell(null); return; }
    const updates: Partial<LeanRestriction> = {};
    if (editCell.field === 'category') {
      (updates as any).category = editVal;
      if (editVal === 'Sin Restricción') {
        (updates as any).status = 'Liberada';
      } else if (r.status === 'Liberada') {
        (updates as any).status = 'Pendiente';
      }
    } else if (editCell.field === 'status') {
      (updates as any).status = editVal;
    } else if (editCell.field === 'plannedReleaseDate') {
      updates.plannedReleaseDate = editVal || null;
    } else if (editCell.field === 'actualReleaseDate') {
      updates.actualReleaseDate = editVal || null;
      if (editVal) (updates as any).status = 'Liberada';
    }
    dispatch({ type: 'UPDATE_RESTRICTION', id: r.id, updates });
    setEditCell(null);
    triggerSave();
  };

  const isEditing = (actId: string, field: string) =>
    editCell?.actId === actId && editCell.field === field;

  /* ── today / status-date column indices ── */
  const todayIso = isoDate(today);
  const statusIso = state.statusDate ? isoDate(state.statusDate) : null;
  const todayDayIdx = useMemo(() => days.findIndex(d => d.iso === todayIso), [days, todayIso]);
  const statusDayIdx = useMemo(() => statusIso ? days.findIndex(d => d.iso === statusIso) : -1, [days, statusIso]);

  const daysUntil = (actId: string): { value: number | null; label: string; color: string } => {
    const r = primaryRestriction[actId];
    if (!r) return { value: null, label: '—', color: 'var(--text-muted)' };
    if (r.status === 'Liberada') return { value: null, label: '✓', color: '#22c55e' };
    if (!r.plannedReleaseDate) return { value: null, label: 'S/F', color: '#64748b' };
    const pd = parseDate(r.plannedReleaseDate);
    if (!pd) return { value: null, label: '—', color: 'var(--text-muted)' };
    const diff = Math.ceil((pd.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { value: diff, label: `${diff}d`, color: '#ef4444' };
    if (diff === 0) return { value: 0, label: 'Hoy', color: '#f59e0b' };
    if (diff <= 7) return { value: diff, label: `${diff}d`, color: '#f59e0b' };
    return { value: diff, label: `${diff}d`, color: '#22c55e' };
  };

  /* ── column resize ── */
  const onResizeStart = (key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key];
    const minW = COL_MAP[key]?.minWidth ?? 30;
    const onMove = (ev: MouseEvent) =>
      setColWidths(prev => ({ ...prev, [key]: Math.max(minW, startW + ev.clientX - startX) }));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /* ── column drag-reorder ── */
  const onColDragStart = (key: string, e: React.DragEvent) => {
    setDragCol(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };
  const onColDragOver = (key: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(key);
  };
  const onColDrop = (key: string, e: React.DragEvent) => {
    e.preventDefault();
    if (dragCol && dragCol !== key) {
      setColOrder(prev => {
        const arr = [...prev];
        const from = arr.indexOf(dragCol);
        const to = arr.indexOf(key);
        arr.splice(from, 1);
        arr.splice(to, 0, dragCol);
        return arr;
      });
    }
    setDragCol(null); setDragOverCol(null);
  };

  /* ── styles ── */
  const inputS: React.CSSProperties = {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--color-indigo)',
    borderRadius: 3, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 10, outline: 'none',
  };

  /* ── cell content renderer ── */
  const renderCell = (key: string, act: ActEx) => {
    const pct = act.pct || 0;
    const pr = primaryRestriction[act.id];
    const rc = restrictionCounts[act.id];
    const isCrit = act.crit;
    const statusColor = pct === 100 ? '#22c55e' : pct > 0 ? '#f59e0b' : '#64748b';
    const statusLabel = pct === 100 ? 'Completada' : pct > 0 ? 'En curso' : 'Pendiente';

    switch (key) {
      case 'id':
        return <span style={{ color: isCrit ? 'var(--color-critical)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{act.id}</span>;

      case 'name':
        return <span style={{ color: 'var(--text-primary)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          {isCrit && <span style={{ color: '#ef4444', marginRight: 4 }}>●</span>}{act.name}
        </span>;

      case 'encargado':
        return editingEncargado === act.id
          ? <input autoFocus list="encargados-list" value={encargadoVal} onChange={e => setEncargadoVal(e.target.value)}
              onBlur={() => commitEncargado(act.id)}
              onKeyDown={e => { if (e.key === 'Enter') commitEncargado(act.id); if (e.key === 'Escape') setEditingEncargado(null); }}
              style={inputS} />
          : <span style={{ color: act.encargado ? 'var(--text-primary)' : 'var(--text-muted)' }}>{act.encargado || '—'}</span>;

      case 'pct':
        return <div style={{ background: 'var(--bg-input)', borderRadius: 4, height: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#6366f1', borderRadius: 4, transition: 'width .3s' }} />
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'white' }}>{pct}%</span>
        </div>;

      case 'pctProgr': {
        const pp = (act as any)._pctProgrLH ?? 0;
        const ppRound = Math.round(pp * 10) / 10;
        const ppBar = Math.min(ppRound, 100);
        return <div style={{ background: 'var(--bg-input)', borderRadius: 4, height: 14, position: 'relative', overflow: 'hidden' }}
          title={`${ppRound}% programado al ${fmtDate(windowEnd)}`}>
          <div style={{ width: `${ppBar}%`, height: '100%', background: '#8b5cf6', borderRadius: 4, transition: 'width .3s' }} />
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'white' }}>{ppRound}%</span>
        </div>;
      }

      case 'estado':
        return <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: statusColor + '22', color: statusColor }}>{statusLabel}</span>;

      case 'tipoRestr':
        return isEditing(act.id, 'category')
          ? <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} style={inputS}>
              {RESTR_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          : pr
            ? <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--bg-input)', color: rc?.pending ? '#f97316' : '#22c55e', whiteSpace: 'nowrap' }}>{pr.category}</span>
            : <span style={{ color: 'var(--text-muted)' }}>—</span>;

      case 'estRestr':
        return isEditing(act.id, 'status')
          ? <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} style={inputS}>
              {RESTR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          : pr
            ? <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: STATUS_COLORS[pr.status] + '22', color: STATUS_COLORS[pr.status] }}>{pr.status}</span>
            : <span style={{ color: 'var(--text-muted)' }}>—</span>;

      case 'dias': {
        const du = daysUntil(act.id);
        return <span style={{ color: du.color, fontWeight: du.value !== null && du.value < 0 ? 700 : 400 }}>{du.label}</span>;
      }

      case 'fPrevista':
        return isEditing(act.id, 'plannedReleaseDate')
          ? <input type="date" autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
              onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
              style={inputS} />
          : pr?.plannedReleaseDate ? (() => {
              const pd = parseDate(pr.plannedReleaseDate);
              const isOverdue = pd && pd < today && pr.status !== 'Liberada';
              return <span style={{ color: isOverdue ? '#ef4444' : pr.status !== 'Liberada' ? '#f59e0b' : '#22c55e', fontWeight: isOverdue ? 700 : 400 }}>{pd ? fmtDate(pd) : pr.plannedReleaseDate}</span>;
            })()
          : <span style={{ color: 'var(--text-muted)' }}>—</span>;

      case 'fLiberado':
        return isEditing(act.id, 'actualReleaseDate')
          ? <input type="date" autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
              onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
              style={inputS} />
          : pr?.actualReleaseDate
            ? <span style={{ color: '#22c55e' }}>{fmtDate(parseDate(pr.actualReleaseDate))}</span>
            : <span style={{ color: 'var(--text-muted)' }}>—</span>;

      /* ── Gantt columns ── */
      case 'outlineNum':
        return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{act.outlineNum || ''}</span>;
      case 'type':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {act.type === 'milestone' ? 'Hito' : act.type === 'summary' ? 'Resumen' : 'Tarea'}
        </span>;
      case 'lv':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(act.lv || 0) + 1}</span>;
      case 'notes':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{(act.notes || '').substring(0, 40)}</span>;
      case 'dur':
        return <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{act.type === 'milestone' ? '0d' : (act.dur || 0) + 'd'}</span>;
      case 'remDur':
        return <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{act.type === 'milestone' ? '0d' : (act.remDur != null ? act.remDur : (act.dur || 0)) + 'd'}</span>;
      case 'startDate':
        return <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{act.ES ? fmtDate(act.ES) : ''}</span>;
      case 'endDate':
        return <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{act.EF ? fmtDate(act.type === 'milestone' ? act.EF : addDays(act.EF, -1)) : ''}</span>;
      case 'actualStart':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.actualStart ? fmtDate(new Date(act.actualStart)) : ''}</span>;
      case 'actualFinish':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.actualFinish ? fmtDate(new Date(act.actualFinish)) : ''}</span>;
      case 'constraint':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.constraint || ''}</span>;
      case 'constraintDate':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.constraintDate || ''}</span>;
      case 'predStr':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{predsToStr(act.preds)}</span>;
      case 'plannedPct':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{Number((act as any)._plannedPct != null ? (act as any)._plannedPct : (act.pct || 0)).toFixed(1)}%</span>;
      case 'res':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{act.res || ''}</span>;
      case 'cal':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{typeof act.cal === 'string' ? act.cal : (act.cal || '') + ''}</span>;
      case 'work':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(act.work || 0) + ' hrs'}</span>;
      case 'earnedValue': {
        const ev = Math.round((act.work || 0) * (act.pct || 0) / 100 * 10) / 10;
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{ev} hrs</span>;
      }
      case 'remainingWork': {
        const ev2 = (act.work || 0) * (act.pct || 0) / 100;
        const rem = Math.round(((act.work || 0) - ev2) * 10) / 10;
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{rem} hrs</span>;
      }
      case 'weight':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.weight != null ? act.weight + '%' : ''}</span>;
      case 'blDur':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.blDur != null ? act.blDur + 'd' : ''}</span>;
      case 'blStart':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.blES ? fmtDate(act.blES) : ''}</span>;
      case 'blEnd':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{act.blEF ? fmtDate(addDays(act.blEF, -1)) : ''}</span>;
      case 'TF':
        return <span style={{ fontSize: 10, color: act.TF != null && act.TF <= 0 ? '#ef4444' : 'var(--text-secondary)' }}>{act.TF != null ? act.TF + 'd' : ''}</span>;
      case 'FF':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(act as any)._freeFloat != null ? (act as any)._freeFloat + 'd' : ''}</span>;
      case 'floatPath':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(act as any)._floatPath != null ? String((act as any)._floatPath) : ''}</span>;
      case 'crit':
        return <span style={{ fontSize: 10, color: act.crit ? '#ef4444' : 'var(--text-secondary)', fontWeight: act.crit ? 600 : 400 }}>{act.crit ? 'Sí' : 'No'}</span>;
      case 'activityCount':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>1</span>;
      case 'txt1': case 'txt2': case 'txt3': case 'txt4': case 'txt5':
        return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(act as any)[key] || ''}</span>;

      default: return null;
    }
  };

  /* ── get doubleClick handler per column ── */
  const getCellDblClick = (key: string, act: ActEx): (() => void) | undefined => {
    const pr = primaryRestriction[act.id];
    switch (key) {
      case 'encargado': return () => { setEditingEncargado(act.id); setEncargadoVal(act.encargado || ''); };
      case 'tipoRestr': return () => startEdit(act.id, 'category', pr?.category || 'Sin Restricción');
      case 'estRestr':  return () => startEdit(act.id, 'status', pr?.status || 'Liberada');
      case 'fPrevista': return () => startEdit(act.id, 'plannedReleaseDate', pr?.plannedReleaseDate || '');
      case 'fLiberado': return () => startEdit(act.id, 'actualReleaseDate', pr?.actualReleaseDate || '');
      default: return undefined;
    }
  };

  /* ═════════════ RENDER ═════════════ */
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Stats bar + column picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 20px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>{stats.total} actividades</span>
          <span style={{ color: '#ef4444' }}><AlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> {stats.critical} críticas</span>
          <span style={{ color: '#f59e0b' }}><Clock size={12} style={{ verticalAlign: 'middle' }} /> {stats.inProgress} en curso</span>
          <span style={{ color: '#22c55e' }}><CheckCircle2 size={12} style={{ verticalAlign: 'middle' }} /> {stats.ending} terminan</span>
          {stats.withRestrictions > 0 && (
            <span style={{ color: '#f97316' }}><ShieldAlert size={12} style={{ verticalAlign: 'middle' }} /> {stats.withRestrictions} restringidas</span>
          )}
        </div>

        {/* Toggle buttons */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_TODAY_LINE' })}
            title="Línea Hoy"
            style={{
              background: state.showTodayLine ? 'rgba(245,158,11,0.15)' : 'var(--bg-input)',
              border: `1px solid ${state.showTodayLine ? '#f59e0b' : 'var(--border-secondary)'}`,
              borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
              color: state.showTodayLine ? '#f59e0b' : 'var(--text-secondary)',
            }}><Ruler size={12} /> Hoy</button>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_STATUS_LINE' })}
            title="Línea Fecha de Corte"
            style={{
              background: state.showStatusLine ? 'rgba(6,182,212,0.15)' : 'var(--bg-input)',
              border: `1px solid ${state.showStatusLine ? '#06b6d4' : 'var(--border-secondary)'}`,
              borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
              color: state.showStatusLine ? '#06b6d4' : 'var(--text-secondary)',
            }}><CalendarCheck2 size={12} /> Corte</button>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_DEPENDENCIES' })}
            title="Mostrar Relaciones"
            style={{
              background: state.showDependencies ? 'rgba(99,102,241,0.15)' : 'var(--bg-input)',
              border: `1px solid ${state.showDependencies ? '#6366f1' : 'var(--border-secondary)'}`,
              borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
              color: state.showDependencies ? '#6366f1' : 'var(--text-secondary)',
            }}><Network size={12} /> Relaciones</button>
          <button
            onClick={() => setShowWBS(v => !v)}
            title="Mostrar / Ocultar WBS (actividades resumen)"
            style={{
              background: showWBS ? 'rgba(168,85,247,0.15)' : 'var(--bg-input)',
              border: `1px solid ${showWBS ? '#a855f7' : 'var(--border-secondary)'}`,
              borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
              color: showWBS ? '#a855f7' : 'var(--text-secondary)',
            }}><Layers size={12} /> WBS</button>
        </div>

        {/* Column picker – opens full modal like Carta Gantt */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowColPicker(true)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4,
              padding: '3px 8px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 4, fontSize: 10 }}>
            <Settings2 size={12} /> Columnas
          </button>
        </div>
      </div>

      {/* Column Picker Modal */}
      {showColPicker && (
        <ColumnPickerModal
          onClose={() => setShowColPicker(false)}
          externalColumns={COL_DEFS.map(c => ({ key: c.key, label: c.label }))}
          externalSelected={visibleCols}
          onExternalApply={(selectedKeys) => {
            // Update colOrder to put selected first, then hidden
            const selSet = new Set(selectedKeys);
            const newOrder = [...selectedKeys, ...colOrder.filter(k => !selSet.has(k))];
            setColOrder(newOrder);
            setColHidden(new Set(COL_DEFS.map(c => c.key).filter(k => !selSet.has(k))));
          }}
          customGroups={LA_COLUMN_GROUPS}
        />
      )}

      {/* Grid */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', padding: 0, position: 'relative' }}>
        <table className="la-grid-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 11 }}>
          <colgroup>
            {visibleCols.map(k => <col key={k} style={{ width: colWidths[k] }} />)}
            {days.map((_, i) => <col key={`d${i}`} style={{ width: dayColWidth }} />)}
          </colgroup>
          <thead>
            {/* Row 1: data columns (rowSpan 2) + week groups */}
            <tr style={{ background: 'var(--bg-header)' }}>
              {visibleCols.map(colKey => {
                const def = COL_MAP[colKey];
                const w = colWidths[colKey];
                return (
                  <th key={colKey} rowSpan={2}
                    draggable
                    onDragStart={e => onColDragStart(colKey, e)}
                    onDragOver={e => onColDragOver(colKey, e)}
                    onDrop={e => onColDrop(colKey, e)}
                    onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                    style={{
                      background: 'var(--bg-header)', padding: '4px 6px',
                      borderBottom: '1px solid var(--border-primary)',
                      borderRight: '1px solid var(--border-primary)',
                      width: w, minWidth: w, textAlign: def.align,
                      color: 'var(--text-muted)', fontSize: 10,
                      position: 'relative', whiteSpace: 'nowrap', userSelect: 'none',
                      cursor: 'grab',
                      opacity: dragCol === colKey ? 0.4 : 1,
                      borderLeft: dragOverCol === colKey && dragCol !== colKey
                        ? '2px solid var(--color-indigo)' : undefined,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      {colKey === 'encargado' && <User size={10} style={{ flexShrink: 0 }} />}
                      <span>{def.label}</span>
                    </div>
                    {/* resize handle */}
                    <div draggable={false}
                      style={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 5,
                        cursor: 'col-resize', zIndex: 1 }}
                      onMouseDown={e => onResizeStart(colKey, e)}
                    />
                  </th>
                );
              })}
              {weekGroups.map((wg, i) => (
                <th key={`wg-${i}`} colSpan={wg.span}
                  style={{ background: 'var(--bg-header)', padding: '3px 0',
                    borderBottom: '1px solid var(--border-secondary)',
                    borderRight: '1px solid var(--border-primary)',
                    textAlign: 'center', color: 'var(--text-accent)', fontSize: 10, fontWeight: 600 }}>
                  {wg.label}
                </th>
              ))}
            </tr>
            {/* Row 2: day sub-headers */}
            <tr style={{ background: 'var(--bg-header)' }}>
              {days.map((d, i) => {
                const isTodayCol = state.showTodayLine && i === todayDayIdx;
                const isStatusCol = state.showStatusLine && i === statusDayIdx;
                return (
                  <th key={i} style={{ padding: '2px 0', borderBottom: '1px solid var(--border-primary)',
                    borderRight: '1px solid var(--border-primary)', textAlign: 'center',
                    fontSize: dayColWidth < 32 ? 8 : 9, color: d.isWeekend ? 'var(--text-muted)' : 'var(--text-secondary)',
                    background: isTodayCol ? 'rgba(245,158,11,0.12)'
                      : isStatusCol ? 'rgba(6,182,212,0.12)'
                      : d.isWeekend ? 'rgba(99,102,241,0.05)' : 'var(--bg-header)',
                    overflow: 'hidden', position: 'relative' }}>
                    {dayColWidth >= 28 && <div>{d.dayName}</div>}
                    <div style={{ fontWeight: 600 }}>{d.date.getDate()}</div>
                    {isTodayCol && <div style={{ position: 'absolute', top: 0, bottom: -1, right: -1, width: 2, background: '#f59e0b', zIndex: 5, pointerEvents: 'none' }} />}
                    {isStatusCol && <div style={{ position: 'absolute', top: 0, bottom: -1, right: -1, width: 2, background: '#06b6d4', zIndex: 5, pointerEvents: 'none' }} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activitiesInWindow.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + days.length}
                  style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No hay actividades en esta ventana de tiempo
                </td>
              </tr>
            ) : activitiesInWindow.map((act, idx) => {
              const pct = act.pct || 0;
              const isCrit = act.crit;
              const rc = restrictionCounts[act.id];
              const isMilestone = act.type === 'milestone';

              // ── Bar color logic matching Carta Gantt ──
              const barColor = isCrit ? '#ef4444' : (act.lv <= 1 ? '#6366f1' : '#3b82f6');
              const barBorder = isCrit ? '#b91c1c' : (act.lv <= 1 ? '#4338ca' : '#1d4ed8');

              // ── Compute bar pixel span across day columns ──
              const startIdx = days.findIndex(d => d.iso === isoDate(act._start));
              const endIdx = days.findIndex(d => d.iso === isoDate(act._end));
              const barStartDay = Math.max(startIdx, 0);
              const barEndDay = endIdx >= 0 ? endIdx : days.length - 1;
              const barLeft = barStartDay * dayColWidth + (startIdx >= 0 ? 2 : 0);
              const barRight = (days.length - barEndDay - 1) * dayColWidth + (endIdx >= 0 ? 2 : 0);
              const barTotalW = (barEndDay - barStartDay + 1) * dayColWidth - (startIdx >= 0 ? 2 : 0) - (endIdx >= 0 ? 2 : 0);

              // Progress width — extends up to statusDate (like Carta Gantt)
              let progressW = 0;
              if (pct > 0 && state.statusDate) {
                const sdIdx = days.findIndex(d => d.iso === isoDate(state.statusDate!));
                if (sdIdx >= 0) {
                  const sdEndPx = (sdIdx - barStartDay + 1) * dayColWidth;
                  progressW = Math.min(Math.max(0, sdEndPx - (startIdx >= 0 ? 2 : 0)), barTotalW);
                } else if (state.statusDate > windowEnd) {
                  progressW = barTotalW; // status date beyond window → full bar
                } else {
                  progressW = Math.round(barTotalW * pct / 100); // fallback
                }
              } else if (pct > 0) {
                progressW = Math.round(barTotalW * pct / 100);
              }

              // Bar label text (like Carta Gantt: "5d 20%")
              const durLabel = (act.dur || 0) + 'd' + (pct ? ' ' + pct + '%' : '');

              // Find this activity's index in the global activities array (for selection/context menu)
              const globalIdx = state.activities.findIndex(a => a.id === act.id);
              const isSelected = state.selIndices.has(globalIdx);

              const isSummaryRow = act.type === 'summary';

              return (
                <tr key={act.id}
                  className={isSelected ? 'la-sel' : ''}
                  style={{
                    background: isSummaryRow
                      ? (state.lightMode ? '#eef2ff' : '#1a1040')
                      : (idx % 2 ? 'var(--bg-row-odd)' : 'var(--bg-row-even)'),
                    borderBottom: isSummaryRow ? '2px solid var(--color-indigo)' : '1px solid var(--border-primary)',
                    fontWeight: isSummaryRow ? 700 : 400,
                  }}
                  onClick={(e) => {
                    if (globalIdx >= 0) dispatch({ type: 'SET_SELECTION', index: globalIdx, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const cell = (e.target as HTMLElement).closest('[data-colkey]') as HTMLElement | null;
                    setCtxColKey(cell?.dataset?.colkey ?? null);
                    if (globalIdx >= 0 && !state.selIndices.has(globalIdx)) {
                      dispatch({ type: 'SET_SELECTION', index: globalIdx });
                    }
                    setCtxMenu({ x: e.clientX, y: e.clientY });
                  }}
                >
                  {/* Data columns – dynamic */}
                  {visibleCols.map(colKey => {
                    const def = COL_MAP[colKey];
                    const w = colWidths[colKey];
                    const dbl = isSummaryRow ? undefined : getCellDblClick(colKey, act);
                    return (
                      <td key={colKey} data-colkey={colKey}
                        onDoubleClick={dbl ? (e) => { e.stopPropagation(); dbl(); } : undefined}
                        style={{ padding: '2px 6px', borderRight: '1px solid var(--border-primary)',
                          width: w, minWidth: w, maxWidth: w, textAlign: def.align,
                          overflow: 'hidden', fontSize: colKey === 'name' ? 11 : 10,
                          cursor: dbl ? 'pointer' : 'default',
                          paddingLeft: isSummaryRow && colKey === 'name' ? (2 + Math.max(0, act.lv) * 14) : undefined }}>
                        {isSummaryRow && colKey === 'name'
                          ? <span style={{ color: 'var(--text-accent)' }}>▾ {act.name}</span>
                          : renderCell(colKey, act)}
                      </td>
                    );
                  })}
                  {/* Day columns — bars are rendered via a single overlay across the row */}
                  {days.map((d, di) => {
                    const isTodayCol = state.showTodayLine && di === todayDayIdx;
                    const isStatusCol = state.showStatusLine && di === statusDayIdx;
                    return (
                      <td key={di} style={{ padding: 0, borderRight: '1px solid var(--border-primary)',
                        background: isTodayCol ? 'rgba(245,158,11,0.08)'
                          : isStatusCol ? 'rgba(6,182,212,0.08)'
                          : d.isWeekend ? 'rgba(99,102,241,0.04)' : 'transparent',
                        position: 'relative', height: 28 }}>
                        {/* Today vertical line */}
                        {isTodayCol && <div style={{ position: 'absolute', top: 0, bottom: 0, right: -1, width: 2, background: '#f59e0b', zIndex: 5, pointerEvents: 'none' }} />}
                        {/* Status-date vertical line */}
                        {isStatusCol && <div style={{ position: 'absolute', top: 0, bottom: 0, right: -1, width: 2, background: '#06b6d4', zIndex: 5, pointerEvents: 'none' }} />}
                        {/* Bar rendered only on the FIRST day cell that is in range to span across all days */}
                        {di === barStartDay && !isMilestone && (
                          <div style={{
                            position: 'absolute', top: 5, bottom: 5,
                            left: startIdx >= 0 ? 2 : 0,
                            width: barTotalW,
                            background: barColor,
                            borderRadius: 3,
                            boxShadow: `0 0 4px ${barColor}88, inset 0 1px 0 rgba(255,255,255,0.18)`,
                            border: `1px solid ${barBorder}`,
                            zIndex: 3,
                            overflow: 'hidden',
                            display: 'flex', alignItems: 'center',
                          }}>
                            {/* Progress fill (green) */}
                            {progressW > 0 && (
                              <div style={{
                                position: 'absolute', top: 0, left: 0, bottom: 0,
                                width: progressW,
                                background: 'rgba(34,197,94,0.45)',
                                borderRadius: '2px 0 0 2px',
                              }} />
                            )}
                            {/* Gradient sheen overlay */}
                            <div style={{
                              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                              background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.12) 100%)',
                              borderRadius: 3, pointerEvents: 'none',
                            }} />
                            {/* Bar label */}
                            {barTotalW > 30 && (
                              <span style={{
                                position: 'relative', zIndex: 1,
                                fontSize: 8, fontWeight: 600, color: '#e5e7eb',
                                marginLeft: 4, whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                              }}>{durLabel}</span>
                            )}
                          </div>
                        )}
                        {/* Bar label outside bar when too narrow */}
                        {di === barEndDay && !isMilestone && barTotalW <= 30 && (
                          <span style={{
                            position: 'absolute', left: endIdx >= 0 ? dayColWidth + 3 : 3,
                            top: '50%', transform: 'translateY(-50%)',
                            fontSize: 8, fontWeight: 600, color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap', zIndex: 4,
                          }}>{durLabel}</span>
                        )}
                        {/* Milestone diamond */}
                        {isMilestone && di === barStartDay && (
                          <div style={{
                            position: 'absolute',
                            top: '50%', left: dayColWidth / 2,
                            width: 10, height: 10,
                            background: '#fbbf24',
                            border: '1.5px solid #92400e',
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                            zIndex: 3,
                            boxShadow: '0 0 4px rgba(251,191,36,0.5)',
                          }} />
                        )}
                        {/* Baseline bar (thin bar at bottom) */}
                        {act.blES && act.blEF && !isMilestone && (() => {
                          const blVisualEnd = addDays(act.blEF!, -1); // blEF is exclusive like EF
                          const blStartIdx = days.findIndex(dd => dd.iso === isoDate(act.blES!));
                          const blEndIdx = days.findIndex(dd => dd.iso === isoDate(blVisualEnd));
                          if (blStartIdx < 0 && blEndIdx < 0) return null;
                          const blStart = Math.max(blStartIdx, 0);
                          if (di !== blStart) return null;
                          const blEnd = blEndIdx >= 0 ? blEndIdx : days.length - 1;
                          const blW = (blEnd - blStart + 1) * dayColWidth - 4;
                          return (
                            <div style={{
                              position: 'absolute', bottom: 1, left: 2,
                              width: blW, height: 3,
                              background: 'rgba(148,163,184,0.4)',
                              borderRadius: 1.5, zIndex: 2,
                            }} />
                          );
                        })()}
                        {/* Restriction indicator dot */}
                        {rc != null && rc.pending > 0 && di === barStartDay && !isMilestone && (
                          <div style={{
                            position: 'absolute', top: 2, right: 2,
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#f97316', border: '1px solid #ea580c',
                            zIndex: 6,
                          }}
                            title={`${rc.pending} restricción(es) pendiente(s)`}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="encargados-list">
          {knownEncargados.map(e => <option key={e} value={e} />)}
        </datalist>

        {/* ── Dependency arrows SVG overlay ── */}
        {state.showDependencies && activitiesInWindow.length > 0 && (() => {
          const rowH = 29; // row height (28 content + 1 border)
          const fixedW = fixedColsWidth;
          const arrows: React.ReactNode[] = [];

          // Build index map of activities visible in the window
          const actIdxMap = new Map<string, number>();
          activitiesInWindow.forEach((a, i) => actIdxMap.set(a.id, i));

          // Build a full activity map (for predecessors that might be outside the window)
          const allActMap = new Map<string, Activity>();
          state.activities.forEach(a => allActMap.set(a.id, a));

          // Measure header height from the actual table
          const table = containerRef.current?.querySelector('table');
          const thead = table?.querySelector('thead');
          const headerH = thead ? thead.getBoundingClientRect().height : 56;

          // helper: get day-column X for a date
          const dayX = (d: Date, edge: 'start' | 'end'): number | null => {
            const idx = days.findIndex(day => day.iso === isoDate(d));
            if (idx >= 0) return fixedW + idx * dayColWidth + (edge === 'end' ? dayColWidth : 0);
            // clamp to edges
            if (d < windowStart) return fixedW;
            if (d > windowEnd) return fixedW + days.length * dayColWidth;
            return null;
          };

          // Iterate each successor (activity with preds) and draw arrow FROM pred TO this activity
          activitiesInWindow.forEach((suc, sucIdx) => {
            if (!suc.preds || !suc.preds.length) return;
            suc.preds.forEach(p => {
              const predIdx = actIdxMap.get(p.id);
              const pred = predIdx !== undefined ? activitiesInWindow[predIdx] : allActMap.get(p.id);
              if (!pred || !pred.ES || !pred.EF) return;

              const predStart = pred.ES!;
              const predEnd = pred.EF!;
              const sucStart = suc._start;
              const sucEnd = suc._end;
              const linkType = p.type || 'FS';

              let x1: number | null, x2: number | null;
              if (linkType === 'FS') { x1 = dayX(predEnd, 'end'); x2 = dayX(sucStart, 'start'); }
              else if (linkType === 'SS') { x1 = dayX(predStart, 'start'); x2 = dayX(sucStart, 'start'); }
              else if (linkType === 'FF') { x1 = dayX(predEnd, 'end'); x2 = dayX(sucEnd, 'end'); }
              else if (linkType === 'SF') { x1 = dayX(predStart, 'start'); x2 = dayX(sucEnd, 'end'); }
              else { x1 = dayX(predEnd, 'end'); x2 = dayX(sucStart, 'start'); }
              if (x1 === null || x2 === null) return;

              const predRow = predIdx !== undefined ? predIdx : -1;
              if (predRow < 0) return; // skip if predecessor is not visible in window

              const isCrit = !!(pred.crit && suc.crit);
              const color = isCrit ? '#ef4444' : '#6366f1';

              const y1 = headerH + predRow * rowH + rowH / 2;
              const y2 = headerH + sucIdx * rowH + rowH / 2;

              const key = `${p.id}-${suc.id}-${linkType}`;

              // Orthogonal routing like GanttTimeline
              let pathD: string;
              if (linkType === 'FS' || linkType === 'SF') {
                if (x2 > x1 + 12) {
                  const bendX = x1 + 6;
                  pathD = `M${x1},${y1} L${bendX},${y1} L${bendX},${y2} L${x2},${y2}`;
                } else {
                  const detourY = y2 > y1 ? Math.max(y2, y1) + rowH / 2 + 2 : Math.min(y2, y1) - rowH / 2 - 2;
                  pathD = `M${x1},${y1} L${x1 + 8},${y1} L${x1 + 8},${detourY} L${x2 - 8},${detourY} L${x2 - 8},${y2} L${x2},${y2}`;
                }
              } else if (linkType === 'SS') {
                const leftX = Math.min(x1, x2) - 10;
                pathD = `M${x1},${y1} L${leftX},${y1} L${leftX},${y2} L${x2},${y2}`;
              } else if (linkType === 'FF') {
                const rightX = Math.max(x1, x2) + 10;
                pathD = `M${x1},${y1} L${rightX},${y1} L${rightX},${y2} L${x2},${y2}`;
              } else {
                const bendX = x1 + 6;
                pathD = `M${x1},${y1} L${bendX},${y1} L${bendX},${y2} L${x2},${y2}`;
              }

              arrows.push(
                <path key={key} d={pathD}
                  fill="none" stroke={color} strokeWidth={1.3} opacity={0.6}
                  markerEnd={isCrit ? 'url(#arrowLA-crit)' : 'url(#arrowLA)'} />,
              );
            });
          });

          if (arrows.length === 0) return null;

          const totalH = headerH + activitiesInWindow.length * rowH;
          const totalW = fixedW + days.length * dayColWidth;
          return (
            <svg style={{ position: 'absolute', top: 0, left: 0, width: totalW, height: totalH, pointerEvents: 'none', zIndex: 10 }}>
              <defs>
                <marker id="arrowLA" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="#6366f1" opacity="0.6" />
                </marker>
                <marker id="arrowLA-crit" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="#ef4444" opacity="0.6" />
                </marker>
              </defs>
              {arrows}
            </svg>
          );
        })()}
      </div>

      {/* ── Row right-click context menu (same as GanttTable) ── */}
      {ctxMenu && <RowContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} onOpenColumns={() => { setCtxMenu(null); setShowColPicker(true); }} colKey={ctxColKey} selCount={state.selIndices.size} onFillDown={() => {}} onFillUp={() => {}} />}
    </div>
  );
}
