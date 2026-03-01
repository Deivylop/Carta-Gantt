// ═══════════════════════════════════════════════════════════════════
// RiskRegisterPanel – CRUD for risk events register
// Each risk has probability, impact, affected activities, etc.
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import type { RiskEvent, RiskCategory } from '../../types/risk';
import { createBlankRiskEvent } from '../../types/risk';
import { Plus, Trash2, Edit3, Save, X } from 'lucide-react';

const CATEGORIES: RiskCategory[] = [
  'Técnico', 'Externo', 'Organizacional', 'Gestión',
  'Clima', 'Suministro', 'Regulatorio', 'Diseño',
  'Subcontrato', 'Otro',
];

export default function RiskRegisterPanel() {
  const { state, dispatch } = useGantt();
  const risks = state.riskState.riskEvents;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RiskEvent | null>(null);

  const tasks = useMemo(
    () => state.activities.filter(a => !a._isProjRow && a.type === 'task' && !a.id.startsWith('__')),
    [state.activities],
  );

  const handleAdd = useCallback(() => {
    const evt = createBlankRiskEvent();
    setDraft(evt);
    setEditingId(evt.id);
  }, []);

  const handleEdit = useCallback((evt: RiskEvent) => {
    setDraft({ ...evt, affectedActivityIds: [...evt.affectedActivityIds] });
    setEditingId(evt.id);
  }, []);

  const handleSave = useCallback(() => {
    if (!draft) return;
    if (!draft.name.trim()) { alert('El nombre del riesgo es requerido.'); return; }
    const existing = risks.find(r => r.id === draft.id);
    if (existing) {
      dispatch({ type: 'UPDATE_RISK_EVENT', event: draft });
    } else {
      dispatch({ type: 'ADD_RISK_EVENT', event: draft });
    }
    setEditingId(null);
    setDraft(null);
  }, [draft, risks, dispatch]);

  const handleCancel = useCallback(() => {
    // If it was a new event not yet saved, just discard
    setEditingId(null);
    setDraft(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (!confirm('¿Eliminar este riesgo?')) return;
    dispatch({ type: 'DELETE_RISK_EVENT', eventId: id });
    if (editingId === id) { setEditingId(null); setDraft(null); }
  }, [editingId, dispatch]);

  const toggleAffected = useCallback((actId: string) => {
    if (!draft) return;
    const ids = [...draft.affectedActivityIds];
    const idx = ids.indexOf(actId);
    if (idx >= 0) ids.splice(idx, 1);
    else ids.push(actId);
    setDraft({ ...draft, affectedActivityIds: ids });
  }, [draft]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
      }}>
        <button onClick={handleAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
            fontSize: 11, fontWeight: 600, background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: 5, cursor: 'pointer',
          }}>
          <Plus size={12} /> Nuevo Riesgo
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {risks.length} riesgo{risks.length !== 1 ? 's' : ''} registrado{risks.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
        {/* Risk list table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={thS}>Riesgo</th>
                <th style={thS}>Prob. (%)</th>
                <th style={thS}>Impacto</th>
                <th style={thS}>Actividades</th>
                <th style={thS}>Categoría</th>
                <th style={thS}>Mitigado</th>
                <th style={thS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                  <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{r.name}</td>
                  <td style={tdS}>
                    <span style={{ color: r.probability >= 70 ? '#ef4444' : r.probability >= 40 ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                      {r.probability}%
                    </span>
                  </td>
                  <td style={tdS}>
                    {r.impactType === 'addDays' ? `+${r.impactValue}d` : `×${r.impactValue}`}
                  </td>
                  <td style={tdS}>{r.affectedActivityIds.length} act.</td>
                  <td style={tdS}>{r.category}</td>
                  <td style={tdS}>{r.mitigated ? `✓ (${r.mitigatedProbability ?? r.probability}%)` : '—'}</td>
                  <td style={tdS}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => handleEdit(r)} style={btnMini} title="Editar"><Edit3 size={11} /></button>
                      <button onClick={() => handleDelete(r.id)} style={{ ...btnMini, color: '#ef4444' }} title="Eliminar"><Trash2 size={11} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {risks.length === 0 && !editingId && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No hay riesgos registrados. Haz clic en "Nuevo Riesgo" para agregar uno.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Edit form (side panel) */}
        {editingId && draft && (
          <div style={{
            width: 300, flexShrink: 0, borderLeft: '1px solid var(--border-primary)',
            overflow: 'auto', padding: 12, background: 'var(--bg-panel)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>
              {risks.find(r => r.id === draft.id) ? 'Editar Riesgo' : 'Nuevo Riesgo'}
            </div>

            <label style={lblS}>
              Nombre:
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={inpS} placeholder="Ej: Lluvia prolongada" />
            </label>

            <label style={lblS}>
              Descripción:
              <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
                style={{ ...inpS, height: 48, resize: 'vertical' }} />
            </label>

            <label style={lblS}>
              Categoría:
              <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as RiskCategory })} style={inpS}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label style={lblS}>
              Probabilidad (%):
              <input type="number" min={0} max={100} value={draft.probability}
                onChange={e => setDraft({ ...draft, probability: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                style={inpS} />
            </label>

            <label style={lblS}>
              Tipo de impacto:
              <select value={draft.impactType} onChange={e => setDraft({ ...draft, impactType: e.target.value as 'addDays' | 'multiply' })} style={inpS}>
                <option value="addDays">Agregar días</option>
                <option value="multiply">Multiplicar duración</option>
              </select>
            </label>

            <label style={lblS}>
              Valor del impacto:
              <input type="number" step={draft.impactType === 'multiply' ? 0.1 : 1} min={0}
                value={draft.impactValue}
                onChange={e => setDraft({ ...draft, impactValue: parseFloat(e.target.value) || 0 })}
                style={inpS} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {draft.impactType === 'addDays' ? 'días adicionales' : 'factor multiplicador (ej: 1.3 = +30%)'}
              </span>
            </label>

            <label style={lblS}>
              Responsable:
              <input value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })} style={inpS} />
            </label>

            {/* Mitigation */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={draft.mitigated}
                onChange={e => setDraft({ ...draft, mitigated: e.target.checked })} />
              Riesgo mitigado
            </label>
            {draft.mitigated && (
              <div style={{ marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={lblS}>
                  Prob. post-mitigación (%):
                  <input type="number" min={0} max={100} value={draft.mitigatedProbability ?? ''}
                    onChange={e => setDraft({ ...draft, mitigatedProbability: parseInt(e.target.value) || undefined })}
                    style={inpS} placeholder={String(draft.probability)} />
                </label>
                <label style={lblS}>
                  Impacto post-mitigación:
                  <input type="number" step={draft.impactType === 'multiply' ? 0.1 : 1} min={0}
                    value={draft.mitigatedImpactValue ?? ''}
                    onChange={e => setDraft({ ...draft, mitigatedImpactValue: parseFloat(e.target.value) || undefined })}
                    style={inpS} placeholder={String(draft.impactValue)} />
                </label>
              </div>
            )}

            {/* Affected activities */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
              Actividades afectadas ({draft.affectedActivityIds.length}):
            </div>
            <div style={{
              maxHeight: 180, overflow: 'auto', border: '1px solid var(--border-primary)',
              borderRadius: 4, padding: 4, background: 'var(--bg-input)',
            }}>
              {tasks.map(a => {
                const checked = draft.affectedActivityIds.includes(a.id);
                return (
                  <label key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '2px 4px', fontSize: 10, cursor: 'pointer',
                    background: checked ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderRadius: 3,
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAffected(a.id)} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  </label>
                );
              })}
            </div>

            {/* Notes */}
            <label style={lblS}>
              Notas:
              <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}
                style={{ ...inpS, height: 40, resize: 'vertical' }} />
            </label>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={handleSave} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '6px 0', fontSize: 11, fontWeight: 600,
                background: '#22c55e', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer',
              }}>
                <Save size={12} /> Guardar
              </button>
              <button onClick={handleCancel} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '6px 0', fontSize: 11, fontWeight: 500,
                background: 'var(--bg-input)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-primary)', borderRadius: 5, cursor: 'pointer',
              }}>
                <X size={12} /> Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const thS: React.CSSProperties = { padding: '6px 8px', textAlign: 'center', fontWeight: 600, fontSize: 10, borderBottom: '2px solid var(--border-primary)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
const tdS: React.CSSProperties = { padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap' };
const btnMini: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--text-secondary)' };
const lblS: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-secondary)' };
const inpS: React.CSSProperties = { fontSize: 11, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
