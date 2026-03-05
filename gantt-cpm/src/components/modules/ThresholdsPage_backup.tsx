// ═══════════════════════════════════════════════════════════════════
// ThresholdsPage – Vista completa de Reglas de Control (Umbrales)
// Usa el mismo patrón que DashboardPage, ConfigPage, etc.
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo } from 'react';
import { useGantt } from '../../store/GanttContext';
import { supabase } from '../../lib/supabase';
import type { ProjectThreshold, ThresholdSeverity, ProjectIssue } from '../../types/gantt';
import { ShieldAlert, Plus, Trash2, Save, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

// ─── Error Boundary ─────────────────────────────────────────────
class ThresholdsErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
    constructor(props: any) { super(props); this.state = { hasError: false, error: '' }; }
    static getDerivedStateFromError(err: any) { return { hasError: true, error: String(err) }; }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, color: '#ef4444', textAlign: 'center' }}>
                    <h3>Error en la página de Control</h3>
                    <pre style={{ fontSize: 12, color: '#f97316', whiteSpace: 'pre-wrap' }}>{this.state.error}</pre>
                    <button onClick={() => this.setState({ hasError: false, error: '' })} style={{ marginTop: 12, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Reintentar</button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Constants ──────────────────────────────────────────────────
const PARAM_LABELS: Record<string, string> = {
    devPct: '% Desviación Física',
    varStart: 'Variación de Inicio (días)',
    varEnd: 'Variación de Fin (días)',
    varDur: 'Variación de Duración (días)',
};

const SEV_OPTIONS: { value: ThresholdSeverity; label: string; color: string; emoji: string }[] = [
    { value: 'Crítica', label: 'Crítica', color: '#ef4444', emoji: '🔴' },
    { value: 'Alta', label: 'Alta', color: '#f97316', emoji: '🟠' },
    { value: 'Media', label: 'Media', color: '#eab308', emoji: '🟡' },
    { value: 'Baja', label: 'Baja', color: '#3b82f6', emoji: '🔵' },
];

const sevColor = (s: ThresholdSeverity) =>
    SEV_OPTIONS.find(o => o.value === s)?.color ?? '#6b7280';

// ─── Component ──────────────────────────────────────────────────
function ThresholdsPageInner() {
    const { state } = useGantt();
    const [rows, setRows] = useState<ProjectThreshold[]>([]);
    const [issues, setIssues] = useState<ProjectIssue[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<'rules' | 'issues'>('rules');

    const projectId =
        localStorage.getItem('GANTT_ACTIVE_PROJECT_ID') ||
        localStorage.getItem('supabase_project_id');

    // ── Load data ──
    useEffect(() => {
        if (!projectId) { setLoading(false); return; }
        loadAll();
    }, [projectId]);

    const loadAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const [thRes, issRes] = await Promise.all([
                supabase.from('project_thresholds').select('*').eq('project_id', projectId!).order('created_at', { ascending: true }),
                supabase.from('project_issues').select('*').eq('project_id', projectId!).order('created_at', { ascending: false }),
            ]);
            if (thRes.error) console.warn('Thresholds query error:', thRes.error);
            if (issRes.error) console.warn('Issues query error:', issRes.error);
            if (thRes.data) setRows(thRes.data as ProjectThreshold[]);
            if (issRes.data) setIssues(issRes.data as ProjectIssue[]);
        } catch (err: any) {
            console.error('Error loading thresholds data:', err);
            setError(String(err?.message || err));
        }
        setLoading(false);
    };

    // ── CRUD Thresholds ──
    const addRow = () => {
        if (!projectId) return;
        setRows(prev => [...prev, {
            id: 'new-' + Date.now(),
            project_id: projectId,
            parameter: 'devPct',
            operator: '<',
            limit_value: -5,
            severity: 'Crítica' as ThresholdSeverity,
            active: true,
        } as ProjectThreshold]);
    };

    const updateRow = (id: string, field: keyof ProjectThreshold, value: any) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
    };

    const removeRow = async (id: string) => {
        if (!id.startsWith('new-')) {
            await supabase.from('project_thresholds').delete().eq('id', id);
        }
        setRows(prev => prev.filter(r => r.id !== id));
    };

    const saveAll = async () => {
        setSaving(true);
        const toUpsert = rows.map(r => {
            const copy: any = { ...r };
            if (String(copy.id).startsWith('new-')) delete copy.id;
            return copy;
        });
        if (toUpsert.length > 0) {
            await supabase.from('project_thresholds').upsert(toUpsert);
        }
        await loadAll();
        setSaving(false);
    };

    // ── Evaluate thresholds against current activities ──
    const evaluationResults = useMemo(() => {
        const results: { actName: string; actId: string; param: string; value: number; threshold: ProjectThreshold }[] = [];
        const activeRules = rows.filter(r => r.active);
        if (activeRules.length === 0) return results;

        for (const act of state.activities) {
            if (act.type === 'summary') continue;
            for (const rule of activeRules) {
                let val: number | undefined;
                if (rule.parameter === 'devPct') {
                    const actual = act.pct || 0;
                    const planned = act._plannedPct != null ? act._plannedPct : actual;
                    val = actual - planned;
                } else if (rule.parameter === 'varStart') {
                    // Variation = Early Start - Baseline Early Start (in days)
                    if (act.ES && act.blES) {
                        val = Math.round((new Date(act.ES).getTime() - new Date(act.blES).getTime()) / 86400000);
                    }
                } else if (rule.parameter === 'varEnd') {
                    // Variation = Early Finish - Baseline Early Finish (in days)
                    if (act.EF && act.blEF) {
                        val = Math.round((new Date(act.EF).getTime() - new Date(act.blEF).getTime()) / 86400000);
                    }
                } else if (rule.parameter === 'varDur') {
                    // Variation = Current Duration - Baseline Duration (in days)
                    if (act.dur != null && act.blDur != null) {
                        val = act.dur - act.blDur;
                    }
                }
                if (val == null) continue;
                let breach = false;
                if (rule.operator === '<') breach = val < rule.limit_value;
                else if (rule.operator === '<=') breach = val <= rule.limit_value;
                else if (rule.operator === '>') breach = val > rule.limit_value;
                else if (rule.operator === '>=') breach = val >= rule.limit_value;
                if (breach) {
                    results.push({
                        actName: act.name || act.id || '(sin nombre)',
                        actId: act.id || '',
                        param: rule.parameter,
                        value: val,
                        threshold: rule,
                    });
                }
            }
        }
        return results;
    }, [rows, state.activities]);

    // ── KPIs ──
    const kpis = useMemo(() => {
        const openIssues = issues.filter(i => i.status === 'Abierto').length;
        const mitigating = issues.filter(i => i.status === 'En Mitigación').length;
        const closed = issues.filter(i => i.status === 'Cerrado').length;
        return { rules: rows.length, activeRules: rows.filter(r => r.active).length, breaches: evaluationResults.length, openIssues, mitigating, closed };
    }, [rows, evaluationResults, issues]);

    // ─── Styles ──
    const card: React.CSSProperties = {
        background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
        borderRadius: 8, padding: 16,
    };
    const kpiBox: React.CSSProperties = {
        background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
        borderRadius: 8, padding: '12px 16px', textAlign: 'center', minWidth: 120,
    };

    if (!projectId) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94a3b8', fontSize: 14 }}>
                <ShieldAlert size={20} style={{ marginRight: 8 }} />
                Abra un proyecto para configurar los umbrales de control.
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#ef4444' }}>
                <AlertTriangle size={28} />
                <div style={{ fontSize: 14 }}>Error al cargar datos de control</div>
                <pre style={{ fontSize: 11, color: '#f97316', maxWidth: 500, whiteSpace: 'pre-wrap' }}>{error}</pre>
                <button onClick={loadAll} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Reintentar</button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto', padding: 20, gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldAlert size={22} style={{ color: 'var(--color-indigo)' }} />
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Control de Proyecto</h2>
                </div>
                <button className="btn btn-secondary" onClick={loadAll} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <RefreshCw size={14} /> Actualizar
                </button>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={kpiBox}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-indigo)' }}>{kpis.activeRules}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Reglas Activas</div>
                </div>
                <div style={kpiBox}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: kpis.breaches > 0 ? '#ef4444' : '#22c55e' }}>{kpis.breaches}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Incumplimientos</div>
                </div>
                <div style={kpiBox}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{kpis.openIssues}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Issues Abiertos</div>
                </div>
                <div style={kpiBox}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{kpis.mitigating}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>En Mitigación</div>
                </div>
                <div style={kpiBox}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{kpis.closed}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Cerrados</div>
                </div>
            </div>

            {/* Inner Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border-primary)' }}>
                {(['rules', 'issues'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '8px 20px', fontSize: 13, fontWeight: tab === t ? 700 : 400,
                            color: tab === t ? 'var(--color-indigo)' : 'var(--text-secondary)',
                            background: 'transparent', border: 'none',
                            borderBottom: tab === t ? '2px solid var(--color-indigo)' : '2px solid transparent',
                            cursor: 'pointer', marginBottom: -2,
                        }}
                    >
                        {t === 'rules' ? '📋 Reglas de Umbrales' : '⚠️ Issues Detectados'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Cargando datos…</div>
            ) : tab === 'rules' ? (
                /* ══════ RULES TAB ══════ */
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            Reglas configuradas ({rows.length})
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-secondary" onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                <Plus size={14} /> Añadir Regla
                            </button>
                            <button className="btn btn-primary" onClick={saveAll} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                <Save size={14} /> {saving ? 'Guardando…' : 'Guardar Todo'}
                            </button>
                        </div>
                    </div>

                    {rows.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: 40, color: 'var(--text-muted)',
                            border: '2px dashed var(--border-primary)', borderRadius: 8,
                        }}>
                            No hay reglas definidas.
                            <br />
                            <span style={{ color: 'var(--color-indigo)', cursor: 'pointer' }} onClick={addRow}>Haga clic aquí para agregar una regla.</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* Header row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 100px 130px 80px 110px 36px', gap: 8, padding: '4px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                <span>On</span><span>Parámetro</span><span>Operador</span><span>Valor Límite</span><span></span><span>Severidad</span><span></span>
                            </div>
                            {rows.map(r => (
                                <div
                                    key={r.id}
                                    style={{
                                        display: 'grid', gridTemplateColumns: '36px 1fr 100px 130px 80px 110px 36px',
                                        gap: 8, alignItems: 'center', padding: '8px 10px',
                                        background: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
                                        borderLeft: `4px solid ${sevColor(r.severity)}`,
                                        borderRadius: 6, opacity: r.active ? 1 : 0.5,
                                    }}
                                >
                                    <input type="checkbox" checked={r.active} onChange={e => updateRow(r.id, 'active', e.target.checked)} style={{ cursor: 'pointer' }} />

                                    <select className="form-input" value={r.parameter} onChange={e => updateRow(r.id, 'parameter', e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }}>
                                        {Object.entries(PARAM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>

                                    <select className="form-input" value={r.operator} onChange={e => updateRow(r.id, 'operator', e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }}>
                                        <option value="<">Menor a</option>
                                        <option value="<=">Menor o igual</option>
                                        <option value=">">Mayor a</option>
                                        <option value=">=">Mayor o igual</option>
                                    </select>

                                    <input type="number" className="form-input" value={r.limit_value} onChange={e => updateRow(r.id, 'limit_value', Number(e.target.value))} style={{ fontSize: 12, padding: '4px 6px' }} />

                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>→ Alerta:</span>

                                    <select className="form-input" value={r.severity} onChange={e => updateRow(r.id, 'severity', e.target.value as ThresholdSeverity)} style={{ fontSize: 12, padding: '4px 6px', fontWeight: 700, color: sevColor(r.severity) }}>
                                        {SEV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>)}
                                    </select>

                                    <button onClick={() => removeRow(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} title="Eliminar">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Live evaluation preview */}
                    {evaluationResults.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={15} /> Incumplimientos Actuales ({evaluationResults.length})
                            </div>
                            <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {evaluationResults.map((r, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                                        background: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
                                        borderLeft: `3px solid ${sevColor(r.threshold.severity)}`,
                                        borderRadius: 4, fontSize: 12,
                                    }}>
                                        <span style={{ fontWeight: 600, minWidth: 180, color: 'var(--text-primary)' }}>{r.actName}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{PARAM_LABELS[r.param]}</span>
                                        <span style={{ fontWeight: 700, color: '#ef4444' }}>{r.value.toFixed(1)}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                            (umbral: {r.threshold.operator} {r.threshold.limit_value})
                                        </span>
                                        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: sevColor(r.threshold.severity) }}>
                                            {r.threshold.severity}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* ══════ ISSUES TAB ══════ */
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Issues registrados ({issues.length})
                    </span>

                    {issues.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: 40, color: 'var(--text-muted)',
                            border: '2px dashed var(--border-primary)', borderRadius: 8,
                        }}>
                            No se han registrado issues todavía.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px 130px', gap: 8, padding: '4px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                <span>Estado</span><span>Descripción</span><span>Tarea</span><span>Fecha</span>
                            </div>
                            {issues.map(iss => {
                                const statusIcon = iss.status === 'Abierto'
                                    ? <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
                                    : iss.status === 'En Mitigación'
                                        ? <Clock size={13} style={{ color: '#3b82f6' }} />
                                        : <CheckCircle2 size={13} style={{ color: '#22c55e' }} />;
                                return (
                                    <div
                                        key={iss.id}
                                        style={{
                                            display: 'grid', gridTemplateColumns: '100px 1fr 100px 130px',
                                            gap: 8, alignItems: 'center', padding: '8px 10px',
                                            background: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
                                            borderRadius: 4, fontSize: 12,
                                        }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                            {statusIcon} {iss.status}
                                        </span>
                                        <span style={{ color: 'var(--text-primary)' }}>{iss.description}</span>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{iss.task_id}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                            {iss.created_at ? new Date(iss.created_at).toLocaleDateString('es-CL') : '—'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Wrapped Export ─────────────────────────────────────────────
export default function ThresholdsPage() {
    return (
        <ThresholdsErrorBoundary>
            <ThresholdsPageInner />
        </ThresholdsErrorBoundary>
    );
}