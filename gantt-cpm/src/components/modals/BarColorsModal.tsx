import { useState, useEffect } from 'react';
import type { GanttState } from '../../store/GanttContext';

interface Props {
    colors: GanttState['barColors'];
    onSave: (colors: Partial<GanttState['barColors']>) => void;
    onClose: () => void;
}

export default function BarColorsModal({ colors, onSave, onClose }: Props) {
    const [localColors, setLocalColors] = useState(colors);

    useEffect(() => { setLocalColors(colors); }, [colors]);

    const handleChange = (key: keyof GanttState['barColors'], val: string) => {
        setLocalColors(prev => ({ ...prev, [key]: val }));
    };

    const categories = [
        { key: 'normal' as const, label: 'Trabajo normal' },
        { key: 'critical' as const, label: 'Trabajo crítico' },
        { key: 'progress' as const, label: 'Trabajo real' },
        { key: 'baseline' as const, label: 'Base de proyecto' },
        { key: 'summary' as const, label: 'Resumen' },
        { key: 'milestone' as const, label: 'Hito' },
    ];

    return (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ width: 450 }}>
                <div className="modal-header">
                    <h2>Configuración de Barras</h2>
                    <button className="icon-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <table className="rt-table" style={{ width: '100%', marginBottom: 16 }}>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th style={{ width: 100 }}>Color</th>
                                <th style={{ width: 100 }}>Vista Previa</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(cat => (
                                <tr key={cat.key}>
                                    <td>{cat.label}</td>
                                    <td>
                                        <input
                                            type="color"
                                            value={localColors[cat.key]}
                                            onChange={(e) => handleChange(cat.key, e.target.value)}
                                            style={{ width: '100%', height: 28, cursor: 'pointer', border: 'none', padding: 0 }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {cat.key === 'milestone' ? (
                                            <div style={{
                                                width: 14, height: 14, transform: 'rotate(45deg)',
                                                background: localColors[cat.key], margin: '0 auto', border: '1px solid #000'
                                            }} />
                                        ) : (
                                            <div style={{
                                                width: '100%', height: 14,
                                                background: localColors[cat.key],
                                                borderRadius: 2
                                            }} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="btn" onClick={onClose}>Cancelar</button>
                        <button className="btn primary" onClick={() => { onSave(localColors); onClose(); }}>Guardar Cambios</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
