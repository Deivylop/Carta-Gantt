// ═══════════════════════════════════════════════════════════════════
// KanbanBoard – Visual Management Board (Lean + Scrum hybrid)
//
// Lean Construction mapping:
//   Inventario      → Activities in the look-ahead window (backlog)
//   Con Restricción → Activities with unresolved constraints
//   Libre           → Make-ready: all constraints released, can be planned
//   En Ejecución    → In the weekly work plan, actively worked
//   Completada      → Done (pct >= 100%)
//
// Inspired by Scrum boards but tailored for construction:
// - Cards are automatically classified based on restriction status & progress
// - Drag-and-drop manual overrides for "En Ejecución" (weekly commitment)
// - WIP limits visible per column
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback, useRef } from 'react';
import { useGantt } from '../../store/GanttContext';
import type { Activity, KanbanStatus, RestrictionCategory } from '../../types/gantt';
import { GripVertical, User, AlertTriangle, CheckCircle2, Clock, Package, Layers, Filter } from 'lucide-react';

const RESTRICTION_CATS: RestrictionCategory[] = [
  'Sin Restricción',
  'Material', 'Mano de Obra', 'Equipos', 'Información', 'Espacio',
  'Actividad Previa', 'Permisos', 'Diseño', 'Subcontrato', 'Calidad', 'Seguridad', 'Otro'
];

interface Props {
  windowStart: Date;
  windowEnd: Date;
}

const COLUMNS: { key: KanbanStatus; label: string; color: string; icon: React.ReactNode }[] = [
  { key: 'Inventario',        label: 'Inventario',         color: '#64748b', icon: <Package size={14} /> },
  { key: 'Con Restricciones', label: 'Con Restricciones',  color: '#ef4444', icon: <AlertTriangle size={14} /> },
  { key: 'Libre',             label: 'Libre de Restr.',    color: '#0ea5e9', icon: <CheckCircle2 size={14} /> },
  { key: 'En Ejecución',      label: 'En Ejecución',       color: '#f59e0b', icon: <Clock size={14} /> },
  { key: 'Completada',        label: 'Completada',         color: '#22c55e', icon: <CheckCircle2 size={14} /> },
];

export default function KanbanBoard({ windowStart, windowEnd }: Props) {
  const { state, dispatch } = useGantt();
  const [dragging, setDragging] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<KanbanStatus | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEncargado, setFilterEncargado] = useState<string>('all');
  const [filterRestrCat, setFilterRestrCat] = useState<RestrictionCategory | 'all'>('all');
  const [manualOverrides, setManualOverrides] = useState<Record<string, KanbanStatus>>({});
  const dragRef = useRef<string | null>(null);

  // Compute restriction map (with categories)
  const restrictionMap = useMemo(() => {
    const m: Record<string, { total: number; pending: number; categories: RestrictionCategory[] }> = {};
    state.leanRestrictions.forEach(r => {
      if (!m[r.activityId]) m[r.activityId] = { total: 0, pending: 0, categories: [] };
      m[r.activityId].total++;
      if (r.status !== 'Liberada') m[r.activityId].pending++;
      if (!m[r.activityId].categories.includes(r.category)) m[r.activityId].categories.push(r.category);
    });
    return m;
  }, [state.leanRestrictions]);

  // Known encargados for filter
  const knownEncargados = useMemo(() => {
    const s = new Set<string>();
    state.activities.forEach(a => { if (a.encargado) s.add(a.encargado); });
    return Array.from(s).sort();
  }, [state.activities]);

  // Activities in window
  const activitiesInWindow = useMemo(() => {
    return state.activities.filter(a => {
      if (a.type === 'summary' || a._isProjRow) return false;
      if (!a.ES || !a.EF) return false;
      return a.ES <= windowEnd && a.EF >= windowStart;
    });
  }, [state.activities, windowStart, windowEnd]);

  // Classify activities into Kanban columns
  const classify = useCallback((a: Activity): KanbanStatus => {
    // Manual override first
    if (manualOverrides[a.id]) return manualOverrides[a.id];
    // Completed
    if (a.pct >= 100) return 'Completada';
    // In execution (has started)
    if (a.pct > 0) return 'En Ejecución';
    // Check restrictions
    const rInfo = restrictionMap[a.id];
    if (rInfo && rInfo.pending > 0) return 'Con Restricciones';
    if (rInfo && rInfo.total > 0 && rInfo.pending === 0) return 'Libre';
    // Default: inventory
    return 'Inventario';
  }, [restrictionMap, manualOverrides]);

  // Grouped activities
  const columns = useMemo(() => {
    const groups: Record<KanbanStatus, Activity[]> = {
      'Inventario': [],
      'Con Restricciones': [],
      'Libre': [],
      'En Ejecución': [],
      'Completada': []
    };
    activitiesInWindow.forEach(a => {
      const status = classify(a);
      groups[status].push(a);
    });
    return groups;
  }, [activitiesInWindow, classify]);

  // Filter by search + encargado + restriction category
  const filtered = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    const g: Record<KanbanStatus, Activity[]> = { 'Inventario': [], 'Con Restricciones': [], 'Libre': [], 'En Ejecución': [], 'Completada': [] };
    for (const [k, list] of Object.entries(columns)) {
      g[k as KanbanStatus] = list.filter(a => {
        if (t && !a.name.toLowerCase().includes(t) && !a.id.toLowerCase().includes(t) && !(a.encargado || '').toLowerCase().includes(t)) return false;
        if (filterEncargado !== 'all' && (a.encargado || '') !== filterEncargado) return false;
        if (filterRestrCat !== 'all') {
          const rInfo = restrictionMap[a.id];
          if (!rInfo || !rInfo.categories.includes(filterRestrCat)) return false;
        }
        return true;
      });
    }
    return g;
  }, [columns, searchTerm, filterEncargado, filterRestrCat, restrictionMap]);

  // Drag
  const onDragStart = (id: string) => { setDragging(id); dragRef.current = id; };
  const onDragOver = (e: React.DragEvent, col: KanbanStatus) => { e.preventDefault(); setOverCol(col); };
  const onDrop = (col: KanbanStatus) => {
    const id = dragRef.current;
    if (id) {
      setManualOverrides(prev => ({ ...prev, [id]: col }));
      // If moved to "Completada", set pct=100. If moved to "En Ejecución" and pct=0, set to 1%.
      const idx = state.activities.findIndex(a => a.id === id);
      if (idx >= 0) {
        const act = state.activities[idx];
        if (col === 'Completada' && act.pct < 100) {
          dispatch({ type: 'UPDATE_ACTIVITY', index: idx, updates: { pct: 100 } });
        } else if (col === 'En Ejecución' && act.pct === 0) {
          dispatch({ type: 'UPDATE_ACTIVITY', index: idx, updates: { pct: 1 } });
        }
      }
    }
    setDragging(null); setOverCol(null); dragRef.current = null;
  };

  // KPIs
  const totalInWindow = activitiesInWindow.length;
  const freeCount = columns['Libre'].length + columns['En Ejecución'].length + columns['Completada'].length;
  const readiness = totalInWindow > 0 ? Math.round((freeCount / totalInWindow) * 100) : 0;

  const cardS: React.CSSProperties = {
    background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 10,
    cursor: 'grab', transition: 'box-shadow .15s', fontSize: 11
  };

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header + Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', flexShrink: 0, borderBottom: '1px solid var(--border-primary)', flexWrap: 'wrap' }}>
        <Layers size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)' }}>Tablero Kanban</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({totalInWindow} act.)</span>

        <span style={{ width: 1, height: 20, background: 'var(--border-primary)' }} />
        <Filter size={12} style={{ color: 'var(--text-muted)' }} />

        <select value={filterEncargado} onChange={e => setFilterEncargado(e.target.value)}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
          <option value="all">Todos los encargados</option>
          {knownEncargados.map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        <select value={filterRestrCat} onChange={e => setFilterRestrCat(e.target.value as any)}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
          <option value="all">Todas las restricciones</option>
          {RESTRICTION_CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Readiness:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: readiness >= 80 ? '#22c55e' : readiness >= 50 ? '#f59e0b' : '#ef4444' }}>{readiness}%</span>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..."
            style={{ width: 150, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-primary)', fontSize: 11 }} />
        </div>
      </div>

      {/* Columns */}
      <div style={{ flex: 1, display: 'flex', gap: 8, padding: '12px 12px', overflow: 'auto' }}>
        {COLUMNS.map(col => {
          const items = filtered[col.key];
          const isDragOver = overCol === col.key && dragging;
          return (
            <div key={col.key}
              onDragOver={(e) => onDragOver(e, col.key)}
              onDragLeave={() => setOverCol(null)}
              onDrop={() => onDrop(col.key)}
              style={{
                flex: 1, minWidth: 190, display: 'flex', flexDirection: 'column', borderRadius: 10,
                background: isDragOver ? col.color + '0c' : 'var(--bg-app)',
                border: isDragOver ? `2px dashed ${col.color}44` : '1px solid var(--border-primary)',
                transition: 'background .15s, border .15s'
              }}>
              {/* Column header */}
              <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `2px solid ${col.color}`, flexShrink: 0 }}>
                <span style={{ color: col.color }}>{col.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)' }}>{col.label}</span>
                <span style={{ marginLeft: 'auto', background: col.color + '22', color: col.color, fontWeight: 700, fontSize: 10, padding: '2px 8px', borderRadius: 10 }}>{items.length}</span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 10 }}>Sin actividades</div>
                ) : items.map(a => {
                  const rInfo = restrictionMap[a.id];
                  return (
                    <div key={a.id} draggable
                      onDragStart={() => onDragStart(a.id)}
                      onDragEnd={() => { setDragging(null); setOverCol(null); }}
                      style={{
                        ...cardS,
                        opacity: dragging === a.id ? 0.5 : 1,
                        borderLeft: `3px solid ${col.color}`
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <GripVertical size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, cursor: 'grab' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{a.id}</span>
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: 11, marginBottom: 6, lineHeight: 1.3 }}>{a.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        {a.encargado ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-secondary)' }}>
                            <User size={10} /> {a.encargado}
                          </span>
                        ) : <span />}
                        {rInfo && rInfo.pending > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#ef4444' }}>
                            <AlertTriangle size={10} /> {rInfo.pending}
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div style={{ marginTop: 6, background: 'var(--bg-input)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, a.pct)}%`, background: col.color, borderRadius: 4, transition: 'width .3s' }} />
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{a.pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
