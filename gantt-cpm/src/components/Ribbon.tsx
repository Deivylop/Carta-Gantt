// ═══════════════════════════════════════════════════════════════════
// Ribbon Toolbar – MS Project style, fully wired
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useRef } from 'react';
import { useGantt } from '../store/GanttContext';
import { newActivity, isoDate, parseDate } from '../utils/cpm';
import { autoId, exportJSON, exportCSV, importJSONData, importCSVData } from '../utils/helpers';
import {
    Plus, Trash2, ArrowRight, ClipboardPaste, Scissors, Settings, Calculator, BarChart3, Sun, Moon, Clock,
    TrendingUp, LineChart, FileText, Diamond, ArrowLeft, ArrowUp, ArrowDown, Info, Undo2, Cloud, Database, Upload, Download, LayoutTemplate, Users, CalendarDays
} from 'lucide-react';
import type { ZoomLevel }
    from '../types/gantt';

export default function Ribbon() {
    const { state, dispatch } = useGantt();
    const [tab, setTab] = useState('tarea');
    const jsonRef = useRef<HTMLInputElement>(null);
    const csvRef = useRef<HTMLInputElement>(null);

    // activity lookup not needed currently

    const addAct = () => {
        dispatch({ type: 'PUSH_UNDO' });
        const a = newActivity(autoId(state.activities), state.defCal);
        a.name = 'Nueva Actividad';
        dispatch({ type: 'ADD_ACTIVITY', activity: a, atIndex: state.selIdx >= 0 ? state.selIdx + 1 : undefined });
    };
    const addSummary = () => {
        dispatch({ type: 'PUSH_UNDO' });
        const a = newActivity(autoId(state.activities), state.defCal);
        a.name = 'Nueva Tarea Resumen'; a.type = 'summary'; a.dur = 0;
        dispatch({ type: 'ADD_ACTIVITY', activity: a, atIndex: state.selIdx >= 0 ? state.selIdx + 1 : undefined });
    };
    const addMilestone = () => {
        dispatch({ type: 'PUSH_UNDO' });
        const a = newActivity(autoId(state.activities), state.defCal);
        a.name = 'Nuevo Hito'; a.type = 'milestone'; a.dur = 0;
        dispatch({ type: 'ADD_ACTIVITY', activity: a, atIndex: state.selIdx >= 0 ? state.selIdx + 1 : undefined });
    };
    const deleteAct = () => {
        if (state.selIdx < 0) return;
        const a = state.activities[state.selIdx];
        if (a._isProjRow) { alert('No se puede eliminar la fila resumen del proyecto (EDT 0).'); return; }
        if (!confirm('¿Eliminar actividad ' + a.id + '?')) return;
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'DELETE_ACTIVITY', index: state.selIdx });
    };

    const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (!f) return;
        const r = new FileReader();
        r.onload = ev => {
            const data = importJSONData(ev.target?.result as string, state.defCal);
            if (data) {
                dispatch({
                    type: 'LOAD_STATE', state: {
                        projStart: data.projStart, projName: data.projName, defCal: data.defCal,
                        statusDate: data.statusDate, activities: data.activities, resourcePool: data.resourcePool,
                        selIdx: data.activities.length ? 0 : -1,
                    }
                });
            }
        };
        r.readAsText(f); e.target.value = '';
    };
    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (!f) return;
        const r = new FileReader();
        r.onload = ev => {
            const acts = importCSVData(ev.target?.result as string, state.defCal, state.resourcePool);
            if (acts) {
                dispatch({ type: 'LOAD_STATE', state: { activities: acts, selIdx: acts.length ? 0 : -1 } });
                alert(acts.length + ' actividades importadas');
            }
        };
        r.readAsText(f); e.target.value = '';
    };

    return (
        <div className="ribbon">
            {/* Tabs Row */}
            <div className="ribbon-tabs">
                <div className="ribbon-brand">📊 Carta Gantt CPM</div>
                {['Tarea', 'Proyecto', 'Vista', 'Datos'].map(t => (
                    <button key={t} className={`ribbon-tab ${tab === t.toLowerCase() ? 'active' : ''}`} onClick={() => setTab(t.toLowerCase())}>{t}</button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="ribbon-body">
                {tab === 'tarea' && <>
                    <RG label="INSERTAR">
                        <RB icon={<Plus size={16} />} label="Actividad" onClick={addAct} />
                        <RB icon={<FileText size={16} />} label="Resumen" onClick={addSummary} />
                        <RB icon={<Diamond size={16} />} label="Hito" onClick={addMilestone} />
                        <RB icon={<Trash2 size={16} />} label="Eliminar" onClick={deleteAct} />
                    </RG>
                    <RG label="ESQUEMA">
                        <RB icon={<ArrowRight size={14} />} label="Indentar" onClick={() => dispatch({ type: 'INDENT', dir: 1 })} />
                        <RB icon={<ArrowLeft size={14} />} label="Des-indentar" onClick={() => dispatch({ type: 'INDENT', dir: -1 })} />
                    </RG>
                    <RG label="EDICIÓN">
                        <RB icon={<ArrowUp size={14} />} label="" onClick={() => dispatch({ type: 'MOVE_ROW', dir: -1 })} />
                        <RB icon={<ArrowDown size={14} />} label="" onClick={() => dispatch({ type: 'MOVE_ROW', dir: 1 })} />
                        <RB icon={<Scissors size={14} />} label="Cortar" onClick={() => dispatch({ type: 'CUT_ACTIVITY' })} />
                        <RB icon={<ClipboardPaste size={14} />} label="Pegar" onClick={() => dispatch({ type: 'PASTE_ACTIVITY' })} />
                    </RG>
                    <RG label="PROPIEDADES">
                        <RB icon={<Info size={16} />} label="Info" onClick={() => { if (state.selIdx >= 0) dispatch({ type: 'OPEN_ACT_MODAL' }); }} />
                        <RB icon={<Undo2 size={16} />} label="Deshacer" onClick={() => dispatch({ type: 'UNDO' })} />
                    </RG>
                    {/* Legend */}
                    <div className="legend">
                        <span className="legend-dot" style={{ background: '#ef4444' }} /> <span>Crítica</span>
                        <span className="legend-dot" style={{ background: '#3b82f6' }} /> <span>Normal</span>
                        <span className="legend-diamond" style={{ background: '#fbbf24' }} /> <span>Hito</span>
                        <span className="legend-line" style={{ background: '#f59e0b' }} /> <span>Hoy</span>
                        <span className="legend-dot" style={{ background: '#22c55e' }} /> <span>Avance</span>
                        <span className="legend-line" style={{ background: '#06b6d4' }} /> <span>Status Date</span>
                        <span className="legend-dot" style={{ background: '#6b7280' }} /> <span>Línea Base</span>
                    </div>
                </>}

                {tab === 'proyecto' && <>
                    <RG label="PROYECTO">
                        <RB icon={<Settings size={16} />} label="Configuración" onClick={() => dispatch({ type: 'OPEN_PROJ_MODAL' })} />
                        <RB icon={<Calculator size={16} />} label="Calcular CPM" onClick={() => dispatch({ type: 'RECALC_CPM' })} />
                    </RG>
                    <RG label="FECHA DE CORTE">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                <Clock size={12} />
                                <input type="date" className="form-input" style={{ fontSize: 10, padding: '2px 4px', width: 110 }}
                                    value={isoDate(state.statusDate)}
                                    onChange={e => { const d = parseDate(e.target.value); if (d) dispatch({ type: 'SET_PROJECT_CONFIG', config: { statusDate: d } }); }} />
                            </div>
                            <span style={{ fontSize: 9, color: '#64748b', maxWidth: 120, lineHeight: 1.1 }}>Se considera al final del día</span>
                        </div>
                    </RG>
                    <RG label="LÍNEA BASE">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                            <button className="rbtn" style={{ fontSize: 10, padding: '4px 10px', whiteSpace: 'nowrap' }}
                                onClick={() => dispatch({ type: 'OPEN_BL_MODAL' })}>
                                📊 Líneas Base
                            </button>
                            {state.activities.some(a => a.baselines?.[state.activeBaselineIdx]) && (
                                <span style={{ fontSize: 9, color: '#60a5fa', fontWeight: 600, textAlign: 'center', lineHeight: 1.1 }}>
                                    LB {state.activeBaselineIdx} activa
                                </span>
                            )}
                        </div>
                    </RG>
                    <RG label="PROGRESO">
                        <RB icon={<TrendingUp size={16} />} label="Progreso Semanal" onClick={() => dispatch({ type: 'OPEN_PROGRESS_MODAL' })} />
                    </RG>
                    <RG label="EDT">
                        <RB label="EDT 0" active={state.showProjRow} onClick={() => dispatch({ type: 'SET_SHOW_PROJ_ROW', show: !state.showProjRow })} />
                    </RG>
                    <RG label="CALENDARIOS">
                        <RB icon={<CalendarDays size={16} />} label="Calendarios" onClick={() => dispatch({ type: 'OPEN_CAL_MODAL' })} />
                    </RG>
                </>}

                {tab === 'vista' && <>
                    <RG label="VISTAS">
                        <RB icon={<BarChart3 size={16} />} label="Diagrama de Gantt" active={state.currentView === 'gantt'} onClick={() => dispatch({ type: 'SET_VIEW', view: 'gantt' })} />
                        <RB label="Hoja de Recursos" active={state.currentView === 'resources'} onClick={() => dispatch({ type: 'SET_VIEW', view: 'resources' })} />
                        <RB icon={<LineChart size={16} />} label="Curva S" active={state.currentView === 'scurve'} onClick={() => dispatch({ type: 'SET_VIEW', view: 'scurve' })} />
                        <RB icon={<LayoutTemplate size={16} />} label="Uso de Tareas" active={state.currentView === 'usage'} onClick={() => dispatch({ type: 'SET_VIEW', view: 'usage' })} />
                        <RB icon={<Users size={16} />} label="Uso de Recursos" active={state.currentView === 'resUsage'} onClick={() => dispatch({ type: 'SET_VIEW', view: 'resUsage' })} />
                    </RG>
                    {(state.currentView === 'usage' || state.currentView === 'resUsage') && (
                        <RG label="USO (MÉTRICAS)">
                            <div style={{ fontSize: 9, lineHeight: 1.3, color: 'var(--text-secondary)', textAlign: 'center', padding: '2px 4px' }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{state.usageModes.length} campo{state.usageModes.length !== 1 ? 's' : ''}</div>
                                <div style={{ fontSize: 8, opacity: 0.7 }}>Clic derecho en<br/>"Detalles" para<br/>configurar</div>
                            </div>
                        </RG>
                    )}
                    <RG label="ZOOM">
                        {(['day', 'week', 'month'] as ZoomLevel[]).map(z => {
                            const isUsageView = state.currentView === 'usage' || state.currentView === 'resUsage';
                            const active = isUsageView ? state.usageZoom === z : state.zoom === z;
                            const onClick = () => isUsageView
                                ? dispatch({ type: 'SET_USAGE_ZOOM', zoom: z as any })
                                : dispatch({ type: 'SET_ZOOM', zoom: z });
                            return <RB key={z} label={z === 'day' ? 'Día' : z === 'week' ? 'Semana' : 'Mes'} active={active} onClick={onClick} />;
                        })}
                        {(state.currentView !== 'usage' && state.currentView !== 'resUsage') && <RB label="Hoy" onClick={() => window.dispatchEvent(new Event('gantt-go-today'))} />}
                    </RG>
                    <RG label="TEMA">
                        <RB icon={state.lightMode ? <Moon size={14} /> : <Sun size={14} />} label={state.lightMode ? '☾ Oscuro' : '☀ Claro'} onClick={() => dispatch({ type: 'TOGGLE_THEME' })} />
                    </RG>
                    <RG label="AGRUPAR">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Agrupar</span>
                            <select className="form-input" style={{ fontSize: 10, padding: '2px 4px' }} value={state.activeGroup}
                                onChange={e => dispatch({ type: 'SET_GROUP', group: e.target.value })}>
                                <option value="none">Sin agrupación</option>
                                <option value="critical">Ruta Crítica</option>
                                <option value="inprogress">En Progreso</option>
                                <option value="notstarted">No Iniciadas</option>
                                <option value="completed">Completadas</option>
                                {state.columns.filter(c => c.key.startsWith('txt')).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                        </div>
                    </RG>
                    <RG label="ESQUEMA">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <select className="form-input" style={{ fontSize: 10, padding: '2px 4px' }}
                                defaultValue=""
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'expand') dispatch({ type: 'EXPAND_ALL' });
                                    else if (val === 'collapse') dispatch({ type: 'COLLAPSE_ALL' });
                                    else dispatch({ type: 'COLLAPSE_TO_LEVEL', level: parseInt(val) });
                                    e.target.value = '';
                                }}>
                                <option value="" disabled>Expandir Todo ▼</option>
                                <option value="expand">Expandir Todo</option>
                                <option value="1">Nivel 1</option>
                                <option value="2">Nivel 2</option>
                                <option value="3">Nivel 3</option>
                                <option value="4">Nivel 4</option>
                                <option value="5">Nivel 5</option>
                                <option value="collapse">Colapsar Todo</option>
                            </select>
                        </div>
                    </RG>
                </>}

                {tab === 'datos' && <>
                    <RG label="EXPORTAR">
                        <RB icon={<Download size={14} />} label="JSON" onClick={() => exportJSON(state.activities, state.projStart, state.projName, state.defCal, state.statusDate, state.resourcePool)} />
                        <RB icon={<Download size={14} />} label="CSV" onClick={() => exportCSV(state.activities, state.projName, state.defCal)} />
                    </RG>
                    <RG label="IMPORTAR">
                        <RB icon={<Upload size={14} />} label="JSON" onClick={() => jsonRef.current?.click()} />
                        <RB icon={<Upload size={14} />} label="CSV" onClick={() => csvRef.current?.click()} />
                        <input ref={jsonRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJSON} />
                        <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
                    </RG>
                    <RG label="SUPABASE">
                        <RB icon={<Cloud size={14} />} label="Guardar" onClick={() => window.dispatchEvent(new Event('sb-force-save'))} />
                        <RB icon={<Database size={14} />} label="Cargar" onClick={() => dispatch({ type: 'OPEN_SB_MODAL' })} />
                        <div className="sb-status" id="sb-sync-status">—</div>
                    </RG>
                </>}
            </div>
        </div>
    );
}

function RG({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="ribbon-group">
            <div className="ribbon-group-inner">{children}</div>
            <div className="ribbon-group-label">{label}</div>
        </div>
    );
}

function RB({ icon, label, active, onClick }: { icon?: React.ReactNode; label?: string; active?: boolean; onClick?: () => void }) {
    return (
        <button className={`rbtn ${active ? 'active' : ''}`} onClick={onClick}>
            {icon}
            {label && <span>{label}</span>}
        </button>
    );
}
