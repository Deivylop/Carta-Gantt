// ═══════════════════════════════════════════════════════════════════
// RiskAnalysisPage – Monte Carlo Risk Analysis Module
// Layout: sidebar (config + run list) | main (sub-tabs)
// Works on the active project's activities (like What-If).
// Simulation runs are persisted in Supabase.
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { runSimulation } from '../../utils/monteCarloEngine';
import { saveRiskRunToSupabase, loadRiskRunsFromSupabase, deleteRiskRunFromSupabase, saveRiskConfigToSupabase, loadRiskConfigFromSupabase } from '../../utils/riskSync';
import RiskDistributionPanel from './RiskDistributionPanel';
import RiskResultsChart from './RiskResultsChart';
import RiskTornadoChart from './RiskTornadoChart';
import RiskRegisterPanel from './RiskRegisterPanel';
import { Dice5, BarChart3, Activity, AlertTriangle, Play, Trash2, Clock, ChevronDown, ChevronRight, Settings } from 'lucide-react';

type SubTab = 'distributions' | 'risks' | 'results' | 'tornado';

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'distributions', label: 'Distribuciones', icon: <Activity size={13} /> },
  { id: 'risks',         label: 'Riesgos',        icon: <AlertTriangle size={13} /> },
  { id: 'results',       label: 'Resultados',     icon: <BarChart3 size={13} /> },
  { id: 'tornado',       label: 'Tornado',        icon: <Dice5 size={13} /> },
];

export default function RiskAnalysisPage() {
  const { state, dispatch } = useGantt();
  const risk = state.riskState;
  const [subTab, setSubTab] = useState<SubTab>('distributions');
  const [sidebarW] = useState(250);
  const [showParams, setShowParams] = useState(true);
  const abortRef = useRef(false);
  const supabaseProjectId = useRef<string | null>(null);

  // Get Supabase project ID from localStorage
  useEffect(() => {
    try {
      const key = 'gantt_supabase_project_id';
      supabaseProjectId.current = localStorage.getItem(key);
    } catch { /* ignore */ }
  }, []);

  // Load past runs from Supabase on mount
  useEffect(() => {
    const pid = supabaseProjectId.current;
    if (!pid) return;
    loadRiskRunsFromSupabase(pid).then(runs => {
      if (runs.length > 0 && risk.simulationRuns.length === 0) {
        for (const r of runs) {
          dispatch({ type: 'RISK_SIM_COMPLETE', result: r });
        }
      }
    }).catch(err => console.warn('[Risk] Failed to load runs from Supabase:', err));
    // Also load risk config (distributions + events)
    loadRiskConfigFromSupabase(pid).then(cfg => {
      if (cfg) {
        dispatch({ type: 'LOAD_RISK_STATE', riskState: cfg });
      }
    }).catch(err => console.warn('[Risk] Failed to load config from Supabase:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Active simulation result
  const activeResult = useMemo(
    () => risk.simulationRuns.find(r => r.id === risk.activeRunId) || null,
    [risk.simulationRuns, risk.activeRunId],
  );

  // Count activities with distributions
  const distCount = useMemo(() => {
    return Object.values(risk.distributions).filter(d => d.type !== 'none').length;
  }, [risk.distributions]);

  // ─── Run Simulation ────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (risk.running) return;
    abortRef.current = false;
    dispatch({ type: 'RISK_SIM_START' });

    // Use setTimeout to let UI update before heavy computation
    setTimeout(async () => {
      try {
        const result = runSimulation(
          risk.params,
          state.activities,
          risk.distributions,
          risk.riskEvents,
          state.projStart,
          state.defCal,
          state.statusDate,
          state.projName,
          state.activeBaselineIdx,
          state.customCalendars,
          (pct) => dispatch({ type: 'RISK_SIM_PROGRESS', progress: pct }),
        );
        dispatch({ type: 'RISK_SIM_COMPLETE', result });
        setSubTab('results');

        // Save to Supabase
        const pid = supabaseProjectId.current;
        if (pid) {
          saveRiskRunToSupabase(pid, result).catch(err =>
            console.warn('[Risk] Failed to save run to Supabase:', err)
          );
          // Also save config (distributions + events)
          saveRiskConfigToSupabase(pid, risk.distributions, risk.riskEvents).catch(err =>
            console.warn('[Risk] Failed to save config to Supabase:', err)
          );
        }
      } catch (err) {
        console.error('[Risk] Simulation error:', err);
        dispatch({ type: 'RISK_SIM_PROGRESS', progress: 0 });
      }
    }, 50);
  }, [risk, state, dispatch]);

  // ─── Delete Run ────────────────────────────────────────────────
  const handleDeleteRun = useCallback((runId: string) => {
    if (!confirm('¿Eliminar esta simulación?')) return;
    dispatch({ type: 'DELETE_RISK_RUN', runId });
    const pid = supabaseProjectId.current;
    if (pid) {
      deleteRiskRunFromSupabase(pid, runId).catch(err =>
        console.warn('[Risk] Failed to delete run from Supabase:', err)
      );
    }
  }, [dispatch]);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* ─── Sidebar ─── */}
      <div style={{
        width: sidebarW, flexShrink: 0, overflow: 'auto',
        borderRight: '1px solid var(--border-primary)',
        background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Title */}
        <div style={{
          padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid var(--border-primary)',
        }}>
          <Dice5 size={18} color="#6366f1" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>Análisis de Riesgos</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Monte Carlo</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-primary)', fontSize: 10, color: 'var(--text-secondary)' }}>
          <div>{distCount} actividades con distribución</div>
          <div>{risk.riskEvents.length} riesgos registrados</div>
          <div>{risk.simulationRuns.length} simulaciones guardadas</div>
        </div>

        {/* Parameters */}
        <div style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div
            onClick={() => setShowParams(!showParams)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
            }}
          >
            {showParams ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Settings size={12} />
            Parámetros
          </div>
          {showParams && (
            <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
              <label style={{ color: 'var(--text-secondary)' }}>
                Iteraciones:
                <select
                  value={risk.params.iterations}
                  onChange={e => dispatch({ type: 'SET_RISK_SIM_PARAMS', params: { iterations: parseInt(e.target.value) } })}
                  style={selectStyle}
                >
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={2000}>2,000</option>
                  <option value={5000}>5,000</option>
                  <option value={10000}>10,000</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={risk.params.useMitigated}
                  onChange={e => dispatch({ type: 'SET_RISK_SIM_PARAMS', params: { useMitigated: e.target.checked } })}
                />
                Usar valores mitigados
              </label>
              <label style={{ color: 'var(--text-secondary)' }}>
                Semilla (vacío = aleatorio):
                <input
                  type="number"
                  value={risk.params.seed ?? ''}
                  onChange={e => {
                    const v = e.target.value.trim();
                    dispatch({ type: 'SET_RISK_SIM_PARAMS', params: { seed: v ? parseInt(v) : null } });
                  }}
                  style={{ ...selectStyle, width: '100%' }}
                  placeholder="Aleatorio"
                />
              </label>
            </div>
          )}
        </div>

        {/* Run button */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-primary)' }}>
          <button
            onClick={handleRun}
            disabled={risk.running || distCount === 0}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 0', fontSize: 12, fontWeight: 700,
              background: risk.running ? '#6366f180' : distCount === 0 ? '#6366f140' : '#6366f1',
              color: '#fff', border: 'none', borderRadius: 6, cursor: risk.running || distCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Play size={14} />
            {risk.running ? 'Ejecutando...' : 'Ejecutar Simulación'}
          </button>
          {risk.running && (
            <div style={{ marginTop: 6 }}>
              <div style={{
                width: '100%', height: 6, borderRadius: 3,
                background: 'rgba(128,128,128,0.2)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${risk.progress}%`, height: '100%',
                  background: '#6366f1', borderRadius: 3,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: 'center' }}>
                {risk.progress}%
              </div>
            </div>
          )}
          {distCount === 0 && !risk.running && (
            <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4, textAlign: 'center' }}>
              Asigna distribuciones a las actividades primero
            </div>
          )}
        </div>

        {/* Simulation Runs List */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
            borderBottom: '1px solid var(--border-primary)',
          }}>
            Simulaciones Guardadas
          </div>
          {risk.simulationRuns.length === 0 ? (
            <div style={{ padding: 14, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              No hay simulaciones aún. Ejecuta una para ver resultados.
            </div>
          ) : (
            risk.simulationRuns.map(run => {
              const isActive = run.id === risk.activeRunId;
              const when = new Date(run.runAt);
              return (
                <div
                  key={run.id}
                  onClick={() => dispatch({ type: 'SET_RISK_ACTIVE_RUN', runId: run.id })}
                  style={{
                    padding: '8px 14px',
                    background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                    borderBottom: '1px solid var(--border-primary)',
                    borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? '#6366f1' : 'var(--text-primary)' }}>
                      {run.name}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteRun(run.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                      title="Eliminar simulación"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10, color: 'var(--text-muted)' }}>
                    <span><Clock size={9} style={{ verticalAlign: 'middle' }} /> {when.toLocaleDateString('es-CL')} {when.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{run.completedIterations} iter.</span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10 }}>
                    <span style={{ color: '#22c55e' }}>P50: {run.durationPercentiles[50] ?? '?'}d</span>
                    {' · '}
                    <span style={{ color: '#f59e0b' }}>P80: {run.durationPercentiles[80] ?? '?'}d</span>
                    {' · '}
                    <span style={{ color: 'var(--text-muted)' }}>Det: {run.deterministicDuration}d</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Main Area ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Sub-tab bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '0 8px', height: 36, flexShrink: 0,
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-panel)',
        }}>
          {SUB_TABS.map(t => {
            const isActive = subTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0 12px', height: '100%',
                  fontSize: 11, fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text-accent)' : 'var(--text-secondary)',
                  background: 'transparent', border: 'none',
                  borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {t.icon} {t.label}
              </button>
            );
          })}
          {activeResult && (
            <>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingRight: 8 }}>
                Resultado: <strong style={{ color: '#6366f1' }}>{activeResult.name}</strong>
                {' · '}P80: <strong style={{ color: '#f59e0b' }}>{activeResult.durationPercentiles[80] ?? '?'}d</strong>
              </div>
            </>
          )}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {subTab === 'distributions' && <RiskDistributionPanel />}
          {subTab === 'risks' && <RiskRegisterPanel />}
          {subTab === 'results' && (
            activeResult
              ? <RiskResultsChart result={activeResult} />
              : <EmptyState msg="Ejecuta una simulación para ver los resultados." icon={<BarChart3 size={40} />} />
          )}
          {subTab === 'tornado' && (
            activeResult
              ? <RiskTornadoChart result={activeResult} />
              : <EmptyState msg="Ejecuta una simulación para ver el análisis de sensibilidad." icon={<Dice5 size={40} />} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ msg, icon }: { msg: string; icon: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', height: '100%',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      color: 'var(--text-muted)', padding: 32,
    }}>
      <div style={{ opacity: 0.2 }}>{icon}</div>
      <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 360 }}>{msg}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 3,
  fontSize: 11, padding: '4px 6px', borderRadius: 4,
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-input)', color: 'var(--text-primary)',
};
