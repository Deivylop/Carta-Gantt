// ═══════════════════════════════════════════════════════════════════
// ScenarioList – Sidebar list for managing What-If scenarios
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useGantt } from '../../store/GanttContext';
import { Plus, Trash2, Copy, Edit3, Check, X, GitBranch } from 'lucide-react';

export default function ScenarioList() {
  const { state, dispatch } = useGantt();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    dispatch({ type: 'CREATE_SCENARIO', name: newName.trim(), description: newDesc.trim() });
    setNewName('');
    setNewDesc('');
    setCreating(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este escenario?')) {
      dispatch({ type: 'DELETE_SCENARIO', id });
    }
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    dispatch({ type: 'RENAME_SCENARIO', id, name: editName.trim() });
    setEditingId(null);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-panel)', borderRight: '1px solid var(--border-primary)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--border-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GitBranch size={14} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)' }}>Escenarios</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', fontSize: 11, fontWeight: 500,
            background: '#6366f1', color: '#fff', border: 'none',
            borderRadius: 5, cursor: 'pointer',
          }}
        >
          <Plus size={12} /> Nuevo
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-hover)' }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre del escenario"
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            style={{
              width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 6,
              background: 'var(--bg-input)', color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)', borderRadius: 4,
            }}
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Descripción (opcional)"
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            style={{
              width: '100%', padding: '6px 8px', fontSize: 11, marginBottom: 8,
              background: 'var(--bg-input)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-primary)', borderRadius: 4,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCreate} style={{ flex: 1, padding: '5px 0', fontSize: 11, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Crear
            </button>
            <button onClick={() => setCreating(false)} style={{ flex: 1, padding: '5px 0', fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Scenario list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        {state.scenarios.length === 0 && !creating && (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No hay escenarios aún.<br />
            Crea uno para simular cambios sin afectar el programa maestro.
          </div>
        )}
        {state.scenarios.map(sc => {
          const isActive = state.activeScenarioId === sc.id;
          const isEditing = editingId === sc.id;

          return (
            <div
              key={sc.id}
              onClick={() => dispatch({ type: 'SET_ACTIVE_SCENARIO', id: isActive ? null : sc.id })}
              style={{
                padding: '10px 14px', margin: '2px 6px', borderRadius: 6, cursor: 'pointer',
                background: isActive ? 'var(--bg-selected)' : 'transparent',
                border: isActive ? `1px solid ${sc.color}44` : '1px solid transparent',
                transition: 'all .15s ease',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget.style.background = 'var(--bg-hover)'); }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget.style.background = 'transparent'); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {/* Color dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: sc.color, flexShrink: 0,
                }} />

                {isEditing ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(sc.id); if (e.key === 'Escape') setEditingId(null); }}
                    style={{
                      flex: 1, padding: '2px 6px', fontSize: 12,
                      background: 'var(--bg-input)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)', borderRadius: 3,
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sc.name}
                  </span>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleRename(sc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 2 }}>
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(sc.id); setEditName(sc.name); }} title="Renombrar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                        <Edit3 size={11} />
                      </button>
                      <button onClick={() => dispatch({ type: 'DUPLICATE_SCENARIO', scenarioId: sc.id })} title="Duplicar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                        <Copy size={11} />
                      </button>
                      <button onClick={() => handleDelete(sc.id)} title="Eliminar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {sc.description && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 16, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sc.description}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 16 }}>
                {sc.changes.length} cambio{sc.changes.length !== 1 ? 's' : ''} · {new Date(sc.createdAt).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
