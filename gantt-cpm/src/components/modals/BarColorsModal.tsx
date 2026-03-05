import { useState, useEffect, useRef } from 'react';
import type { GanttState } from '../../store/GanttContext';

const BASIC_COLORS = [
    '#ff8080', '#ffff80', '#80ff80', '#00ff80', '#80ffff', '#0080ff', '#ff80c0', '#ff80ff',
    '#ff0000', '#ffff00', '#80ff00', '#00ff40', '#00ffff', '#0080c0', '#8080c0', '#ff00ff',
    '#804040', '#ff8040', '#00ff00', '#008080', '#004080', '#8080ff', '#800040', '#ff0080',
    '#800000', '#ff8000', '#008000', '#008040', '#0000ff', '#0000a0', '#800080', '#8000ff',
    '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
    '#000000', '#808000', '#808040', '#808080', '#408080', '#c0c0c0', '#400040', '#ffffff',
];

function ClassicPicker({ initialColor, onSelect, onCancel }: { initialColor: string, onSelect: (c: string) => void, onCancel: () => void }) {
    const [sel, setSel] = useState(initialColor);
    const [customColors, setCustomColors] = useState<string[]>(() => {
        const stored = localStorage.getItem('gantt_custom_colors');
        if (stored) return JSON.parse(stored);
        return new Array(16).fill('#ffffff');
    });
    const nativeInputRef = useRef<HTMLInputElement>(null);

    const handleSwatchClick = (c: string) => { setSel(c); };

    const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setSel(newColor);
        const firstWhiteIdx = customColors.findIndex(c => c.toLowerCase() === '#ffffff');
        const nextCustom = [...customColors];
        if (firstWhiteIdx !== -1) {
            nextCustom[firstWhiteIdx] = newColor;
        } else {
            nextCustom.unshift(newColor);
            nextCustom.pop();
        }
        setCustomColors(nextCustom);
        localStorage.setItem('gantt_custom_colors', JSON.stringify(nextCustom));
    };

    const swatchStyle = (c: string, isSel: boolean) => ({
        width: 20, height: 20,
        backgroundColor: c,
        borderTop: '1px solid #a0a0a0', borderLeft: '1px solid #a0a0a0',
        borderBottom: '1px solid #fff', borderRight: '1px solid #fff',
        outline: isSel ? '1px dotted #000' : 'none',
        outlineOffset: isSel ? '1px' : '0',
        cursor: 'pointer',
        boxSizing: 'border-box' as const,
        margin: '2px'
    });

    return (
        <div style={{ background: '#f0f0f0', color: '#000', padding: 12, borderRadius: 4, width: 260, border: '1px solid #ccc', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10000, fontFamily: 'Segoe UI, Tahoma, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 'bold' }}>Color</span>
                <span style={{ cursor: 'pointer', fontSize: 13 }} onClick={onCancel}>✕</span>
            </div>
            
            <div style={{ fontSize: 12, marginBottom: 4 }}>Colores básicos:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, max-content)', gap: 2, marginBottom: 12 }}>
                {BASIC_COLORS.map((c, i) => (
                    <div key={'bsc'+i} style={swatchStyle(c, sel.toLowerCase() === c.toLowerCase())} onClick={() => handleSwatchClick(c)} />
                ))}
            </div>

            <div style={{ fontSize: 12, marginBottom: 4 }}>Colores personalizados:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, max-content)', gap: 2, marginBottom: 16 }}>
                {customColors.map((c, i) => (
                    <div key={'cst'+i} style={swatchStyle(c, sel.toLowerCase() === c.toLowerCase())} onClick={() => handleSwatchClick(c)} />
                ))}
            </div>

            <input type="color" ref={nativeInputRef} onChange={handleNativeChange} style={{ display: 'none' }} />

            <button onClick={() => nativeInputRef.current?.click()} style={{ background: '#e1e1e1', border: '1px solid #adadad', borderRadius: 2, width: '100%', marginBottom: 16, padding: '4px 0', fontSize: 12, cursor: 'pointer' }}>Definir colores personalizados &gt;&gt;</button>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
                <button onClick={() => onSelect(sel)} style={{ background: '#e1e1e1', border: '1px solid #adadad', padding: '4px 20px', fontSize: 12, cursor: 'pointer' }}>Aceptar</button>
                <button onClick={onCancel} style={{ background: '#e1e1e1', border: '1px solid #adadad', padding: '4px 20px', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
            </div>
        </div>
    );
}

interface Props {
    colors: GanttState['barColors'];
    onSave: (colors: Partial<GanttState['barColors']>) => void;
    onClose: () => void;
}

export default function BarColorsModal({ colors, onSave, onClose }: Props) {
    const [localColors, setLocalColors] = useState(colors);
    const [pickingFor, setPickingFor] = useState<keyof GanttState['barColors'] | null>(null);

    useEffect(() => { setLocalColors(colors); }, [colors]);

    const handleColorSave = (val: string) => {
        if (pickingFor) {
            setLocalColors(prev => ({ ...prev, [pickingFor]: val }));
            setPickingFor(null);
        }
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
        <div className="modal-overlay open" style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ width: 450, background: 'var(--bg-panel)', padding: 20, borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Configuración de Barras</h2>
                    <button className="icon-btn" onClick={onClose} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 20, color: 'var(--text-main)' }}>&times;</button>
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
                                        <div
                                            onClick={() => setPickingFor(cat.key)}
                                            style={{
                                                width: '100%', height: 28, cursor: 'pointer',
                                                backgroundColor: localColors[cat.key],
                                                border: '1px solid #777',
                                                boxShadow: 'inset 0px 1px 3px rgba(0,0,0,0.2)'
                                            }}
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

            {pickingFor && (
                <ClassicPicker
                    initialColor={localColors[pickingFor]}
                    onSelect={handleColorSave}
                    onCancel={() => setPickingFor(null)}
                />
            )}
        </div>
    );
}
