// ═══════════════════════════════════════════════════════════════════
// Project Configuration Modal – matches HTML #modal-overlay exactly
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { isoDate, parseDate } from '../../utils/cpm';

export default function ProjectModal() {
    const { state, dispatch } = useGantt();
    const [form, setForm] = useState({ name: '', start: '', status: '', cal: '6' });

    useEffect(() => {
        if (state.projModalOpen) {
            setForm({
                name: state.projName,
                start: isoDate(state.projStart),
                status: isoDate(state.statusDate),
                cal: String(state.defCal),
            });
        }
    }, [state.projModalOpen]);

    if (!state.projModalOpen) return null;

    const save = () => {
        const config: any = {};
        config.projName = form.name || 'Mi Proyecto';
        const d = parseDate(form.start);
        if (d) config.projStart = d;
        const sd = parseDate(form.status);
        if (sd) config.statusDate = sd;
        config.defCal = parseInt(form.cal) || 6;
        dispatch({ type: 'SET_PROJECT_CONFIG', config });
        dispatch({ type: 'CLOSE_PROJ_MODAL' });
    };

    const close = () => dispatch({ type: 'CLOSE_PROJ_MODAL' });
    const F = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

    return (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="modal" style={{ width: 420 }}>
                <h2>Configuración del Proyecto</h2>
                <div className="form-group"><label className="form-label">Nombre del Proyecto</label>
                    <input className="form-input" value={form.name} onChange={e => F('name', e.target.value)} />
                </div>
                <div className="form-row">
                    <div className="form-group"><label className="form-label">Fecha de Inicio</label>
                        <input className="form-input" type="date" value={form.start} onChange={e => F('start', e.target.value)} />
                    </div>
                    <div className="form-group"><label className="form-label">Fecha de Corte (Status)</label>
                        <input className="form-input" type="date" value={form.status} onChange={e => F('status', e.target.value)} />
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: 4, lineHeight: 1.2 }}>
                            Nota: Se evalúa al final del día (jornada completa).
                        </div>
                    </div>
                </div>
                <div className="form-group"><label className="form-label">Calendario por Defecto</label>
                    <select className="form-input" value={form.cal} onChange={e => F('cal', e.target.value)}>
                        <option value="5">5 días - Lunes a Viernes</option>
                        <option value="6">6 días - Lunes a Sábado</option>
                        <option value="7">7 días - Continuo</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                    <button className="btn btn-ghost" onClick={close}>Cancelar</button>
                    <button className="btn btn-primary" onClick={save}>Guardar</button>
                </div>
            </div>
        </div>
    );
}
