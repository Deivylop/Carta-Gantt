// ═══════════════════════════════════════════════════════════════════
// RiskQualitativePanel – Qualitative Risk Assessment (P6-style)
// INLINE-EDITABLE risk register + 5×5 matrix + resizable detail panel.
// Every change dispatches immediately (auto-save).
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import type {
  RiskEvent, ImpactLevel, QualitativeScore, RiskCategory,
  MitigationResponse, ThreatOrOpportunity, RiskStatus,
} from '../../types/risk';
import {
  IMPACT_LABELS, IMPACT_WEIGHT, PROB_RANGES,
  computeQualScore, scoreColor, scoreLabel, createBlankRiskEvent,
  DEFAULT_RISK_SCORING, DEFAULT_IMPACT_SCALE,
} from '../../types/risk';
import { Plus, Trash2, Settings, Eye } from 'lucide-react';
import RiskScoringModal from '../modals/RiskScoringModal';

const CATEGORIES: RiskCategory[] = [
  'Técnico', 'Externo', 'Organizacional', 'Gestión',
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

type ColGroup = 'risk' | 'pre' | 'post' | 'mitigation' | 'actions';
const COL_GROUPS: { key: ColGroup; label: string; color: string }[] = [
  { key: 'risk', label: 'Riesgo', color: '#166534' },
  { key: 'pre', label: 'Pre-Mitigación', color: '#dc2626' },
  { key: 'post', label: 'Post-Mitigación', color: '#059669' },
  { key: 'mitigation', label: 'Mitigación', color: '#1e40af' },
  { key: 'actions', label: 'Acciones', color: '#4a5568' },
];

type DetailTab = 'details' | 'mitigation' | 'matrix';

export default function RiskQualitativePanel() {
  const { state, dispatch } = useGantt();
  const risks = state.riskState.riskEvents;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('details');
  const [bottomH, setBottomH] = useState(280);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColGroup>>(new Set(['risk', 'pre', 'post', 'mitigation', 'actions']));
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => risks.find(r => r.id === selectedId) ?? null, [risks, selectedId]);
  const scoringCfg = state.riskState.riskScoring ?? DEFAULT_RISK_SCORING;
  const [scoringOpen, setScoringOpen] = useState(false);

  // Derive active level keys from config (dynamic N)
  const activeKeys = useMemo<ImpactLevel[]>(
    () => scoringCfg.probabilityScale.map(s => s.key),
    [scoringCfg.probabilityScale],
  );
  // LOW→HIGH for matrix Y-axis
  const activeKeysReversed = useMemo(() => [...activeKeys].reverse(), [activeKeys]);

  // ─── Auto-save helper: dispatch UPDATE immediately ────────────
  const updateRisk = useCallback((riskId: string, partial: Partial<RiskEvent>) => {
    const r = risks.find(x => x.id === riskId);
    if (!r) return;
    dispatch({ type: 'UPDATE_RISK_EVENT', event: { ...r, ...partial } });
  }, [risks, dispatch]);

  const updateQS = useCallback((riskId: string, which: 'preMitigation' | 'postMitigation', field: keyof QualitativeScore, val: ImpactLevel) => {
    const r = risks.find(x => x.id === riskId);
    if (!r) return;
    dispatch({ type: 'UPDATE_RISK_EVENT', event: { ...r, [which]: { ...r[which], [field]: val } } });
  }, [risks, dispatch]);

  // ─── CRUD ─────────────────────────────────────────────────────
  const handleAdd = useCallback(() => {
    const evt = createBlankRiskEvent({ name: 'Nuevo Riesgo', status: 'open' });
    dispatch({ type: 'ADD_RISK_EVENT', event: evt });
    setSelectedId(evt.id);
    setDetailTab('details');
  }, [dispatch]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm('¿Eliminar este riesgo?')) return;
    dispatch({ type: 'DELETE_RISK_EVENT', eventId: id });
    if (selectedId === id) setSelectedId(null);
  }, [selectedId, dispatch]);

  // ─── Resizable bottom panel ───────────────────────────────────
  const onSplitterDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: bottomH };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setBottomH(Math.max(120, Math.min(600, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [bottomH]);

  // ─── Risk Matrix data (separate pre & post) ──────────────────
  const buildMatrix = useCallback((src: 'preMitigation' | 'postMitigation') => {
    const grid: Record<string, RiskEvent[]> = {};
    for (const p of activeKeys) for (const i of activeKeys) grid[`${p}-${i}`] = [];
    for (const r of risks) {
      const qs = r[src] || r.preMitigation;
      if (!qs) continue;
      const iMap: Record<string, number> = {};
      for (const s of (scoringCfg.impactScale ?? DEFAULT_IMPACT_SCALE)) iMap[s.key] = s.weight;
      const maxImpact = (['schedule', 'cost', 'performance'] as const)
        .reduce((m, k) => (iMap[qs[k]] ?? IMPACT_WEIGHT[qs[k]]) > (iMap[m] ?? IMPACT_WEIGHT[m]) ? qs[k] : m, 'VL' as ImpactLevel);
      grid[`${qs.probability}-${maxImpact}`]?.push(r);
    }
    return grid;
  }, [risks, scoringCfg, activeKeys]);

  const matrixDataPre = useMemo(() => buildMatrix('preMitigation'), [buildMatrix]);
  const matrixDataPost = useMemo(() => buildMatrix('postMitigation'), [buildMatrix]);

  const cellScore = (probLvl: ImpactLevel, impLvl: ImpactLevel) => {
    const pMap: Record<string, number> = {};
    for (const s of scoringCfg.probabilityScale) pMap[s.key] = s.weight;
    const iMap: Record<string, number> = {};
    for (const s of (scoringCfg.impactScale ?? DEFAULT_IMPACT_SCALE)) iMap[s.key] = s.weight;
    return Math.ceil((pMap[probLvl] ?? IMPACT_WEIGHT[probLvl]) * (iMap[impLvl] ?? IMPACT_WEIGHT[impLvl]));
  };

  // Close column picker when clicking outside
  useEffect(() => {
    if (!colPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colPickerOpen]);

  const toggleCol = (g: ColGroup) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  // compute total visible columns for colSpan
  const totalCols = (visibleCols.has('risk') ? 3 : 0) + (visibleCols.has('pre') ? 4 : 0)
    + (visibleCols.has('post') ? 4 : 0) + (visibleCols.has('mitigation') ? 2 : 0) + (visibleCols.has('actions') ? 1 : 0);

  // ─── Reusable risk matrix renderer (P6 format) ────────────────
  const renderRiskMatrix = (title: string, mData: Record<string, RiskEvent[]>) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', marginBottom: 6, color: 'var(--text-heading)' }}>
        {title}
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
          fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: 4,
        }}>
          PROBABILIDAD →
        </div>
        <div style={{ flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                {activeKeysReversed.map(l => (
                  <th key={l} style={{ fontSize: 9, fontWeight: 600, textAlign: 'center', padding: 2, color: 'var(--text-secondary)' }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeKeys.map(pLvl => (
                <tr key={pLvl}>
                  <td style={{ fontSize: 9, fontWeight: 600, textAlign: 'right', paddingRight: 3, color: 'var(--text-secondary)' }}>
                    {pLvl}<br /><span style={{ fontSize: 7, fontWeight: 400 }}>{scoringCfg.probabilityScale.find(s => s.key === pLvl)?.threshold ?? PROB_RANGES[pLvl]}</span>
                  </td>
                  {activeKeysReversed.map(iLvl => {
                    const cellRisks = mData[`${pLvl}-${iLvl}`] || [];
                    const cs = cellScore(pLvl, iLvl);
                    const count = cellRisks.length;
                    return (
                      <td key={iLvl} style={{
                        background: scoreColor(cs, scoringCfg),
                        border: '1px solid var(--border-primary)',
                        height: 52, padding: 2, verticalAlign: 'middle', textAlign: 'center',
                        cursor: count > 0 ? 'pointer' : 'default',
                      }}
                        title={`Score: ${cs} (${scoreLabel(cs, scoringCfg)}) — ${count} riesgo${count !== 1 ? 's' : ''}`}
                        onClick={() => { if (count === 1) setSelectedId(cellRisks[0].id); }}
                      >
                        {count > 0 && (
                          <span style={{
                            fontSize: 14, fontWeight: 800, color: '#fff',
                            textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                          }}>
                            {count}
                          </span>
                        )}
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
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ─── Top: Register Grid + Matrix ─── */}
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
          <button onClick={() => setScoringOpen(true)} style={btnSmall} title="Configurar Escalas de Puntuación">
            <Settings size={11} /> Escalas
          </button>
          {/* Column visibility picker */}
          <div ref={colPickerRef} style={{ position: 'relative' }}>
            <button onClick={() => setColPickerOpen(v => !v)} style={btnSmall} title="Mostrar/Ocultar Columnas">
              <Eye size={11} /> Columnas
            </button>
            {colPickerOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '110%', zIndex: 50,
                background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: 8, minWidth: 170, boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: 'var(--text-heading)' }}>Columnas visibles</div>
                {COL_GROUPS.map(g => (
                  <label key={g.key} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
                    fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={visibleCols.has(g.key)}
                      onChange={() => toggleCol(g.key)} />
                    <span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                      background: g.color, flexShrink: 0,
                    }} />
                    {g.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Split: Register table + Matrix */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Register Table - INLINE EDITABLE */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 2 }}>
                  {visibleCols.has('risk') && <th style={{ ...thS, background: '#166534', color: '#fff' }} colSpan={3}>Riesgo</th>}
                  {visibleCols.has('pre') && <th style={{ ...thS, background: '#dc2626', color: '#fff' }} colSpan={4}>Pre-Mitigación</th>}
                  {visibleCols.has('post') && <th style={{ ...thS, background: '#059669', color: '#fff' }} colSpan={4}>Post-Mitigación</th>}
                  {visibleCols.has('mitigation') && <th style={{ ...thS, background: '#1e40af', color: '#fff' }} colSpan={2}>Mitigación</th>}
                  {visibleCols.has('actions') && <th style={{ ...thS, background: '#4a5568', color: '#fff' }}>Acc.</th>}
                </tr>
                <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 22, zIndex: 2 }}>
                  {visibleCols.has('risk') && <><th style={thS}>ID</th><th style={thS}>T/O</th><th style={{ ...thS, textAlign: 'left', minWidth: 160 }}>Título</th></>}
                  {visibleCols.has('pre') && <><th style={thS}>Prob.</th><th style={thS}>Prog.</th><th style={thS}>Costo</th><th style={thS}>Score</th></>}
                  {visibleCols.has('post') && <><th style={thS}>Prob.</th><th style={thS}>Prog.</th><th style={thS}>Costo</th><th style={thS}>Score</th></>}
                  {visibleCols.has('mitigation') && <><th style={thS}>Respuesta</th><th style={thS}>Costo Mit.</th></>}
                  {visibleCols.has('actions') && <th style={thS}></th>}
                </tr>
              </thead>
              <tbody>
                {risks.map((r, i) => {
                  const qsPre = r.preMitigation;
                  const qsPost = r.postMitigation;
                  const scPre = qsPre ? computeQualScore(qsPre, scoringCfg) : 0;
                  const scPost = qsPost ? computeQualScore(qsPost, scoringCfg) : 0;
                  const isSelected = r.id === selectedId;
                  return (
                    <tr key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99,102,241,0.12)' : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'),
                        borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                      }}>
                      {/* ─── Risk columns ─── */}
                      {visibleCols.has('risk') && <>
                      <td style={{ ...tdS, padding: 0 }}>
                        <InlineText value={r.code || r.id.slice(-4).toUpperCase()} placeholder="Código"
                          onCommit={(v) => updateRisk(r.id, { code: v })} />
                      </td>
                      <td style={tdS}>
                        <span onClick={(e) => {
                          e.stopPropagation();
                          updateRisk(r.id, { threatOrOpportunity: r.threatOrOpportunity === 'threat' ? 'opportunity' : 'threat' });
                        }}
                          style={{
                            display: 'inline-block', background: r.threatOrOpportunity === 'threat' ? '#ef4444' : '#22c55e',
                            color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
                          }}>
                          {r.threatOrOpportunity === 'threat' ? 'T' : 'O'}
                        </span>
                      </td>
                      <td style={{ ...tdS, textAlign: 'left', padding: 0 }}>
                        <InlineText value={r.name} placeholder="Nombre del riesgo..."
                          onCommit={(v) => updateRisk(r.id, { name: v })} />
                      </td>
                      </>}
                      {/* ─── Pre-Mitigation columns ─── */}
                      {visibleCols.has('pre') && <>
                      <td style={tdS}>
                        <LevelSelect value={qsPre?.probability || 'M'} levels={activeKeys}
                          onChange={(v) => updateQS(r.id, 'preMitigation', 'probability', v)} />
                      </td>
                      <td style={tdS}>
                        <LevelSelect value={qsPre?.schedule || 'M'} levels={activeKeys}
                          onChange={(v) => updateQS(r.id, 'preMitigation', 'schedule', v)} />
                      </td>
                      <td style={tdS}>
                        <LevelSelect value={qsPre?.cost || 'M'} levels={activeKeys}
                          onChange={(v) => updateQS(r.id, 'preMitigation', 'cost', v)} />
                      </td>
                      <td style={tdS}>
                        <span style={{
                          display: 'inline-block', minWidth: 28, textAlign: 'center',
                          background: scoreColor(scPre, scoringCfg), color: '#fff',
                          borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                        }}>
                          {scPre}
                        </span>
                      </td>
                      </>}
                      {/* ─── Post-Mitigation columns ─── */}
                      {visibleCols.has('post') && <>
                      <td style={tdS}>
                        <LevelSelect value={qsPost?.probability || 'M'} levels={activeKeys}
                          onChange={(v) => updateQS(r.id, 'postMitigation', 'probability', v)} />
                      </td>
                      <td style={tdS}>
                        <LevelSelect value={qsPost?.schedule || 'M'} levels={activeKeys}
                          onChange={(v) => updateQS(r.id, 'postMitigation', 'schedule', v)} />
                      </td>
                      <td style={tdS}>
                        <LevelSelect value={qsPost?.cost || 'M'} levels={activeKeys}
                          onChange={(v) => updateQS(r.id, 'postMitigation', 'cost', v)} />
                      </td>
                      <td style={tdS}>
                        <span style={{
                          display: 'inline-block', minWidth: 28, textAlign: 'center',
                          background: scoreColor(scPost, scoringCfg), color: '#fff',
                          borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                        }}>
                          {scPost}
                        </span>
                      </td>
                      </>}
                      {/* ─── Mitigation columns ─── */}
                      {visibleCols.has('mitigation') && <>
                      <td style={tdS}>
                        <select value={r.mitigationResponse}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateRisk(r.id, { mitigationResponse: e.target.value as MitigationResponse })}
                          style={cellSelect}>
                          {RESPONSES.map(resp => <option key={resp} value={resp}>{RESPONSE_LABELS[resp]}</option>)}
                        </select>
                      </td>
                      <td style={{ ...tdS, padding: 0 }}>
                        <InlineNumber value={r.mitigationCost || 0} prefix="$"
                          onCommit={(v) => updateRisk(r.id, { mitigationCost: v })} />
                      </td>
                      </>}
                      {/* ─── Actions column ─── */}
                      {visibleCols.has('actions') &&
                      <td style={tdS}>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444' }}>
                          <Trash2 size={11} />
                        </button>
                      </td>}
                    </tr>
                  );
                })}
                {risks.length === 0 && (
                  <tr><td colSpan={totalCols || 14} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    No hay riesgos. Escribe en la fila de abajo para crear uno.
                  </td></tr>
                )}
                {/* ── New-row placeholder: type here to add a risk ── */}
                <NewRiskRow onAdd={(code, name) => {
                  const evt = createBlankRiskEvent({ code: code || undefined, name: name || 'Nuevo Riesgo', status: 'open' });
                  if (code) evt.code = code;
                  dispatch({ type: 'ADD_RISK_EVENT', event: evt });
                  setSelectedId(evt.id);
                }} />
              </tbody>
            </table>
          </div>

          {/* Pre & Post Risk Matrices (P6-style: VL→VH left-to-right, VH→VL top-to-bottom) */}
          <div style={{
            width: 440, flexShrink: 0, borderLeft: '1px solid var(--border-primary)',
            overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {/* ── Pre-Mitigation Matrix ── */}
            {renderRiskMatrix('Pre-Mitigación', matrixDataPre)}
            {/* ── Post-Mitigation Matrix ── */}
            {renderRiskMatrix('Post-Mitigación', matrixDataPost)}
          </div>
        </div>
      </div>

      {/* ─── Resizable Splitter ─── */}
      {selected && (
        <div onMouseDown={onSplitterDown}
          style={{
            height: 5, flexShrink: 0, cursor: 'row-resize',
            background: 'var(--border-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div style={{ width: 32, height: 2, borderRadius: 1, background: 'var(--text-muted)' }} />
        </div>
      )}

      {/* ─── Bottom: Detail Panel (auto-save) ─── */}
      {selected && (
        <div style={{
          height: bottomH, flexShrink: 0,
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
          </div>

          {/* Detail content — auto-save on every change */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            {detailTab === 'details' && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ ...lblS, flex: 0.3 }}>
                      Código:
                      <DetailText value={selected.code || ''} riskId={selected.id} field="code" update={updateRisk} />
                    </label>
                    <label style={{ ...lblS, flex: 1 }}>
                      Título:
                      <DetailText value={selected.name} riskId={selected.id} field="name" update={updateRisk} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ ...lblS, flex: 1 }}>
                      Causa:
                      <DetailTextArea value={selected.cause} riskId={selected.id} field="cause" update={updateRisk} />
                    </label>
                    <label style={{ ...lblS, flex: 1 }}>
                      Descripción:
                      <DetailTextArea value={selected.description} riskId={selected.id} field="description" update={updateRisk} />
                    </label>
                    <label style={{ ...lblS, flex: 1 }}>
                      Efecto:
                      <DetailTextArea value={selected.effect} riskId={selected.id} field="effect" update={updateRisk} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={lblS}>
                      Categoría:
                      <select value={selected.category}
                        onChange={e => updateRisk(selected.id, { category: e.target.value as RiskCategory })} style={inpS}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={lblS}>
                      RBS:
                      <DetailText value={selected.rbs || ''} riskId={selected.id} field="rbs" update={updateRisk} />
                    </label>
                  </div>
                </div>
                <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={lblS}>
                    Amenaza / Oportunidad:
                    <select value={selected.threatOrOpportunity}
                      onChange={e => updateRisk(selected.id, { threatOrOpportunity: e.target.value as ThreatOrOpportunity })} style={inpS}>
                      {T_O_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </label>
                  <label style={lblS}>
                    Estado:
                    <select value={selected.status}
                      onChange={e => updateRisk(selected.id, { status: e.target.value as RiskStatus })} style={inpS}>
                      {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </label>
                  <label style={lblS}>
                    Responsable:
                    <select value={selected.owner}
                      onChange={e => updateRisk(selected.id, { owner: e.target.value })} style={inpS}>
                      <option value="">Sin asignar</option>
                      <option value="PM">PM</option>
                      <option value="Jefe Obra">Jefe Obra</option>
                      <option value="OT">OT</option>
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={lblS}>
                      Fecha Inicio:
                      <input type="date" value={selected.startDate || ''}
                        onChange={e => updateRisk(selected.id, { startDate: e.target.value })} style={inpS} />
                    </label>
                    <label style={lblS}>
                      Fecha Fin:
                      <input type="date" value={selected.endDate || ''}
                        onChange={e => updateRisk(selected.id, { endDate: e.target.value })} style={inpS} />
                    </label>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={selected.quantified}
                      onChange={e => updateRisk(selected.id, { quantified: e.target.checked })} />
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
                    <select value={selected.mitigationResponse}
                      onChange={e => updateRisk(selected.id, { mitigationResponse: e.target.value as MitigationResponse })} style={inpS}>
                      {RESPONSES.map(r => <option key={r} value={r}>{RESPONSE_LABELS[r]}</option>)}
                    </select>
                  </label>
                  <label style={lblS}>
                    Descripción de la Mitigación:
                    <DetailTextArea value={selected.mitigationTitle} riskId={selected.id} field="mitigationTitle" update={updateRisk} />
                  </label>
                  <label style={lblS}>
                    Costo de Mitigación ($):
                    <input type="number" min={0} value={selected.mitigationCost}
                      onChange={e => updateRisk(selected.id, { mitigationCost: parseFloat(e.target.value) || 0 })} style={inpS} />
                  </label>
                </div>
              </div>
            )}

            {detailTab === 'matrix' && (
              <div style={{ display: 'flex', gap: 24 }}>
                <ScoreCard title="Pre-Mitigación" qs={selected.preMitigation}
                  onChange={(f, v) => updateQS(selected.id, 'preMitigation', f, v)} scoringCfg={scoringCfg} levels={activeKeys} />
                <ScoreCard title="Post-Mitigación" qs={selected.postMitigation}
                  onChange={(f, v) => updateQS(selected.id, 'postMitigation', f, v)} scoringCfg={scoringCfg} levels={activeKeys} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Risk Scoring Configuration Modal */}
      <RiskScoringModal open={scoringOpen} onClose={() => setScoringOpen(false)} />
    </div>
  );
}

// ─── Inline Editing Sub-components ──────────────────────────────

/** Inline text input for grid cells (commits on blur / Enter) */
function InlineText({ value, placeholder, onCommit }: {
  value: string; placeholder?: string; onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input value={local} placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (local !== value) onCommit(local); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onClick={e => e.stopPropagation()}
      style={{
        width: '100%', background: focused ? 'var(--bg-input)' : 'transparent',
        color: 'var(--text-primary)', fontSize: 10, fontWeight: 500,
        padding: '3px 6px', outline: 'none',
        border: focused ? '1px solid #6366f1' : '1px solid transparent',
        borderRadius: 2,
      }} />
  );
}

/** Inline number input for grid cells */
function InlineNumber({ value, prefix, onCommit }: {
  value: number; prefix?: string; onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const display = prefix ? `${prefix}${local}` : local;
  const [editing, setEditing] = useState(false);
  return editing ? (
    <input type="number" min={0} value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { onCommit(parseFloat(local) || 0); setEditing(false); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onClick={e => e.stopPropagation()}
      autoFocus
      style={{ width: 70, fontSize: 10, padding: '2px 4px', border: '1px solid #6366f1', borderRadius: 2, background: 'var(--bg-input)', color: 'var(--text-primary)', textAlign: 'right' }} />
  ) : (
    <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{ fontSize: 10, cursor: 'text', padding: '3px 6px', display: 'block', textAlign: 'center' }}>
      {display}
    </span>
  );
}

/** Level badge that is a select dropdown (accepts dynamic levels list) */
function LevelSelect({ value, onChange, levels }: { value: ImpactLevel; onChange: (v: ImpactLevel) => void; levels: ImpactLevel[] }) {
  const w = IMPACT_WEIGHT[value];
  const bg = w >= 8 ? '#ef4444' : w >= 6 ? '#f97316' : w >= 4 ? '#f59e0b' : w >= 2 ? '#22c55e' : '#3b82f6';
  return (
    <select value={value}
      onClick={e => e.stopPropagation()}
      onChange={e => onChange(e.target.value as ImpactLevel)}
      style={{
        fontSize: 9, fontWeight: 700, textAlign: 'center',
        background: bg + '25', color: bg, border: `1px solid ${bg}50`,
        borderRadius: 3, padding: '1px 2px', cursor: 'pointer',
        appearance: 'none', WebkitAppearance: 'none', width: 32,
      }}>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}
    </select>
  );
}

/** Detail panel text input (auto-save on blur) */
function DetailText({ value, riskId, field, update }: {
  value: string; riskId: string; field: string;
  update: (id: string, p: Partial<RiskEvent>) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) update(riskId, { [field]: local }); }}
      style={inpS} />
  );
}

/** Detail panel textarea (auto-save on blur) */
function DetailTextArea({ value, riskId, field, update }: {
  value: string; riskId: string; field: string;
  update: (id: string, p: Partial<RiskEvent>) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <textarea value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) update(riskId, { [field]: local }); }}
      style={{ ...inpS, height: 50, resize: 'vertical' }} />
  );
}

function ScoreCard({ title, qs, onChange, scoringCfg, levels }: {
  title: string;
  qs: QualitativeScore;
  onChange: (field: keyof QualitativeScore, val: ImpactLevel) => void;
  scoringCfg?: import('../../types/risk').RiskScoringConfig;
  levels: ImpactLevel[];
}) {
  const sc = computeQualScore(qs, scoringCfg);
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
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {IMPACT_LABELS[qs[field]]}
            {field === 'probability' && ` (${scoringCfg?.probabilityScale.find(s => s.key === qs[field])?.threshold ?? PROB_RANGES[qs[field]]})`}
          </span>
        </div>
      ))}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
        padding: '6px 8px', background: scoreColor(sc, scoringCfg) + '20', borderRadius: 4,
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Score:</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(sc, scoringCfg) }}>{sc}</span>
        <span style={{ fontSize: 10, color: scoreColor(sc, scoringCfg), fontWeight: 600 }}>{scoreLabel(sc, scoringCfg)}</span>
      </div>
    </div>
  );
}

/** Empty row at the bottom of the grid – typing in code or name creates a new risk */
function NewRiskRow({ onAdd }: { onAdd: (code: string, name: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const commit = () => {
    if (!code.trim() && !name.trim()) return;
    onAdd(code.trim(), name.trim());
    setCode('');
    setName('');
  };

  return (
    <tr style={{ background: 'rgba(99,102,241,0.04)' }}>
      <td style={{ ...tdS, padding: 0 }}>
        <input value={code} placeholder="Código…" onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          style={{
            width: '100%', border: '1px dashed var(--border-primary)', background: 'transparent',
            color: 'var(--text-muted)', fontSize: 10, padding: '3px 6px', outline: 'none', borderRadius: 2,
          }} />
      </td>
      <td style={tdS}></td>
      <td style={{ ...tdS, textAlign: 'left', padding: 0 }}>
        <input value={name} placeholder="Escribe para agregar riesgo…" onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          style={{
            width: '100%', border: '1px dashed var(--border-primary)', background: 'transparent',
            color: 'var(--text-muted)', fontSize: 10, padding: '3px 6px', outline: 'none', borderRadius: 2,
          }} />
      </td>
      <td colSpan={11} style={{ ...tdS, color: 'var(--text-muted)', fontSize: 9 }}>
        <span style={{ opacity: 0.5 }}>↵ Enter para crear</span>
      </td>
    </tr>
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
const cellSelect: React.CSSProperties = {
  fontSize: 9, padding: '1px 3px', borderRadius: 2,
  border: '1px solid var(--border-primary)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', cursor: 'pointer',
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
