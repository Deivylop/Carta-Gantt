// ═══════════════════════════════════════════════════════════════════
// RiskQuantitativePanel – Quantitative Risk Assessment (P6-style)
// Risk View: shows quantified risks with probability &amp; impacted tasks.
// Task View: shows activities and which risks affect them.
// Bottom: per-task schedule/cost distribution impacts.
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import type { RiskEvent, RiskTaskImpact, DistributionType } from '../../types/risk';
import { createBlankRiskEvent } from '../../types/risk';
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react';

const DIST_OPTS: { v: DistributionType; l: string }[] = [
  { v: 'none', l: 'Sin dist.' },
  { v: 'betaPERT', l: 'BetaPert' },
  { v: 'triangular', l: 'Triangular' },
  { v: 'uniform', l: 'Uniforme' },
];

type ViewMode = 'risk' | 'task';
type MitView = 'pre' | 'post';

export default function RiskQuantitativePanel() {
  const { state, dispatch } = useGantt();
  const risks = state.riskState.riskEvents;
  const [viewMode, setViewMode] = useState<ViewMode>('risk');
  const [mitView, setMitView] = useState<MitView>('pre');
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Only quantified risks for this panel
  const quantifiedRisks = useMemo(() => risks.filter(r => r.quantified), [risks]);

  // All task activities
  const tasks = useMemo(
    () => state.activities.filter(a => !a._isProjRow && a.type === 'task' && !a.id.startsWith('__')),
    [state.activities],
  );

  // Currently selected risk
  const selRisk = useMemo(
    () => quantifiedRisks.find(r => r.id === selectedRiskId) ?? null,
    [quantifiedRisks, selectedRiskId],
  );

  // Impacts for selected risk
  const selImpacts: RiskTaskImpact[] = selRisk?.taskImpacts ?? [];

  // For Task View: tasks with at least one risk
  const taskRiskMap = useMemo(() => {
    const m: Record<string, RiskEvent[]> = {};
    for (const r of quantifiedRisks) {
      for (const ti of (r.taskImpacts ?? [])) {
        (m[ti.taskId] ??= []).push(r);
      }
    }
    return m;
  }, [quantifiedRisks]);

  // ─── Toggle quantified ────────────────────────────────────────
  const toggleQuantified = useCallback((riskId: string) => {
    const r = risks.find(x => x.id === riskId);
    if (!r) return;
    dispatch({ type: 'UPDATE_RISK_EVENT', event: { ...r, quantified: !r.quantified } });
  }, [risks, dispatch]);

  // ─── Add task impact to selected risk ─────────────────────────
  const addTaskImpact = useCallback((taskId: string) => {
    if (!selRisk) return;
    const already = selRisk.taskImpacts.find(t => t.taskId === taskId);
    if (already) return;
    const act = tasks.find(a => a.id === taskId);
    const dur = act?.dur || 10;
    const newImpact: RiskTaskImpact = {
      taskId,
      scheduleShape: 'betaPERT',
      scheduleMin: Math.max(1, Math.round(dur * 0.8)),
      scheduleLikely: dur,
      scheduleMax: Math.round(dur * 1.3),
      costShape: 'none',
      correlate: true,
      impactRanges: true,
      eventExistence: true,
    };
    const updated: RiskEvent = {
      ...selRisk,
      taskImpacts: [...selRisk.taskImpacts, newImpact],
      affectedActivityIds: [...new Set([...selRisk.affectedActivityIds, taskId])],
    };
    dispatch({ type: 'UPDATE_RISK_EVENT', event: updated });
  }, [selRisk, tasks, dispatch]);

  // ─── Remove task impact ───────────────────────────────────────
  const removeTaskImpact = useCallback((taskId: string) => {
    if (!selRisk) return;
    const updated: RiskEvent = {
      ...selRisk,
      taskImpacts: selRisk.taskImpacts.filter(t => t.taskId !== taskId),
      affectedActivityIds: selRisk.affectedActivityIds.filter(id => id !== taskId),
    };
    dispatch({ type: 'UPDATE_RISK_EVENT', event: updated });
  }, [selRisk, dispatch]);

  // ─── Update impact field ──────────────────────────────────────
  const updateImpact = useCallback((taskId: string, field: keyof RiskTaskImpact, value: unknown) => {
    if (!selRisk) return;
    const impacts = selRisk.taskImpacts.map(t => {
      if (t.taskId !== taskId) return t;
      return { ...t, [field]: value };
    });
    const updated: RiskEvent = { ...selRisk, taskImpacts: impacts };
    dispatch({ type: 'UPDATE_RISK_EVENT', event: updated });
  }, [selRisk, dispatch]);

  // ─── Update probability ───────────────────────────────────────
  const updateProb = useCallback((val: number) => {
    if (!selRisk) return;
    dispatch({ type: 'UPDATE_RISK_EVENT', event: { ...selRisk, probability: Math.min(100, Math.max(0, val)) } });
  }, [selRisk, dispatch]);

  // ─── Add new risk directly from quantitative ──────────────────
  const handleAddRisk = useCallback(() => {
    const evt = createBlankRiskEvent({ quantified: true, name: 'Nuevo Riesgo Cuantitativo' });
    dispatch({ type: 'ADD_RISK_EVENT', event: evt });
    setSelectedRiskId(evt.id);
  }, [dispatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
      }}>
        {(['risk', 'task'] as ViewMode[]).map(v => (
          <button key={v} onClick={() => setViewMode(v)}
            style={{
              ...tabBtn,
              fontWeight: viewMode === v ? 700 : 400,
              color: viewMode === v ? '#6366f1' : 'var(--text-secondary)',
              borderBottom: viewMode === v ? '2px solid #6366f1' : '2px solid transparent',
            }}>
            {v === 'risk' ? 'Vista Riesgo' : 'Vista Tarea'}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--border-primary)', margin: '0 4px' }} />
        {(['pre', 'post'] as MitView[]).map(v => (
          <button key={v} onClick={() => setMitView(v)}
            style={{
              ...tabBtn, fontSize: 9,
              fontWeight: mitView === v ? 600 : 400,
              background: mitView === v ? '#6366f130' : 'transparent',
              borderRadius: 3,
            }}>
            {v === 'pre' ? 'Pre-mitigado' : 'Post-mitigado'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={handleAddRisk} style={btnPrimary}>
          <Plus size={10} /> Nuevo Riesgo
        </button>
      </div>

      {/* Main split: List (left) + Activity Tree (right) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ─── Left: Risk/Task list ─── */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {viewMode === 'risk' ? (
            /* ─── RISK VIEW ─── */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ ...thS, background: '#166534', color: '#fff' }} colSpan={2}>Detalles</th>
                  <th style={thS}>T/O</th>
                  <th style={thS}>Título</th>
                  <th style={thS}>Cuantif.</th>
                  <th style={thS}>Prob. %</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 200 }}>Actividades Impactadas</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r, i) => {
                  const isQ = r.quantified;
                  const isSel = r.id === selectedRiskId;
                  return (
                    <tr key={r.id}
                      onClick={() => { setSelectedRiskId(r.id); }}
                      style={{
                        cursor: 'pointer',
                        background: isSel ? 'rgba(99,102,241,0.1)' : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'),
                        borderLeft: isSel ? '3px solid #6366f1' : '3px solid transparent',
                        opacity: isQ ? 1 : 0.5,
                      }}>
                      <td style={tdS}>{r.id.slice(-4).toUpperCase()}</td>
                      <td style={tdS}>
                        <BoolIcon val={r.threatOrOpportunity === 'threat'} colorT="#ef4444" colorF="#22c55e" labelT="T" labelF="O" />
                      </td>
                      <td style={tdS}>
                        <span style={{
                          background: r.threatOrOpportunity === 'threat' ? '#ef444420' : '#22c55e20',
                          padding: '1px 4px', borderRadius: 2, fontSize: 9,
                        }}>
                          {r.threatOrOpportunity === 'threat' ? 'T' : 'O'}
                        </span>
                      </td>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{r.name || '(sin nombre)'}</td>
                      <td style={tdS}>
                        <span onClick={(e) => { e.stopPropagation(); toggleQuantified(r.id); }}
                          style={{ cursor: 'pointer' }}>
                          {isQ ? <CheckSquare size={13} color="#6366f1" /> : <Square size={13} color="var(--text-muted)" />}
                        </span>
                      </td>
                      <td style={tdS}>
                        <span style={{
                          color: r.probability >= 70 ? '#ef4444' : r.probability >= 40 ? '#f59e0b' : '#22c55e',
                          fontWeight: 600,
                        }}>
                          {r.probability}%
                        </span>
                      </td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 9 }}>
                        {r.taskImpacts?.map(t => t.taskId).join(', ') || '—'}
                      </td>
                    </tr>
                  );
                })}
                {risks.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                    No hay riesgos. Crea uno desde la pestaña Cualitativo o aquí.
                  </td></tr>
                )}
              </tbody>
            </table>
          ) : (
            /* ─── TASK VIEW ─── */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={thS}>ID Tarea</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 180 }}>Descripción</th>
                  <th style={thS}>Dur.</th>
                  <th style={thS}>Riesgos</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((a, i) => {
                  const rr = taskRiskMap[a.id] || [];
                  const isSel = a.id === selectedTaskId;
                  return (
                    <tr key={a.id}
                      onClick={() => setSelectedTaskId(a.id)}
                      style={{
                        cursor: 'pointer',
                        background: isSel ? 'rgba(99,102,241,0.1)' : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'),
                        borderLeft: isSel ? '3px solid #6366f1' : '3px solid transparent',
                      }}>
                      <td style={tdS}>{a.id}</td>
                      <td style={{ ...tdS, textAlign: 'left' }}>{a.name}</td>
                      <td style={tdS}>{a.dur}d</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 9 }}>
                        {rr.length > 0
                          ? rr.map(r => r.name || r.id.slice(-4)).join(', ')
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ─── Right: Activity Tree / Selector ─── */}
        {viewMode === 'risk' && selRisk && (
          <div style={{
            width: 280, flexShrink: 0, borderLeft: '1px solid var(--border-primary)',
            overflow: 'auto', background: 'var(--bg-panel)', padding: 0,
          }}>
            <div style={{
              padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-heading)',
              borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-row-even)',
            }}>
              Actividades del Proyecto
            </div>
            <div style={{ padding: 4 }}>
              {tasks.map(a => {
                const isImpacted = selRisk.taskImpacts?.some(t => t.taskId === a.id);
                return (
                  <div key={a.id}
                    onClick={() => isImpacted ? removeTaskImpact(a.id) : addTaskImpact(a.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px',
                      fontSize: 9, cursor: 'pointer', borderRadius: 3,
                      background: isImpacted ? 'rgba(99,102,241,0.1)' : 'transparent',
                    }}>
                    {isImpacted
                      ? <CheckSquare size={11} color="#6366f1" />
                      : <Square size={11} color="var(--text-muted)" />
                    }
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: isImpacted ? 600 : 400,
                      color: isImpacted ? '#6366f1' : 'var(--text-primary)',
                    }}>
                      {a.id} – {a.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom: Impacts Table (for selected risk in Risk View) ─── */}
      {viewMode === 'risk' && selRisk && selImpacts.length > 0 && (
        <div style={{
          flexShrink: 0, borderTop: '2px solid var(--border-primary)',
          maxHeight: 220, overflow: 'auto', background: 'var(--bg-panel)',
        }}>
          <div style={{
            padding: '5px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-heading)',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>Impactos para Riesgo {selRisk.id.slice(-4).toUpperCase()}</span>
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
              Probabilidad:
              <input type="number" min={0} max={100}
                value={selRisk.probability}
                onChange={e => updateProb(parseInt(e.target.value) || 0)}
                style={{ ...numInp, width: 42, marginLeft: 4 }} />%
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
            <thead>
              <tr style={{ background: 'var(--bg-row-even)' }}>
                <th style={thS} rowSpan={2}>Tarea ID</th>
                <th style={thS} rowSpan={2}>Descripción</th>
                <th style={{ ...thS, background: '#1d4ed830' }} colSpan={4}>Programa (Schedule)</th>
                <th style={{ ...thS, background: '#f5960b30' }} colSpan={4}>Costo</th>
                <th style={thS} rowSpan={2}>Corr.</th>
                <th style={thS} rowSpan={2}>Rangos</th>
                <th style={thS} rowSpan={2}>Evento</th>
                <th style={thS} rowSpan={2}></th>
              </tr>
              <tr style={{ background: 'var(--bg-row-even)' }}>
                <th style={thS}>Dist.</th>
                <th style={thS}>Mín</th>
                <th style={thS}>Prob.</th>
                <th style={thS}>Máx</th>
                <th style={thS}>Dist.</th>
                <th style={thS}>Mín</th>
                <th style={thS}>Prob.</th>
                <th style={thS}>Máx</th>
              </tr>
            </thead>
            <tbody>
              {selImpacts.map((imp, i) => {
                const act = tasks.find(a => a.id === imp.taskId);
                const showSchML = imp.scheduleShape === 'betaPERT' || imp.scheduleShape === 'triangular';
                const showCostML = imp.costShape === 'betaPERT' || imp.costShape === 'triangular';
                return (
                  <tr key={imp.taskId} style={{
                    background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)',
                  }}>
                    <td style={tdS}>{imp.taskId}</td>
                    <td style={{ ...tdS, textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {act?.name || imp.taskId}
                    </td>
                    {/* Schedule */}
                    <td style={tdS}>
                      <select value={imp.scheduleShape}
                        onChange={e => updateImpact(imp.taskId, 'scheduleShape', e.target.value)}
                        style={selInp}>
                        {DIST_OPTS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
                      </select>
                    </td>
                    <td style={tdS}>
                      {imp.scheduleShape !== 'none' && (
                        <input type="number" min={0} value={imp.scheduleMin ?? ''}
                          onChange={e => updateImpact(imp.taskId, 'scheduleMin', parseFloat(e.target.value) || 0)}
                          style={numInp} />
                      )}
                    </td>
                    <td style={tdS}>
                      {showSchML && (
                        <input type="number" min={0} value={imp.scheduleLikely ?? ''}
                          onChange={e => updateImpact(imp.taskId, 'scheduleLikely', parseFloat(e.target.value) || 0)}
                          style={numInp} />
                      )}
                    </td>
                    <td style={tdS}>
                      {imp.scheduleShape !== 'none' && (
                        <input type="number" min={0} value={imp.scheduleMax ?? ''}
                          onChange={e => updateImpact(imp.taskId, 'scheduleMax', parseFloat(e.target.value) || 0)}
                          style={numInp} />
                      )}
                    </td>
                    {/* Cost */}
                    <td style={tdS}>
                      <select value={imp.costShape}
                        onChange={e => updateImpact(imp.taskId, 'costShape', e.target.value)}
                        style={selInp}>
                        {DIST_OPTS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
                      </select>
                    </td>
                    <td style={tdS}>
                      {imp.costShape !== 'none' && (
                        <input type="number" min={0} value={imp.costMin ?? ''}
                          onChange={e => updateImpact(imp.taskId, 'costMin', parseFloat(e.target.value) || 0)}
                          style={numInp} />
                      )}
                    </td>
                    <td style={tdS}>
                      {showCostML && (
                        <input type="number" min={0} value={imp.costLikely ?? ''}
                          onChange={e => updateImpact(imp.taskId, 'costLikely', parseFloat(e.target.value) || 0)}
                          style={numInp} />
                      )}
                    </td>
                    <td style={tdS}>
                      {imp.costShape !== 'none' && (
                        <input type="number" min={0} value={imp.costMax ?? ''}
                          onChange={e => updateImpact(imp.taskId, 'costMax', parseFloat(e.target.value) || 0)}
                          style={numInp} />
                      )}
                    </td>
                    {/* Checkboxes */}
                    <td style={tdS}>
                      <input type="checkbox" checked={imp.correlate}
                        onChange={e => updateImpact(imp.taskId, 'correlate', e.target.checked)} />
                    </td>
                    <td style={tdS}>
                      <input type="checkbox" checked={imp.impactRanges}
                        onChange={e => updateImpact(imp.taskId, 'impactRanges', e.target.checked)} />
                    </td>
                    <td style={tdS}>
                      <input type="checkbox" checked={imp.eventExistence}
                        onChange={e => updateImpact(imp.taskId, 'eventExistence', e.target.checked)} />
                    </td>
                    <td style={tdS}>
                      <button onClick={() => removeTaskImpact(imp.taskId)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: '#ef4444' }}>
                        <Trash2 size={10} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'risk' && selRisk && selImpacts.length === 0 && (
        <div style={{
          flexShrink: 0, borderTop: '2px solid var(--border-primary)',
          padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11,
        }}>
          Selecciona actividades del panel derecho para definir impactos de programación y costo.
        </div>
      )}
    </div>
  );
}

function BoolIcon({ val, colorT, colorF, labelT, labelF }: {
  val: boolean; colorT: string; colorF: string; labelT: string; labelF: string;
}) {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16, borderRadius: 3,
      background: val ? colorT : colorF, color: '#fff', fontSize: 8,
      fontWeight: 700, textAlign: 'center', lineHeight: '16px',
    }}>
      {val ? labelT : labelF}
    </span>
  );
}

const thS: React.CSSProperties = {
  padding: '3px 5px', textAlign: 'center', fontWeight: 600, fontSize: 8,
  borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
};
const tdS: React.CSSProperties = {
  padding: '2px 4px', textAlign: 'center', fontSize: 9,
  borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap',
};
const numInp: React.CSSProperties = {
  width: 48, fontSize: 9, padding: '2px 3px', borderRadius: 3,
  border: '1px solid var(--border-primary)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', textAlign: 'right',
};
const selInp: React.CSSProperties = {
  fontSize: 8, padding: '1px 2px', borderRadius: 3,
  border: '1px solid var(--border-primary)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', width: 68,
};
const tabBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 10, background: 'transparent',
  border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
};
const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  fontSize: 9, fontWeight: 600, background: '#6366f1', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer',
};
