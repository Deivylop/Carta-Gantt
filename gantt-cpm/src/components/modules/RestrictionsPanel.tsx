// ═══════════════════════════════════════════════════════════════════
// RestrictionsPanel – Lean Construction Constraint Analysis
// Based on LPS "Make Ready" process: identify, track & release
// restrictions before work assignments enter the weekly plan.
//
// Key Lean principles:
// • Only constraint-free activities should enter the weekly plan
// • Each restriction has a responsible person & planned release date
// • Visual indicators: Red=overdue, Amber=this week, Green=released
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import { isoDate, fmtDate, parseDate } from '../../utils/cpm';
import type { LeanRestriction, RestrictionCategory, RestrictionStatus } from '../../types/gantt';
import { ShieldAlert, Plus, Trash2, CheckCircle2, Clock, AlertTriangle, Filter } from 'lucide-react';

const CATEGORIES: RestrictionCategory[] = [
  'Sin Restricción',
  'Material', 'Mano de Obra', 'Equipos', 'Información', 'Espacio',
  'Actividad Previa', 'Permisos', 'Diseño', 'Subcontrato', 'Calidad', 'Seguridad', 'Otro'
];
const STATUSES: RestrictionStatus[] = ['Pendiente', 'En Gestión', 'Liberada', 'No Liberada'];
const STATUS_COLORS: Record<RestrictionStatus, string> = {
  'Pendiente': '#ef4444', 'En Gestión': '#f59e0b', 'Liberada': '#22c55e', 'No Liberada': '#64748b'
};

let _uid = 0;
const uid = () => `r_${Date.now()}_${++_uid}`;

interface Props {
  windowStart: Date;
  windowEnd: Date;
}

export default function RestrictionsPanel({ windowStart, windowEnd }: Props) {
  const { state, dispatch } = useGantt();
  const [filterStatus, setFilterStatus] = useState<RestrictionStatus | 'all'>('all');
  const [filterCat, setFilterCat] = useState<RestrictionCategory | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formActId, setFormActId] = useState('');
  const [formCat, setFormCat] = useState<RestrictionCategory>('Material');
  const [formDesc, setFormDesc] = useState('');
  const [formResp, setFormResp] = useState('');
  const [formPlanned, setFormPlanned] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Inline editing
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null);
  const [editVal, setEditVal] = useState('');

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Activities in window for selecting
  const activitiesInWindow = useMemo(() => {
    return state.activities.filter(a => {
      if (a.type === 'summary' || a._isProjRow) return false;
      if (!a.ES || !a.EF) return false;
      return a.ES <= windowEnd && a.EF >= windowStart;
    });
  }, [state.activities, windowStart, windowEnd]);

  // Filtered restrictions
  const restrictions = useMemo(() => {
    let list = [...state.leanRestrictions];
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    if (filterCat !== 'all') list = list.filter(r => r.category === filterCat);
    // Sort: pending first, then by planned date
    list.sort((a, b) => {
      const order: Record<string, number> = { 'Pendiente': 0, 'En Gestión': 1, 'No Liberada': 2, 'Liberada': 3 };
      const ov = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (ov !== 0) return ov;
      return (a.plannedReleaseDate || '').localeCompare(b.plannedReleaseDate || '');
    });
    return list;
  }, [state.leanRestrictions, filterStatus, filterCat]);

  // KPIs
  const kpis = useMemo(() => {
    const all = state.leanRestrictions;
    const total = all.length;
    const pending = all.filter(r => r.status === 'Pendiente' || r.status === 'En Gestión').length;
    const released = all.filter(r => r.status === 'Liberada').length;
    const overdue = all.filter(r => {
      if (r.status === 'Liberada') return false;
      if (!r.plannedReleaseDate) return false;
      const pd = parseDate(r.plannedReleaseDate);
      return pd && pd < today;
    }).length;
    const releaseRate = total > 0 ? Math.round((released / total) * 100) : 0;
    return { total, pending, released, overdue, releaseRate };
  }, [state.leanRestrictions, today]);

  // Known responsibles
  const knownResps = useMemo(() => {
    const s = new Set<string>();
    state.leanRestrictions.forEach(r => { if (r.responsible) s.add(r.responsible); });
    state.activities.forEach(a => { if (a.encargado) s.add(a.encargado); });
    return Array.from(s).sort();
  }, [state.leanRestrictions, state.activities]);

  // Add restriction
  const addRestriction = () => {
    if (!formActId || !formDesc) return;
    const r: LeanRestriction = {
      id: uid(), activityId: formActId, category: formCat, description: formDesc,
      responsible: formResp, plannedReleaseDate: formPlanned || null, actualReleaseDate: null,
      status: formCat === 'Sin Restricción' ? 'Liberada' : 'Pendiente', notes: formNotes, createdAt: new Date().toISOString()
    };
    dispatch({ type: 'ADD_RESTRICTION', restriction: r });
    setShowForm(false); setFormActId(''); setFormDesc(''); setFormResp(''); setFormPlanned(''); setFormNotes('');
  };

  // Release restriction
  const releaseRestriction = (id: string) => {
    dispatch({ type: 'UPDATE_RESTRICTION', id, updates: { status: 'Liberada', actualReleaseDate: isoDate(new Date()) } });
  };

  // Inline edit commit
  const commitEdit = (id: string, field: string) => {
    const updates: Partial<LeanRestriction> = {};
    if (field === 'status') (updates as any).status = editVal;
    else if (field === 'responsible') updates.responsible = editVal;
    else if (field === 'plannedReleaseDate') updates.plannedReleaseDate = editVal || null;
    else if (field === 'actualReleaseDate') updates.actualReleaseDate = editVal || null;
    else if (field === 'description') updates.description = editVal;
    else if (field === 'category') {
      (updates as any).category = editVal;
      if (editVal === 'Sin Restricción') (updates as any).status = 'Liberada';
    }
    dispatch({ type: 'UPDATE_RESTRICTION', id, updates });
    setEditingField(null);
  };

  // Date indicator color
  const dateIndicator = (r: LeanRestriction): string => {
    if (r.status === 'Liberada') return '#22c55e';
    if (!r.plannedReleaseDate) return '#64748b';
    const pd = parseDate(r.plannedReleaseDate);
    if (!pd) return '#64748b';
    if (pd < today) return '#ef4444'; // overdue
    const diff = (pd.getTime() - today.getTime()) / 86400000;
    if (diff <= 7) return '#f59e0b'; // this week
    return '#64748b';
  };

  const actName = (id: string) => state.activities.find(a => a.id === id)?.name || id;

  const thS: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--border-primary)', position: 'sticky', top: 0, background: 'var(--bg-header)', zIndex: 5 };
  const tdS: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, color: 'var(--text-primary)' };

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, padding: '16px 20px', flexShrink: 0 }}>
        {[
          { label: 'Total', value: kpis.total, icon: <ShieldAlert size={14} />, color: '#6366f1' },
          { label: 'Pendientes', value: kpis.pending, icon: <Clock size={14} />, color: '#f59e0b' },
          { label: 'Liberadas', value: kpis.released, icon: <CheckCircle2 size={14} />, color: '#22c55e' },
          { label: 'Vencidas', value: kpis.overdue, icon: <AlertTriangle size={14} />, color: '#ef4444' },
          { label: 'Tasa Lib.', value: kpis.releaseRate + '%', icon: <CheckCircle2 size={14} />, color: '#0ea5e9' },
        ].map((k, i) => (
          <div key={i} style={{ flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-heading)' }}>{k.value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 10px', flexShrink: 0 }}>
        <Filter size={14} style={{ color: 'var(--text-muted)' }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
          <option value="all">Todos los estados</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
          <option value="all">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setShowForm(true)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: '#6366f122', border: '1px solid #6366f144', borderRadius: 6, padding: '5px 14px', color: '#6366f1', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
          <Plus size={14} /> Agregar Restricción
        </button>
      </div>

      {/* Add form overlay */}
      {showForm && (
        <div style={{ padding: '0 20px 16px', flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Actividad *</label>
              <select value={formActId} onChange={e => setFormActId(e.target.value)} style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
                <option value="">Seleccionar...</option>
                {activitiesInWindow.map(a => <option key={a.id} value={a.id}>{a.id} – {a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Categoría</label>
              <select value={formCat} onChange={e => setFormCat(e.target.value as RestrictionCategory)} style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Descripción *</label>
              <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Describe la restricción..."
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Responsable</label>
              <input value={formResp} onChange={e => setFormResp(e.target.value)} list="resp-list"
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
              <datalist id="resp-list">{knownResps.map(r => <option key={r} value={r} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Fecha Lib. Prevista</label>
              <input type="date" value={formPlanned} onChange={e => setFormPlanned(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Notas</label>
              <input value={formNotes} onChange={e => setFormNotes(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '5px 16px', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>Cancelar</button>
              <button onClick={addRestriction} disabled={!formActId || !formDesc}
                style={{ padding: '5px 16px', background: '#6366f1', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, opacity: (!formActId || !formDesc) ? 0.5 : 1 }}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thS}>Actividad</th>
              <th style={thS}>Categoría</th>
              <th style={thS}>Descripción</th>
              <th style={thS}>Responsable</th>
              <th style={thS}>F. Prevista</th>
              <th style={thS}>F. Real</th>
              <th style={thS}>Estado</th>
              <th style={{ ...thS, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {restrictions.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>
                No hay restricciones registradas. Haz clic en "Agregar Restricción" para comenzar el análisis de restricciones (Make Ready).
              </td></tr>
            ) : restrictions.map((r, i) => {
              const dColor = dateIndicator(r);
              const isEditing = (f: string) => editingField?.id === r.id && editingField.field === f;
              const startEdit = (field: string, val: string) => { setEditingField({ id: r.id, field }); setEditVal(val); };

              return (
                <tr key={r.id} style={{ background: i % 2 ? 'var(--bg-row-odd)' : 'transparent' }}>
                  <td style={{ ...tdS, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={actName(r.activityId)}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>{r.activityId}</span>
                    {actName(r.activityId)}
                  </td>
                  <td style={tdS} onDoubleClick={() => startEdit('category', r.category)}>
                    {isEditing('category') ? (
                      <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commitEdit(r.id, 'category')}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--color-indigo)', borderRadius: 3, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 11 }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--bg-input)', fontSize: 10 }}>{r.category}</span>
                    )}
                  </td>
                  <td style={{ ...tdS, maxWidth: 200 }} onDoubleClick={() => startEdit('description', r.description)}>
                    {isEditing('description') ? (
                      <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commitEdit(r.id, 'description')} onKeyDown={e => e.key === 'Enter' && commitEdit(r.id, 'description')}
                        style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--color-indigo)', borderRadius: 3, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 11 }} />
                    ) : r.description}
                  </td>
                  <td style={tdS} onDoubleClick={() => startEdit('responsible', r.responsible)}>
                    {isEditing('responsible') ? (
                      <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commitEdit(r.id, 'responsible')} onKeyDown={e => e.key === 'Enter' && commitEdit(r.id, 'responsible')} list="resp-list2"
                        style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--color-indigo)', borderRadius: 3, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 11 }} />
                    ) : (r.responsible || '—')}
                    <datalist id="resp-list2">{knownResps.map(rr => <option key={rr} value={rr} />)}</datalist>
                  </td>
                  <td style={tdS} onDoubleClick={() => startEdit('plannedReleaseDate', r.plannedReleaseDate || '')}>
                    {isEditing('plannedReleaseDate') ? (
                      <input type="date" autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commitEdit(r.id, 'plannedReleaseDate')}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--color-indigo)', borderRadius: 3, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 11 }} />
                    ) : (
                      <span style={{ color: dColor, fontWeight: r.status !== 'Liberada' && dColor === '#ef4444' ? 700 : 400 }}>
                        {r.plannedReleaseDate ? fmtDate(parseDate(r.plannedReleaseDate)) : '—'}
                      </span>
                    )}
                  </td>
                  <td style={tdS}>
                    <span style={{ color: r.actualReleaseDate ? '#22c55e' : 'var(--text-muted)' }}>
                      {r.actualReleaseDate ? fmtDate(parseDate(r.actualReleaseDate)) : '—'}
                    </span>
                  </td>
                  <td style={tdS} onDoubleClick={() => startEdit('status', r.status)}>
                    {isEditing('status') ? (
                      <select autoFocus value={editVal} onChange={e => { setEditVal(e.target.value); }} onBlur={() => commitEdit(r.id, 'status')}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--color-indigo)', borderRadius: 3, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 11 }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: STATUS_COLORS[r.status] + '22', color: STATUS_COLORS[r.status] }}>{r.status}</span>
                    )}
                  </td>
                  <td style={{ ...tdS, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {r.status !== 'Liberada' && (
                        <button onClick={() => releaseRestriction(r.id)} title="Liberar" style={{ background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: 4, padding: '2px 6px', color: '#22c55e', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>✓ Liberar</button>
                      )}
                      <button onClick={() => dispatch({ type: 'DELETE_RESTRICTION', id: r.id })} title="Eliminar" style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 4, padding: '2px 6px', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
