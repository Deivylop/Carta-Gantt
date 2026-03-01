// ═══════════════════════════════════════════════════════════════════
// ProjectConfigModal – Configure a portfolio project's settings
// Fields: name, code, start date, status date, calendar, priority, status
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import type { ProjectMeta } from '../../types/portfolio';
import { Settings } from 'lucide-react';

interface Props {
    open: boolean;
    project: ProjectMeta | null; // null = creating new project
    epsId: string | null;        // target EPS for new projects
    nextCode?: string;           // auto-generated next code for new projects
    existingCodes?: string[];    // existing codes to validate uniqueness
    onSave: (data: {
        name: string;
        code: string;
        priority: number;
        status: ProjectMeta['status'];
        startDate: string;
        statusDate: string;
        calendar: string;
        description: string;
    }) => void;
    onClose: () => void;
    customCalendars?: { id: string; name: string }[];
}

export default function ProjectConfigModal({ open, project, nextCode = 'PRY-001', existingCodes = [], onSave, onClose, customCalendars = [] }: Props) {
    const [form, setForm] = useState({
        name: '',
        code: '',
        priority: '1',
        status: 'Planificación' as ProjectMeta['status'],
        startDate: '',
        statusDate: '',
        calendar: '6',
        description: '',
    });
    const [codeError, setCodeError] = useState('');

    useEffect(() => {
        if (open) {
            setCodeError('');
            if (project) {
                setForm({
                    name: project.name,
                    code: project.code,
                    priority: String(project.priority),
                    status: project.status,
                    startDate: project.startDate ? project.startDate.slice(0, 10) : '',
                    statusDate: project.statusDate ? project.statusDate.slice(0, 10) : '',
                    calendar: '6',
                    description: project.description,
                });
            } else {
                const today = new Date().toISOString().slice(0, 10);
                setForm({
                    name: '',
                    code: nextCode,
                    priority: '1',
                    status: 'Planificación',
                    startDate: today,
                    statusDate: today,
                    calendar: '6',
                    description: '',
                });
            }
        }
    }, [open, project, nextCode]);

    if (!open) return null;

    const F = (key: string, val: string) => {
        setForm(f => ({ ...f, [key]: val }));
        if (key === 'code') {
            // Validate uniqueness (skip check against the project being edited)
            const editingCode = project?.code;
            if (val && val !== editingCode && existingCodes.includes(val)) {
                setCodeError('Este código ya está en uso');
            } else {
                setCodeError('');
            }
        }
    };

    const handleSave = () => {
        const finalCode = form.code || nextCode;
        // Block save if code is duplicate
        const editingCode = project?.code;
        if (finalCode !== editingCode && existingCodes.includes(finalCode)) {
            setCodeError('Este código ya está en uso');
            return;
        }
        onSave({
            name: form.name || 'Nuevo Proyecto',
            code: finalCode,
            priority: parseInt(form.priority) || 1,
            status: form.status,
            startDate: form.startDate,
            statusDate: form.statusDate,
            calendar: form.calendar,
            description: form.description,
        });
    };

    return (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal" style={{ width: 480 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Settings size={18} style={{ color: '#6366f1' }} />
                    <h2 style={{ margin: 0 }}>
                        {project ? 'Configuración del Proyecto' : 'Nuevo Proyecto'}
                    </h2>
                </div>
                <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 16px' }}>
                    {project ? 'Edite las propiedades del proyecto' : 'Complete los datos para crear un nuevo proyecto en la cartera'}
                </p>

                <div className="form-group">
                    <label className="form-label">Nombre del Proyecto</label>
                    <input className="form-input" value={form.name} onChange={e => F('name', e.target.value)} placeholder="Mi Proyecto" />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Código (ID)</label>
                        <input className="form-input" value={form.code} onChange={e => F('code', e.target.value)} placeholder="PRY-001" style={codeError ? { borderColor: '#ef4444' } : undefined} />
                        {codeError && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>{codeError}</div>}
                    </div>
                    <div className="form-group">
                        <label className="form-label">Prioridad</label>
                        <input className="form-input" type="number" min="1" value={form.priority} onChange={e => F('priority', e.target.value)} />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Fecha de Inicio</label>
                        <input className="form-input" type="date" value={form.startDate} onChange={e => F('startDate', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Fecha de Corte (Status)</label>
                        <input className="form-input" type="date" value={form.statusDate} onChange={e => F('statusDate', e.target.value)} />
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: 4, lineHeight: 1.2 }}>
                            Se evalúa al final del día (jornada completa).
                        </div>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Calendario por Defecto</label>
                        <select className="form-input" value={form.calendar} onChange={e => F('calendar', e.target.value)}>
                            <option value="5">5 días - Lunes a Viernes</option>
                            <option value="6">6 días - Lunes a Sábado</option>
                            <option value="7">7 días - Continuo</option>
                            {customCalendars.map(cc => (
                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Estado</label>
                        <select className="form-input" value={form.status} onChange={e => F('status', e.target.value as ProjectMeta['status'])}>
                            <option value="Planificación">Planificación</option>
                            <option value="Ejecución">Ejecución</option>
                            <option value="Suspendido">Suspendido</option>
                            <option value="Completado">Completado</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Descripción</label>
                    <textarea
                        className="form-input"
                        value={form.description}
                        onChange={e => F('description', e.target.value)}
                        rows={3}
                        placeholder="Descripción del proyecto..."
                        style={{ resize: 'vertical', minHeight: 60 }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        {project ? 'Guardar' : 'Crear Proyecto'}
                    </button>
                </div>
            </div>
        </div>
    );
}
