import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { isoDate, getExactElapsedRatio, getExactWorkDays, dayDiff, addDays, getUsageDailyValues } from '../utils/cpm';
import type { ZoomLevel, CalScale, UsageChartType } from '../types/gantt';

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
// â”€â”€â”€ Monotone cubic Hermite spline (Fritschâ€“Carlson) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // 3) Fritschâ€“Carlson: ensure monotonicity
        for (let i = 0; i < n - 1; i++) {
            if (Math.abs(slope[i]) < 1e-12) {
                // Flat segment â†’ zero tangent at both endpoints
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

// â”€â”€â”€ Pure canvas S-Curve for pixel-perfect Gantt alignment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Histogram integration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { state: _gsState } = useGantt();
    const { calScale, usageChartType } = _gsState;
    const showBars       = usageChartType === 'histogram' || usageChartType === 'both';
    const showCurveLines = usageChartType !== 'histogram';

    const intervals = useMemo(() => {
        const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        const endD = addDays(projStart, totalDays);
        const cs = calScale as CalScale;
        const result: { start: Date; end: Date; w: number; label: string; isWeekend: boolean }[] = [];
        if (cs === 'week-day') {
            let cur = new Date(projStart);
            while (cur < endD) {
                result.push({ start: new Date(cur), end: addDays(cur, 1), w: PX, label: String(cur.getDate()), isWeekend: cur.getDay() === 0 || cur.getDay() === 6 });
                cur.setDate(cur.getDate() + 1);
            }
        } else if (cs === 'month-week') {
            let cur = new Date(projStart);
            const dow = cur.getDay(); cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1));
            while (cur < endD) {
                const next = addDays(cur, 7);
                const ds = cur < projStart ? new Date(projStart) : new Date(cur);
                const lbl = String(ds.getDate()).padStart(2, '0') + '-' + MESES[ds.getMonth()];
                result.push({ start: ds, end: next > endD ? endD : next, w: 7 * PX, label: lbl, isWeekend: false });
                cur = next;
            }
        } else if (cs === 'year-quarter') {
            let cur = new Date(projStart.getFullYear(), Math.floor(projStart.getMonth() / 3) * 3, 1);
            while (cur < endD) {
                const next = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
                const ds = cur < projStart ? new Date(projStart) : new Date(cur);
                const de = next > endD ? endD : next;
                const q = Math.floor(cur.getMonth() / 3) + 1;
                result.push({ start: ds, end: de, w: dayDiff(ds, de) * PX, label: `Q${q}`, isWeekend: false });
                cur = next;
            }
        } else {
            let cur = new Date(projStart.getFullYear(), projStart.getMonth(), 1);
            while (cur < endD) {
                const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const ds = cur < projStart ? new Date(projStart) : new Date(cur);
                const de = next > endD ? endD : next;
                result.push({ start: ds, end: de, w: dayDiff(ds, de) * PX, label: MESES[cur.getMonth()], isWeekend: false });
                cur = next;
            }
        }
        return result;
    }, [projStart, totalDays, calScale, PX]);

    // Top-row header intervals (year/quarter/month spans matching TaskUsageGrid top header)
    const topIntervals = useMemo(() => {
        const MESES_H = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        const endD = addDays(projStart, totalDays);
        const cs = calScale as CalScale;
        const result: { start: Date; end: Date; label: string }[] = [];
        if (cs === 'year-month' || cs === 'year-quarter') {
            for (let yr = projStart.getFullYear(); yr <= endD.getFullYear(); yr++) {
                const yS = new Date(yr, 0, 1), yE = new Date(yr + 1, 0, 1);
                const ds = yS < projStart ? new Date(projStart) : yS;
                const de = yE > endD ? endD : yE;
                result.push({ start: ds, end: de, label: String(yr) });
            }
        } else if (cs === 'quarter-month') {
            for (let yr = projStart.getFullYear(); yr <= endD.getFullYear(); yr++) {
                for (let q = 0; q < 4; q++) {
                    const qS = new Date(yr, q * 3, 1), qE = new Date(yr, q * 3 + 3, 1);
                    if (qE <= projStart || qS >= endD) continue;
                    const ds = qS < projStart ? new Date(projStart) : qS;
                    const de = qE > endD ? endD : qE;
                    result.push({ start: ds, end: de, label: `Q${q + 1} ${yr}` });
                }
            }
        } else if (cs === 'week-day') {
            let cur = new Date(projStart);
            const dow = cur.getDay(); cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1));
            while (cur < endD) {
                const wEnd = new Date(cur); wEnd.setDate(wEnd.getDate() + 7);
                const ds = cur < projStart ? new Date(projStart) : new Date(cur);
                const de = wEnd > endD ? endD : wEnd;
                result.push({ start: ds, end: de, label: String(ds.getDate()).padStart(2, '0') + '-' + MESES_H[ds.getMonth()] });
                cur.setDate(cur.getDate() + 7);
            }
        } else {
            // month-week: top = months
            let cur = new Date(projStart.getFullYear(), projStart.getMonth(), 1);
            while (cur < endD) {
                const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const ds = cur < projStart ? new Date(projStart) : new Date(cur);
                const de = nm > endD ? endD : nm;
                result.push({ start: ds, end: de, label: cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }) });
                cur = nm;
            }
        }
        return result;
    }, [projStart, totalDays, calScale]);

    const barData = useMemo(() => {
        const getCumAt = (ms: number): { planned: number; actual: number | null } => {
            if (points.length === 0) return { planned: 0, actual: null };
            if (ms <= points[0].dateMs) return { planned: 0, actual: 0 };
            if (ms >= points[points.length - 1].dateMs) return { planned: points[points.length - 1].planned, actual: points[points.length - 1].actual };
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i], p2 = points[i + 1];
                if (ms >= p1.dateMs && ms <= p2.dateMs) {
                    const t2 = (ms - p1.dateMs) / (p2.dateMs - p1.dateMs);
                    return {
                        planned: p1.planned + t2 * (p2.planned - p1.planned),
                        actual: p1.actual != null && p2.actual != null ? p1.actual + t2 * (p2.actual - p1.actual) : null,
                    };
                }
            }
            return { planned: 0, actual: null };
        };
        return intervals.map(inv => {
            const s = getCumAt(inv.start.getTime());
            const e = getCumAt(inv.end.getTime());
            return {
                planned: Math.max(0, e.planned - s.planned),
                actual:  e.actual != null && s.actual != null ? Math.max(0, e.actual - s.actual) : null,
            };
        });
    }, [intervals, points]);

    const draw = useCallback((containerH: number) => {
        const c = canvasRef.current; if (!c) return;
        const totalH = Math.max(150, containerH);
        const chartH = totalH - HDR_H - LEGEND_H - PADDING_T - PADDING_B;
        c.width = width; c.height = totalH;
        c.style.width = width + 'px'; c.style.height = totalH + 'px';
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, width, totalH);

        // â”€â”€â”€ Colors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const bgColor = lightMode ? '#ffffff' : '#0f172a';
        const gridColor = lightMode ? '#e2e8f0' : '#1e293b';
        const textColor = lightMode ? '#334155' : '#94a3b8';
        const plannedColor = '#3b82f6';
        const actualColor = '#10b981';

        // â”€â”€â”€ Background â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, totalH); // full canvas — axis area painted on top

        // â”€â”€â”€ Legend (dynamic based on chart type) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ctx.font = '11px Segoe UI'; ctx.textBaseline = 'middle';
        const lgY = 12;
        let lx = Math.max(8, width / 2 - 220);
        if (showBars) {
            // Planned bar
            ctx.fillStyle = lightMode ? 'rgba(59,130,246,0.55)' : 'rgba(96,165,250,0.55)';
            ctx.fillRect(lx, lgY - 5, 10, 10); lx += 13;
            ctx.fillStyle = textColor; ctx.fillText(isHours ? 'HH Prev. (período)' : 'Av.Prog. (período)', lx, lgY);
            lx += ctx.measureText(isHours ? 'HH Prev. (período)' : 'Av.Prog. (período)').width + 10;
            // Actual bar
            ctx.fillStyle = lightMode ? 'rgba(16,185,129,0.65)' : 'rgba(52,211,153,0.65)';
            ctx.fillRect(lx, lgY - 5, 10, 10); lx += 13;
            ctx.fillStyle = textColor; ctx.fillText(isHours ? 'HH Real (período)' : 'Av.Real (período)', lx, lgY);
            lx += ctx.measureText(isHours ? 'HH Real (período)' : 'Av.Real (período)').width + 14;
        }
        if (showCurveLines) {
            ctx.fillStyle = plannedColor;
            ctx.fillRect(lx, lgY - 3, 14, 3); ctx.beginPath(); ctx.arc(lx + 7, lgY - 2, 3, 0, Math.PI * 2); ctx.fill();
            lx += 17; ctx.fillStyle = textColor;
            ctx.fillText(isHours ? 'HH Prog. (acum.)' : 'Avance Programado', lx, lgY);
            lx += ctx.measureText(isHours ? 'HH Prog. (acum.)' : 'Avance Programado').width + 10;
            ctx.fillStyle = actualColor;
            ctx.fillRect(lx, lgY - 3, 14, 3); ctx.beginPath(); ctx.arc(lx + 7, lgY - 2, 3, 0, Math.PI * 2); ctx.fill();
            lx += 17; ctx.fillStyle = textColor;
            ctx.fillText(isHours ? 'HH Real (acum.)' : 'Avance Real', lx, lgY);
        }
        ctx.textBaseline = 'alphabetic';

        const chartTop = LEGEND_H + PADDING_T;
        const chartBot = chartTop + chartH;

        // â”€â”€â”€ Y scale (adapts to bars when histogram-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const rawMax = maxValue && maxValue > 0 ? maxValue : 100;
        const maxBarH = showBars && barData.length > 0
            ? Math.max(0, ...barData.map(d => d.planned), ...barData.map(d => d.actual ?? 0))
            : 0;
        const yMax = showBars && !showCurveLines
            ? Math.max(rawMax, maxBarH) * 1.15
            : Math.max(rawMax, maxBarH);

        // â”€â”€â”€ Y Axis labels + horizontal grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€â”€ Fixed Y-Axis overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€â”€ Vertical month grid lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€â”€ Helper: date ms â†’ x pixel (same as Gantt!) â”€â”€
        const msToX = (ms: number) => {
            const date = new Date(ms);
            return dayDiff(projStart, date) * PX;
        };

        // â”€â”€â”€ Status Date line (cyan solid, matching Gantt) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€â”€ Today line (amber) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const todayX = dayDiff(projStart, new Date()) * PX;
        if (todayX >= 0 && todayX <= width) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(todayX, chartTop, 2, chartH);
        }

        // â”€â”€â”€ Value â†’ y pixel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const valToY = (val: number) => chartBot - (val / yMax) * chartH;

        // â”€â”€â”€ Histogram bars (drawn first, behind curves) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (showBars) {
            intervals.forEach((inv, i) => {
                const x = dayDiff(projStart, inv.start) * PX;
                const iw = Math.max(2, inv.w);
                const d = barData[i];
                if (!d) return;
                const gap = Math.max(1, iw * 0.06);
                const barW = Math.max(1, (iw - gap * 3) / 2);
                if (d.planned > 0) {
                    const bh = (d.planned / yMax) * chartH;
                    ctx.fillStyle = lightMode ? 'rgba(59,130,246,0.50)' : 'rgba(96,165,250,0.50)';
                    ctx.fillRect(x + gap, chartBot - bh, barW, bh);
                    ctx.strokeStyle = lightMode ? 'rgba(59,130,246,0.85)' : 'rgba(96,165,250,0.85)';
                    ctx.lineWidth = 0.5; ctx.strokeRect(x + gap, chartBot - bh, barW, bh); ctx.lineWidth = 1;
                }
                if (d.actual != null && d.actual > 0) {
                    const bh2 = (d.actual / yMax) * chartH;
                    ctx.fillStyle = lightMode ? 'rgba(16,185,129,0.60)' : 'rgba(52,211,153,0.60)';
                    ctx.fillRect(x + gap * 2 + barW, chartBot - bh2, barW, bh2);
                    ctx.strokeStyle = lightMode ? 'rgba(16,185,129,0.90)' : 'rgba(52,211,153,0.90)';
                    ctx.lineWidth = 0.5; ctx.strokeRect(x + gap * 2 + barW, chartBot - bh2, barW, bh2); ctx.lineWidth = 1;
                }
            });
        }

        // â”€â”€â”€ Draw planned curve (smooth bezier) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (showCurveLines && points.length > 0) {
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

        // â”€â”€â”€ Draw actual curve (smooth bezier) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const actualPoints = points.filter(p => p.actual !== null && p.actual !== undefined);
        if (showCurveLines && actualPoints.length > 0) {
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

        // â”€â”€â”€ Timeline Axis (footer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const axisTop = totalH - HDR_H;
        const colors = lightMode ? {
            topBg: '#e2e8f0', topBorder: '#cbd5e1', topText: '#334155',
            botBg: '#f1f5f9', botBorder: '#e2e8f0', botText: '#334155', weekend: '#e0e7ff',
        } : {
            topBg: '#0a0f1a', topBorder: '#1f2937', topText: '#94a3b8',
            botBg: '#0f172a', botBorder: '#1e293b', botText: '#64748b', weekend: '#1a1040',
        };

        // Top row (calScale-aware, matching TaskUsageGrid top header)
        topIntervals.forEach(inv => {
            const x = dayDiff(projStart, inv.start) * PX;
            const w = dayDiff(inv.start, inv.end) * PX;
            ctx.fillStyle = colors.topBg; ctx.fillRect(x, axisTop, w, 17);
            ctx.strokeStyle = colors.topBorder; ctx.strokeRect(x, axisTop, w, 17);
            ctx.fillStyle = colors.topText; ctx.font = 'bold 10px Segoe UI';
            if (w > 20) ctx.fillText(inv.label, x + 4, axisTop + 12);
        });

        // Bottom row (intervals — same format & alignment as TaskUsageGrid)
        if (calScale === 'week-day') {
            intervals.forEach(inv => {
                const x = dayDiff(projStart, inv.start) * PX;
                const wkndFill = inv.isWeekend ? colors.weekend : colors.botBg;
                const wkndText = inv.isWeekend ? (lightMode ? '#94a3b8' : '#374151') : colors.botText;
                ctx.fillStyle = wkndFill; ctx.fillRect(x, axisTop + 17, inv.w, 19);
                ctx.strokeStyle = colors.botBorder;
                ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                ctx.fillStyle = wkndText; ctx.font = '9px Segoe UI'; ctx.textAlign = 'center';
                if (PX >= 14) ctx.fillText(inv.label, x + inv.w / 2, axisTop + 29);
                ctx.textAlign = 'left';
            });
        } else {
            intervals.forEach(inv => {
                const x = dayDiff(projStart, inv.start) * PX;
                ctx.fillStyle = colors.botBg; ctx.fillRect(x, axisTop + 17, inv.w, 19);
                ctx.strokeStyle = colors.botBorder;
                ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                ctx.fillStyle = colors.botText; ctx.font = '9px Segoe UI';
                if (inv.w > 24) ctx.fillText(inv.label, x + 4, axisTop + 30);
            });
        }

        // Today & status date markers on axis
        if (todayX >= 0 && todayX <= width) {
            ctx.fillStyle = '#f59e0b'; ctx.fillRect(todayX, axisTop, 2, HDR_H);
        }
        if (statusDate) {
            const sdx = (dayDiff(projStart, statusDate) + 1) * PX;
            if (sdx >= 0 && sdx <= width) {
                ctx.fillStyle = '#06b6d4'; ctx.fillRect(sdx, axisTop, 2, HDR_H);
            }
        }
    }, [width, projStart, totalDays, PX, zoom, lightMode, statusDate, points, statusDateMs, isHours, maxValue, showBars, showCurveLines, barData, intervals, topIntervals, calScale, usageChartType]);

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

        // 2. Interpolate Y using same Fritschâ€“Carlson monotone cubic as drawSmoothCurve
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

            // Compute tangent slopes (Fritschâ€“Carlson)
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
        const formatT = (v: number | null) => v == null ? 'â€”' : (isHours ? v.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' h' : v.toFixed(1) + '%');

        setTooltip({
            visibleX,
            visibleY,
            date: hoveredDate.toLocaleDateString('es-CL', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
            planned: formatT(interpPlanned),
            actual: formatT(interpActual),
        });
    }, [projStart, PX, points]);

    // Initial scroll sync (mount only — do NOT put this in [draw] or it resets on every usageChartType change)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const grBody = document.getElementById('gr-body');
        if (grBody) el.scrollLeft = grBody.scrollLeft;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Draw / resize observer — fires when draw callback changes
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

    const chartTypeOptions: { key: UsageChartType; label: string }[] = [
        { key: 'none', label: 'Ninguno' },
        { key: 'histogram', label: 'Histograma' },
        { key: 'curve', label: 'Curva S' },
        { key: 'both', label: 'Histograma + Curva S' },
    ];

    return (
        <div
            style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}
            onContextMenu={(e) => { e.preventDefault(); setChartCtxMenu({ x: e.clientX, y: e.clientY }); }}
            onClick={() => setChartCtxMenu(null)}
        >
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
                    <div style={{ color: '#10b981' }}>Real: <strong>{tooltip.actual}</strong></div>
                </div>
            )}
            {/* Right-click context menu — change chart type */}
            {chartCtxMenu && (
                <div
                    style={{
                        position: 'fixed', left: chartCtxMenu.x, top: chartCtxMenu.y,
                        zIndex: 9999, minWidth: 170,
                        background: lightMode ? '#fff' : '#1e293b',
                        border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`,
                        borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.35)',
                        padding: '4px 0', fontSize: 12,
                    }}
                    onMouseLeave={() => setChartCtxMenu(null)}
                >
                    <div style={{ padding: '4px 12px 4px', fontSize: 10, fontWeight: 700, color: lightMode ? '#94a3b8' : '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Mostrar gráfico</div>
                    {chartTypeOptions.map(opt => (
                        <div
                            key={opt.key}
                            style={{
                                padding: '5px 14px', cursor: 'pointer',
                                color: lightMode ? '#1e293b' : '#e2e8f0',
                                background: usageChartType === opt.key ? (lightMode ? '#eff6ff' : '#1e3a5f') : 'transparent',
                                fontWeight: usageChartType === opt.key ? 600 : 400,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = lightMode ? '#f1f5f9' : '#0f2744'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = usageChartType === opt.key ? (lightMode ? '#eff6ff' : '#1e3a5f') : 'transparent'; }}
                            onMouseDown={e => { e.stopPropagation(); dispatch({ type: 'SET_USAGE_CHART_TYPE', chartType: opt.key }); setChartCtxMenu(null); }}
                        >
                            {usageChartType === opt.key ? '✓ ' : '   '}{opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
