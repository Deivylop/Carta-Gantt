import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { isoDate, getExactElapsedRatio, getExactWorkDays, dayDiff, addDays } from '../utils/cpm';
import type { ZoomLevel } from '../types/gantt';

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
        const isResUsage = state.currentView === 'resUsage';
        const isTaskUsage = state.currentView === 'usage';
        const isHoursMode = isResUsage || isTaskUsage;
        const effectiveId = forcedActivityId || selectedId;
        const isProjectLevel = !multiSelectIds && effectiveId === '__PROJECT__';

        let targetResNames: string[] = [];
        let tasks: any[] = [];

        if (isResUsage) {
            if (multiSelectIds && multiSelectIds.length > 0) {
                targetResNames = multiSelectIds;
            } else {
                targetResNames = isProjectLevel ? state.resourcePool.map(r => r.name) : [effectiveId];
            }
            tasks = state.activities.filter(a => !a._isProjRow && a.type === 'task' && a.resources && a.resources.some(r => targetResNames.includes(r.name)));
        } else if (isTaskUsage) {
            // Task usage: same task selection as default gantt but work in hours
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
                            if (child.type === 'task') tasks.push(child);
                        }
                    }
                }
            }
        } else {
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
        }

        if (tasks.length === 0) return { points: [], statusDateMs: 0, maxValue: 0, isHoursMode };

        let minMs = 8640000000000000;
        let maxMs = -8640000000000000;
        let totalWeight = 0;
        let fallbackTotalWeight = 0;

        tasks.forEach(t => {
            const rawStart = t.blES || t.ES;
            const rawEnd = t.blEF || t.EF;

            if (!rawStart || !rawEnd) return;
            const start = new Date(rawStart); start.setHours(0, 0, 0, 0);
            const end = new Date(rawEnd); end.setHours(0, 0, 0, 0);

            let w = 0, wBackup = 0;
            if (isResUsage) {
                const resWork = t.resources?.filter((r: any) => targetResNames.includes(r.name)).reduce((sum: number, r: any) => sum + (r.work || 0), 0) || 0;
                w = resWork;
                wBackup = resWork;
            } else if (isTaskUsage) {
                w = t.work || 0;
                wBackup = t.work || 0;
            } else {
                const cw = t.work || 0;
                w = (t.weight != null && t.weight > 0) ? t.weight : (cw || t.dur || 1);
                wBackup = t.dur || 1;
            }

            if (start && start.getTime() < minMs) minMs = start.getTime();
            if (end && end.getTime() > maxMs) maxMs = end.getTime();

            if (start && end) {
                totalWeight += w;
                fallbackTotalWeight += wBackup;
            }
        });

        if (totalWeight === 0 || minMs > maxMs) return { points: [], statusDateMs: 0, maxValue: 0, isHoursMode };

        const points: any[] = [];
        const minDate = new Date(minMs);
        const maxDate = new Date(maxMs);

        let current = new Date(minDate);
        current.setHours(0, 0, 0, 0);
        const targetDay = new Date(state.statusDate || new Date()).getDay();
        while (current.getDay() !== targetDay) {
            current.setDate(current.getDate() - 1);
        }

        const end = new Date(maxDate);
        end.setDate(end.getDate() + 14);

        const chartStartDateStr = isoDate(current);

        const history = [
            { date: chartStartDateStr, actualPct: 0 },
            ...state.progressHistory
        ].sort((a, b) => a.date.localeCompare(b.date));

        const statusDateObj = state.statusDate || new Date();

        const calcPlannedPct = (date: Date) => {
            let earned = 0;
            let fallbackEarned = 0;

            const evalDate = new Date(date);
            evalDate.setDate(evalDate.getDate() + 1);

            tasks.forEach(t => {
                const rawStart = t.blES || t.ES;
                const rawEnd = t.blEF || t.EF;
                if (!rawStart || !rawEnd) return;

                let w = 0, wBackup = 0;
                if (isResUsage) {
                    const resWork = t.resources?.filter((r: any) => targetResNames.includes(r.name)).reduce((sum: number, r: any) => sum + (r.work || 0), 0) || 0;
                    w = resWork; wBackup = resWork;
                } else if (isTaskUsage) {
                    w = t.work || 0; wBackup = t.work || 0;
                } else {
                    const cw = t.work || 0;
                    w = (t.weight != null && t.weight > 0) ? t.weight : (cw || t.dur || 1);
                    wBackup = t.dur || 1;
                }

                // Check if active baseline has pct data for two-segment interpolation
                const activeBl = (t.baselines || [])[state.activeBaselineIdx] || null;
                let ratio: number;
                if (activeBl && activeBl.pct != null && activeBl.pct > 0 && activeBl.statusDate) {
                    const stObj = new Date(rawStart); stObj.setHours(0, 0, 0, 0);
                    const endObj = new Date(rawEnd); endObj.setHours(0, 0, 0, 0);
                    const blStatusEnd = new Date(activeBl.statusDate);
                    blStatusEnd.setHours(0, 0, 0, 0);
                    blStatusEnd.setDate(blStatusEnd.getDate() + 1);
                    const blPct = activeBl.pct / 100;

                    if (evalDate <= stObj) {
                        ratio = 0;
                    } else if (evalDate >= endObj) {
                        ratio = 1;
                    } else if (evalDate <= blStatusEnd) {
                        const totalWdSeg1 = getExactWorkDays(stObj, blStatusEnd, t.blCal || t.cal || state.defCal);
                        const elapsedWd = getExactWorkDays(stObj, evalDate, t.blCal || t.cal || state.defCal);
                        const ratioSeg1 = totalWdSeg1 > 0 ? elapsedWd / totalWdSeg1 : 1;
                        ratio = ratioSeg1 * blPct;
                    } else {
                        const totalWdSeg2 = getExactWorkDays(blStatusEnd, endObj, t.blCal || t.cal || state.defCal);
                        const elapsedWd = getExactWorkDays(blStatusEnd, evalDate, t.blCal || t.cal || state.defCal);
                        const ratioSeg2 = totalWdSeg2 > 0 ? elapsedWd / totalWdSeg2 : 1;
                        ratio = blPct + ratioSeg2 * (1 - blPct);
                    }
                } else {
                    ratio = getExactElapsedRatio(rawStart, rawEnd, evalDate, t.blCal || t.cal || state.defCal);
                }

                earned += w * ratio;
                fallbackEarned += wBackup * ratio;
            });
            if (isHoursMode) return earned;
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
        // End-of-day: add 1 day for line positioning
        const sTimeEndOfDay = sTime + 86400000;
        datesToEvaluate.add(sTime);

        const sortedDates = Array.from(datesToEvaluate).sort((a, b) => a - b);

        sortedDates.forEach(time => {
            const d = new Date(time);
            const iso = isoDate(d);
            let actualPct: number | null = null;

            if (time <= sTime) {
                const exactRecord = history.find(h => h.date === iso);

                if (isHoursMode) {
                    let historyEarnedHours = 0;
                    if (exactRecord || time === sTime) {
                        tasks.forEach(t => {
                            let actPct = 0;
                            if (time === sTime) {
                                actPct = t.pct || 0;
                            } else if (exactRecord) {
                                const recIdx = history.indexOf(exactRecord);
                                for (let i = recIdx; i >= 0; i--) {
                                    const rec = history[i];
                                    if (rec.details && rec.details[t.id] !== undefined) {
                                        actPct = rec.details[t.id]; break;
                                    }
                                }
                            }
                            let taskWork: number;
                            if (isResUsage) {
                                taskWork = t.resources?.filter((r: any) => targetResNames.includes(r.name)).reduce((sum: number, r: any) => sum + (r.work || 0), 0) || 0;
                            } else {
                                taskWork = t.work || 0;
                            }
                            historyEarnedHours += taskWork * (actPct / 100);
                        });
                        actualPct = historyEarnedHours;
                    }
                } else {
                    if (exactRecord) {
                        if (isProjectLevel) {
                            actualPct = exactRecord.actualPct;
                        } else if (multiSelectIds && multiSelectIds.length > 0) {
                            let weightedSum = 0;
                            let weightSum = 0;
                            tasks.forEach(t => {
                                const cw = t.work || 0;
                                const w = (t.weight != null && t.weight > 0) ? t.weight : (cw || t.dur || 1);
                                let actPct = 0;
                                const recIdx = history.indexOf(exactRecord);
                                for (let i = recIdx; i >= 0; i--) {
                                    const rec = history[i];
                                    if (rec.details && rec.details[t.id] !== undefined) {
                                        actPct = rec.details[t.id]; break;
                                    }
                                }
                                weightedSum += w * actPct;
                                weightSum += w;
                            });
                            actualPct = weightSum > 0 ? weightedSum / weightSum : 0;
                        } else {
                            let found = false;
                            const idx = history.indexOf(exactRecord);
                            for (let i = idx; i >= 0; i--) {
                                const rec = history[i];
                                if (rec.details && rec.details[effectiveId] !== undefined) {
                                    actualPct = rec.details[effectiveId]; found = true; break;
                                }
                            }
                            if (!found) actualPct = 0;
                        }
                    } else if (time === sTime) {
                        if (isProjectLevel) {
                            const projAct = state.activities.find(a => a._isProjRow);
                            actualPct = projAct ? (projAct.pct || 0) : 0;
                        } else if (multiSelectIds && multiSelectIds.length > 0) {
                            let weightedSum = 0; let weightSum = 0;
                            tasks.forEach(t => {
                                const cw = t.work || 0;
                                const w = (t.weight != null && t.weight > 0) ? t.weight : (cw || t.dur || 1);
                                weightedSum += w * (t.pct || 0); weightSum += w;
                            });
                            actualPct = weightSum > 0 ? weightedSum / weightSum : 0;
                        } else {
                            const selAct = state.activities.find(a => a.id === effectiveId);
                            actualPct = selAct ? (selAct.pct || 0) : 0;
                        }
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

        // Shift status-date data point to end-of-day so actual curve reaches the Fecha de Corte line
        const sdPt = points.find(p => p.dateMs === sTime);
        if (sdPt) sdPt.dateMs = sTimeEndOfDay;

        return { points, statusDateMs: sTimeEndOfDay, maxValue: totalWeight, isHoursMode };

    }, [state.activities, state.progressHistory, state.statusDate, selectedId, multiSelectIds, forcedActivityId, state.currentView, state.resourcePool, state.defCal]);

    const textColor = state.lightMode ? '#1e293b' : '#f8fafc';
    const gridColor = state.lightMode ? '#e2e8f0' : '#334155';
    const plannedColor = '#3b82f6'; // Blue
    const actualColor = '#10b981'; // Green

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: state.lightMode ? '#fff' : '#0f172a' }}>
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
                        {state.currentView === 'resUsage' ? (
                            <>
                                <option value="__PROJECT__">Todos los Recursos</option>
                                {state.resourcePool.map(r => (
                                    <option key={r.name} value={r.name}>{r.name}</option>
                                ))}
                            </>
                        ) : (
                            <>
                                <option value="__PROJECT__">Todo el Proyecto</option>
                                {state.activities.filter(a => !a._isProjRow).map(a => (
                                    <option key={a.id} value={a.id}>
                                        {'\u00A0'.repeat(a.lv * 4)}{a.id} - {a.name}
                                    </option>
                                ))}
                            </>
                        )}
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
                    projStart={state.timelineStart}
                    totalDays={state.totalDays}
                    pxPerDay={state.pxPerDay}
                    zoom={state.currentView === 'usage' || state.currentView === 'resUsage' ? (state.usageZoom || 'week') : state.zoom}
                    lightMode={state.lightMode}
                    statusDate={state.statusDate}
                    points={data.points}
                    statusDateMs={data.statusDateMs}
                    maxValue={data.isHoursMode ? data.maxValue : 100}
                    isHours={data.isHoursMode}
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
                            <YAxis stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} domain={[0, data.isHoursMode ? data.maxValue : 100]} tickFormatter={(val: number) => data.isHoursMode ? `${val.toLocaleString('es-CL', { maximumFractionDigits: 0 })}h` : `${val}%`} />
                            <YAxis yAxisId="right" orientation="right" stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} domain={[0, data.isHoursMode ? data.maxValue : 100]} tickFormatter={(val: number) => data.isHoursMode ? `${val.toLocaleString('es-CL', { maximumFractionDigits: 0 })}h` : `${val}%`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: state.lightMode ? '#fff' : '#1e293b', borderColor: gridColor, color: textColor }}
                                formatter={(value: any, name: any) => [data.isHoursMode ? `${value.toLocaleString('es-CL')} hrs` : `${value}%`, name]}
                                labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                            />
                            <Legend verticalAlign="top" height={36} />
                            <ReferenceLine x={data.statusDateMs} stroke="#06b6d4" strokeWidth={2} label={{ position: 'insideTopLeft', value: 'Fecha de Corte', fill: '#06b6d4', fontSize: 12 }} />
                            <Line type="monotone" dataKey="planned" name={data.isHoursMode ? "HH Programadas" : "Avance Programado"} stroke={plannedColor} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="actual" name={data.isHoursMode ? "HH Reales" : "Avance Real"} stroke={actualColor} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={true} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
// ─── Monotone cubic Hermite spline (Fritsch–Carlson) ─────────────
// Same algorithm as Recharts type="monotone" / D3 curveMonotoneX
function drawSmoothCurve(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], _minY?: number, _maxY?: number) {
    if (pts.length < 2) { if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 2, 0, Math.PI * 2); ctx.fill(); } return; }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
    } else {
        const n = pts.length;
        // 1) Compute deltas and slopes
        const dx: number[] = [];
        const dy: number[] = [];
        const m: number[] = [];  // tangent slopes at each point
        for (let i = 0; i < n - 1; i++) {
            dx.push(pts[i + 1].x - pts[i].x);
            dy.push(pts[i + 1].y - pts[i].y);
        }
        const slope: number[] = dx.map((d, i) => d === 0 ? 0 : dy[i] / d);

        // 2) Initialize tangents with average of adjacent slopes
        m.push(slope[0]);
        for (let i = 1; i < n - 1; i++) {
            m.push((slope[i - 1] + slope[i]) / 2);
        }
        m.push(slope[n - 2]);

        // 3) Fritsch–Carlson: ensure monotonicity
        for (let i = 0; i < n - 1; i++) {
            if (Math.abs(slope[i]) < 1e-12) {
                // Flat segment → zero tangent at both endpoints
                m[i] = 0;
                m[i + 1] = 0;
            } else {
                const alpha = m[i] / slope[i];
                const beta = m[i + 1] / slope[i];
                // Restrict to a circle of radius 3 to prevent overshoot
                const r = alpha * alpha + beta * beta;
                if (r > 9) {
                    const s = 3 / Math.sqrt(r);
                    m[i] = s * alpha * slope[i];
                    m[i + 1] = s * beta * slope[i];
                }
            }
        }

        // 4) Draw cubic Hermite segments
        for (let i = 0; i < n - 1; i++) {
            const h = dx[i];
            if (h === 0) continue;
            const cp1x = pts[i].x + h / 3;
            const cp1y = pts[i].y + m[i] * h / 3;
            const cp2x = pts[i + 1].x - h / 3;
            const cp2y = pts[i + 1].y - m[i + 1] * h / 3;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pts[i + 1].x, pts[i + 1].y);
        }
    }
    ctx.stroke();
}

// ─── Pure canvas S-Curve for pixel-perfect Gantt alignment ──────────
interface SCurveCanvasProps {
    width: number;
    projStart: Date;
    totalDays: number;
    pxPerDay: number;
    zoom: ZoomLevel;
    lightMode: boolean;
    statusDate?: Date;
    points: any[];
    statusDateMs?: number;
    maxValue?: number;
    isHours?: boolean;
}

function SCurveCanvas({ width, projStart, totalDays, pxPerDay, zoom, lightMode, statusDate, points, statusDateMs, maxValue, isHours }: SCurveCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const yAxisCanvasRef = useRef<HTMLCanvasElement>(null);
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
        const yMax = maxValue && maxValue > 0 ? maxValue : 100;
        const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
        ctx.font = '10px Segoe UI';
        const formatY = (v: number) => isHours ? v.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + 'h' : Math.round(v) + '%';
        yTicks.forEach(val => {
            const y = chartBot - (val / yMax) * chartH;
            // Grid line on MAIN canvas
            ctx.strokeStyle = gridColor;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            ctx.setLineDash([]);
        });

        // ─── Fixed Y-Axis overlay ───────────────────────
        const yc = yAxisCanvasRef.current;
        if (yc) {
            const yw = 55;
            yc.width = yw; yc.height = totalH;
            yc.style.width = yw + 'px'; yc.style.height = totalH + 'px';
            const yCtx = yc.getContext('2d')!;
            yCtx.clearRect(0, 0, yw, totalH);

            const grad = yCtx.createLinearGradient(yw - 15, 0, yw, 0);
            const rgb = lightMode ? '255,255,255' : '15,23,42';
            grad.addColorStop(0, `rgba(${rgb},1)`);
            grad.addColorStop(1, `rgba(${rgb},0)`);
            yCtx.fillStyle = `rgb(${rgb})`;
            yCtx.fillRect(0, 0, yw - 15, totalH);
            yCtx.fillStyle = grad;
            yCtx.fillRect(yw - 15, 0, 15, totalH);

            yCtx.fillStyle = textColor;
            yCtx.font = '10px Segoe UI';
            yCtx.textAlign = 'left';
            yCtx.textBaseline = 'bottom';
            yTicks.forEach(val => {
                const y = chartBot - (val / yMax) * chartH;
                yCtx.fillText(formatY(val), 4, y - 3);
            });
        }

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

        // ─── Status Date line (cyan solid, matching Gantt) ───────────
        if (statusDateMs) {
            const sdX = msToX(statusDateMs);
            if (sdX >= 0 && sdX <= width) {
                ctx.fillStyle = '#06b6d4';
                ctx.fillRect(sdX, chartTop, 2, chartH);
                // Label
                ctx.fillStyle = '#06b6d4';
                ctx.font = 'bold 10px Segoe UI';
                ctx.fillText('Fecha de Corte', sdX + 4, chartTop + 12);
            }
        }

        // ─── Today line (amber) ──────────────────────────
        const todayX = (dayDiff(projStart, new Date()) + 1) * PX;
        if (todayX >= 0 && todayX <= width) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(todayX, chartTop, 2, chartH);
        }

        // ─── Value → y pixel ───────────────────────────────
        const valToY = (val: number) => chartBot - (val / yMax) * chartH;

        // ─── Draw planned curve (smooth bezier) ──────────────
        if (points.length > 0) {
            ctx.strokeStyle = plannedColor;
            ctx.lineWidth = 2.5;
            drawSmoothCurve(ctx, points.map(p => ({ x: msToX(p.dateMs), y: valToY(p.planned) })), chartTop, chartBot);
            ctx.lineWidth = 1;

            // Dots
            ctx.fillStyle = plannedColor;
            points.forEach(p => {
                const x = msToX(p.dateMs);
                const y = valToY(p.planned);
                ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
            });
        }

        // ─── Draw actual curve (smooth bezier) ───────────────
        const actualPoints = points.filter(p => p.actual !== null && p.actual !== undefined);
        if (actualPoints.length > 0) {
            ctx.strokeStyle = actualColor;
            ctx.lineWidth = 2.5;
            drawSmoothCurve(ctx, actualPoints.map(p => ({ x: msToX(p.dateMs), y: valToY(p.actual!) })), chartTop, chartBot);
            ctx.lineWidth = 1;

            // Dots
            ctx.fillStyle = actualColor;
            actualPoints.forEach(p => {
                const x = msToX(p.dateMs);
                const y = valToY(p.actual!);
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
            const sdx = (dayDiff(projStart, statusDate) + 1) * PX;  // end of status date, matching Gantt
            if (sdx >= 0 && sdx <= width) {
                ctx.fillStyle = '#06b6d4'; ctx.fillRect(sdx, axisTop, 2, HDR_H);
            }
        }
    }, [width, projStart, totalDays, PX, zoom, lightMode, statusDate, points, statusDateMs]);

    const [tooltip, setTooltip] = useState<{ visibleX: number; visibleY: number; date: string; planned: string; actual: string } | null>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const c = canvasRef.current; if (!c) return;
        const rect = c.getBoundingClientRect();
        const outerContainer = containerRef.current?.parentElement;
        const outerRect = outerContainer ? outerContainer.getBoundingClientRect() : rect;

        const mx = e.clientX - rect.left;
        const visibleX = e.clientX - outerRect.left;
        const visibleY = e.clientY - outerRect.top;
        // 1. Find segment enclosing current mx (mouse X)
        let i0 = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const px = dayDiff(projStart, new Date(points[i + 1].dateMs)) * PX;
            if (px >= mx) { i0 = i; break; }
            if (i === points.length - 2) i0 = i;
        }

        const p1 = points[i0];
        const p2 = points[i0 + 1];

        // Ensure we are inside project bounds
        if (mx < dayDiff(projStart, new Date(points[0].dateMs)) * PX || mx > dayDiff(projStart, new Date(points[points.length - 1].dateMs)) * PX) {
            setTooltip(null);
            return;
        }

        // 2. Interpolate Y using same Fritsch–Carlson monotone cubic as drawSmoothCurve
        const interpolateY = (key: 'planned' | 'actual', _p0: any, p1: any, p2: any, _p3: any) => {
            if (p1[key] == null || p2[key] == null) return null;

            // Build the full series of points for this key to compute proper tangents
            const allPts: { x: number; y: number }[] = [];
            const src = key === 'actual' ? points.filter((p: any) => p[key] != null) : points;
            for (const p of src) {
                allPts.push({ x: dayDiff(projStart, new Date(p.dateMs)) * PX, y: p[key] });
            }
            if (allPts.length < 2) return p1[key];

            // Find the segment in allPts that encloses mx
            let seg = 0;
            for (let j = 0; j < allPts.length - 1; j++) {
                if (allPts[j + 1].x >= mx) { seg = j; break; }
                if (j === allPts.length - 2) seg = j;
            }
            const a = allPts[seg];
            const b = allPts[seg + 1];
            const h = b.x - a.x;
            if (h === 0) return a.y;

            // Compute tangent slopes (Fritsch–Carlson)
            const n = allPts.length;
            const dxArr: number[] = [];
            const slopeArr: number[] = [];
            for (let j = 0; j < n - 1; j++) {
                const ddx = allPts[j + 1].x - allPts[j].x;
                dxArr.push(ddx);
                slopeArr.push(ddx === 0 ? 0 : (allPts[j + 1].y - allPts[j].y) / ddx);
            }
            const mArr: number[] = [slopeArr[0]];
            for (let j = 1; j < n - 1; j++) mArr.push((slopeArr[j - 1] + slopeArr[j]) / 2);
            mArr.push(slopeArr[n - 2]);

            for (let j = 0; j < n - 1; j++) {
                if (Math.abs(slopeArr[j]) < 1e-12) {
                    mArr[j] = 0; mArr[j + 1] = 0;
                } else {
                    const al = mArr[j] / slopeArr[j];
                    const bt = mArr[j + 1] / slopeArr[j];
                    const r = al * al + bt * bt;
                    if (r > 9) {
                        const s = 3 / Math.sqrt(r);
                        mArr[j] = s * al * slopeArr[j];
                        mArr[j + 1] = s * bt * slopeArr[j];
                    }
                }
            }

            // Cubic Hermite on this segment
            const t = (mx - a.x) / h;
            const cp1y = a.y + mArr[seg] * h / 3;
            const cp2y = b.y - mArr[seg + 1] * h / 3;
            const omt = 1 - t;
            return (omt ** 3) * a.y + 3 * (omt ** 2) * t * cp1y + 3 * omt * (t ** 2) * cp2y + (t ** 3) * b.y;
        };

        const p0 = points[Math.max(0, i0 - 1)];
        const p3 = points[Math.min(points.length - 1, i0 + 2)];

        const interpPlanned = interpolateY('planned', p0, p1, p2, p3);
        let interpActual = interpolateY('actual', p0, p1, p2, p3);
        // If interpolation returns null (e.g. mouse between a known and null point),
        // fall back to the nearest non-null actual value
        if (interpActual == null) {
            if (p1.actual != null) interpActual = p1.actual;
            else if (p2 && p2.actual != null) interpActual = p2.actual;
        }

        const hoveredDate = new Date(projStart.getTime() + (mx / PX) * 86400000);
        const formatT = (v: number | null) => v == null ? '—' : (isHours ? v.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' h' : v.toFixed(1) + '%');

        setTooltip({
            visibleX,
            visibleY,
            date: hoveredDate.toLocaleDateString('es-CL', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
            planned: formatT(interpPlanned),
            actual: formatT(interpActual),
        });
    }, [projStart, PX, points]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Sync initial scroll position from whichever grid is visible
        const grBody = document.getElementById('gr-body');
        if (grBody) el.scrollLeft = grBody.scrollLeft;
        const ro = new ResizeObserver(() => {
            draw(el.getBoundingClientRect().height);
        });
        ro.observe(el);
        draw(el.getBoundingClientRect().height);
        return () => ro.disconnect();
    }, [draw]);

    // Sync scroll with Gantt timeline (gr-body) and task/resource usage grids
    useEffect(() => {
        const wrapper = containerRef.current;
        if (!wrapper) return;
        const handler = () => {
            const grBody = document.getElementById('gr-body');
            if (grBody) grBody.scrollLeft = wrapper.scrollLeft;
            const resGrBody = document.getElementById('res-gr-body');
            if (resGrBody) resGrBody.scrollLeft = wrapper.scrollLeft;
            // Also keep the task usage time header in sync
            const usageHdr = document.getElementById('usage-hdr-scroll');
            if (usageHdr) usageHdr.scrollLeft = wrapper.scrollLeft;
        };
        wrapper.addEventListener('scroll', handler);
        return () => wrapper.removeEventListener('scroll', handler);
    }, []);

    return (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div ref={containerRef} id="scurve-body" style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    style={{ display: 'block', width: width + 'px', minWidth: width + 'px' }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setTooltip(null)}
                />
            </div>
            {/* Sticky Y-Axis Overlay */}
            <canvas
                ref={yAxisCanvasRef}
                style={{ position: 'absolute', left: 0, top: 0, width: '55px', height: '100%', pointerEvents: 'none', zIndex: 5 }}
            />
            {/* Crosshair Guide Line */}
            {tooltip && (
                <div style={{
                    position: 'absolute',
                    left: tooltip.visibleX,
                    top: 10,
                    bottom: 10,
                    width: 1,
                    backgroundColor: lightMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
                    borderRight: `1px dashed ${lightMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'}`,
                    pointerEvents: 'none',
                    zIndex: 9,
                }} />
            )}
            {/* Tooltip Card */}
            {tooltip && (
                <div style={{
                    position: 'absolute',
                    left: tooltip.visibleX + 15,
                    top: tooltip.visibleY - 15,
                    background: lightMode ? '#fff' : '#1e293b',
                    border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 11,
                    color: lightMode ? '#334155' : '#e2e8f0',
                    pointerEvents: 'none',
                    zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,.3)',
                    whiteSpace: 'nowrap',
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 12, borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}`, paddingBottom: 3 }}>
                        {tooltip.date}
                    </div>
                    <div style={{ color: '#3b82f6', marginBottom: 2 }}>Programado: <strong>{tooltip.planned}</strong></div>
                    <div style={{ color: '#06b6d4' }}>Real: <strong>{tooltip.actual}</strong></div>
                </div>
            )}
        </div>
    );
}
