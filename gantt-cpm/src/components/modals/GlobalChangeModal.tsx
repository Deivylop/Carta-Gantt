// ═══════════════════════════════════════════════════════════════════
// GlobalChangeModal – Motor de cambio masivo al estilo Primavera P6
// Flujo: Listado -> Editor (definir condiciones IF -> THEN/ELSE) -> Preview -> Commit
// ═══════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react';
import { useGantt } from '../../store/GanttContext';
import { DEFAULT_COLS } from '../../store/GanttContext';
import { Wand2, Plus, Trash2, ArrowRight, CheckCircle2, Eye } from 'lucide-react';
import { isoDate, parseDate } from '../../utils/cpm';
import type { Activity, GCCondition, GCActionDef, GCActionType, GCOperator, SavedGlobalChange } from '../../types/gantt';

// ─── Types ───────────────────────────────────────────────────────

interface GCPreviewRow {
    actId: string;
    actName: string;
    index: number;
    fieldLabel: string;
    fieldKey: string;
    oldValue: string;
    newValue: string;
    updates: Partial<Activity>;
}

type ModalStep = 'list' | 'editor' | 'preview';

// ─── Constants ───────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const FILTER_FIELDS = DEFAULT_COLS.filter(c =>
    !['_num', '_info', '_mode', 'activityCount', 'simRealPct', 'simProgPct',
        'earnedValue', 'remainingWork', 'varStart', 'varEnd', 'varDur', 'varWork',
        'lpEstado', 'tipoRestr', 'estRestr', 'lpDias', 'fPrevista', 'fLiberado',
        'plannedPct', 'floatPath', 'FF'].includes(c.key)
);

const MUTABLE_FIELDS: { key: string; label: string; type: 'number' | 'text' | 'date' | 'select' }[] = [
    { key: 'dur', label: 'Duración', type: 'number' },
    { key: 'remDur', label: 'Dur. Restante', type: 'number' },
    { key: 'pct', label: '% Avance', type: 'number' },
    { key: 'work', label: 'Trabajo (hrs)', type: 'number' },
    { key: 'weight', label: 'Peso %', type: 'number' },
    { key: 'encargado', label: 'Encargado', type: 'text' },
    { key: 'notes', label: 'Notas', type: 'text' },
    { key: 'txt1', label: 'Texto 1', type: 'text' },
    { key: 'txt2', label: 'Texto 2', type: 'text' },
    { key: 'txt3', label: 'Texto 3', type: 'text' },
    { key: 'txt4', label: 'Texto 4', type: 'text' },
    { key: 'txt5', label: 'Texto 5', type: 'text' },
    { key: 'constraint', label: 'Restricción', type: 'select' },
    { key: 'constraintDate', label: 'Fecha Restricción', type: 'date' },
    { key: 'actualStart', label: 'Inicio Real', type: 'date' },
    { key: 'actualFinish', label: 'Fin Real', type: 'date' },
];

const NUMERIC_FIELDS = new Set(['dur', 'remDur', 'pct', 'work', 'weight']);
const DATE_FILTER_FIELDS = new Set(['startDate', 'endDate', 'actualStart', 'actualFinish',
    'blStart', 'blEnd', 'constraintDate', 'remStartDate', 'remEndDate', 'suspendDate', 'resumeDate']);
const CONSTRAINT_OPTIONS = ['', 'SNET', 'SNLT', 'MSO', 'MFO', 'FNET', 'FNLT'];

// ─── Value resolver (mirrors buildVisRows resolveFieldValue) ─────

function resolveFieldVal(a: Activity, field: string): string {
    switch (field) {
        case 'dur': return String(a.type === 'milestone' ? 0 : (a.dur ?? 0));
        case 'remDur': return String(a.remDur ?? a.dur ?? 0);
        case 'pct': return String(a.pct ?? 0);
        case 'work': return String(a.work ?? 0);
        case 'TF': return a.TF != null ? String(a.TF) : '';
        case 'crit': return a.crit ? 'Sí' : 'No';
        case 'type': return a.type === 'milestone' ? 'Hito' : a.type === 'summary' ? 'Resumen' : 'Tarea';
        case 'lv': return String(a.lv);
        case 'outlineNum': return a.outlineNum ?? '';
        case 'startDate': return isoDate(a.ES ?? null);
        case 'endDate': return isoDate(a.EF ?? null);
        case 'actualStart': return a.actualStart ?? '';
        case 'actualFinish': return a.actualFinish ?? '';
        case 'blStart': return isoDate(a.blES ?? null);
        case 'blEnd': return isoDate(a.blEF ?? null);
        case 'constraintDate': return (a.constraint && a.constraintDate) ? a.constraintDate : '';
        case 'suspendDate': return a.suspendDate ?? '';
        case 'resumeDate': return a.resumeDate ?? '';
        case 'weight': return a.weight != null ? String(a.weight) : '';
        case 'blDur': return a.blDur != null ? String(a.blDur) : '';
        case 'blWork': return a.blWork != null ? String(a.blWork) : '';
        case 'predStr': return (a.preds ?? []).map(p =>
            p.id + (p.type !== 'FS' ? ` ${p.type}` : '') + (p.lag ? ` +${p.lag}d` : '')
        ).join(', ');
        default: return String(((a as unknown) as Record<string, unknown>)[field] ?? '');
    }
}

// ─── Condition evaluation ─────────────────────────────────────────

function evalCondition(a: Activity, cond: GCCondition): boolean {
    const rawVal = resolveFieldVal(a, cond.field);
    const sVal = rawVal.trim().toLowerCase();
    const tVal = cond.value.trim().toLowerCase().replace(/\s*(días|dias|d|hrs|h|%)$/, '');

    const isoRx = /^\d{4}-\d{2}-\d{2}$/;
    const bothDates = isoRx.test(sVal) && isoRx.test(tVal);
    const numVal = parseFloat(sVal);
    const numTVal = parseFloat(tVal);
    const bothNumeric = !bothDates && !isNaN(numVal) && !isNaN(numTVal) && tVal !== '';

    switch (cond.operator) {
        case 'is_empty': return sVal === '';
        case 'is_not_empty': return sVal !== '';
        case 'equals':
            return bothDates ? sVal === tVal : (bothNumeric ? numVal === numTVal : sVal === tVal);
        case 'not_equals':
            return bothDates ? sVal !== tVal : (bothNumeric ? numVal !== numTVal : sVal !== tVal);
        case 'contains': return sVal.includes(tVal);
        case 'not_contains': return !sVal.includes(tVal);
        case 'greater_than': {
            const dV = parseDate(sVal), dT = parseDate(tVal);
            if (dV && dT) return dV.getTime() > dT.getTime();
            return bothNumeric && numVal > numTVal;
        }
        case 'greater_than_or_equal': {
            const dV = parseDate(sVal), dT = parseDate(tVal);
            if (dV && dT) return dV.getTime() >= dT.getTime();
            return bothNumeric && numVal >= numTVal;
        }
        case 'less_than': {
            const dV = parseDate(sVal), dT = parseDate(tVal);
            if (dV && dT) return dV.getTime() < dT.getTime();
            return bothNumeric && numVal < numTVal;
        }
        case 'less_than_or_equal': {
            const dV = parseDate(sVal), dT = parseDate(tVal);
            if (dV && dT) return dV.getTime() <= dT.getTime();
            return bothNumeric && numVal <= numTVal;
        }
        default: return false;
    }
}

function activityPasses(a: Activity, conditions: GCCondition[], matchAll: boolean): boolean {
    if (conditions.length === 0) return true;
    const results = conditions.map(c => evalCondition(a, c));
    return matchAll ? results.every(Boolean) : results.some(Boolean);
}

// ─── Mutation logic ───────────────────────────────────────────────

function computeNewValue(a: Activity, actionDef: GCActionDef): { newRaw: unknown; newDisplay: string } | null {
    const { field, action, value } = actionDef;
    const fInfo = MUTABLE_FIELDS.find(f => f.key === field);
    if (!fInfo) return null;

    const currentDisplay = resolveFieldVal(a, field);
    const currentNum = parseFloat(currentDisplay);
    const targetNum = parseFloat(value);

    if (fInfo.type === 'number') {
        let result: number;
        switch (action) {
            case 'set': result = isNaN(targetNum) ? 0 : targetNum; break;
            case 'add': result = (isNaN(currentNum) ? 0 : currentNum) + (isNaN(targetNum) ? 0 : targetNum); break;
            case 'multiply': result = (isNaN(currentNum) ? 0 : currentNum) * (isNaN(targetNum) ? 1 : targetNum); break;
            default: return null;
        }
        // Clamp pct to 0-100
        if (field === 'pct') result = Math.max(0, Math.min(100, result));
        // Round to 2 decimals
        result = Math.round(result * 100) / 100;
        return { newRaw: result, newDisplay: String(result) };
    }

    if (fInfo.type === 'text') {
        switch (action) {
            case 'set': return { newRaw: value, newDisplay: value };
            case 'append': {
                const cur = currentDisplay;
                const newVal = cur ? cur + ' ' + value : value;
                return { newRaw: newVal, newDisplay: newVal };
            }
            default: return null;
        }
    }

    if (fInfo.type === 'date') {
        if (action === 'set') return { newRaw: value || null, newDisplay: value };
        return null;
    }

    if (fInfo.type === 'select') {
        if (action === 'set') return { newRaw: value, newDisplay: value };
        return null;
    }

    return null;
}

// ─── Available actions per field type ────────────────────────────
const ACTIONS_FOR_TYPE: Record<string, { value: GCActionType; label: string }[]> = {
    number: [
        { value: 'set', label: 'Asignar valor' },
        { value: 'add', label: 'Sumar a valor actual' },
        { value: 'multiply', label: 'Multiplicar por' },
    ],
    text: [
        { value: 'set', label: 'Asignar texto' },
        { value: 'append', label: 'Agregar al final' },
    ],
    date: [{ value: 'set', label: 'Asignar fecha' }],
    select: [{ value: 'set', label: 'Asignar valor' }],
};

// ─── Component ────────────────────────────────────────────────────

export default function GlobalChangeModal() {
    const { state, dispatch } = useGantt();
    const lm = state.lightMode;

    // ── Editor State ──
    const [editorId, setEditorId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [conditions, setConditions] = useState<GCCondition[]>([]);
    const [matchAll, setMatchAll] = useState(true);
    const [thenAction, setThenAction] = useState<GCActionDef>({ field: 'pct', action: 'set', value: '' });
    const [elseEnabled, setElseEnabled] = useState(false);
    const [elseAction, setElseAction] = useState<GCActionDef>({ field: 'pct', action: 'set', value: '' });

    // ── App State ──
    const [preview, setPreview] = useState<GCPreviewRow[] | null>(null);
    const [step, setStep] = useState<ModalStep>('list');
    const [selectedGcId, setSelectedGcId] = useState<string | null>(null);

    const close = () => {
        dispatch({ type: 'CLOSE_GLOBAL_CHANGE_MODAL' });
        setPreview(null);
        setStep('list');
    };

    // ── List View Handlers ──
    const handleNew = () => {
        setEditorId(uid());
        setName('Nuevo Cambio Global');
        setConditions([]);
        setMatchAll(true);
        setThenAction({ field: 'pct', action: 'set', value: '' });
        setElseEnabled(false);
        setElseAction({ field: 'pct', action: 'set', value: '' });
        setStep('editor');
    };

    const handleEdit = (gc: SavedGlobalChange) => {
        setEditorId(gc.id);
        setName(gc.name);
        setConditions(gc.conditions);
        setMatchAll(gc.matchAll);
        if (gc.thenAction) setThenAction(gc.thenAction);
        setElseEnabled(gc.elseEnabled);
        if (gc.elseAction) setElseAction(gc.elseAction);
        setStep('editor');
    };

    const handleDelete = (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este cambio global?')) return;
        dispatch({ type: 'DELETE_GLOBAL_CHANGE', id });
        if (selectedGcId === id) setSelectedGcId(null);
    };

    const handleApplyFromList = (gcId: string) => {
        const gc = state.savedGlobalChanges.find((g: any) => g.id === gcId);
        if (!gc) return;
        // Load settings to background state for the preview build context
        setConditions(gc.conditions);
        setMatchAll(gc.matchAll);
        setThenAction(gc.thenAction ?? { field: 'pct', action: 'set', value: '' });
        setElseEnabled(gc.elseEnabled);
        setElseAction(gc.elseAction ?? { field: 'pct', action: 'set', value: '' });

        // Immediately build logic
        buildPreviewFromData(gc.conditions, gc.matchAll, gc.thenAction ?? { field: 'pct', action: 'set', value: '' }, gc.elseEnabled, gc.elseAction ?? { field: 'pct', action: 'set', value: '' });
    };

    // ── Editor Handlers ──
    const saveEditor = () => {
        if (!name.trim()) return alert('El cambio global debe tener un nombre.');
        const gc: SavedGlobalChange = {
            id: editorId || uid(),
            name,
            matchAll,
            conditions,
            thenAction,
            elseEnabled,
            elseAction
        };
        dispatch({ type: 'SAVE_GLOBAL_CHANGE', change: gc });
        setStep('list');
    };

    // Condition sub-handlers
    const addCondition = () => setConditions(prev => [
        ...prev,
        { id: uid(), field: 'name', operator: 'contains', value: '' }
    ]);
    const removeCondition = (id: string) => setConditions(prev => prev.filter(c => c.id !== id));
    const updateCondition = (id: string, updates: Partial<GCCondition>) =>
        setConditions(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

    // ── Preview generation ──
    const buildPreviewFromData = useCallback((conds: GCCondition[], mAll: boolean, tAct: GCActionDef | null, eEnb: boolean, eAct: GCActionDef | null) => {
        const rows: GCPreviewRow[] = [];
        const activities = state.activities;

        activities.forEach((a, idx) => {
            if (a._isProjRow) return;

            const passes = activityPasses(a, conds, mAll);
            const actionToApply = passes ? tAct : (eEnb ? eAct : null);
            if (!actionToApply) return;
            if (!actionToApply.field || actionToApply.value === '') return;

            const computed = computeNewValue(a, actionToApply);
            if (!computed) return;

            const oldDisplay = resolveFieldVal(a, actionToApply.field);
            // Only include if value actually changes
            if (oldDisplay === computed.newDisplay) return;

            const fLabel = MUTABLE_FIELDS.find(f => f.key === actionToApply.field)?.label ?? actionToApply.field;
            rows.push({
                actId: a.id,
                actName: a.name,
                index: idx,
                fieldLabel: fLabel,
                fieldKey: actionToApply.field,
                oldValue: oldDisplay || '—',
                newValue: computed.newDisplay,
                updates: { [actionToApply.field]: computed.newRaw } as Partial<Activity>,
            });
        });

        setPreview(rows);
        setStep('preview');
    }, [state.activities]);

    const handleBuildPreview = () => {
        buildPreviewFromData(conditions, matchAll, thenAction, elseEnabled, elseAction);
    };

    // ── Commit ──
    const commit = () => {
        if (!preview || preview.length === 0) return;
        dispatch({ type: 'PUSH_UNDO' });

        // Merge updates per activity index (multiple fields may change)
        const byIndex = new Map<number, Partial<Activity>>();
        preview.forEach(row => {
            const existing = byIndex.get(row.index) ?? {};
            byIndex.set(row.index, { ...existing, ...row.updates });
        });

        const changes = Array.from(byIndex.entries()).map(([index, updates]) => ({ index, updates }));
        dispatch({ type: 'APPLY_GLOBAL_CHANGE', changes });
        close();
    };

    if (!state.globalChangeModalOpen) return null;

    // ── Styles (theme-aware) ──
    const border = `1px solid ${lm ? '#e2e8f0' : '#334155'}`;
    const bg = lm ? '#fff' : '#1e293b';
    const bgAlt = lm ? '#f8fafc' : '#0f172a';
    const bgSelected = lm ? '#e0e7ff' : '#312e81';
    const textMuted = lm ? '#64748b' : '#94a3b8';
    const accent = '#818cf8';

    // ── Selected THEN field type ──
    const thenFieldInfo = MUTABLE_FIELDS.find(f => f.key === thenAction.field);
    const thenFieldType = thenFieldInfo?.type ?? 'text';
    const elseFieldInfo = MUTABLE_FIELDS.find(f => f.key === elseAction.field);
    const elseFieldType = elseFieldInfo?.type ?? 'text';

    return (
        <div className="modal-overlay open" onClick={close} style={{ zIndex: 10001 }}>
            <div
                className="modal"
                onClick={e => e.stopPropagation()}
                style={{
                    width: step === 'list' ? 600 : 900,
                    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                    background: bg, border,
                    transition: 'width 0.2s',
                }}
            >
                {/* ── Header ── */}
                <div className="modal-header" style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 18px', borderBottom: border,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wand2 size={20} color={accent} />
                        <h3 style={{ margin: 0, fontSize: 16, color: accent, fontWeight: 700 }}>Global Change</h3>
                        {step === 'list' ? (
                            <span style={{ fontSize: 11, color: textMuted, marginLeft: 4 }}>
                                Selecciona un perfil de cambio
                            </span>
                        ) : (
                            <span style={{ fontSize: 11, color: textMuted, marginLeft: 4 }}>
                                Motor de cambio masivo (Emulación P6)
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {step === 'editor' && (
                            <button className="btn btn-secondary" onClick={() => setStep('list')} style={{ fontSize: 12 }}>
                                ← Volver a la lista
                            </button>
                        )}
                        {step === 'preview' && (
                            <button className="btn btn-secondary" onClick={() => setStep('editor')} style={{ fontSize: 12 }}>
                                ← Editar Parámetros
                            </button>
                        )}
                        <button className="modal-close" onClick={close}>✕</button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>

                    {/* ═══ LIST VIEW ═══ */}
                    {step === 'list' && (
                        <div style={{ display: 'flex', height: 400 }}>
                            <div style={{ flex: 1, padding: 18, borderRight: border, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: border }}>
                                            <Th>Nombre</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {state.savedGlobalChanges.map((gc: any) => (
                                            <tr key={gc.id}
                                                onClick={() => setSelectedGcId(gc.id)}
                                                onDoubleClick={() => handleApplyFromList(gc.id)}
                                                style={{
                                                    cursor: 'pointer',
                                                    background: selectedGcId === gc.id ? bgSelected : 'transparent',
                                                    borderBottom: border
                                                }}>
                                                <td style={{ padding: '8px 10px', color: selectedGcId === gc.id ? (lm ? '#3730a3' : '#a5b4fc') : 'inherit' }}>
                                                    {gc.name}
                                                </td>
                                            </tr>
                                        ))}
                                        {state.savedGlobalChanges.length === 0 && (
                                            <tr>
                                                <td style={{ padding: '20px', textAlign: 'center', color: textMuted, fontStyle: 'italic' }}>
                                                    No hay cambios globales guardados. Haz clic en "Nuevo" para crear uno.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {/* P6 Sidebar Buttons */}
                            <div style={{ width: 140, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, background: bgAlt }}>
                                <button className="btn btn-primary" onClick={close} style={{ width: '100%', justifyContent: 'center' }}>Cerrar</button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => selectedGcId && handleApplyFromList(selectedGcId)}
                                    disabled={!selectedGcId}
                                    style={{ width: '100%', justifyContent: 'center', opacity: selectedGcId ? 1 : 0.5 }}
                                >
                                    Aplicar cambio
                                </button>
                                <div style={{ height: 10 }}></div>
                                <button className="btn btn-secondary" onClick={handleNew} style={{ width: '100%', justifyContent: 'center' }}>Nuevo</button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => selectedGcId && handleEdit(state.savedGlobalChanges.find((g: any) => g.id === selectedGcId)! as any)}
                                    disabled={!selectedGcId}
                                    style={{ width: '100%', justifyContent: 'center', opacity: selectedGcId ? 1 : 0.5 }}
                                >
                                    Modificar
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => selectedGcId && handleDelete(selectedGcId)}
                                    disabled={!selectedGcId}
                                    style={{ width: '100%', justifyContent: 'center', opacity: selectedGcId ? 1 : 0.5 }}
                                >
                                    Suprimir
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ═══ EDITOR VIEW ═══ */}
                    {step === 'editor' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 18 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <label style={{ fontSize: 13, fontWeight: 600, width: 120 }}>Nombre Cambio:</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ flex: 1, padding: '6px 10px', fontSize: 14, fontWeight: 600 }}
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Nombre descriptivo para identificarlo..."
                                />
                            </div>

                            {/* ── Subject Area ── */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: bgAlt, borderRadius: 6, border }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: textMuted, width: 110 }}>Subject Area:</span>
                                <select className="form-input" style={{ fontSize: 12, padding: '4px 8px', width: 220 }} defaultValue="activities">
                                    <option value="activities">Activities</option>
                                </select>
                                <span style={{ fontSize: 11, color: textMuted }}>(Expansión en futuras versiones)</span>
                            </div>

                            {/* ── IF CONDITIONS ── */}
                            <Section title="IF — Condiciones" accent={accent} border={border}>
                                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                        <input type="radio" checked={matchAll} onChange={() => setMatchAll(true)} />
                                        <strong>AND</strong> — Todas las condiciones
                                    </label>
                                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                        <input type="radio" checked={!matchAll} onChange={() => setMatchAll(false)} />
                                        <strong>OR</strong> — Cualquier condición
                                    </label>
                                </div>

                                {conditions.length === 0 && (
                                    <div style={{ textAlign: 'center', color: textMuted, fontStyle: 'italic', fontSize: 12, padding: 14, border: `1px dashed ${lm ? '#cbd5e1' : '#475569'}`, borderRadius: 6 }}>
                                        Sin condiciones — se aplicará a <strong>todas</strong> las actividades
                                    </div>
                                )}

                                {conditions.map((cond, i) => (
                                    <ConditionRow
                                        key={cond.id}
                                        cond={cond}
                                        index={i}
                                        matchAll={matchAll}
                                        border={border}
                                        textMuted={textMuted}
                                        onUpdate={updates => updateCondition(cond.id, updates)}
                                        onRemove={() => removeCondition(cond.id)}
                                    />
                                ))}

                                <button className="btn btn-secondary" onClick={addCondition}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 12, padding: '5px 12px' }}>
                                    <Plus size={13} /> Agregar condición
                                </button>
                            </Section>

                            {/* ── THEN action ── */}
                            <Section title="THEN — Acción principal" accent="#22c55e" border={border}>
                                <ActionRow
                                    actionDef={thenAction}
                                    fieldType={thenFieldType}
                                    lm={lm}
                                    onUpdate={u => setThenAction(prev => ({ ...prev, ...u }))}
                                />
                            </Section>

                            {/* ── ELSE action (optional) ── */}
                            <Section
                                title={
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={elseEnabled} onChange={e => setElseEnabled(e.target.checked)} />
                                        <span>ELSE — Acción alternativa <span style={{ fontSize: 10, color: textMuted }}>(opcional)</span></span>
                                    </label>
                                }
                                accent="#f59e0b"
                                border={border}
                            >
                                {elseEnabled ? (
                                    <ActionRow
                                        actionDef={elseAction}
                                        fieldType={elseFieldType}
                                        lm={lm}
                                        onUpdate={u => setElseAction(prev => ({ ...prev, ...u }))}
                                    />
                                ) : (
                                    <div style={{ color: textMuted, fontStyle: 'italic', fontSize: 12 }}>
                                        Activar para definir una acción para las actividades que NO cumplen las condiciones IF.
                                    </div>
                                )}
                            </Section>

                            {/* ── Editor Controls ── */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                                <button className="btn btn-secondary" onClick={() => setStep('list')}>Cancelar</button>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-primary" onClick={handleBuildPreview}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#059669' }}>
                                        <Eye size={15} /> Preview (Vista previa)
                                    </button>
                                    <button className="btn btn-primary" onClick={saveEditor}>Guardar Cambio Global</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══ PREVIEW VIEW ═══ */}
                    {step === 'preview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                                background: lm ? '#f0fdf4' : '#14532d33',
                                border: `1px solid ${lm ? '#86efac' : '#16a34a'}`,
                                borderRadius: 6, fontSize: 12
                            }}>
                                <CheckCircle2 size={14} color="#22c55e" />
                                <span>
                                    <strong>{preview?.length ?? 0}</strong> actividade(s) se modificarán.
                                    Revisa los cambios propuestos antes de confirmar al archivo.
                                </span>
                            </div>

                            {preview && preview.length > 0 ? (
                                <div style={{ border, borderRadius: 6, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: lm ? '#f1f5f9' : '#334155', textAlign: 'left' }}>
                                                <Th>Activity ID</Th>
                                                <Th>Activity Name</Th>
                                                <Th>Field Name</Th>
                                                <Th>Old Value</Th>
                                                <Th style={{ color: '#22c55e' }}>New Value</Th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.map((row, i) => (
                                                <tr key={i} style={{
                                                    borderTop: border,
                                                    background: i % 2 === 0 ? 'transparent' : (lm ? '#f8fafc' : '#1e293b40')
                                                }}>
                                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600, color: accent }}>{row.actId}</td>
                                                    <td style={{ padding: '6px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.actName}</td>
                                                    <td style={{ padding: '6px 10px', color: textMuted }}>{row.fieldLabel}</td>
                                                    <td style={{ padding: '6px 10px', color: '#ef4444', textDecoration: 'line-through', opacity: 0.8 }}>{row.oldValue}</td>
                                                    <td style={{ padding: '6px 10px', color: '#22c55e', fontWeight: 600 }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <ArrowRight size={11} />
                                                            {row.newValue}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{
                                    textAlign: 'center', padding: 40, color: textMuted,
                                    border: `1px dashed ${lm ? '#cbd5e1' : '#475569'}`, borderRadius: 8, fontSize: 13
                                }}>
                                    Ninguna actividad cumple las condiciones o no hay cambios reales a aplicar.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                {step === 'preview' && (
                    <div className="modal-footer" style={{
                        borderTop: border, padding: '12px 18px',
                        display: 'flex', justifyContent: 'flex-end', gap: 10
                    }}>
                        <button className="btn btn-secondary" onClick={() => setStep('list')}>Cancelar</button>
                        <button
                            className="btn btn-primary"
                            onClick={commit}
                            disabled={!preview || preview.length === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: '#22c55e', borderColor: '#16a34a',
                                opacity: (!preview || preview.length === 0) ? 0.5 : 1,
                            }}
                        >
                            <CheckCircle2 size={15} /> Commit Changes ({preview?.length ?? 0})
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────

function Section({ title, accent, border, children }: {
    title: React.ReactNode; accent: string; border: string; children: React.ReactNode;
}) {
    return (
        <div style={{ border, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{
                padding: '8px 14px', borderBottom: border,
                background: 'transparent',
                display: 'flex', alignItems: 'center', gap: 8,
                borderLeft: `4px solid ${accent}`,
                fontSize: 13, fontWeight: 700,
            }}>
                {title}
            </div>
            <div style={{ padding: 14 }}>{children}</div>
        </div>
    );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <th style={{ padding: '7px 10px', fontWeight: 600, fontSize: 11, ...style }}>{children}</th>;
}

function ConditionRow({ cond, index, matchAll, border, textMuted, onUpdate, onRemove }: {
    cond: GCCondition;
    index: number;
    matchAll: boolean;
    border: string;
    textMuted: string;
    onUpdate: (updates: Partial<GCCondition>) => void;
    onRemove: () => void;
}) {
    const isDate = DATE_FILTER_FIELDS.has(cond.field);
    const isNumeric = NUMERIC_FIELDS.has(cond.field) ||
        ['TF', 'lv', 'dur', 'remDur', 'pct', 'work', 'weight', 'blDur', 'blWork'].includes(cond.field);
    const needsValue = !['is_empty', 'is_not_empty'].includes(cond.operator);

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            padding: '6px 10px', border, borderRadius: 6,
            background: 'transparent'
        }}>
            {/* Connector badge */}
            {index > 0 && (
                <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                    background: matchAll ? '#3730a340' : '#b4530040',
                    color: matchAll ? '#818cf8' : '#f97316',
                    minWidth: 32, textAlign: 'center',
                }}>
                    {matchAll ? 'AND' : 'OR'}
                </span>
            )}
            {index === 0 && <span style={{ fontSize: 10, color: textMuted, minWidth: 32, textAlign: 'center' }}>SI</span>}

            {/* Field */}
            <select className="form-input" style={{ fontSize: 11, padding: '4px 6px', flex: '0 0 140px' }}
                value={cond.field} onChange={e => onUpdate({ field: e.target.value })}>
                {FILTER_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>

            {/* Operator */}
            <select className="form-input" style={{ fontSize: 11, padding: '4px 6px', flex: '0 0 160px' }}
                value={cond.operator} onChange={e => onUpdate({ operator: e.target.value as GCOperator })}>
                <option value="equals">es igual a</option>
                <option value="not_equals">no es igual a</option>
                {isNumeric || isDate ? <>
                    <option value="greater_than">es mayor que</option>
                    <option value="greater_than_or_equal">es mayor o igual (≥)</option>
                    <option value="less_than">es menor que</option>
                    <option value="less_than_or_equal">es menor o igual (≤)</option>
                </> : <>
                    <option value="contains">contiene</option>
                    <option value="not_contains">no contiene</option>
                </>}
                <option value="is_empty">está vacío</option>
                <option value="is_not_empty">no está vacío</option>
            </select>

            {/* Value */}
            {needsValue ? (
                isDate ? (
                    <input type="date" className="form-input" style={{ fontSize: 11, padding: '4px 6px', flex: 1 }}
                        value={cond.value} onChange={e => onUpdate({ value: e.target.value })} />
                ) : (
                    <input type={isNumeric ? 'number' : 'text'} className="form-input"
                        style={{ fontSize: 11, padding: '4px 6px', flex: 1 }}
                        value={cond.value} placeholder="valor..."
                        onChange={e => onUpdate({ value: e.target.value })} />
                )
            ) : <div style={{ flex: 1 }} />}

            <button onClick={onRemove}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, flexShrink: 0 }}
                title="Eliminar condición">
                <Trash2 size={14} />
            </button>
        </div>
    );
}

function ActionRow({ actionDef, fieldType, lm, onUpdate }: {
    actionDef: GCActionDef;
    fieldType: string;
    lm: boolean;
    onUpdate: (updates: Partial<GCActionDef>) => void;
}) {
    const actions = ACTIONS_FOR_TYPE[fieldType] ?? ACTIONS_FOR_TYPE.text;
    const isDate = fieldType === 'date';
    const isSelect = fieldType === 'select';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Field to modify */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 10, color: lm ? '#64748b' : '#94a3b8', fontWeight: 600 }}>CAMPO</label>
                <select className="form-input" style={{ fontSize: 12, padding: '5px 8px', minWidth: 160 }}
                    value={actionDef.field}
                    onChange={e => {
                        const newField = e.target.value;
                        const newType = MUTABLE_FIELDS.find(f => f.key === newField)?.type ?? 'text';
                        const defaultAction = ACTIONS_FOR_TYPE[newType]?.[0]?.value ?? 'set';
                        onUpdate({ field: newField, action: defaultAction as GCActionType, value: '' });
                    }}>
                    {MUTABLE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
            </div>

            <ArrowRight size={14} style={{ color: lm ? '#94a3b8' : '#475569', marginTop: 14 }} />

            {/* Operation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 10, color: lm ? '#64748b' : '#94a3b8', fontWeight: 600 }}>OPERACIÓN</label>
                <select className="form-input" style={{ fontSize: 12, padding: '5px 8px', minWidth: 160 }}
                    value={actionDef.action}
                    onChange={e => onUpdate({ action: e.target.value as GCActionType })}>
                    {actions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
            </div>

            {/* Value */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 10, color: lm ? '#64748b' : '#94a3b8', fontWeight: 600 }}>
                    {actionDef.action === 'add' ? 'VALOR A SUMAR' :
                        actionDef.action === 'multiply' ? 'FACTOR' :
                            actionDef.action === 'append' ? 'TEXTO A AGREGAR' : 'NUEVO VALOR'}
                </label>
                {isDate ? (
                    <input type="date" className="form-input" style={{ fontSize: 12, padding: '5px 8px' }}
                        value={actionDef.value} onChange={e => onUpdate({ value: e.target.value })} />
                ) : isSelect ? (
                    <select className="form-input" style={{ fontSize: 12, padding: '5px 8px' }}
                        value={actionDef.value} onChange={e => onUpdate({ value: e.target.value })}>
                        {CONSTRAINT_OPTIONS.map(o => <option key={o} value={o}>{o || '(Sin restricción)'}</option>)}
                    </select>
                ) : (
                    <input
                        type={fieldType === 'number' ? 'number' : 'text'}
                        className="form-input"
                        style={{ fontSize: 12, padding: '5px 8px' }}
                        value={actionDef.value}
                        placeholder={fieldType === 'number' ? '0' : 'valor...'}
                        onChange={e => onUpdate({ value: e.target.value })}
                    />
                )}
            </div>
        </div>
    );
}
