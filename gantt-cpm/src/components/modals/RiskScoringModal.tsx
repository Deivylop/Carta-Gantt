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
  RiskScoringConfig, ScaleLevel, ImpactType, ToleranceLevel, PIDScoreMode,
} from '../../types/risk';
import {
  DEFAULT_RISK_SCORING, DEFAULT_PROBABILITY_SCALE, DEFAULT_IMPACT_SCALE,
  DEFAULT_IMPACT_TYPES, DEFAULT_TOLERANCE_LEVELS,
  IMPACT_WEIGHT, IMPACT_LABELS, getLevelKeysForSize, ALL_LEVEL_KEYS,
} from '../../types/risk';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';

/** Default prob weights per scale size (index 0 = highest key) */
const PROB_DEFAULTS: Record<number, number[]> = {
  2: [9, 1], 3: [9, 5, 1], 4: [9, 7, 3, 1],
  5: [9, 7, 5, 3, 1], 6: [9, 8, 7, 5, 3, 1], 7: [9, 8, 7, 5, 3, 2, 1],
};
/** Default impact weights per scale size */
const IMP_DEFAULTS: Record<number, number[]> = {
  2: [8, 0.5], 3: [8, 2, 0.5], 4: [8, 4, 1, 0.5],
  5: [8, 4, 2, 1, 0.5], 6: [8, 6, 4, 2, 1, 0.5], 7: [8, 6, 4, 2, 1, 0.5, 0.25],
};

interface Props { open: boolean; onClose: () => void; }

export default function RiskScoringModal({ open, onClose }: Props) {
  const { state, dispatch } = useGantt();
  const existing = state.riskState.riskScoring ?? DEFAULT_RISK_SCORING;

  // Local draft
  const [probScale, setProbScale] = useState<ScaleLevel[]>(() => [...existing.probabilityScale]);
  const [impScale, setImpScale] = useState<ScaleLevel[]>(() => [...(existing.impactScale ?? DEFAULT_IMPACT_SCALE)]);
  const [impTypes, setImpTypes] = useState<ImpactType[]>(() => existing.impactTypes.map(t => ({ ...t, levels: { ...t.levels } })));
  const [tols, setTols] = useState<ToleranceLevel[]>(() => existing.toleranceLevels.map(t => ({ ...t })));
  const [pidMode, setPidMode] = useState<PIDScoreMode>(existing.pidScoreMode);
  const scaleSize = probScale.length;
  const activeKeys = probScale.map(s => s.key);

  // ─── Handlers: Probability Scale ───────────────────────────
  const setProbWeight = useCallback((idx: number, val: number) => {
    setProbScale(s => s.map((lv, i) => i === idx ? { ...lv, weight: val } : lv));
  }, []);
  const setProbThreshold = useCallback((idx: number, val: string) => {
    setProbScale(s => s.map((lv, i) => i === idx ? { ...lv, threshold: val } : lv));
  }, []);

  // ─── Handlers: Impact Scale ────────────────────────────────
  const setImpWeight = useCallback((idx: number, val: number) => {
    setImpScale(s => s.map((lv, i) => i === idx ? { ...lv, weight: val } : lv));
  }, []);
  const setImpThresholdScale = useCallback((idx: number, val: string) => {
    setImpScale(s => s.map((lv, i) => i === idx ? { ...lv, threshold: val } : lv));
  }, []);

  // ─── Handler: Change scale size (2-7) ─────────────────────
  const changeScaleSize = useCallback((n: number) => {
    const keys = getLevelKeysForSize(n);
    const pDef = PROB_DEFAULTS[n] ?? PROB_DEFAULTS[5];
    const iDef = IMP_DEFAULTS[n] ?? IMP_DEFAULTS[5];
    setProbScale(old => keys.map((k, i) => {
      const prev = old.find(s => s.key === k);
      return prev ? { ...prev } : { key: k, label: IMPACT_LABELS[k], weight: pDef[i] ?? 1, threshold: '' };
    }));
    setImpScale(old => keys.map((k, i) => {
      const prev = old.find(s => s.key === k);
      return prev ? { ...prev } : { key: k, label: IMPACT_LABELS[k], weight: iDef[i] ?? 1, threshold: '' };
    }));
  }, []);

  // ─── Handlers: Impact Types ────────────────────────────────
  const toggleScored = useCallback((idx: number) => {
    setImpTypes(ts => ts.map((t, i) => i === idx ? { ...t, scored: !t.scored } : t));
  }, []);
  const setImpThreshold = useCallback((typeIdx: number, lvl: string, val: string) => {
    setImpTypes(ts => ts.map((t, i) => i === typeIdx ? { ...t, levels: { ...t.levels, [lvl]: val } } : t));
  }, []);
  const setImpLabel = useCallback((idx: number, val: string) => {
    setImpTypes(ts => ts.map((t, i) => i === idx ? { ...t, label: val } : t));
  }, []);
  const addImpType = useCallback(() => {
    const emptyLevels: Record<string, string> = {};
    for (const k of ALL_LEVEL_KEYS) emptyLevels[k] = '';
    setImpTypes(ts => [...ts, {
      id: 'custom_' + Date.now().toString(36),
      label: 'Nuevo Tipo',
      scored: true,
      levels: emptyLevels,
    }]);
  }, []);
  const removeImpType = useCallback((idx: number) => {
    setImpTypes(ts => ts.filter((_, i) => i !== idx));
  }, []);

  // ─── Handlers: Tolerance ───────────────────────────────────
  const setTolField = useCallback((idx: number, field: keyof ToleranceLevel, val: string | number) => {
    setTols(ts => ts.map((t, i) => i === idx ? { ...t, [field]: val } : t));
  }, []);
  const addTolerance = useCallback(() => {
    setTols(ts => [...ts, { label: 'Nuevo', color: '#3b82f6', minScore: 0 }]);
  }, []);
  const removeTolerance = useCallback((idx: number) => {
    setTols(ts => ts.filter((_, i) => i !== idx));
  }, []);

  // ─── Save ──────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const cfg: RiskScoringConfig = {
      probabilityScale: probScale,
      impactScale: impScale,
      impactTypes: impTypes,
      toleranceLevels: tols,
      pidScoreMode: pidMode,
    };
    dispatch({ type: 'SET_RISK_SCORING', scoring: cfg });
    onClose();
  }, [probScale, impScale, impTypes, tols, pidMode, dispatch, onClose]);

  // ─── Reset ─────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setProbScale([...DEFAULT_PROBABILITY_SCALE]);
    setImpScale([...DEFAULT_IMPACT_SCALE]);
    setImpTypes(DEFAULT_IMPACT_TYPES.map(t => ({ ...t, levels: { ...t.levels } })));
    setTols(DEFAULT_TOLERANCE_LEVELS.map(t => ({ ...t })));
    setPidMode('highest');
  }, []);

  // ─── PID Matrix Preview (separate prob × impact weights) ────
  const pidMatrix = activeKeys.map(pLvl => {
    const pW = probScale.find(s => s.key === pLvl)?.weight ?? IMPACT_WEIGHT[pLvl];
    return activeKeys.map(iLvl => {
      const iW = impScale.find(s => s.key === iLvl)?.weight ?? IMPACT_WEIGHT[iLvl];
      return Math.ceil(pW * iW);
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
        borderRadius: 8, width: 1050, maxHeight: '90vh', overflow: 'auto',
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
          {/* ─── LEFT: Scale Size, Prob Scale, Impact Scale, Tolerance ─── */}
          <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Scale size selector */}
            <fieldset style={fieldsetS}>
              <legend style={legendS}>Configuración de Escalas</legend>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Items en la escala:</span>
                <select value={scaleSize} onChange={e => changeScaleSize(Number(e.target.value))}
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
                  {[2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </fieldset>

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
                      <td style={{ ...tdSm, fontWeight: 600 }}>{IMPACT_LABELS[lv.key]}</td>
                      <td style={tdSm}>
                        <input type="number" min={0} step="any" value={lv.weight}
                          onChange={e => setProbWeight(i, parseFloat(e.target.value) || 0)}
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

            {/* Impact Scale (SEPARATE weights from probability) */}
            <fieldset style={fieldsetS}>
              <legend style={legendS}>Escala de Impacto</legend>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={thSm}></th>
                    <th style={thSm}>Peso</th>
                    <th style={thSm}>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {impScale.map((lv, i) => (
                    <tr key={lv.key}>
                      <td style={{ ...tdSm, fontWeight: 600 }}>{IMPACT_LABELS[lv.key]}</td>
                      <td style={tdSm}>
                        <input type="number" min={0} step="any" value={lv.weight}
                          onChange={e => setImpWeight(i, parseFloat(e.target.value) || 0)}
                          style={inputNarrow} />
                      </td>
                      <td style={tdSm}>
                        <input value={lv.threshold}
                          onChange={e => setImpThresholdScale(i, e.target.value)}
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
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <button onClick={addTolerance} style={btnAdd}><Plus size={10} /> Agregar</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={thSm}>Label</th>
                    <th style={thSm}>Color</th>
                    <th style={thSm}>Score ≥</th>
                    <th style={thSm}></th>
                  </tr>
                </thead>
                <tbody>
                  {tols.map((t, i) => (
                    <tr key={i}>
                      <td style={tdSm}>
                        <input value={t.label} onChange={e => setTolField(i, 'label', e.target.value)}
                          style={{ ...inputWide, fontWeight: 600 }} />
                      </td>
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
                      <td style={tdSm}>
                        {tols.length > 1 && (
                          <button onClick={() => removeTolerance(i)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                            <Trash2 size={10} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
          </div>

          {/* ─── RIGHT: Impact Types & PID Matrix ─── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                      {activeKeys.map(l => <th key={l} style={thSm}>{IMPACT_LABELS[l]}</th>)}
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
                        {activeKeys.map(l => (
                          <td key={l} style={tdSm}>
                            <input value={t.levels[l] || ''} onChange={e => setImpThreshold(ti, l, e.target.value)}
                              style={inputWide} title={`${t.label} - ${IMPACT_LABELS[l]}`} />
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

              {/* Matrix preview – N×N dynamic (P6 format: VL→VH left-to-right) */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thSm, background: 'var(--bg-panel)' }}></th>
                      <th style={{ ...thSm, fontSize: 9 }} colSpan={scaleSize}>Impactos</th>
                    </tr>
                    <tr>
                      <th style={{ ...thSm, background: 'var(--bg-panel)' }}></th>
                      {[...activeKeys].reverse().map(l => <th key={l} style={{ ...thSm, minWidth: 52, fontSize: 10 }}>{IMPACT_LABELS[l]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {activeKeys.map((pLvl, pi) => (
                      <tr key={pLvl}>
                        <td style={{ ...tdSm, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                          {IMPACT_LABELS[pLvl]} %
                        </td>
                        {[...activeKeys].reverse().map((_, ri) => {
                          const ii = activeKeys.length - 1 - ri;
                          const val = pidMatrix[pi][ii];
                          return (
                            <td key={ri} style={{
                              ...tdSm, textAlign: 'center', fontWeight: 700,
                              background: tolColor(val), color: '#fff',
                              minWidth: 52, padding: '6px 8px', fontSize: 12,
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
