// ═══════════════════════════════════════════════════════════════════
// RiskScoringModal – Customizable Risk Scoring Configuration
// Replicates P6/PRA's "Risk Scoring" dialog:
//   • Probability Scale (5 levels with weights & threshold descriptions)
//   • Impact Types (Schedule, Cost, Performance…) with Score? toggle
//   • Tolerance Scale (3 bands: Low/Medium/High with color + minScore)
//   • PID Score Mode (Highest / Average of Impacts / Average of Scores)
// All changes are saved per-project and persisted to Supabase.
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import type {
  RiskScoringConfig, ScaleLevel, ImpactType, ToleranceLevel, PIDScoreMode, ImpactLevel,
} from '../../types/risk';
import {
  DEFAULT_RISK_SCORING, DEFAULT_PROBABILITY_SCALE, DEFAULT_IMPACT_TYPES, DEFAULT_TOLERANCE_LEVELS,
  IMPACT_WEIGHT,
} from '../../types/risk';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';

const LEVELS: ImpactLevel[] = ['VH', 'H', 'M', 'L', 'VL'];
const LEVEL_LABELS: Record<ImpactLevel, string> = { VH: 'Muy Alto', H: 'Alto', M: 'Medio', L: 'Bajo', VL: 'Muy Bajo' };

interface Props { open: boolean; onClose: () => void; }

export default function RiskScoringModal({ open, onClose }: Props) {
  const { state, dispatch } = useGantt();
  const existing = state.riskState.riskScoring ?? DEFAULT_RISK_SCORING;

  // Local draft
  const [probScale, setProbScale] = useState<ScaleLevel[]>(() => [...existing.probabilityScale]);
  const [impTypes, setImpTypes] = useState<ImpactType[]>(() => existing.impactTypes.map(t => ({ ...t, levels: { ...t.levels } })));
  const [tols, setTols] = useState<ToleranceLevel[]>(() => existing.toleranceLevels.map(t => ({ ...t })));
  const [pidMode, setPidMode] = useState<PIDScoreMode>(existing.pidScoreMode);

  // ─── Handlers: Probability Scale ───────────────────────────
  const setProbWeight = useCallback((idx: number, val: number) => {
    setProbScale(s => s.map((lv, i) => i === idx ? { ...lv, weight: val } : lv));
  }, []);
  const setProbThreshold = useCallback((idx: number, val: string) => {
    setProbScale(s => s.map((lv, i) => i === idx ? { ...lv, threshold: val } : lv));
  }, []);

  // ─── Handlers: Impact Types ────────────────────────────────
  const toggleScored = useCallback((idx: number) => {
    setImpTypes(ts => ts.map((t, i) => i === idx ? { ...t, scored: !t.scored } : t));
  }, []);
  const setImpThreshold = useCallback((typeIdx: number, lvl: ImpactLevel, val: string) => {
    setImpTypes(ts => ts.map((t, i) => i === typeIdx ? { ...t, levels: { ...t.levels, [lvl]: val } } : t));
  }, []);
  const setImpLabel = useCallback((idx: number, val: string) => {
    setImpTypes(ts => ts.map((t, i) => i === idx ? { ...t, label: val } : t));
  }, []);
  const addImpType = useCallback(() => {
    setImpTypes(ts => [...ts, {
      id: 'custom_' + Date.now().toString(36),
      label: 'Nuevo Tipo',
      scored: true,
      levels: { VL: '', L: '', M: '', H: '', VH: '' },
    }]);
  }, []);
  const removeImpType = useCallback((idx: number) => {
    setImpTypes(ts => ts.filter((_, i) => i !== idx));
  }, []);

  // ─── Handlers: Tolerance ───────────────────────────────────
  const setTolField = useCallback((idx: number, field: keyof ToleranceLevel, val: string | number) => {
    setTols(ts => ts.map((t, i) => i === idx ? { ...t, [field]: val } : t));
  }, []);

  // ─── Save ──────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const cfg: RiskScoringConfig = {
      probabilityScale: probScale,
      impactTypes: impTypes,
      toleranceLevels: tols,
      pidScoreMode: pidMode,
    };
    dispatch({ type: 'SET_RISK_SCORING', scoring: cfg });
    onClose();
  }, [probScale, impTypes, tols, pidMode, dispatch, onClose]);

  // ─── Reset ─────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setProbScale([...DEFAULT_PROBABILITY_SCALE]);
    setImpTypes(DEFAULT_IMPACT_TYPES.map(t => ({ ...t, levels: { ...t.levels } })));
    setTols(DEFAULT_TOLERANCE_LEVELS.map(t => ({ ...t })));
    setPidMode('highest');
  }, []);

  // ─── PID Matrix Preview ─────────────────────────────────────
  const pidMatrix = LEVELS.map(pLvl => {
    const pW = probScale.find(s => s.key === pLvl)?.weight ?? IMPACT_WEIGHT[pLvl];
    return LEVELS.map(iLvl => {
      const iW = probScale.find(s => s.key === iLvl)?.weight ?? IMPACT_WEIGHT[iLvl];
      return Math.round(pW * iW);
    });
  });

  const tolColor = (score: number): string => {
    const sorted = [...tols].sort((a, b) => b.minScore - a.minScore);
    for (const t of sorted) if (score >= t.minScore) return t.color;
    return '#3b82f6';
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
        borderRadius: 8, width: 980, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 16px',
          borderBottom: '1px solid var(--border-primary)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)', flex: 1 }}>
            Escalas de Puntuación del Riesgo
          </span>
          <button onClick={handleReset} style={btnReset} title="Restaurar valores predeterminados">
            <RotateCcw size={12} /> Reset
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 8 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body – 2-column layout mirroring P6 dialog */}
        <div style={{ display: 'flex', padding: 16, gap: 16 }}>
          {/* ─── LEFT: Probability Scale + Tolerance Scale ─── */}
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Probability Scale */}
            <fieldset style={fieldsetS}>
              <legend style={legendS}>Escala de Probabilidad</legend>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={thSm}></th>
                    <th style={thSm}>Peso</th>
                    <th style={thSm}>Probabilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {probScale.map((lv, i) => (
                    <tr key={lv.key}>
                      <td style={{ ...tdSm, fontWeight: 600 }}>{LEVEL_LABELS[lv.key]}</td>
                      <td style={tdSm}>
                        <input type="number" min={1} value={lv.weight}
                          onChange={e => setProbWeight(i, parseInt(e.target.value) || 1)}
                          style={inputNarrow} />
                      </td>
                      <td style={tdSm}>
                        <input value={lv.threshold}
                          onChange={e => setProbThreshold(i, e.target.value)}
                          style={inputWide} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>

            {/* Tolerance Scale */}
            <fieldset style={fieldsetS}>
              <legend style={legendS}>Escala de Tolerancia</legend>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={thSm}></th>
                    <th style={thSm}>Color</th>
                    <th style={thSm}>Score ≥</th>
                  </tr>
                </thead>
                <tbody>
                  {tols.map((t, i) => (
                    <tr key={i}>
                      <td style={{ ...tdSm, fontWeight: 600 }}>{t.label}</td>
                      <td style={tdSm}>
                        <input type="color" value={t.color}
                          onChange={e => setTolField(i, 'color', e.target.value)}
                          style={{ width: 28, height: 20, border: 'none', cursor: 'pointer', padding: 0 }} />
                      </td>
                      <td style={tdSm}>
                        <input type="number" min={0} value={t.minScore}
                          onChange={e => setTolField(i, 'minScore', parseInt(e.target.value) || 0)}
                          style={inputNarrow} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
          </div>

          {/* ─── RIGHT: Impact Types & PID Matrix ─── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Impact Scales & Types */}
            <fieldset style={fieldsetS}>
              <legend style={legendS}>Tipos de Impacto y Escalas</legend>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                <button onClick={addImpType} style={btnAdd}><Plus size={10} /> Agregar Tipo</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th style={thSm}>Tipo de Impacto</th>
                      <th style={thSm}>Score?</th>
                      {LEVELS.map(l => <th key={l} style={thSm}>{LEVEL_LABELS[l]}</th>)}
                      <th style={thSm}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {impTypes.map((t, ti) => (
                      <tr key={t.id}>
                        <td style={tdSm}>
                          <input value={t.label} onChange={e => setImpLabel(ti, e.target.value)}
                            style={{ ...inputWide, fontWeight: 600 }} />
                        </td>
                        <td style={{ ...tdSm, textAlign: 'center' }}>
                          <input type="checkbox" checked={t.scored} onChange={() => toggleScored(ti)} />
                        </td>
                        {LEVELS.map(l => (
                          <td key={l} style={tdSm}>
                            <input value={t.levels[l]} onChange={e => setImpThreshold(ti, l, e.target.value)}
                              style={inputWide} title={`${t.label} - ${LEVEL_LABELS[l]}`} />
                          </td>
                        ))}
                        <td style={tdSm}>
                          {!['schedule', 'cost', 'performance'].includes(t.id) && (
                            <button onClick={() => removeImpType(ti)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                              <Trash2 size={11} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>

            {/* PID Scoring */}
            <fieldset style={fieldsetS}>
              <legend style={legendS}>Puntuación de Probabilidad e Impacto (PID)</legend>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 10, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>Score se basa en:</span>
                {([
                  { v: 'highest' as PIDScoreMode, l: 'Mayor Impacto' },
                  { v: 'average_impacts' as PIDScoreMode, l: 'Promedio de Impactos' },
                  { v: 'average_scores' as PIDScoreMode, l: 'Promedio de Scores Individuales' },
                ] as const).map(o => (
                  <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                    <input type="radio" name="pidMode" checked={pidMode === o.v}
                      onChange={() => setPidMode(o.v)} style={{ margin: 0 }} />
                    {o.l}
                  </label>
                ))}
              </div>

              {/* Matrix preview */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thSm, background: 'var(--bg-panel)' }}></th>
                      <th style={{ ...thSm, fontSize: 8 }} colSpan={5}>Impactos</th>
                    </tr>
                    <tr>
                      <th style={{ ...thSm, background: 'var(--bg-panel)' }}></th>
                      {LEVELS.map(l => <th key={l} style={{ ...thSm, minWidth: 42 }}>{LEVEL_LABELS[l]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {LEVELS.map((pLvl, pi) => (
                      <tr key={pLvl}>
                        <td style={{ ...tdSm, fontWeight: 600, fontSize: 9, whiteSpace: 'nowrap' }}>
                          {LEVEL_LABELS[pLvl]} %
                        </td>
                        {LEVELS.map((_, ii) => {
                          const val = pidMatrix[pi][ii];
                          return (
                            <td key={ii} style={{
                              ...tdSm, textAlign: 'center', fontWeight: 700,
                              background: tolColor(val), color: '#fff',
                              minWidth: 42,
                            }}>
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '10px 16px', borderTop: '1px solid var(--border-primary)',
        }}>
          <button onClick={onClose} style={btnCancel}>Cancelar</button>
          <button onClick={handleSave} style={btnSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────
const fieldsetS: React.CSSProperties = {
  border: '1px solid var(--border-primary)', borderRadius: 6,
  padding: '8px 10px', margin: 0,
};
const legendS: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-heading)',
  padding: '0 6px',
};
const thSm: React.CSSProperties = {
  padding: '3px 4px', textAlign: 'left', fontWeight: 600, fontSize: 9,
  borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
};
const tdSm: React.CSSProperties = {
  padding: '2px 4px', fontSize: 10,
  borderBottom: '1px solid var(--border-primary)',
};
const inputNarrow: React.CSSProperties = {
  width: 48, fontSize: 10, padding: '2px 4px', borderRadius: 3,
  border: '1px solid var(--border-primary)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', textAlign: 'center',
};
const inputWide: React.CSSProperties = {
  width: '100%', fontSize: 10, padding: '2px 4px', borderRadius: 3,
  border: '1px solid var(--border-primary)', background: 'var(--bg-input)',
  color: 'var(--text-primary)',
};
const btnAdd: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
  fontSize: 9, fontWeight: 600, background: '#6366f120', color: '#6366f1',
  border: '1px solid #6366f150', borderRadius: 3, cursor: 'pointer',
};
const btnReset: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
  fontSize: 9, fontWeight: 500, background: 'var(--bg-input)',
  color: 'var(--text-secondary)', border: '1px solid var(--border-primary)',
  borderRadius: 3, cursor: 'pointer',
};
const btnCancel: React.CSSProperties = {
  padding: '5px 14px', fontSize: 11, fontWeight: 500,
  background: 'var(--bg-input)', color: 'var(--text-secondary)',
  border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer',
};
const btnSave: React.CSSProperties = {
  padding: '5px 14px', fontSize: 11, fontWeight: 600,
  background: '#6366f1', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer',
};
