import { useMemo, useState } from 'react';
import { useGantt } from '../store/GanttContext';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { isoDate } from '../utils/cpm';

export default function SCurveChart() {
    const { state } = useGantt();
    const [selectedId, setSelectedId] = useState<string>('__PROJECT__');

    const data = useMemo(() => {
        // 1. Get base tasks for the selected context
        let tasks: any[] = [];
        if (selectedId === '__PROJECT__') {
            tasks = state.activities.filter(a => a.type === 'task' && !a._isProjRow);
        } else {
            const idx = state.activities.findIndex(a => a.id === selectedId);
            if (idx >= 0) {
                const node = state.activities[idx];
                if (node.type === 'task') {
                    tasks = [node];
                } else if (node.type === 'summary') {
                    for (let i = idx + 1; i < state.activities.length; i++) {
                        const child = state.activities[i];
                        if (child.lv <= node.lv) break;
                        if (child.type === 'task') {
                            tasks.push(child);
                        }
                    }
                }
            }
        }

        if (tasks.length === 0) return { points: [], statusDateMs: 0 };

        let minMs = 8640000000000000; // Max possible date ms
        let maxMs = -8640000000000000; // Min possible date ms
        let totalWeight = 0;
        let fallbackTotalWeight = 0;

        tasks.forEach(t => {
            const start = t.blES || t.ES;
            const end = t.blEF || t.EF;
            const cw = t.work || 0;
            const w = (t.weight != null && t.weight > 0) ? t.weight : cw;
            const wBackup = t.dur || 1;

            if (start && start.getTime() < minMs) minMs = start.getTime();
            if (end && end.getTime() > maxMs) maxMs = end.getTime();

            if (start && end) {
                totalWeight += w;
                fallbackTotalWeight += wBackup;
            }
        });

        if (totalWeight === 0 || minMs > maxMs) return { points: [], statusDateMs: 0 };

        // Calculate weekly points from minDate to maxDate + 1 month
        const points: any[] = [];
        const minDate = new Date(minMs);
        const maxDate = new Date(maxMs);

        let current = new Date(minDate);
        current.setHours(0, 0, 0, 0);
        // Align to the same weekday as the status date to prevent misaligned points
        const targetDay = new Date(state.statusDate || new Date()).getDay();
        while (current.getDay() !== targetDay) {
            current.setDate(current.getDate() - 1);
        }

        const end = new Date(maxDate);
        end.setDate(end.getDate() + 14); // Add 2 weeks buffer

        const chartStartDateStr = isoDate(current);

        // Sort progress history and inject a 0% at the start of the chart
        const history = [
            { date: chartStartDateStr, actualPct: 0 },
            ...state.progressHistory
        ].sort((a, b) => a.date.localeCompare(b.date));

        const statusDateObj = state.statusDate || new Date();

        const calcPlannedPct = (date: Date) => {
            let earned = 0;
            let fallbackEarned = 0;
            tasks.forEach(t => {
                const tStart = t.blES || t.ES;
                const tEnd = t.blEF || t.EF;
                const cw = t.work || 0;
                const w = (t.weight != null && t.weight > 0) ? t.weight : cw;
                const wBackup = t.dur || 1;

                if (!tStart || !tEnd) return;

                if (date >= tEnd) {
                    earned += w; // 100% completed of this task time
                    fallbackEarned += wBackup;
                } else if (date > tStart) {
                    // linear interpolation
                    const totalMs = tEnd.getTime() - tStart.getTime();
                    const elapsedMs = date.getTime() - tStart.getTime();
                    if (totalMs > 0) {
                        earned += w * (elapsedMs / totalMs);
                        fallbackEarned += wBackup * (elapsedMs / totalMs);
                    }
                }
            });
            if (totalWeight > 0) return (earned / totalWeight) * 100;
            if (fallbackTotalWeight > 0) return (fallbackEarned / fallbackTotalWeight) * 100;
            return 0;
        };

        const datesToEvaluate = new Set<number>();
        while (current <= end) {
            datesToEvaluate.add(current.getTime());
            current.setDate(current.getDate() + 7);
        }

        history.forEach(h => {
            const parts = h.date.split('-');
            if (parts.length === 3) {
                const dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
                dt.setHours(0, 0, 0, 0);
                datesToEvaluate.add(dt.getTime());
            }
        });

        const sDate = new Date(statusDateObj);
        sDate.setHours(0, 0, 0, 0);
        const sTime = sDate.getTime();
        datesToEvaluate.add(sTime);

        const sortedDates = Array.from(datesToEvaluate).sort((a, b) => a - b);

        sortedDates.forEach(time => {
            const d = new Date(time);
            const iso = isoDate(d);
            let actualPct: number | null = null;

            // Only plot actual progress for exact history dates or status date
            if (time <= sTime) {
                const exactRecord = history.find(h => h.date === iso);
                if (exactRecord) {
                    if (selectedId === '__PROJECT__') {
                        actualPct = exactRecord.actualPct;
                    } else {
                        let found = false;
                        const idx = history.indexOf(exactRecord);
                        for (let i = idx; i >= 0; i--) {
                            const rec = history[i];
                            if (rec.details && rec.details[selectedId] !== undefined) {
                                actualPct = rec.details[selectedId];
                                found = true;
                                break;
                            }
                        }
                        if (!found) actualPct = 0;
                    }
                } else if (time === sTime) {
                    if (selectedId === '__PROJECT__') {
                        const projAct = state.activities.find(a => a._isProjRow);
                        actualPct = projAct ? (projAct.pct || 0) : 0;
                    } else {
                        const selAct = state.activities.find(a => a.id === selectedId);
                        actualPct = selAct ? (selAct.pct || 0) : 0;
                    }
                }
            }

            points.push({
                name: d.toLocaleDateString(),
                dateISO: iso,
                dateMs: time,
                planned: parseFloat(calcPlannedPct(d).toFixed(2)),
                actual: actualPct !== null ? parseFloat(actualPct.toFixed(2)) : null
            });
        });

        return { points, statusDateMs: sTime };

    }, [state.activities, state.progressHistory, state.statusDate, selectedId]);

    const textColor = state.lightMode ? '#1e293b' : '#f8fafc';
    const gridColor = state.lightMode ? '#e2e8f0' : '#334155';
    const plannedColor = '#3b82f6'; // Blue
    const actualColor = '#10b981'; // Green

    return (
        <div style={{ padding: 20, width: '100%', height: '100%', backgroundColor: state.lightMode ? '#ffffff' : '#0f172a', color: textColor, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Curva S (Avance Programado vs Avance Real)</h2>
                <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    style={{
                        padding: '4px 8px', borderRadius: 4, border: `1px solid ${gridColor}`,
                        background: state.lightMode ? '#fff' : '#1e293b', color: textColor, outline: 'none', maxWidth: '300px'
                    }}
                >
                    <option value="__PROJECT__">Todo el Proyecto</option>
                    {state.activities.filter(a => !a._isProjRow).map(a => (
                        <option key={a.id} value={a.id}>
                            {'\u00A0'.repeat(a.lv * 4)}{a.id} - {a.name}
                        </option>
                    ))}
                </select>
            </div>

            {data.points.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    No hay suficientes datos de fechas base o duraciones para calcular la Curva S.
                </div>
            ) : (
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data.points}
                            margin={{
                                top: 5,
                                right: 30,
                                left: 20,
                                bottom: 25,
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis
                                type="number"
                                scale="time"
                                domain={['dataMin', 'dataMax']}
                                dataKey="dateMs"
                                stroke={textColor}
                                tick={{ fill: textColor, fontSize: 12 }}
                                tickFormatter={(val) => new Date(val).toLocaleDateString()}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis
                                stroke={textColor}
                                tick={{ fill: textColor, fontSize: 12 }}
                                domain={[0, 100]}
                                tickFormatter={(val: number) => `${val}%`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: state.lightMode ? '#fff' : '#1e293b', borderColor: gridColor, color: textColor }}
                                formatter={(value: any, name: any) => [`${value}%`, name]}
                                labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                            />
                            <Legend verticalAlign="top" height={36} />

                            <ReferenceLine x={data.statusDateMs} stroke="red" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Fecha de Corte', fill: 'red', fontSize: 12 }} />

                            <Line type="monotone" dataKey="planned" name="Avance Programado" stroke={plannedColor} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="actual" name="Avance Real" stroke={actualColor} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={true} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
