// ═══════════════════════════════════════════════════════════════════
// Resource Sheet – Full CRUD editable table for resource pool
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useGantt } from '../store/GanttContext';
import { newPoolResource } from '../utils/helpers';

const RS_COLS = [
    { key: 'rid', label: '#', w: 40, edit: false },
    { key: 'name', label: 'Nombre del recurso', w: 160, edit: true },
    { key: 'type', label: 'Tipo', w: 80, edit: 'select' },
    { key: 'materialLabel', label: 'Etiqueta material', w: 100, edit: true },
    { key: 'initials', label: 'Iniciales', w: 60, edit: true },
    { key: 'group', label: 'Grupo', w: 100, edit: true },
    { key: 'maxCapacity', label: 'Capacidad máx.', w: 80, edit: true },
    { key: 'stdRate', label: 'Tasa estándar', w: 80, edit: true },
    { key: 'overtimeRate', label: 'Tasa horas extra', w: 90, edit: true },
    { key: 'costPerUse', label: 'Costo/Uso', w: 80, edit: true },
    { key: 'accrual', label: 'Acumulación', w: 80, edit: 'select' },
    { key: 'calendar', label: 'Calendario', w: 70, edit: 'select' },
    { key: 'code', label: 'Código', w: 70, edit: true },
];

export default function ResourceSheet() {
    const { state, dispatch } = useGantt();
    const [selRid, setSelRid] = useState<number | null>(null);

    const resources = state.resourcePool;

    const updateResource = (rid: number, key: string, value: string) => {
        const updated = resources.map(r => r.rid === rid ? { ...r, [key]: value } : r);
        dispatch({ type: 'SET_RESOURCES', resources: updated });
    };

    const addResource = () => {
        const nr = newPoolResource();
        nr.name = 'Recurso ' + (resources.length + 1);
        nr.initials = 'R' + (resources.length + 1);
        dispatch({ type: 'ADD_TO_POOL', resource: nr });
    };

    const deleteResource = () => {
        if (selRid === null) return;
        if (!confirm('¿Eliminar recurso?')) return;
        dispatch({ type: 'SET_RESOURCES', resources: resources.filter(r => r.rid !== selRid) });
        setSelRid(null);
    };

    const totalW = RS_COLS.reduce((s, c) => s + c.w, 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 6, padding: '4px 8px', background: 'var(--bg-ribbon)', borderBottom: '1px solid var(--border-primary)' }}>
                <button className="rbtn" onClick={addResource}>+ Nuevo Recurso</button>
                <button className="rbtn" onClick={deleteResource}>🗑️ Eliminar</button>
            </div>

            {/* Header */}
            <div style={{ display: 'flex', flexShrink: 0 }}>
                {RS_COLS.map(c => (
                    <div key={c.key} className="col-hdr" style={{ width: c.w }}>{c.label}</div>
                ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {resources.map(r => (
                    <div key={r.rid}
                        className={`trow ${selRid === r.rid ? 'sel' : ''}`}
                        style={{ width: totalW }}
                        onClick={() => setSelRid(r.rid)}>
                        {RS_COLS.map(c => {
                            const val = String((r as any)[c.key] || '');
                            if (c.edit === 'select') {
                                let options: { v: string; l: string }[] = [];
                                if (c.key === 'type') options = [{ v: 'Trabajo', l: 'Trabajo' }, { v: 'Material', l: 'Material' }, { v: 'Costo', l: 'Costo' }];
                                if (c.key === 'accrual') options = [{ v: 'Comienzo', l: 'Comienzo' }, { v: 'Prorrateo', l: 'Prorrateo' }, { v: 'Fin', l: 'Fin' }];
                                if (c.key === 'calendar') options = [{ v: '5d', l: '5d' }, { v: '6d', l: '6d' }, { v: '7d', l: '7d' }];
                                return (
                                    <div key={c.key} className="tcell" style={{ width: c.w }}>
                                        <select style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', fontSize: 11, outline: 'none' }}
                                            value={val} onChange={e => updateResource(r.rid, c.key, e.target.value)}>
                                            {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                        </select>
                                    </div>
                                );
                            }
                            if (c.edit === true) {
                                return (
                                    <div key={c.key} className="tcell" style={{ width: c.w }}
                                        contentEditable suppressContentEditableWarning spellCheck={false}
                                        onBlur={e => updateResource(r.rid, c.key, e.currentTarget.textContent || '')}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}>
                                        {val}
                                    </div>
                                );
                            }
                            return <div key={c.key} className="tcell tcell-num" style={{ width: c.w }}>{val}</div>;
                        })}
                    </div>
                ))}
                {/* Empty rows */}
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={`empty-r-${i}`} className="trow" style={{ width: totalW, opacity: 0.15 }}>
                        {RS_COLS.map(c => <div key={c.key} className="tcell" style={{ width: c.w }} />)}
                    </div>
                ))}
            </div>
        </div>
    );
}
