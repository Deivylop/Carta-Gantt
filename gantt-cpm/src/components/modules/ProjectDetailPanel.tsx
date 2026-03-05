// ═══════════════════════════════════════════════════════════════════
// ProjectDetailPanel – P6-style detail panel below the project tree
// Tabs: General | Fechas | Valores por defecto | Códigos | Bloc de notas
// Shows when a project is selected; styled like the BaselineModal tabs
// ═══════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react';
import { usePortfolio } from '../../store/PortfolioContext';
import type { ProjectMeta } from '../../types/portfolio';
import { updateSupabaseProjectName } from '../../utils/supabaseSync';

type Tab = 'general' | 'fechas' | 'defaults' | 'codigos' | 'notas';

const TABS: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'fechas', label: 'Fechas' },
    { key: 'defaults', label: 'Valores por defecto' },
    { key: 'codigos', label: 'Códigos' },
    { key: 'notas', label: 'Bloc de notas' },
];

interface Props {
    projectId: string;
    customCalendars?: { name: string }[];
}

// ── Shared input styles ──
const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
};
const valStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-primary)', padding: '4px 8px',
    background: 'var(--bg-input)', border: '1px solid var(--border-secondary)',
    borderRadius: 4, width: '100%', outline: 'none',
};
const rowStyle: React.CSSProperties = {
    display: 'flex', gap: 16, marginBottom: 10,
};
const fieldStyle: React.CSSProperties = {
    flex: 1, minWidth: 0,
};

export default function ProjectDetailPanel({ projectId, customCalendars = [] }: Props) {
    const { state, dispatch } = usePortfolio();
    const [tab, setTab] = useState<Tab>('general');

    const project = state.projects.find(p => p.id === projectId);
    if (!project) return null;

    const update = useCallback((updates: Partial<ProjectMeta>) => {
        dispatch({ type: 'UPDATE_PROJECT', id: projectId, updates });
        if (updates.name && project?.supabaseId) {
            updateSupabaseProjectName(project.supabaseId, updates.name);
        }
    }, [dispatch, projectId, project?.supabaseId]);

    // ── Tab: General ──
    const renderGeneral = () => (
        <div style={{ padding: '12px 16px' }}>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Nombre del Proyecto</div>
                    <input style={valStyle} value={project.name}
                        onChange={e => update({ name: e.target.value })} />
                </div>
                <div style={{ ...fieldStyle, maxWidth: 140 }}>
                    <div style={labelStyle}>Código</div>
                    <input style={valStyle} value={project.code}
                        onChange={e => update({ code: e.target.value })} />
                </div>
                <div style={{ ...fieldStyle, maxWidth: 80 }}>
                    <div style={labelStyle}>Prioridad</div>
                    <input style={valStyle} type="number" min={1} value={project.priority}
                        onChange={e => update({ priority: parseInt(e.target.value) || 1 })} />
                </div>
            </div>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Estado</div>
                    <select style={valStyle} value={project.status}
                        onChange={e => update({ status: e.target.value as ProjectMeta['status'] })}>
                        <option value="Planificación">Planificación</option>
                        <option value="Ejecución">Ejecución</option>
                        <option value="Suspendido">Suspendido</option>
                        <option value="Completado">Completado</option>
                    </select>
                </div>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Descripción</div>
                    <input style={valStyle} value={project.description}
                        onChange={e => update({ description: e.target.value })} />
                </div>
            </div>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Actividades</div>
                    <div style={{ ...valStyle, background: 'transparent', border: 'none', color: 'var(--text-heading)', fontWeight: 600 }}>
                        {project.activityCount} total · {project.completedCount} completadas · {project.criticalCount} críticas
                    </div>
                </div>
                <div style={{ ...fieldStyle, maxWidth: 180 }}>
                    <div style={labelStyle}>Avance Global</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${project.globalPct}%`, height: '100%', background: '#6366f1', borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>{project.globalPct}%</span>
                    </div>
                </div>
            </div>
        </div>
    );

    // ── Tab: Fechas ──
    const renderFechas = () => (
        <div style={{ padding: '12px 16px' }}>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Fecha de Inicio</div>
                    <input style={valStyle} type="date"
                        value={project.startDate ? project.startDate.slice(0, 10) : ''}
                        onChange={e => update({ startDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Fecha de Fin</div>
                    <input style={valStyle} type="date"
                        value={project.endDate ? project.endDate.slice(0, 10) : ''}
                        onChange={e => update({ endDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Fecha de Corte (Status)</div>
                    <input style={valStyle} type="date"
                        value={project.statusDate ? project.statusDate.slice(0, 10) : ''}
                        onChange={e => update({ statusDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
            </div>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Creado</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(project.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Última Actualización</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(project.updatedAt).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </div>
    );

    // ── Tab: Valores por defecto ──
    const renderDefaults = () => (
        <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                Valores por defecto para actividades nuevas
            </div>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Tipo de duración</div>
                    <select style={valStyle} value={project.durationType || 'Fija Duración y Unidades'}
                        onChange={e => update({ durationType: e.target.value })}>
                        <option>Fija Duración y Unidades</option>
                        <option>Fija Unidades/Tiempo</option>
                        <option>Fija Unidades</option>
                        <option>Fija Duración y Unidades/Tiempo</option>
                    </select>
                </div>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Tipo de porcentaje finalizado</div>
                    <select style={valStyle} value={project.pctCompleteType || 'Duración'}
                        onChange={e => update({ pctCompleteType: e.target.value })}>
                        <option>Físico</option>
                        <option>Duración</option>
                        <option>Unidades</option>
                    </select>
                </div>
            </div>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Tipo de actividad</div>
                    <select style={valStyle} value={project.activityType || 'Dependiente de tarea'}
                        onChange={e => update({ activityType: e.target.value })}>
                        <option>Dependiente de tarea</option>
                        <option>Dependiente de recurso</option>
                        <option>Nivel de esfuerzo</option>
                        <option>Hito de inicio</option>
                        <option>Hito de fin</option>
                    </select>
                </div>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Calendario</div>
                    <select style={valStyle} value={project.defaultCalendar === 'Estándar' ? '6' : (project.defaultCalendar || '6')}
                        onChange={e => update({ defaultCalendar: e.target.value })}>
                        <option value="5">5 días - Lunes a Viernes</option>
                        <option value="6">6 días - Lunes a Sábado</option>
                        <option value="7">7 días - Continuo</option>
                        {customCalendars.map(c => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div style={rowStyle}>
                <div style={{ ...fieldStyle, maxWidth: 180 }}>
                    <div style={labelStyle}>Prefijo de ID de actividad</div>
                    <input style={valStyle} value={project.actIdPrefix || ''}
                        placeholder="A"
                        onChange={e => update({ actIdPrefix: e.target.value })} />
                </div>
                <div style={{ ...fieldStyle, maxWidth: 180 }}>
                    <div style={labelStyle}>Sufijo de ID de actividad</div>
                    <input style={valStyle} value={project.actIdSuffix || ''}
                        placeholder=""
                        onChange={e => update({ actIdSuffix: e.target.value })} />
                </div>
                <div style={{ ...fieldStyle, maxWidth: 120 }}>
                    <div style={labelStyle}>Incremento</div>
                    <input style={valStyle} type="number" min={1} value={project.actIdIncrement || 10}
                        onChange={e => update({ actIdIncrement: parseInt(e.target.value) || 10 })} />
                </div>
            </div>
        </div>
    );

    // ── Tab: Códigos ──
    const renderCodigos = () => (
        <div style={{ padding: '12px 16px' }}>
            <div style={rowStyle}>
                <div style={{ ...fieldStyle, maxWidth: 200 }}>
                    <div style={labelStyle}>Código de Proyecto</div>
                    <input style={valStyle} value={project.code}
                        onChange={e => update({ code: e.target.value })} />
                </div>
                <div style={fieldStyle}>
                    <div style={labelStyle}>Supabase ID</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', padding: '4px 0' }}>
                        {project.supabaseId || '— No vinculado —'}
                    </div>
                </div>
            </div>
            <div style={rowStyle}>
                <div style={fieldStyle}>
                    <div style={labelStyle}>ID interno</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', padding: '4px 0' }}>
                        {project.id}
                    </div>
                </div>
            </div>
        </div>
    );

    // ── Tab: Bloc de notas ──
    const renderNotas = () => (
        <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <textarea
                style={{
                    ...valStyle, flex: 1, resize: 'none', minHeight: 80,
                    fontFamily: 'inherit', lineHeight: 1.5,
                }}
                value={project.notes || ''}
                onChange={e => update({ notes: e.target.value })}
                placeholder="Notas del proyecto..."
            />
        </div>
    );

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            borderTop: '2px solid var(--border-primary)',
            background: 'var(--bg-panel)',
        }}>
            {/* ── Tabs ── */}
            <div style={{
                display: 'flex', gap: 0,
                borderBottom: '2px solid var(--border-primary)',
                background: 'var(--bg-ribbon)',
                flexShrink: 0,
                overflowX: 'auto',
            }}>
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            padding: '6px 14px', fontSize: 10, fontWeight: tab === t.key ? 700 : 400,
                            color: tab === t.key ? '#6366f1' : 'var(--text-muted)',
                            background: 'transparent', border: 'none',
                            borderBottom: tab === t.key ? '2px solid #6366f1' : '2px solid transparent',
                            cursor: 'pointer', marginBottom: -2, whiteSpace: 'nowrap',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <div style={{
                    fontSize: 10, color: 'var(--text-muted)', padding: '6px 12px',
                    display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    📁 {project.name}
                </div>
            </div>

            {/* ── Tab Content ── */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {tab === 'general' && renderGeneral()}
                {tab === 'fechas' && renderFechas()}
                {tab === 'defaults' && renderDefaults()}
                {tab === 'codigos' && renderCodigos()}
                {tab === 'notas' && renderNotas()}
            </div>
        </div>
    );
}
