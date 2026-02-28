// ═══════════════════════════════════════════════════════════════════
// WhatIfPage – Simplified What-If module
// Layout: sidebar (ScenarioList) | main (Edición / Comparación)
// Edición tab reuses GanttTable + GanttTimeline via ScenarioGanttProvider
// Master schedule shown as ghost bars behind scenario bars.
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useMemo, useCallback, useRef, useEffect, Component, type ErrorInfo, type ReactNode } from 'react';
import { useGantt } from '../../store/GanttContext';
import { fmtDate, isoDate } from '../../utils/cpm';
import ScenarioList from './ScenarioList';
import ScenarioComparison from './ScenarioComparison';
import ScenarioGanttProvider from './ScenarioGanttProvider';
import { validateScenarioForMerge, default as ScenarioAlertModal, type ScenarioAlert } from './ScenarioAlertModal';
import GanttTable from '../GanttTable';
import GanttTimeline from '../GanttTimeline';
import ActivityDetailPanel from '../ActivityDetailPanel';
import LinkModal from '../modals/LinkModal';
import { GitBranch, GanttChart, BarChart3, Play, CheckCircle, XCircle, CalendarDays } from 'lucide-react';

type SubTab = 'editor' | 'comparison';

/* ── Error Boundary to catch render crashes in scenario mode ───── */
class ScenarioErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WhatIf] Scenario render crash:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>Error al renderizar el escenario</div>
          <pre style={{ fontSize: 11, maxWidth: 600, overflow: 'auto', background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <button onClick={() => { this.setState({ error: null }); this.props.onReset(); }}
            style={{ padding: '6px 18px', fontSize: 12, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WhatIfPage() {
  const { state, dispatch } = useGantt();
  const [subTab, setSubTab] = useState<SubTab>('editor');
  const [sidebarW] = useState(240);
  const [resizing, setResizing] = useState(false);
  const [mergeAlert, setMergeAlert] = useState<ScenarioAlert | null>(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);

  const activeScenario = useMemo(
    () => state.scenarios.find(s => s.id === state.activeScenarioId) || null,
    [state.scenarios, state.activeScenarioId]
  );

  /* ── Toolbar actions ── */
  const handleRecalcCPM = useCallback(() => {
    if (!activeScenario) return;
    // Use the scenario's simStatusDate if set, otherwise regular recalc
    if (activeScenario.simStatusDate) {
      dispatch({ type: 'RECALC_SCENARIO_CPM_WITH_DATE', scenarioId: activeScenario.id, statusDate: activeScenario.simStatusDate });
    } else {
      dispatch({ type: 'RECALC_SCENARIO_CPM', scenarioId: activeScenario.id });
    }
  }, [activeScenario, dispatch]);

  // Step 1: User clicks button → show confirmation dialog
  const handleMerge = useCallback(() => {
    if (!activeScenario) return;
    setShowMergeConfirm(true);
  }, [activeScenario]);

  // Step 2: User confirms → run validation → merge or show alert
  const handleMergeAfterConfirm = useCallback(() => {
    if (!activeScenario) return;
    setShowMergeConfirm(false);
    const alert = validateScenarioForMerge(activeScenario.activities, state.statusDate, fmtDate);
    if (alert) {
      if (alert.mergeErrors && alert.mergeErrors.length > 0) { setMergeAlert(alert); return; }
      setMergeAlert(alert);
      return;
    }
    dispatch({ type: 'MERGE_SCENARIO', scenarioId: activeScenario.id });
  }, [activeScenario, state.statusDate, dispatch]);

  // Step 3: If validation had warnings, user can still proceed
  const handleMergeAlertProceed = useCallback(() => {
    if (!activeScenario) return;
    dispatch({ type: 'MERGE_SCENARIO', scenarioId: activeScenario.id });
    setMergeAlert(null);
  }, [activeScenario, dispatch]);

  const handleDiscard = useCallback(() => {
    if (!activeScenario) return;
    if (confirm('¿Descartar todos los cambios del escenario "' + activeScenario.name + '"?')) {
      dispatch({ type: 'DELETE_SCENARIO', id: activeScenario.id });
    }
  }, [activeScenario, dispatch]);

  /* ── Status date for reprogramming ── */
  const scenarioStatusDate = activeScenario?.simStatusDate || (state.statusDate ? isoDate(state.statusDate) : '');
  const handleStatusDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeScenario) return;
    const val = e.target.value; // yyyy-mm-dd
    // Only save the date — user must click "Recalcular CPM" to reprogram
    dispatch({ type: 'SET_SCENARIO_SIM_STATUS_DATE', scenarioId: activeScenario.id, simStatusDate: val });
  }, [activeScenario, dispatch]);

  /* ── Resize handle for vertical divider ── */
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      dispatch({ type: 'SET_TABLE_W', width: Math.max(200, Math.min(e.clientX - sidebarW, window.innerWidth - sidebarW - 200)) });
    };
    const handleMouseUp = () => setResizing(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [resizing, sidebarW, dispatch]);

  const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'editor',     label: 'Edición',     icon: <GanttChart size={13} /> },
    { id: 'comparison', label: 'Comparación', icon: <BarChart3 size={13} /> },
  ];

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: sidebarW, flexShrink: 0, overflow: 'hidden' }}>
        <ScenarioList />
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeScenario ? (
          /* Empty state */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', gap: 12,
          }}>
            <GitBranch size={48} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Escenarios What-If
            </div>
            <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 420, lineHeight: 1.6 }}>
              Crea escenarios para simular cambios en el cronograma sin afectar el programa maestro.
              Edita directamente en la tabla y observa los cambios en el Gantt en tiempo real.
              Las barras fantasma muestran la posición original del programa maestro.
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Selecciona o crea un escenario en el panel izquierdo para comenzar.
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar + Sub-tabs */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2,
              padding: '0 8px', height: 36, flexShrink: 0,
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-panel)',
            }}>
              {/* Sub-tab buttons */}
              {SUB_TABS.map(t => {
                const isActive = subTab === t.id;
                return (
                  <button key={t.id} onClick={() => setSubTab(t.id)}
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

              {/* Separator */}
              <div style={{ width: 1, height: 18, background: 'var(--border-primary)', margin: '0 8px' }} />

              {/* Scenario name */}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', marginRight: 8, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeScenario.name}
              </div>

              {/* Change count badge */}
              {activeScenario.changes.length > 0 && (
                <div style={{
                  padding: '1px 7px', borderRadius: 10,
                  background: '#6366f120', color: '#6366f1',
                  fontSize: 10, fontWeight: 600, marginRight: 4,
                }}>
                  {activeScenario.changes.length} cambio{activeScenario.changes.length !== 1 ? 's' : ''}
                </div>
              )}

              {/* ── Status Date picker ── */}
              {subTab === 'editor' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, marginRight: 4 }}>
                  <CalendarDays size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fecha Estado:</span>
                  <input
                    type="date"
                    value={scenarioStatusDate}
                    onChange={handleStatusDateChange}
                    style={{
                      fontSize: 11, padding: '2px 4px', borderRadius: 4,
                      border: '1px solid var(--border-primary)',
                      background: 'var(--bg-input)', color: 'var(--text-primary)',
                      cursor: 'pointer', width: 120,
                    }}
                    title="Fecha de estado para reprogramación del escenario"
                  />
                </div>
              )}

              <div style={{ flex: 1 }} />

              {/* Action buttons */}
              {subTab === 'editor' && (<>
                <button onClick={handleRecalcCPM} title="Recalcular CPM del escenario"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', fontSize: 11, fontWeight: 500,
                    background: 'var(--bg-input)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer',
                    marginRight: 4,
                  }}>
                  <Play size={11} /> Recalcular CPM
                </button>
                <button onClick={handleMerge} title="Aplicar escenario al programa maestro"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', fontSize: 11, fontWeight: 600,
                    background: '#22c55e', color: '#fff',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                    marginRight: 4,
                  }}>
                  <CheckCircle size={11} /> Aplicar al Maestro
                </button>
                <button onClick={handleDiscard} title="Descartar escenario"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', fontSize: 11, fontWeight: 500,
                    background: 'transparent', color: '#ef4444',
                    border: '1px solid #ef4444', borderRadius: 4, cursor: 'pointer',
                  }}>
                  <XCircle size={11} /> Descartar
                </button>
              </>)}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {subTab === 'editor' && (
                <ScenarioGanttProvider scenario={activeScenario}>
                  <ScenarioErrorBoundary onReset={() => dispatch({ type: 'SET_ACTIVE_SCENARIO', id: null })}>
                  <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
                    {/* Gantt Area: Table | Resize | Timeline */}
                    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      {/* Table */}
                      <div style={{ width: state.tableW, flexShrink: 0, overflow: 'hidden' }}>
                        <GanttTable />
                      </div>

                      {/* Vertical Resize Handle */}
                      <div className={`v-resize ${resizing ? 'rsz' : ''}`}
                        onMouseDown={() => setResizing(true)} />

                      {/* Timeline */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <GanttTimeline />
                      </div>
                    </div>

                    {/* Detail Panel at bottom (optional — for activity editing) */}
                    <div style={{ height: 180, flexShrink: 0, overflow: 'hidden', borderTop: '1px solid var(--border-primary)' }}>
                      <ActivityDetailPanel />
                    </div>
                  </div>
                  {/* LinkModal inside ScenarioGanttProvider so links route to scenario */}
                  <LinkModal />
                  </ScenarioErrorBoundary>
                </ScenarioGanttProvider>
              )}
              {subTab === 'comparison' && <ScenarioComparison scenario={activeScenario} />}
            </div>
          </>
        )}
      </div>

      {/* Merge confirmation dialog */}
      {showMergeConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowMergeConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border-primary)',
            borderRadius: 10, padding: '24px 28px', maxWidth: 460, width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <CheckCircle size={22} color="#22c55e" />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>Aplicar al Cronograma Maestro</span>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              Los cambios realizados en el escenario What-If <strong style={{ color: '#6366f1' }}>"{activeScenario?.name}"</strong> se
              aplicarán al <strong>Cronograma Maestro</strong>.
            </p>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Esta acción reemplazará las actividades del programa maestro con las del escenario.
              <strong style={{ color: '#f59e0b' }}> Esta operación no se puede deshacer.</strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowMergeConfirm(false)} style={{
                padding: '6px 16px', fontSize: 12, fontWeight: 500,
                background: 'var(--bg-input)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-primary)', borderRadius: 5, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={handleMergeAfterConfirm} style={{
                padding: '6px 16px', fontSize: 12, fontWeight: 600,
                background: '#22c55e', color: '#fff',
                border: 'none', borderRadius: 5, cursor: 'pointer',
              }}>Sí, Aplicar al Maestro</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge alert modal (validation warnings/errors) */}
      {mergeAlert && (
        <ScenarioAlertModal
          alert={mergeAlert}
          onClose={() => setMergeAlert(null)}
          onProceed={mergeAlert.mergeErrors && mergeAlert.mergeErrors.length > 0 ? undefined : handleMergeAlertProceed}
        />
      )}
    </div>
  );
}
