// ═══════════════════════════════════════════════════════════════════
// RiskQualitativePanel – Qualitative Risk Assessment (P6-style)
// Risk register + 5×5 impact/probability matrix + detail panel.
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import type {
  RiskEvent, ImpactLevel, QualitativeScore, RiskCategory,
  MitigationResponse, ThreatOrOpportunity, RiskStatus,
} from '../../types/risk';
import {
  IMPACT_LABELS, IMPACT_WEIGHT, PROB_RANGES,
  computeQualScore, scoreColor, scoreLabel, createBlankRiskEvent,
} from '../../types/risk';
import { Plus, Trash2, Save, X, Shield, ShieldAlert } from 'lucide-react';

const LEVELS: ImpactLevel[] = ['VL', 'L', 'M', 'H', 'VH'];
const CATEGORIES: RiskCategory[] = [
  'Técnico', 'Externo', 'Organisacional', 'Gestión',
  'Clima', 'Suministro', 'Regulatorio', 'Diseño',
  'Subcontrato', 'Otro',
];
const RESPONSES: MitigationResponse[] = ['accept', 'mitigate', 'transfer', 'avoid', 'exploit', 'enhance'];
const RESPONSE_LABELS: Record<MitigationResponse, string> = {
  accept: 'Aceptar', mitigate: 'Mitigar', transfer: 'Transferir',
  avoid: 'Evitar', exploit: 'Explotar', enhance: 'Mejorar',
};
const T_O_OPTIONS: { v: ThreatOrOpportunity; l: string }[] = [
  { v: 'threat', l: 'Amenaza' }, { v: 'opportunity', l: 'Oportunidad' },
];
const STATUS_OPTIONS: { v: RiskStatus; l: string }[] = [
  { v: 'proposed', l: 'Propuesto' }, { v: 'open', l: 'Abierto' },
  { v: 'closed', l: 'Cerrado' }, { v: 'mitigated', l: 'Mitigado' },
];

type DetailTab = 'details' | 'mitigation' | 'matrix';

export default function RiskQualitativePanel() {
  const { state, dispatch } = useGantt();
  const risks = state.riskState.riskEvents;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RiskEvent | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('details');
  const [mitigationView, setMitigationView] = useState<'pre' | 'post'>('pre');

  const selected = useMemo(() => risks.find(r => r.id === selectedId) ?? null, [risks, selectedId]);

  // ─── CRUD Handlers ──────────────────────────────────────────
  const handleAdd = useCallback(() => {
    const evt = createBlankRiskEvent();
    dispatch({ type: 'ADD_RISK_EVENT', event: evt });
    setSelectedId(evt.id);
    setEditDraft(evt);
    setDetailTab('details');
  }, [dispatch]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm('¿Eliminar este riesgo?')) return;
    dispatch({ type: 'DELETE_RISK_EVENT', eventId: id });
    if (selectedId === id) { setSelectedId(null); setEditDraft(null); }
  }, [selectedId, dispatch]);

  const handleSelect = useCallback((r: RiskEvent) => {
    setSelectedId(r.id);
    setEditDraft({ ...r, taskImpacts: r.taskImpacts?.map(t => ({ ...t })) || [] });
  }, []);

  const handleSave = useCallback(() => {
    if (!editDraft) return;
    if (!editDraft.name.trim()) { alert('Nombre requerido'); return; }
    dispatch({ type: 'UPDATE_RISK_EVENT', event: editDraft });
    setSelectedId(editDraft.id);
  }, [editDraft, dispatch]);

  const handleCancel = useCallback(() => {
    if (selected) setEditDraft({ ...selected, taskImpacts: selected.taskImpacts?.map(t => ({ ...t })) || [] });
    else { setEditDraft(null); setSelectedId(null); }
  }, [selected]);

  // Helpers for draft updates
  const upd = useCallback((partial: Partial<RiskEvent>) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, ...partial });
  }, [editDraft]);

  const updPre = useCallback((field: keyof QualitativeScore, val: ImpactLevel) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, preMitigation: { ...editDraft.preMitigation, [field]: val } });
  }, [editDraft]);

  const updPost = useCallback((field: keyof QualitativeScore, val: ImpactLevel) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, postMitigation: { ...editDraft.postMitigation, [field]: val } });
  }, [editDraft]);

  // ─── Risk Matrix ──────────────────────────────────────────────
  const matrixData = useMemo(() => {
    // Build 5×5 grid: rows = probability (VH top → VL bottom), cols = impact (VL left → VH right)
    const grid: Record<string, RiskEvent[]> = {};
    for (const p of LEVELS) for (const i of LEVELS) grid[`${p}-${i}`] = [];
    const src = mitigationView === 'pre' ? 'preMitigation' : 'postMitigation';
    for (const r of risks) {
      const qs = r[src] || r.preMitigation;
      if (!qs) continue;
      const maxImpact = (['schedule', 'cost', 'performance'] as const)
        .reduce((m, k) => IMPACT_WEIGHT[qs[k]] > IMPACT_WEIGHT[m] ? qs[k] : m, 'VL' as ImpactLevel);
      grid[`${qs.probability}-${maxImpact}`]?.push(r);
    }
    return grid;
  }, [risks, mitigationView]);

  // Score for grid cell background
  const cellScore = (probLvl: ImpactLevel, impLvl: ImpactLevel) =>
    IMPACT_WEIGHT[probLvl] * IMPACT_WEIGHT[impLvl];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ─── Top: Register Grid ─── */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
        }}>
          <button onClick={handleAdd} style={btnPrimary}>
            <Plus size={12} /> Nuevo Riesgo
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {risks.length} riesgo{risks.length !== 1 ? 's' : ''}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {(['pre', 'post'] as const).map(v => (
              <button key={v} onClick={() => setMitigationView(v)}
                style={{
                  ...btnSmall, fontWeight: mitigationView === v ? 700 : 400,
                  background: mitigationView === v ? '#6366f1' : 'var(--bg-input)',
                  color: mitigationView === v ? '#fff' : 'var(--text-secondary)',
                }}>
                {v === 'pre' ? <ShieldAlert size={10} /> : <Shield size={10} />}
                {v === 'pre' ? 'Pre-mitigación' : 'Post-mitigación'}
              </button>
            ))}
          </div>
        </div>

        {/* Split: Register table + Matrix */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Register Table */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ ...thS, background: '#166534', color: '#fff' }} colSpan={3}>Riesgo</th>
                  <th style={{ ...thS, background: mitigationView === 'pre' ? '#dc2626' : '#059669', color: '#fff' }} colSpan={4}>
                    {mitigationView === 'pre' ? 'Pre-Mitigación' : 'Post-Mitigación'}
                  </th>
                  <th style={{ ...thS, background: '#1e40af', color: '#fff' }} colSpan={2}>Mitigación</th>
                  <th style={{ ...thS, background: '#4a5568', color: '#fff' }}>Acc.</th>
                </tr>
                <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 22, zIndex: 2 }}>
                  <th style={thS}>ID</th>
                  <th style={thS}>T/O</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 140 }}>Título</th>
                  <th style={thS}>Prob.</th>
                  <th style={thS}>Prog.</th>
                  <th style={thS}>Costo</th>
                  <th style={thS}>Score</th>
                  <th style={thS}>Respuesta</th>
                  <th style={thS}>Costo Mit.</th>
                  <th style={thS}></th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r, i) => {
                  const qs = mitigationView === 'pre' ? r.preMitigation : r.postMitigation;
                  const sc = qs ? computeQualScore(qs) : 0;
                  const isSelected = r.id === selectedId;
                  return (
                    <tr key={r.id}
                      onClick={() => handleSelect(r)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99,102,241,0.12)' : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'),
                        borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                      }}>
                      <td style={tdS}>{r.id.slice(-4).toUpperCase()}</td>
                      <td style={tdS}>
                        <span style={{
                          display: 'inline-block', background: r.threatOrOpportunity === 'threat' ? '#ef4444' : '#22c55e',
                          color: '#fff', borderRadius: 3, padding: '1px 4px', fontSize: 9, fontWeight: 600,
                        }}>
                          {r.threatOrOpportunity === 'threat' ? 'T' : 'O'}
                        </span>
                      </td>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{r.name || '(sin nombre)'}</td>
                      <td style={tdS}><LevelBadge level={qs?.probability} /></td>
                      <td style={tdS}><LevelBadge level={qs?.schedule} /></td>
                      <td style={tdS}><LevelBadge level={qs?.cost} /></td>
                      <td style={tdS}>
                        <span style={{
                          display: 'inline-block', minWidth: 28, textAlign: 'center',
                          background: scoreColor(sc), color: '#fff',
                          borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                        }}>
                          {sc}
                        </span>
                      </td>
                      <td style={tdS}>{RESPONSE_LABELS[r.mitigationResponse] || r.mitigationResponse}</td>
                      <td style={tdS}>${(r.mitigationCost || 0).toLocaleString()}</td>
                      <td style={tdS}>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444' }}>
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {risks.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    No hay riesgos. Haz clic en "Nuevo Riesgo" para comenzar.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 5×5 Risk Matrix */}
          <div style={{
            width: 320, flexShrink: 0, borderLeft: '1px solid var(--border-primary)',
            overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', marginBottom: 6, color: 'var(--text-heading)' }}>
              Matriz de Riesgos ({mitigationView === 'pre' ? 'Pre' : 'Post'}-Mitigación)
            </div>
            <div style={{ display: 'flex', flex: 1 }}>
              {/* Y-axis label */}
              <div style={{
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                paddingRight: 4,
              }}>
                PROBABILIDAD →
              </div>
              <div style={{ flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
                      {LEVELS.map(l => (
                        <th key={l} style={{
                          fontSize: 8, fontWeight: 600, textAlign: 'center',
                          padding: 2, color: 'var(--text-secondary)',
                        }}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([...LEVELS].reverse()).map(pLvl => (
                      <tr key={pLvl}>
                        <td style={{
                          fontSize: 8, fontWeight: 600, textAlign: 'right',
                          paddingRight: 3, color: 'var(--text-secondary)',
                        }}>
                          {pLvl}<br /><span style={{ fontSize: 7, fontWeight: 400 }}>{PROB_RANGES[pLvl]}</span>
                        </td>
                        {LEVELS.map(iLvl => {
                          const cellRisks = matrixData[`${pLvl}-${iLvl}`] || [];
                          const cs = cellScore(pLvl, iLvl);
                          return (
                            <td key={iLvl} style={{
                              background: scoreColor(cs) + '25',
                              border: '1px solid var(--border-primary)',
                              height: 44, padding: 2, verticalAlign: 'top',
                              cursor: cellRisks.length > 0 ? 'pointer' : 'default',
                            }}
                              title={`Score: ${cs} (${scoreLabel(cs)})`}
                            >
                              {cellRisks.map(r => (
                                <div key={r.id}
                                  onClick={() => handleSelect(r)}
                                  style={{
                                    fontSize: 7, lineHeight: '9px', padding: '1px 2px',
                                    background: r.threatOrOpportunity === 'threat' ? '#ef444430' : '#22c55e30',
                                    borderRadius: 2, marginBottom: 1,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    border: r.id === selectedId ? '1px solid #6366f1' : '1px solid transparent',
                                    cursor: 'pointer',
                                  }}>
                                  {r.name || r.id.slice(-4)}
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 9, fontWeight: 600, textAlign: 'center', color: 'var(--text-muted)', marginTop: 3 }}>
                  IMPACTO →
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom: Detail Panel ─── */}
      {editDraft && (
        <div style={{
          height: 300, flexShrink: 0, borderTop: '2px solid var(--border-primary)',
          overflow: 'auto', background: 'var(--bg-panel)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Detail tabs */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
          }}>
            {(['details', 'mitigation', 'matrix'] as DetailTab[]).map(t => (
              <button key={t} onClick={() => setDetailTab(t)}
                style={{
                  padding: '6px 14px', fontSize: 10, fontWeight: detailTab === t ? 700 : 400,
                  color: detailTab === t ? '#6366f1' : 'var(--text-secondary)',
                  background: 'transparent', border: 'none',
                  borderBottom: detailTab === t ? '2px solid #6366f1' : '2px solid transparent',
                  cursor: 'pointer',
                }}>
                {t === 'details' ? 'Detalle del Riesgo' : t === 'mitigation' ? 'Mitigación' : 'Posición'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={handleSave} style={{ ...btnSmall, background: '#22c55e', color: '#fff', marginRight: 4 }}>
              <Save size={10} /> Guardar
            </button>
            <button onClick={handleCancel} style={{ ...btnSmall, marginRight: 8 }}>
              <X size={10} /> Cancelar
            </button>
          </div>

          {/* Detail content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            {detailTab === 'details' && (
              <div style={{ display: 'flex', gap: 16 }}>
                {/* Left col */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ ...lblS, flex: 0.3 }}>
                      ID:
                      <input value={editDraft.id.slice(-6).toUpperCase()} readOnly style={{ ...inpS, background: 'var(--bg-panel)' }} />
                    </label>
                    <label style={{ ...lblS, flex: 1 }}>
                      Título:
                      <input value={editDraft.name} onChange={e => upd({ name: e.target.value })}
                        style={inpS} placeholder="Ej: Retraso en ejecución" />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ ...lblS, flex: 1 }}>
                      Causa:
                      <textarea value={editDraft.cause} onChange={e => upd({ cause: e.target.value })}
                        style={{ ...inpS, height: 50, resize: 'vertical' }} />
                    </label>
                    <label style={{ ...lblS, flex: 1 }}>
                      Descripción:
                      <textarea value={editDraft.description} onChange={e => upd({ description: e.target.value })}
                        style={{ ...inpS, height: 50, resize: 'vertical' }} />
                    </label>
                    <label style={{ ...lblS, flex: 1 }}>
                      Efecto:
                      <textarea value={editDraft.effect} onChange={e => upd({ effect: e.target.value })}
                        style={{ ...inpS, height: 50, resize: 'vertical' }} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={lblS}>
                      Categoría:
                      <select value={editDraft.category} onChange={e => upd({ category: e.target.value as RiskCategory })} style={inpS}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={lblS}>
                      RBS:
                      <input value={editDraft.rbs || ''} onChange={e => upd({ rbs: e.target.value })} style={inpS} />
                    </label>
                  </div>
                </div>
                {/* Right col */}
                <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={lblS}>
                    Amenaza / Oportunidad:
                    <select value={editDraft.threatOrOpportunity}
                      onChange={e => upd({ threatOrOpportunity: e.target.value as ThreatOrOpportunity })} style={inpS}>
                      {T_O_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </label>
                  <label style={lblS}>
                    Estado:
                    <select value={editDraft.status} onChange={e => upd({ status: e.target.value as RiskStatus })} style={inpS}>
                      {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </label>
                  <label style={lblS}>
                    Responsable:
                    <select value={editDraft.owner} onChange={e => upd({ owner: e.target.value })} style={inpS}>
                      <option value="">Sin asignar</option>
                      <option value="PM">PM</option>
                      <option value="Jefe Obra">Jefe Obra</option>
                      <option value="OT">OT</option>
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={lblS}>
                      Fecha Inicio:
                      <input type="date" value={editDraft.startDate || ''} onChange={e => upd({ startDate: e.target.value })} style={inpS} />
                    </label>
                    <label style={lblS}>
                      Fecha Fin:
                      <input type="date" value={editDraft.endDate || ''} onChange={e => upd({ endDate: e.target.value })} style={inpS} />
                    </label>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={editDraft.quantified}
                      onChange={e => upd({ quantified: e.target.checked })} />
                    Riesgo Cuantificado
                  </label>
                </div>
              </div>
            )}

            {detailTab === 'mitigation' && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={lblS}>
                    Respuesta de Mitigación:
                    <select value={editDraft.mitigationResponse}
                      onChange={e => upd({ mitigationResponse: e.target.value as MitigationResponse })} style={inpS}>
                      {RESPONSES.map(r => <option key={r} value={r}>{RESPONSE_LABELS[r]}</option>)}
                    </select>
                  </label>
                  <label style={lblS}>
                    Descripción de la Mitigación:
                    <textarea value={editDraft.mitigationTitle} onChange={e => upd({ mitigationTitle: e.target.value })}
                      style={{ ...inpS, height: 60, resize: 'vertical' }} />
                  </label>
                  <label style={lblS}>
                    Costo de Mitigación ($):
                    <input type="number" min={0} value={editDraft.mitigationCost}
                      onChange={e => upd({ mitigationCost: parseFloat(e.target.value) || 0 })} style={inpS} />
                  </label>
                </div>
              </div>
            )}

            {detailTab === 'matrix' && (
              <div style={{ display: 'flex', gap: 24 }}>
                {/* Pre-mitigated position */}
                <ScoreCard title="Pre-Mitigación" qs={editDraft.preMitigation} onChange={updPre} />
                {/* Post-mitigated position */}
                <ScoreCard title="Post-Mitigación" qs={editDraft.postMitigation} onChange={updPost} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function LevelBadge({ level }: { level?: ImpactLevel }) {
  if (!level) return <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>—</span>;
  const w = IMPACT_WEIGHT[level];
  const bg = w >= 16 ? '#ef4444' : w >= 8 ? '#f97316' : w >= 4 ? '#f59e0b' : w >= 2 ? '#22c55e' : '#3b82f6';
  return (
    <span style={{
      display: 'inline-block', minWidth: 22, textAlign: 'center',
      background: bg + '25', color: bg, border: `1px solid ${bg}50`,
      borderRadius: 3, padding: '0 3px', fontSize: 9, fontWeight: 700,
    }}>
      {level}
    </span>
  );
}

function ScoreCard({ title, qs, onChange }: {
  title: string;
  qs: QualitativeScore;
  onChange: (field: keyof QualitativeScore, val: ImpactLevel) => void;
}) {
  const sc = computeQualScore(qs);
  return (
    <div style={{
      flex: 1, border: '1px solid var(--border-primary)', borderRadius: 6,
      padding: 10, background: 'var(--bg-input)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--text-heading)' }}>{title}</div>
      {(['probability', 'schedule', 'cost', 'performance'] as const).map(field => (
        <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            width: 85, fontSize: 10, fontWeight: 600,
            color: field === 'probability' ? '#6366f1' : 'var(--text-secondary)',
            textTransform: 'capitalize',
          }}>
            {field === 'probability' ? 'Probabilidad' : field === 'schedule' ? 'Programa' : field === 'cost' ? 'Costo' : 'Desempeño'}
          </span>
          <select value={qs[field]} onChange={e => onChange(field, e.target.value as ImpactLevel)}
            style={{ fontSize: 10, padding: '2px 4px', borderRadius: 3, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', width: 60 }}>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {IMPACT_LABELS[qs[field]]}
            {field === 'probability' && ` (${PROB_RANGES[qs[field]]})`}
          </span>
        </div>
      ))}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
        padding: '6px 8px', background: scoreColor(sc) + '20', borderRadius: 4,
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Score:</span>
        <span style={{
          fontSize: 14, fontWeight: 800, color: scoreColor(sc),
        }}>{sc}</span>
        <span style={{ fontSize: 10, color: scoreColor(sc), fontWeight: 600 }}>{scoreLabel(sc)}</span>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const thS: React.CSSProperties = {
  padding: '4px 6px', textAlign: 'center', fontWeight: 600, fontSize: 9,
  borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap',
};
const tdS: React.CSSProperties = {
  padding: '3px 6px', textAlign: 'center', fontSize: 10,
  borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap',
};
const lblS: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: 'var(--text-secondary)' };
const inpS: React.CSSProperties = { fontSize: 10, padding: '3px 5px', borderRadius: 3, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  fontSize: 10, fontWeight: 600, background: '#6366f1', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer',
};
const btnSmall: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
  fontSize: 9, fontWeight: 500, background: 'var(--bg-input)',
  color: 'var(--text-secondary)', border: '1px solid var(--border-primary)',
  borderRadius: 3, cursor: 'pointer',
};
