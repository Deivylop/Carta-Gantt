import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { isoDate, getExactElapsedRatio, dayDiff, addDays } from '../utils/cpm';

interface SCurveChartProps {
    hideHeader?: boolean;
    forcedActivityId?: string;
    multiSelectIds?: string[];
    exactWidth?: number;
    startDateMs?: number;
    endDateMs?: number;
}

export default function SCurveChart({ hideHeader, forcedActivityId, multiSelectIds, exactWidth }: SCurveChartProps = {}) {
    const { state } = useGantt();
    const [selectedId, setSelectedId] = useState<string>('__PROJECT__');

    const data = useMemo(() => {
        const effectiveId = forcedActivityId || selectedId;
        // 1. Get base tasks for the selected context
        let tasks: any[] = [];
        if (multiSelectIds) {
            tasks = state.activities.filter(a => multiSelectIds.includes(a.id) && a.type === 'task');
        } else if (effectiveId === '__PROJECT__') {
            tasks = state.activities.filter(a => a.type === 'task' && !a._isProjRow);
        } else {
            const idx = state.activities.findIndex(a => a.id === effectiveId);
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
            const rawStart = t.blES || t.ES;
            const rawEnd = t.blEF || t.EF;

            if (!rawStart || !rawEnd) return;
            const start = new Date(rawStart); start.setHours(0, 0, 0, 0);
            const end = new Date(rawEnd); end.setHours(0, 0, 0, 0);

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

            // The status date or chart coordinate evaluates to the end of the day.
            const evalDate = new Date(date);
            evalDate.setDate(evalDate.getDate() + 1);

            tasks.forEach(t => {
                const rawStart = t.blES || t.ES;
                const rawEnd = t.blEF || t.EF;
                if (!rawStart || !rawEnd) return;

                const cw = t.work || 0;
                const w = (t.weight != null && t.weight > 0) ? t.weight : cw;
                const wBackup = t.dur || 1;

                const ratio = getExactElapsedRatio(rawStart, rawEnd, evalDate, t.blCal || t.cal || state.defCal);

                earned += w * ratio;
                fallbackEarned += wBackup * ratio;
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

    }, [state.activities, state.progressHistory, state.statusDate, selectedId, multiSelectIds, forcedActivityId]);

    const textColor = state.lightMode ? '#1e293b' : '#f8fafc';
    const gridColor = state.lightMode ? '#e2e8f0' : '#334155';
    const plannedColor = '#3b82f6'; // Blue
    const actualColor = '#10b981'; // Green

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: exactWidth ? exactWidth : '100%', background: state.lightMode ? '#fff' : '#0f172a' }}>
            {!hideHeader && (
                <div className="fv-hdr" style={{ padding: '8px 16px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${gridColor}` }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>Analizar:</span>
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
            )}

            {data.points.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    No hay suficientes datos de fechas base o duraciones para calcular la Curva S.
                </div>
            ) : exactWidth ? (
                <SCurveCanvas
                    width={exactWidth}
                    projStart={state.projStart}
                    totalDays={state.totalDays}
                    pxPerDay={exactWidth / state.totalDays}
                    zoom={state.zoom}
                    lightMode={state.lightMode}
                    statusDate={state.statusDate}
                    points={data.points}
                    statusDateMs={data.statusDateMs}
                />
            ) : (
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data.points}
                            margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
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
                            <YAxis stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} domain={[0, 100]} tickFormatter={(val: number) => `${val}%`} />
                            <YAxis yAxisId="right" orientation="right" stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} domain={[0, 100]} tickFormatter={(val: number) => `${val}%`} />
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

// ─── Pure canvas S-Curve for pixel-perfect Gantt alignment ──────────
interface SCurveCanvasProps {
    width: number;
    projStart: Date;
    totalDays: number;
    pxPerDay: number;
    zoom: string;
    lightMode: boolean;
    statusDate: Date | null;
    points: { dateMs: number; planned: number; actual: number | null; name: string }[];
    statusDateMs: number;
}

function SCurveCanvas({ width, projStart, totalDays, pxPerDay, zoom, lightMode, statusDate, points, statusDateMs }: SCurveCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const PX = pxPerDay;
    const HDR_H = 36; // timeline axis height
    const LEGEND_H = 24;
    const PADDING_T = 10; // padding top for chart area
    const PADDING_B = 5;  // padding bottom for chart area

    const draw = useCallback((containerH: number) => {
        const c = canvasRef.current; if (!c) return;
        const totalH = Math.max(150, containerH);
        const chartH = totalH - HDR_H - LEGEND_H - PADDING_T - PADDING_B;
        c.width = width; c.height = totalH;
        c.style.width = width + 'px'; c.style.height = totalH + 'px';
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, width, totalH);

        // ─── Colors ──────────────────────────────────────
        const bgColor = lightMode ? '#ffffff' : '#0f172a';
        const gridColor = lightMode ? '#e2e8f0' : '#1e293b';
        const textColor = lightMode ? '#334155' : '#94a3b8';
        const plannedColor = '#3b82f6';
        const actualColor = '#06b6d4';

        // ─── Background ──────────────────────────────────
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, totalH - HDR_H);

        // ─── Legend ──────────────────────────────────────
        ctx.font = '11px Segoe UI';
        const lgY = 14;
        // Planned
        ctx.fillStyle = plannedColor;
        ctx.fillRect(width / 2 - 140, lgY - 6, 14, 3);
        ctx.beginPath(); ctx.arc(width / 2 - 133, lgY - 5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = textColor;
        ctx.fillText('Avance Programado', width / 2 - 122, lgY);
        // Actual
        ctx.fillStyle = actualColor;
        ctx.fillRect(width / 2 + 30, lgY - 6, 14, 3);
        ctx.beginPath(); ctx.arc(width / 2 + 37, lgY - 5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = textColor;
        ctx.fillText('Avance Real', width / 2 + 50, lgY);

        const chartTop = LEGEND_H + PADDING_T;
        const chartBot = chartTop + chartH;

        // ─── Y Axis labels + horizontal grid ─────────────
        const yTicks = [0, 25, 50, 75, 100];
        ctx.font = '10px Segoe UI';
        yTicks.forEach(pct => {
            const y = chartBot - (pct / 100) * chartH;
            // Grid line
            ctx.strokeStyle = gridColor;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            ctx.setLineDash([]);
            // Label
            ctx.fillStyle = textColor;
            ctx.fillText(`${pct}%`, 4, y - 3);
        });

        // ─── Vertical month grid lines ───────────────────
        let cur = new Date(projStart);
        const end = addDays(projStart, totalDays);
        while (cur < end) {
            const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            const x = dayDiff(projStart, nm) * PX;
            if (x > 0 && x < width) {
                ctx.strokeStyle = gridColor;
                ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(x, chartTop); ctx.lineTo(x, chartBot); ctx.stroke();
            }
            cur = nm;
        }

        // ─── Helper: date ms → x pixel (same as Gantt!) ──
        const msToX = (ms: number) => {
            const date = new Date(ms);
            return dayDiff(projStart, date) * PX;
        };

        // ─── Status Date line (red dashed) ───────────────
        if (statusDateMs) {
            const sdX = msToX(statusDateMs);
            if (sdX >= 0 && sdX <= width) {
                ctx.strokeStyle = '#ef4444';
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(sdX, chartTop); ctx.lineTo(sdX, chartBot); ctx.stroke();
                ctx.setLineDash([]);
                ctx.lineWidth = 1;
                // Label
                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 10px Segoe UI';
                ctx.fillText('Fecha de Corte', sdX + 4, chartTop + 12);
            }
        }

        // ─── Today line (amber) ──────────────────────────
        const todayX = dayDiff(projStart, new Date()) * PX;
        if (todayX >= 0 && todayX <= width) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(todayX, chartTop, 2, chartH);
        }

        // ─── Pct → y pixel ───────────────────────────────
        const pctToY = (pct: number) => chartBot - (pct / 100) * chartH;

        // ─── Draw planned curve ──────────────────────────
        if (points.length > 0) {
            ctx.strokeStyle = plannedColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            points.forEach((p, i) => {
                const x = msToX(p.dateMs);
                const y = pctToY(p.planned);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.lineWidth = 1;

            // Dots
            ctx.fillStyle = plannedColor;
            points.forEach(p => {
                const x = msToX(p.dateMs);
                const y = pctToY(p.planned);
                ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
            });
        }

        // ─── Draw actual curve ───────────────────────────
        const actualPoints = points.filter(p => p.actual !== null && p.actual !== undefined);
        if (actualPoints.length > 0) {
            ctx.strokeStyle = actualColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            actualPoints.forEach((p, i) => {
                const x = msToX(p.dateMs);
                const y = pctToY(p.actual!);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.lineWidth = 1;

            // Dots
            ctx.fillStyle = actualColor;
            actualPoints.forEach(p => {
                const x = msToX(p.dateMs);
                const y = pctToY(p.actual!);
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
            });
        }

        // ─── Timeline Axis (footer) ────────────────────
        const axisTop = totalH - HDR_H;
        const colors = lightMode ? {
            topBg: '#e2e8f0', topBorder: '#cbd5e1', topText: '#334155',
            botBg: '#f1f5f9', botBorder: '#e2e8f0', botText: '#334155', weekend: '#e0e7ff',
        } : {
            topBg: '#0a0f1a', topBorder: '#1f2937', topText: '#94a3b8',
            botBg: '#0f172a', botBorder: '#1e293b', botText: '#64748b', weekend: '#1a1040',
        };

        // Month headers
        cur = new Date(projStart);
        while (cur < end) {
            const x = dayDiff(projStart, cur) * PX;
            const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            const w = Math.min(dayDiff(cur, nm) * PX, width - x);
            ctx.fillStyle = colors.topBg; ctx.fillRect(x, axisTop, w, 17);
            ctx.strokeStyle = colors.topBorder; ctx.strokeRect(x, axisTop, w, 17);
            ctx.fillStyle = colors.topText; ctx.font = 'bold 10px Segoe UI';
            const lbl = cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
            if (w > 24) ctx.fillText(lbl, x + 4, axisTop + 12);
            cur = nm;
        }

        // Sub-headers
        cur = new Date(projStart);
        while (cur < end) {
            const x = dayDiff(projStart, cur) * PX;
            if (zoom === 'month') {
                const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const w = dayDiff(cur, nm) * PX;
                ctx.fillStyle = colors.botBg; ctx.fillRect(x, axisTop + 17, w, 19);
                ctx.strokeStyle = colors.botBorder; ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                cur = nm;
            } else if (zoom === 'week') {
                const w = 7 * PX;
                ctx.fillStyle = colors.botBg; ctx.fillRect(x, axisTop + 17, w, 19);
                ctx.strokeStyle = colors.botBorder; ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                const dd = 'S ' + String(cur.getDate()).padStart(2, '0') + '/' + String(cur.getMonth() + 1).padStart(2, '0');
                ctx.fillStyle = colors.botText; ctx.font = '9px Segoe UI';
                if (PX * 7 > 40) ctx.fillText(dd, x + 2, axisTop + 30);
                cur.setDate(cur.getDate() + 7);
            } else {
                const isSun = cur.getDay() === 0, isSat = cur.getDay() === 6;
                ctx.fillStyle = isSun || isSat ? colors.weekend : colors.botBg; ctx.fillRect(x, axisTop + 17, PX, 19);
                ctx.strokeStyle = colors.botBorder; ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                const days = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
                ctx.fillStyle = isSun || isSat ? (lightMode ? '#94a3b8' : '#374151') : colors.botText; ctx.font = '9px Segoe UI';
                if (PX >= 18) ctx.fillText(days[cur.getDay()], x + 2, axisTop + 30);
                else if (PX >= 14) ctx.fillText(String(cur.getDate()), x + 2, axisTop + 30);
                cur.setDate(cur.getDate() + 1);
            }
        }

        // Today & status date markers on axis
        if (todayX >= 0 && todayX <= width) {
            ctx.fillStyle = '#f59e0b'; ctx.fillRect(todayX, axisTop, 2, HDR_H);
        }
        if (statusDate) {
            const sdx = dayDiff(projStart, statusDate) * PX;
            if (sdx >= 0 && sdx <= width) {
                ctx.fillStyle = '#06b6d4'; ctx.fillRect(sdx, axisTop, 2, HDR_H);
            }
        }
    }, [width, projStart, totalDays, PX, zoom, lightMode, statusDate, points, statusDateMs]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            draw(el.getBoundingClientRect().height);
        });
        ro.observe(el);
        draw(el.getBoundingClientRect().height);
        return () => ro.disconnect();
    }, [draw]);

    return (
        <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
    );
}
