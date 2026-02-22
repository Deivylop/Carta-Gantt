import { useRef, useEffect } from 'react';
import { useGantt } from '../store/GanttContext';
import { ChevronDown, ChevronRight, User } from 'lucide-react';

const ROW_H = 26;
const HDR_H = 36;

export default function ResourceUsageTable() {
    const { state, dispatch } = useGantt();
    const { resourcePool, activities, expResources, lightMode, tableW } = state;
    const bodyRef = useRef<HTMLDivElement>(null);

    // Filter project rows
    const normalActs = activities.filter(a => !a._isProjRow && a.type !== 'summary');
    const renderRows: any[] = [];
    let totalProjectWork = 0;

    resourcePool.forEach((res) => {
        const assignedActs = normalActs.filter(a => a.resources && a.resources.some(r => r.name === res.name));
        if (assignedActs.length === 0) return;

        let resTotalWork = 0;
        const actRows: any[] = [];

        assignedActs.forEach(a => {
            const assignment = a.resources!.find(r => r.name === res.name)!;
            const work = assignment.work || 0;
            resTotalWork += work;
            actRows.push({ ...a, _isResChild: true, _resWork: work });
        });

        totalProjectWork += resTotalWork;
        const isExp = expResources.has(res.name);

        renderRows.push({
            _isResParent: true,
            id: res.name,
            name: res.name,
            work: resTotalWork,
            isExp
        });

        if (isExp) {
            renderRows.push(...actRows);
        }
    });

    useEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        const handler = () => {
            const grBody = document.getElementById('res-gr-body');
            if (grBody) grBody.scrollTop = body.scrollTop;
        };
        body.addEventListener('scroll', handler);
        return () => body.removeEventListener('scroll', handler);
    }, []);

    const toggleRes = (name: string) => dispatch({ type: 'TOGGLE_RES_COLLAPSE', id: name });

    const t = lightMode ? {
        hdrBg: '#e2e8f0', hdrBorder: '#cbd5e1', text: '#334155', rowEven: '#ffffff', rowOdd: '#f8fafc', border: '#e2e8f0', cellBg: '#f1f5f9'
    } : {
        hdrBg: '#0f172a', hdrBorder: '#1e293b', text: '#cbd5e1', rowEven: '#0d1422', rowOdd: '#111827', border: '#1e293b', cellBg: '#0a0f1a'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: tableW, borderRight: `2px solid ${t.border} `, background: t.rowEven, fontSize: 11, color: t.text, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ height: HDR_H, display: 'flex', background: t.hdrBg, borderBottom: `1px solid ${t.hdrBorder} `, fontWeight: 600, flexShrink: 0 }}>
                <div style={{ width: 40, borderRight: `1px solid ${t.hdrBorder} `, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={14} />
                </div>
                <div style={{ flex: 1, padding: '0 8px', display: 'flex', alignItems: 'center', borderRight: `1px solid ${t.hdrBorder} ` }}>
                    Nombre del recurso
                </div>
                <div style={{ width: 80, padding: '0 8px', display: 'flex', alignItems: 'center', borderLeft: `1px solid ${t.hdrBorder} `, justifyContent: 'flex-end' }}>
                    Trabajo
                </div>
            </div>

            {/* Body */}
            <div ref={bodyRef} id="res-gl-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {renderRows.map((r, i) => (
                    <div key={r._isResParent ? `res - ${r.id} ` : `act - ${r.id} -${i} `}
                        style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${t.border} `, background: i % 2 === 0 ? t.rowEven : t.rowOdd }}
                    >
                        {r._isResParent ? (
                            <>
                                <div style={{ width: 40, borderRight: `1px solid ${t.hdrBorder} `, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.cellBg, cursor: 'pointer' }} onClick={() => toggleRes(r.name)}>
                                    {r.isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </div>
                                <div style={{ flex: 1, padding: '0 8px', display: 'flex', alignItems: 'center', borderRight: `1px solid ${t.hdrBorder} `, fontWeight: 'bold' }}>
                                    <User size={12} style={{ marginRight: 6, color: '#dc2626' }} />
                                    <span style={{ color: '#dc2626' }}>{r.name}</span>
                                </div>
                                <div style={{ width: 80, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 'bold', color: '#dc2626' }}>
                                    {r.work.toLocaleString('es-CL')} horas
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ width: 40, borderRight: `1px solid ${t.hdrBorder} ` }} />
                                <div style={{ flex: 1, padding: '0 24px', display: 'flex', alignItems: 'center', borderRight: `1px solid ${t.hdrBorder} `, fontStyle: 'italic' }}>
                                    {r.name}
                                </div>
                                <div style={{ width: 80, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontStyle: 'italic' }}>
                                    {r._resWork.toLocaleString('es-CL')} horas
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
