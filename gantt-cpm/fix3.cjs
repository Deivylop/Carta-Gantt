const fs = require('fs');
let content = fs.readFileSync('src/components/ActivityDetailPanel.tsx', 'utf8');

const oldTabPasos = `function TabPasos({ a: _a }: { a: Activity }) {
    return (
        <div className="adp-table-tab">
            <div className="adp-section-title">Pasos de la actividad</div>
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 11 }}>
                <p>Los pasos permiten dividir una actividad en sub-tareas de seguimiento.</p>
                <p style={{ marginTop: 8, opacity: 0.6 }}>Funcionalidad pendiente de implementación.</p>
            </div>
        </div>
    );
}`;

const newTabPasos = `function TabPasos({ a, dispatch, selIdx }: { a: Activity, dispatch: any, selIdx: number }) {
    const steps = a.steps || [];
    const [selRow, setSelRow] = useState<number | null>(null);

    const redistributeWeights = (list: any[]) => {
        if (list.length === 0) return list;
        const nw = 100 / list.length;
        let sum = 0;
        return list.map((s, idx) => {
            if (idx === list.length - 1) {
                return { ...s, weight: Number((100 - sum).toFixed(2)) };
            } else {
                const w = Number(nw.toFixed(2));
                sum += w;
                return { ...s, weight: w };
            }
        });
    };

    const addStep = () => {
        const newStep = {
            id: \`step-\${Date.now()}\`,
            name: \`Nuevo paso \${steps.length + 1}\`,
            weight: 0,
            pct: 0
        };
        const newSteps = redistributeWeights([...steps, newStep]);
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: { steps: newSteps } });
        setSelRow(newSteps.length - 1);
    };

    const totalWeight = steps.reduce((sum, s) => sum + (s.weight || 0), 0);
    const isWeightValid = steps.length === 0 || Math.abs(totalWeight - 100) < 0.1;

    const applyPctToActivity = (currentSteps: any[] = steps) => {
        if (currentSteps.length === 0) return;
        const currentTotalWeight = currentSteps.reduce((sum, s) => sum + (s.weight || 0), 0);
        if (Math.abs(currentTotalWeight - 100) >= 0.1 && currentSteps.length > 0) return; // Only process if weights are valid (100)

        const earned = currentSteps.reduce((sum, s) => sum + ((s.weight || 0) * (s.pct || 0) / 100), 0);
        const newActivityPct = Math.round(earned);

        // En lugar de COMMIT_EDIT que auto-asigna fechas, enviamos un UPDATE_ACTIVITY con un flag especial
        dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: { pct: newActivityPct }, _skipAutoDate: true });
    };

    const updateStep = (idx: number, key: string, value: any) => {
        const newSteps = [...steps];
        newSteps[idx] = { ...newSteps[idx], [key]: value };
        dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: { steps: newSteps } });

        if (key === 'pct' || key === 'weight') {
            applyPctToActivity(newSteps);
        }
    };

    const removeStep = () => {
        if (selRow === null) return;
        const newSteps = redistributeWeights(steps.filter((_, i) => i !== selRow));
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'UPDATE_ACTIVITY', index: selIdx, updates: { steps: newSteps } });
        setSelRow(null);
        applyPctToActivity(newSteps);
    };

    const inputStyle: React.CSSProperties = { border: '1px solid transparent', background: 'transparent', color: 'inherit', width: '100%', outline: 'none', fontSize: 12, padding: '2px 4px', borderRadius: 3 };

    return (
        <div className="adp-table-tab" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="adp-rel-header" style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="adp-rel-title">Pasos de la actividad ({steps.length})</span>
                <div className="adp-rel-btns">
                    <button className="adp-rel-btn" onClick={addStep}>＋ Añadir Paso</button>
                    <button className="adp-rel-btn" onClick={removeStep} disabled={selRow === null} style={{ opacity: selRow === null ? 0.5 : 1 }}>🗑 Eliminar</button>
                    <button 
                        className="adp-rel-btn" 
                        style={{ marginLeft: 8, opacity: isWeightValid ? 1 : 0.5 }}
                        disabled={!isWeightValid}
                        onClick={() => { dispatch({ type: 'PUSH_UNDO' }); applyPctToActivity(); }}
                        title="Calcula el % de Avance de la actividad basado en el peso de los pasos">
                        ↻ Forzar Recálculo
                    </button>
                </div>
            </div>

            {!isWeightValid && (
                <div style={{ padding: '6px 16px', background: '#7f1d1d', color: '#fca5a5', fontSize: 11, borderBottom: '1px solid #991b1b', fontWeight: 'bold' }}>
                    ⚠️ Advertencia: La suma de los pesos es {totalWeight.toFixed(2)}% pero debe ser exactamente 100%. Por favor, ajusta los valores para calcular el avance físico correctamente.
                </div>
            )}

            <div className="adp-rel-list" style={{ flex: 1, overflowY: 'auto' }}>
                {steps.length === 0 ? (
                    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
                        No hay pasos definidos. Añade el primer paso para desglosar el progreso.
                    </div>
                ) : (
                    <table className="adp-rel-table">
                        <thead>
                            <tr>
                                <th>Nombre del Paso</th>
                                <th style={{ width: 80, textAlign: 'right' }}>Peso (%)</th>
                                <th style={{ width: 80, textAlign: 'right' }}>% Avance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {steps.map((s, i) => (
                                <tr key={s.id}
                                    className={selRow === i ? 'selected' : ''}
                                    onClick={() => setSelRow(i)}
                                >
                                    <td style={{ padding: 2 }}>
                                        <input
                                            value={s.name}
                                            onChange={e => updateStep(i, 'name', e.target.value)}
                                            style={inputStyle}
                                            onFocus={e => e.target.style.background = 'var(--bg-elevated, rgba(255,255,255,0.05))'}       
                                            onBlur={e => e.target.style.background = 'transparent'}
                                        />
                                    </td>
                                    <td style={{ padding: 2 }}>
                                        <input
                                            type="number" min="0" max="100" step="1"
                                            value={s.weight}
                                            onChange={e => updateStep(i, 'weight', parseFloat(e.target.value) || 0)}
                                            style={{ ...inputStyle, textAlign: 'right' }}
                                            onFocus={e => e.target.style.background = 'var(--bg-elevated, rgba(255,255,255,0.05))'}       
                                            onBlur={e => e.target.style.background = 'transparent'}
                                        />
                                    </td>
                                    <td style={{ padding: 2 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                            <input
                                                type="number" min="0" max="100" step="5"
                                                value={s.pct}
                                                onChange={e => updateStep(i, 'pct', parseFloat(e.target.value) || 0)}
                                                style={{ ...inputStyle, textAlign: 'right', width: 50 }}
                                                onFocus={e => e.target.style.background = 'var(--bg-elevated, rgba(255,255,255,0.05))'}       
                                                onBlur={e => e.target.style.background = 'transparent'}
                                            />
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}`;

content = content.replace(oldTabPasos, newTabPasos);

const originalTabCaller = "{tab === 'pasos' && <TabPasos a={a} />}";
const newTabCaller = "{tab === 'pasos' && <TabPasos a={a} dispatch={dispatch} selIdx={selIdx} />}";
content = content.replace(originalTabCaller, newTabCaller);

fs.writeFileSync('src/components/ActivityDetailPanel.tsx', content, 'utf8');
console.log('Done!');
