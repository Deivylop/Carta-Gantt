// ═══════════════════════════════════════════════════════════════════
// ScenarioAlertModal – Validation alerts for What-If sandbox
// Alert 1: "Avance Improcedente" – progress on future activity
// Alert 2: "Lógica Rota" – out-of-sequence progress
// Alert 3: "Merge Blocked" – prevents merging with integrity errors
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { AlertTriangle, ShieldAlert, XCircle } from 'lucide-react';

export type AlertKind = 'avance-improcedente' | 'logica-rota' | 'merge-blocked';

export interface ScenarioAlert {
  kind: AlertKind;
  activityId?: string;
  activityName?: string;
  statusDate?: string;          // formatted date
  predecessorIds?: string[];    // for lógica rota
  mergeErrors?: string[];       // for merge validation
  mergeWarnings?: string[];
}

interface Props {
  alert: ScenarioAlert | null;
  onClose: () => void;
  /** For lógica-rota: user can acknowledge and proceed */
  onProceed?: () => void;
}

const ICONS: Record<AlertKind, React.ReactNode> = {
  'avance-improcedente': <XCircle size={22} color="#ef4444" />,
  'logica-rota': <AlertTriangle size={22} color="#f59e0b" />,
  'merge-blocked': <ShieldAlert size={22} color="#ef4444" />,
};

const TITLES: Record<AlertKind, string> = {
  'avance-improcedente': 'Avance Improcedente',
  'logica-rota': 'Advertencia de Lógica Rota',
  'merge-blocked': 'Fusión Bloqueada',
};

export default function ScenarioAlertModal({ alert, onClose, onProceed }: Props) {
  if (!alert) return null;

  const renderBody = () => {
    if (alert.kind === 'avance-improcedente') {
      return (
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#ef4444' }}>
            No se puede registrar avance en la actividad <strong style={{ color: 'var(--text-heading)' }}>{alert.activityId}</strong> – {alert.activityName}.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            La fecha de inicio planificada de esta actividad es <strong>posterior</strong> a la Fecha de Corte actual
            (<strong style={{ color: '#06b6d4' }}>{alert.statusDate}</strong>).
            No es lógicamente posible reportar progreso en una actividad que aún no ha comenzado según el cronograma.
          </p>
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 6, padding: '10px 14px', fontSize: 11, lineHeight: 1.7,
          }}>
            <strong>Acción requerida:</strong> Para registrar un avance, debe modificar manualmente la
            fecha de <em>Comienzo Real (Actual Start)</em> a una fecha igual o anterior a la Fecha de Corte actual
            (<strong>{alert.statusDate}</strong>). Luego podrá ingresar el porcentaje de avance.
          </div>
        </div>
      );
    }

    if (alert.kind === 'logica-rota') {
      return (
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <p style={{ margin: '0 0 10px' }}>
            Está reportando progreso <strong>fuera de secuencia</strong> en la actividad{' '}
            <strong style={{ color: 'var(--text-heading)' }}>{alert.activityId}</strong> – {alert.activityName}.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            Las siguientes actividades predecesoras con relación Fin-Comienzo (FS) aún no están finalizadas al 100%:
          </p>
          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 6, padding: '10px 14px', fontSize: 11,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(alert.predecessorIds || []).map(id => (
                <span key={id} style={{
                  padding: '2px 8px', background: 'rgba(245,158,11,0.15)',
                  borderRadius: 4, fontFamily: 'monospace', fontWeight: 600, color: '#f59e0b',
                }}>{id}</span>
              ))}
            </div>
          </div>
          <p style={{ margin: '10px 0 0' }}>
            Corrija la secuencia o revise la lógica de red para no invalidar el cálculo CPM.
            Puede continuar bajo su responsabilidad, pero el cronograma podría mostrar resultados inconsistentes.
          </p>
        </div>
      );
    }

    if (alert.kind === 'merge-blocked') {
      return (
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <p style={{ margin: '0 0 10px' }}>
            No se puede fusionar este escenario con el programa maestro porque contiene los siguientes errores de integridad:
          </p>

          {(alert.mergeErrors || []).length > 0 && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 6, padding: '10px 14px', marginBottom: 10,
            }}>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 6, fontSize: 11 }}>
                Errores bloqueantes:
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.8 }}>
                {(alert.mergeErrors || []).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {(alert.mergeWarnings || []).length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 6, padding: '10px 14px',
            }}>
              <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: 6, fontSize: 11 }}>
                Advertencias:
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.8 }}>
                {(alert.mergeWarnings || []).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ margin: '10px 0 0', fontWeight: 600 }}>
            Corrija los errores de integridad antes de aplicar este escenario al programa maestro.
          </p>
        </div>
      );
    }
    return null;
  };

  const isWarning = alert.kind === 'logica-rota';

  return (
    <div className="modal-overlay open" onClick={onClose}
      style={{ zIndex: 10000 }}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '90vw',
          border: `1px solid ${isWarning ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {ICONS[alert.kind]}
            <h3 style={{ margin: 0, fontSize: 15, color: isWarning ? '#f59e0b' : '#ef4444' }}>
              {TITLES[alert.kind]}
            </h3>
          </div>
          <button className="modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '16px 20px' }}>
          {renderBody()}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px', borderTop: '1px solid var(--border-primary)',
        }}>
          {isWarning && onProceed && (
            <button onClick={() => { onProceed(); onClose(); }}
              style={{
                padding: '6px 16px', fontSize: 12,
                background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, cursor: 'pointer',
              }}>
              Continuar de todas formas
            </button>
          )}
          <button onClick={onClose}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 600,
              background: isWarning ? '#f59e0b' : '#ef4444', color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer',
            }}>
            {isWarning ? 'Cerrar' : 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Validation utility functions
// ═══════════════════════════════════════════════════════════════════

import type { Activity } from '../../types/gantt';

/**
 * Check if an activity can receive progress given the status date.
 * Returns null if OK, or an alert object if blocked.
 */
export function validateProgressDataDate(
  activity: Activity,
  newPct: number,
  statusDate: Date | null,
  fmtDateFn: (d: Date) => string,
): ScenarioAlert | null {
  if (newPct <= 0) return null;
  if (!statusDate) return null;
  if ((activity.pct || 0) > 0) return null; // already has progress, allow changes

  // If the activity already has an actualStart <= statusDate, OK
  if (activity.actualStart) {
    const as = new Date(activity.actualStart + 'T00:00:00');
    if (as <= statusDate) return null;
  }

  // Check: is the planned start AFTER the status date?
  const es = activity.ES;
  if (es && es > statusDate) {
    return {
      kind: 'avance-improcedente',
      activityId: activity.id,
      activityName: activity.name,
      statusDate: fmtDateFn(statusDate),
    };
  }

  return null;
}

/**
 * Check for out-of-sequence progress (Lógica Rota).
 * Returns null if OK, or an alert with the list of incomplete FS predecessors.
 */
export function validateOutOfSequence(
  activity: Activity,
  newPct: number,
  allActivities: Activity[],
): ScenarioAlert | null {
  if (newPct <= 0) return null;
  if ((activity.pct || 0) > 0) return null; // already has progress, skip re-check

  const byId = new Map<string, Activity>();
  allActivities.forEach(a => byId.set(a.id, a));

  const incompleteFSPreds: string[] = [];
  (activity.preds || []).forEach(p => {
    if (p.type === 'FS') {
      const pred = byId.get(p.id);
      if (pred && (pred.pct || 0) < 100) {
        incompleteFSPreds.push(p.id);
      }
    }
  });

  if (incompleteFSPreds.length === 0) return null;

  return {
    kind: 'logica-rota',
    activityId: activity.id,
    activityName: activity.name,
    predecessorIds: incompleteFSPreds,
  };
}

/**
 * Validate a scenario before merging to master.
 * Returns null if clean, or a merge-blocked alert.
 * 
 * SANDBOX RULE: No scenario can be merged if:
 * - An activity has progress but its planned start is after Data Date w/o valid actualStart (blocking error)
 * - An activity has progress but is missing actualStart entirely (blocking error)
 * - An activity has out-of-sequence progress (FS predecessors incomplete) (blocking error – lógica rota)
 */
export function validateScenarioForMerge(
  scenarioActivities: Activity[],
  statusDate: Date | null,
  fmtDateFn: (d: Date) => string,
): ScenarioAlert | null {
  const errors: string[] = [];
  const warnings: string[] = [];

  const byId = new Map<string, Activity>();
  scenarioActivities.forEach(a => byId.set(a.id, a));

  scenarioActivities.forEach(a => {
    if (a._isProjRow || a.type === 'summary' || a.type === 'milestone') return;
    const pct = a.pct || 0;

    // Error: Progress on activity whose start is after status date (without valid actualStart)
    if (pct > 0 && statusDate) {
      const hasValidActualStart = a.actualStart &&
        new Date(a.actualStart + 'T00:00:00') <= statusDate;
      if (!hasValidActualStart && a.ES && a.ES > statusDate) {
        errors.push(
          `${a.id} (${a.name}): Avance ${pct}% con inicio planificado posterior a Fecha de Corte (${fmtDateFn(statusDate)}). Debe establecer un Inicio Real válido.`
        );
      }
    }

    // Error: Progress > 0 but actualStart is missing entirely
    if (pct > 0 && !a.actualStart) {
      errors.push(
        `${a.id} (${a.name}): Avance ${pct}% sin Fecha de Inicio Real (Actual Start). Debe registrar una fecha de inicio real antes de fusionar.`
      );
    }

    // Error (Lógica Rota): Out-of-sequence progress (FS predecessors incomplete)
    // Per sandbox rules, broken logic sequences BLOCK merge — they are not mere warnings.
    if (pct > 0 && a.preds) {
      const incompletePreds = a.preds
        .filter(p => p.type === 'FS')
        .filter(p => {
          const pred = byId.get(p.id);
          return pred && (pred.pct || 0) < 100;
        })
        .map(p => p.id);
      if (incompletePreds.length > 0) {
        errors.push(
          `${a.id} (${a.name}): Lógica rota — progreso fuera de secuencia. Predecesoras FS incompletas: ${incompletePreds.join(', ')}. Corrija la secuencia o justifique antes de fusionar.`
        );
      }
    }
  });

  if (errors.length === 0 && warnings.length === 0) return null;

  return { kind: 'merge-blocked', mergeErrors: errors, mergeWarnings: warnings };
}
