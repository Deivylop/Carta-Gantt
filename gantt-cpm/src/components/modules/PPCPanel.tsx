// ═══════════════════════════════════════════════════════════════════
// PPCPanel – Percent Plan Complete & Root-Cause Analysis
//
// Last Planner System core metrics:
// 1. PPC (Porcentaje de Plan Cumplido) — weekly reliability measure
//    PPC = completed / planned * 100%
//    Target: ≥85% = reliable planning; <60% = systemic problems
//
// 2. CNC (Causas de No Cumplimiento) — root-cause analysis
//    For each non-completed activity, categorize the reason.
//    Pareto chart reveals systemic issues to address.
//
// Scrum parallel: PPC = Sprint velocity consistency;
//    CNC = Sprint retrospective action items.
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useRef } from 'react';
import { useGantt } from '../../store/GanttContext';
import type { PPCWeekRecord, CNCEntry, CNCCategory } from '../../types/gantt';
import { isoDate, fmtDate, parseDate } from '../../utils/cpm';
import { BarChart3, PlusCircle, Trash2, CalendarDays, TrendingUp, Award } from 'lucide-react';

const CNC_CATEGORIES: CNCCategory[] = [
  'Programación', 'Material', 'Mano de Obra', 'Equipos',
  'Subcontrato', 'Clima', 'Diseño', 'Cliente',
  'Actividad Previa', 'Calidad', 'Seguridad', 'Otro'
];
const CNC_COLORS: Record<CNCCategory, string> = {
  'Programación': '#ef4444', 'Material': '#f97316', 'Mano de Obra': '#f59e0b',
  'Equipos': '#eab308', 'Subcontrato': '#84cc16', 'Clima': '#22c55e',
  'Diseño': '#06b6d4', 'Cliente': '#14b8a6',
  'Actividad Previa': '#3b82f6', 'Calidad': '#6366f1', 'Seguridad': '#8b5cf6', 'Otro': '#64748b'
};

let _uid = 0;
const uid = () => `ppc_${Date.now()}_${++_uid}`;
const cncUid = () => `cnc_${Date.now()}_${++_uid}`;

interface Props {
  windowStart: Date;
  windowEnd: Date;
}

export default function PPCPanel({ windowStart, windowEnd }: Props) {
  const { state, dispatch } = useGantt();

  // Week selection for new record
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Mon
    return isoDate(d);
  });
  const [selectedPlanned, setSelectedPlanned] = useState<string[]>([]);
  const [selectedCompleted, setSelectedCompleted] = useState<string[]>([]);
  const [weekNotes, setWeekNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);

  // CNC form
  const [cncActId, setCncActId] = useState('');
  const [cncCat, setCncCat] = useState<CNCCategory>('Material');
  const [cncDesc, setCncDesc] = useState('');

  const chartRef = useRef<HTMLCanvasElement | null>(null);

  // Activities in look-ahead window
  const activitiesInWindow = useMemo(() => {
    return state.activities.filter(a => {
      if (a.type === 'summary' || a._isProjRow) return false;
      if (!a.ES || !a.EF) return false;
      return a.ES <= windowEnd && a.EF >= windowStart;
    });
  }, [state.activities, windowStart, windowEnd]);

  // Sorted PPC history
  const history = useMemo(() => {
    return [...state.ppcHistory].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [state.ppcHistory]);

  // Aggregate CNC for Pareto
  const cncAgg = useMemo(() => {
    const counts: Record<CNCCategory, number> = {} as any;
    CNC_CATEGORIES.forEach(c => counts[c] = 0);
    state.ppcHistory.forEach(w => {
      w.cncEntries.forEach(e => counts[e.category]++);
    });
    return CNC_CATEGORIES.map(c => ({ cat: c, count: counts[c] }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [state.ppcHistory]);
  const totalCNC = cncAgg.reduce((s, x) => s + x.count, 0);

  // Overall PPC
  const avgPPC = useMemo(() => {
    if (history.length === 0) return 0;
    return Math.round(history.reduce((s, w) => s + w.ppc, 0) / history.length);
  }, [history]);

  // Trend (last 4 weeks)
  const recentTrend = useMemo(() => {
    const recent = history.slice(0, 4);
    if (recent.length < 2) return 0;
    return recent[0].ppc - recent[recent.length - 1].ppc;
  }, [history]);

  // Record PPC week
  const recordWeek = () => {
    const ppc = selectedPlanned.length > 0 ? Math.round((selectedCompleted.length / selectedPlanned.length) * 100) : 0;
    const rec: PPCWeekRecord = {
      id: uid(), weekStart, planned: [...selectedPlanned], completed: [...selectedCompleted],
      ppc, cncEntries: [], notes: weekNotes, createdAt: new Date().toISOString()
    };
    dispatch({ type: 'ADD_PPC_WEEK', record: rec });
    setShowForm(false); setSelectedPlanned([]); setSelectedCompleted([]); setWeekNotes('');
    setEditingWeekId(rec.id); // open for CNC entry
  };

  // Add CNC entry
  const addCNC = (weekId: string) => {
    if (!cncActId || !cncDesc) return;
    const entry: CNCEntry = { id: cncUid(), activityId: cncActId, category: cncCat, description: cncDesc, responsible: '' };
    dispatch({ type: 'ADD_CNC_ENTRY', weekId, entry });
    setCncActId(''); setCncDesc('');
  };

  const togglePlanned = (id: string) => {
    setSelectedPlanned(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    // If removed from planned, also remove from completed
    if (selectedPlanned.includes(id)) {
      setSelectedCompleted(prev => prev.filter(x => x !== id));
    }
  };
  const toggleCompleted = (id: string) => {
    if (!selectedPlanned.includes(id)) return; // must be planned
    setSelectedCompleted(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const ppcColor = (v: number) => v >= 85 ? '#22c55e' : v >= 60 ? '#f59e0b' : '#ef4444';
  const actName = (id: string) => state.activities.find(a => a.id === id)?.name || id;
  const thS: React.CSSProperties = { padding: '5px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--border-primary)' };
  const tdS: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, color: 'var(--text-primary)' };

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12, padding: '16px 20px', flexShrink: 0 }}>
        {[
          { label: 'PPC Promedio', value: avgPPC + '%', color: ppcColor(avgPPC), icon: <BarChart3 size={14} /> },
          { label: 'Semanas Reg.', value: history.length, color: '#6366f1', icon: <CalendarDays size={14} /> },
          { label: 'Tendencia (4 sem)', value: (recentTrend >= 0 ? '+' : '') + recentTrend + 'pp', color: recentTrend >= 0 ? '#22c55e' : '#ef4444', icon: <TrendingUp size={14} /> },
          { label: 'CNC Totales', value: totalCNC, color: '#f59e0b', icon: <Award size={14} /> },
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

      <div style={{ display: 'flex', gap: 16, padding: '0 20px 20px', flex: 1, overflow: 'hidden' }}>
        {/* Left side: PPC trend + recording */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Add button */}
          <div style={{ marginBottom: 10, flexShrink: 0 }}>
            <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#6366f122', border: '1px solid #6366f144', borderRadius: 6, padding: '6px 16px', color: '#6366f1', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
              <PlusCircle size={14} /> Registrar Semana
            </button>
          </div>

          {/* Record form */}
          {showForm && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, marginBottom: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Semana del:</label>
                <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>| Planificadas: {selectedPlanned.length} | Cumplidas: {selectedCompleted.length} | PPC: {selectedPlanned.length > 0 ? Math.round(selectedCompleted.length / selectedPlanned.length * 100) : 0}%</span>
              </div>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, width: 40, textAlign: 'center' }}>Plan</th>
                      <th style={{ ...thS, width: 40, textAlign: 'center' }}>✓</th>
                      <th style={thS}>ID</th>
                      <th style={thS}>Actividad</th>
                      <th style={thS}>Encargado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activitiesInWindow.map(a => (
                      <tr key={a.id}>
                        <td style={{ ...tdS, textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedPlanned.includes(a.id)} onChange={() => togglePlanned(a.id)} />
                        </td>
                        <td style={{ ...tdS, textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedCompleted.includes(a.id)} onChange={() => toggleCompleted(a.id)} disabled={!selectedPlanned.includes(a.id)} />
                        </td>
                        <td style={{ ...tdS, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{a.id}</td>
                        <td style={tdS}>{a.name}</td>
                        <td style={{ ...tdS, color: 'var(--text-secondary)' }}>{a.encargado || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input value={weekNotes} onChange={e => setWeekNotes(e.target.value)} placeholder="Notas de la semana..."
                  style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 4, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 11 }} />
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>Cancelar</button>
                <button onClick={recordWeek} disabled={selectedPlanned.length === 0}
                  style={{ padding: '4px 14px', background: '#6366f1', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, opacity: selectedPlanned.length === 0 ? 0.5 : 1 }}>Registrar</button>
              </div>
            </div>
          )}

          {/* PPC trend chart (horizontal bars) */}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 10 }}>Tendencia PPC Semanal</div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>
                No hay registros PPC. Haz clic en "Registrar Semana" para iniciar el seguimiento semanal del Last Planner System.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Target line label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: '#22c55e' }}>— Meta 85%</span>
                  <span style={{ fontSize: 9, color: '#f59e0b' }}>— Mín aceptable 60%</span>
                </div>
                {history.map(w => {
                  const d = parseDate(w.weekStart);
                  const color = ppcColor(w.ppc);
                  return (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      onClick={() => setEditingWeekId(editingWeekId === w.id ? null : w.id)}>
                      <span style={{ width: 70, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>{d ? fmtDate(d) : w.weekStart}</span>
                      <div style={{ flex: 1, height: 20, background: 'var(--bg-input)', borderRadius: 4, position: 'relative', cursor: 'pointer' }}>
                        <div style={{ height: '100%', width: `${w.ppc}%`, background: color, borderRadius: 4, transition: 'width .3s' }} />
                        {/* 85% marker */}
                        <div style={{ position: 'absolute', left: '85%', top: 0, bottom: 0, width: 1, background: '#22c55e44' }} />
                        {/* 60% marker */}
                        <div style={{ position: 'absolute', left: '60%', top: 0, bottom: 0, width: 1, background: '#f59e0b44' }} />
                      </div>
                      <span style={{ width: 34, fontSize: 11, fontWeight: 700, color, textAlign: 'right' }}>{w.ppc}%</span>
                      <span style={{ width: 50, fontSize: 9, color: 'var(--text-muted)' }}>{w.planned.length}p/{w.completed.length}c</span>
                      <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DELETE_PPC_WEEK', id: w.id }); }}
                        style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', padding: 2 }}><Trash2 size={12} /></button>
                    </div>
                  );
                })}

                {/* CNC entry section (expanded for selected week) */}
                {editingWeekId && (() => {
                  const week = history.find(w => w.id === editingWeekId);
                  if (!week) return null;
                  const notCompleted = week.planned.filter(id => !week.completed.includes(id));
                  return (
                    <div style={{ marginTop: 8, background: 'var(--bg-app)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8 }}>
                        CNC — Semana {fmtDate(parseDate(week.weekStart))} ({notCompleted.length} no cumplidas)
                      </div>
                      {/* Existing CNC entries */}
                      {week.cncEntries.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          {week.cncEntries.map(e => (
                            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--border-primary)' }}>
                              <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: CNC_COLORS[e.category] + '22', color: CNC_COLORS[e.category] }}>{e.category}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{e.activityId}</span>
                              <span style={{ flex: 1, fontSize: 11 }}>{e.description}</span>
                              <button onClick={() => dispatch({ type: 'DELETE_CNC_ENTRY', weekId: week.id, entryId: e.id })}
                                style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', padding: 2 }}><Trash2 size={10} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Add CNC form */}
                      {notCompleted.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                          <div>
                            <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Actividad</label>
                            <select value={cncActId} onChange={e => setCncActId(e.target.value)}
                              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 10 }}>
                              <option value="">...</option>
                              {notCompleted.map(id => <option key={id} value={id}>{id} – {actName(id)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Categoría</label>
                            <select value={cncCat} onChange={e => setCncCat(e.target.value as CNCCategory)}
                              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 10 }}>
                              {CNC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Descripción</label>
                            <input value={cncDesc} onChange={e => setCncDesc(e.target.value)} placeholder="Causa de no cumplimiento..."
                              onKeyDown={e => e.key === 'Enter' && addCNC(week.id)}
                              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-secondary)', borderRadius: 3, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 10 }} />
                          </div>
                          <button onClick={() => addCNC(week.id)} disabled={!cncActId || !cncDesc}
                            style={{ padding: '3px 10px', background: '#6366f1', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 10, fontWeight: 600, opacity: (!cncActId || !cncDesc) ? 0.5 : 1 }}>+ CNC</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Right side: Pareto chart */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, overflow: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 10 }}>Análisis Pareto — CNC</div>
            {cncAgg.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>
                Sin datos de CNC. Registra semanas PPC y sus causas de no cumplimiento para ver el análisis Pareto.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Horizontal bar Pareto */}
                {(() => {
                  let cumPct = 0;
                  return cncAgg.map((x) => {
                    const pct = totalCNC > 0 ? Math.round((x.count / totalCNC) * 100) : 0;
                    cumPct += pct;
                    return (
                      <div key={x.cat}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 90, fontSize: 10, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>{x.cat}</span>
                          <div style={{ flex: 1, height: 16, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: CNC_COLORS[x.cat], borderRadius: 3, minWidth: 2 }} />
                          </div>
                          <span style={{ width: 28, fontSize: 10, fontWeight: 700, color: CNC_COLORS[x.cat], textAlign: 'right' }}>{x.count}</span>
                          <span style={{ width: 32, fontSize: 9, color: 'var(--text-muted)', textAlign: 'right' }}>{pct}%</span>
                          <span style={{ width: 36, fontSize: 9, color: cumPct >= 80 ? '#ef4444' : 'var(--text-muted)', textAlign: 'right' }}>{cumPct}%</span>
                        </div>
                      </div>
                    );
                  });
                })()}
                {/* 80/20 rule indicator */}
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: 6 }}>
                  <span style={{ fontSize: 10, color: '#f59e0b' }}>
                    📊 Principio de Pareto: las primeras {cncAgg.filter((_, i) => {
                      let cum = 0;
                      for (let j = 0; j <= i; j++) cum += cncAgg[j].count;
                      return cum / totalCNC <= 0.8;
                    }).length + 1} categorías representan ~80% de las causas de no cumplimiento.
                  </span>
                </div>
              </div>
            )}

            {/* Legend */}
            <div style={{ marginTop: 16, padding: '12px 0', borderTop: '1px solid var(--border-primary)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 6 }}>Referencia Last Planner System</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong>PPC ≥ 85%</strong> → Planificación confiable (meta)<br />
                <strong>PPC 60-84%</strong> → Proceso de mejora necesario<br />
                <strong>PPC &lt; 60%</strong> → Problemas sistémicos graves<br /><br />
                <strong>Ciclo LPS semanal:</strong><br />
                1. Planificar → 2. Ejecutar → 3. Medir PPC → 4. Analizar CNC → 5. Mejorar<br /><br />
                <strong>Scrum paralelo:</strong> Sprint = Semana, PPC = Velocity, CNC = Retrospectiva
              </div>
            </div>
          </div>
        </div>
      </div>

      <canvas ref={chartRef} style={{ display: 'none' }} />
    </div>
  );
}
