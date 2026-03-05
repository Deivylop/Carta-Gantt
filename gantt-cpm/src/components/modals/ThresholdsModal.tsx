import { useState, useEffect } from 'react';
import { useGantt } from '../../store/GanttContext';
import { X, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ProjectThreshold, ThresholdParameter, ThresholdSeverity } from '../../types/gantt';

export function ThresholdsModal() {
    const { state, dispatch } = useGantt();
    const [thresholds, setThresholds] = useState<ProjectThreshold[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Obtener ID real del proyecto actual si lo hay guardado para carga a base de datos.
    const projectId = localStorage.getItem('GANTT_ACTIVE_PROJECT_ID') || localStorage.getItem('supabase_project_id');

    const parameterLabels: Record<ThresholdParameter, string> = {
        devPct: '% Desviación',
        varStart: 'Variación de Inicio (días)',
        varEnd: 'Variación de Fin (días)',
        varDur: 'Variación de Duración (días)',
    };

    const severityColors: Record<ThresholdSeverity, string> = {
        'Crítica': '#ef4444',
        'Alta': '#f97316',
        'Media': '#eab308',
        'Baja': '#3b82f6',
    };

    useEffect(() => {
        if (!projectId) {
            setLoading(false);
            return;
        }
        loadThresholds();
    }, [projectId, state.activeModal]);

    const loadThresholds = async () => {
        setLoading(true);
        if(!projectId) return;

        const { data, error } = await supabase
            .from('project_thresholds')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (!error && data) {
            setThresholds(data as ProjectThreshold[]);
        }
        setLoading(false);
    };

    const handleAdd = () => {
        if (!projectId) {
            alert("No hay un proyecto conectado a la base de datos.");
            return;
        }
        const newThreshold: Partial<ProjectThreshold> = {
            id: 'temp-' + Date.now(),
            project_id: projectId,
            parameter: 'devPct',
            operator: '<',
            limit_value: -5,
            severity: 'Crítica',
            active: true
        };
        setThresholds([...thresholds, newThreshold as ProjectThreshold]);
    };

    const handleUpdate = (id: string, field: keyof ProjectThreshold, value: any) => {
        setThresholds(thresholds.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    const handleRemove = async (id: string) => {
        if (!id.startsWith('temp-')) {
            await supabase.from('project_thresholds').delete().eq('id', id);
        }
        setThresholds(thresholds.filter(t => t.id !== id));
    };

    const handleSaveAndClose = async () => {
        const toUpsert = thresholds.map(t => {
            const copy = { ...t };
            if (copy.id.startsWith('temp-')) {
                // @ts-ignore
                delete copy.id; // Let supabase generate UUID
            }
            return copy;
        });

        if (toUpsert.length > 0) {
            await supabase.from('project_thresholds').upsert(toUpsert);
        }

        dispatch({ type: 'CLOSE_MODAL' });
    };

    const handleClose = () => dispatch({ type: 'CLOSE_MODAL' });

    if (state.activeModal !== 'thresholds') return null;

    return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black bg-opacity-70">
            <div className="bg-white text-gray-900 rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h2 className="text-lg font-semibold">Reglas de Control de Proyecto</h2>
                        <p className="text-xs text-gray-500">Configure los umbrales para envío de alertas y registro de problemas.</p>
                    </div>
                    <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto bg-gray-50">
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Cargando reglas...</div>
                    ) : thresholds.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                            Ninguna regla definida para este proyecto.<br />
                            <button onClick={handleAdd} className="mt-2 text-blue-600 hover:underline">Haga clic aquí para agregar una.</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {thresholds.map((t) => (
                                <div key={t.id} className={`flex items-center gap-3 p-3 bg-white border border-l-4 rounded shadow-sm`} style={{ borderLeftColor: severityColors[t.severity] }}>
                                    
                                    <div className="flex items-center">
                                        <input type="checkbox" checked={t.active} onChange={(e) => handleUpdate(t.id, 'active', e.target.checked)} className="cursor-pointer" title="Regla Activa" />
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">Si</span>
                                        <select value={t.parameter} onChange={(e) => handleUpdate(t.id, 'parameter', e.target.value)} className="border rounded p-1 text-sm bg-gray-50">
                                            <option value="devPct">% de Desviación Fis.</option>
                                            <option value="varStart">Variación de Inicio</option>
                                            <option value="varEnd">Variación de Fin</option>
                                            <option value="varDur">Variación de Duración</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">es</span>
                                        <select value={t.operator} onChange={(e) => handleUpdate(t.id, 'operator', e.target.value)} className="border rounded p-1 text-sm bg-gray-50">
                                            <option value="<">Menor a</option>
                                            <option value="<=">Menor o igual a</option>
                                            <option value=">">Mayor a</option>
                                            <option value=">=">Mayor o igual a</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-2 flex-1">
                                        <input type="number" value={t.limit_value} onChange={(e) => handleUpdate(t.id, 'limit_value', Number(e.target.value))} className="border rounded p-1 w-20 text-sm" />
                                    </div>

                                    <div className="flex items-center gap-2 justify-end">
                                        <span className="text-sm text-gray-500">→ Alerta:</span>
                                        <select value={t.severity} onChange={(e) => handleUpdate(t.id, 'severity', e.target.value)} className="border rounded p-1 text-sm bg-gray-50 uppercase font-semibold text-xs" style={{ color: severityColors[t.severity] }}>
                                            <option value="Crítica">CRÍTICA 🔴</option>
                                            <option value="Alta">ALTA 🟠</option>
                                            <option value="Media">MEDIA 🟡</option>
                                            <option value="Baja">BAJA 🔵</option>
                                        </select>
                                        <button onClick={() => handleRemove(t.id)} className="p-1 text-red-500 hover:bg-red-100 rounded ml-2" title="Eliminar Regla">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 flex justify-center">
                        <button onClick={handleAdd} className="flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50">
                            <Plus size={16} /> Añadir Nueva Regla
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t flex justify-end gap-2 bg-white rounded-b-lg">
                    <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 border border-gray-300 rounded transition-colors">
                        Cancelar
                    </button>
                    <button onClick={handleSaveAndClose} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors shadow-sm">
                        Guardar Umbrales
                    </button>
                </div>
            </div>
        </div>
    );
}
