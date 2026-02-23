import { useState } from 'react';
import { useGantt } from '../store/GanttContext';
import SCurveChart from './SCurveChart';

export default function ResourceForm() {
    const { state } = useGantt();
    const { resourcePool, tableW, totalDays, pxPerDay, currentView } = state;

    // Default to 'all' resources initially
    const [scurveMode, setScurveMode] = useState<'all' | 'selected'>('all');
    const [scurveSelection, setScurveSelection] = useState<string[]>([]);

    return (
        <div className="form-zone" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0 }}>
            {/* Header row (Minimal for resUsage) */}
            <div className="form-header" style={{ flexWrap: 'wrap', padding: '8px 12px 0 12px' }}>
                <span className="fh-title">Panel de Recursos</span>
                <span className="fh-field" style={{ marginLeft: 16 }}>Ocupación y Curva S</span>
            </div>

            {/* Tabs */}
            <div className="fv-tabs" style={{ padding: '0 12px' }}>
                <div className="fv-tab active">📈 Curva S</div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
                {/* Left sidebar: Resource Selection */}
                <div style={{ width: tableW + 6, flexShrink: 0, borderRight: '1px solid var(--border-color, #e2e8f0)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" checked={scurveMode === 'all'} onChange={() => setScurveMode('all')} />
                        <span style={{ fontSize: 12 }}>Todos los recursos</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" checked={scurveMode === 'selected'} onChange={() => setScurveMode('selected')} />
                        <span style={{ fontSize: 12 }}>Recursos seleccionados</span>
                    </label>
                    <div style={{ borderTop: '1px solid #334155', margin: '4px 0', flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {resourcePool.map(r => (
                            <label key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: scurveMode === 'all' ? 0.5 : 1 }}>
                                <input type="checkbox"
                                    disabled={scurveMode === 'all'}
                                    checked={scurveSelection.includes(r.name)}
                                    onChange={(e) => {
                                        if (e.target.checked) setScurveSelection(prev => [...prev, r.name]);
                                        else setScurveSelection(prev => prev.filter(name => name !== r.name));
                                    }}
                                />
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.name}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Right pane: S-Curve Chart */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', paddingLeft: currentView === 'resUsage' ? 100 : 0 }}>
                    <SCurveChart
                        hideHeader
                        multiSelectIds={scurveMode === 'selected' && scurveSelection.length > 0 ? scurveSelection : undefined}
                        exactWidth={totalDays * pxPerDay}
                    />
                </div>
            </div>
        </div>
    );
}
