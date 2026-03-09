import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useGantt } from '../store/GanttContext';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { isoDate, getExactElapsedRatio, getExactWorkDays, dayDiff, addDays, normDate } from '../utils/cpm';
import type { ZoomLevel, CalScale } from '../types/gantt';

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
            // Removed +1 day offset so that the evaluation aligns exactly 
            // with the X-axis points plotted (start-of-day), avoiding a 1-day leftward shift.

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

        const cs = state.calScale || state.zoom;
        const datesToEvaluate = new Set<number>();
        while (current <= end) {
            datesToEvaluate.add(current.getTime());
            if (cs === 'week-day') {
                current.setDate(current.getDate() + 1);
            } else if (cs === 'month-week') {
                // Ensure alignment with Monday
                const dow = current.getDay();
                if (datesToEvaluate.size === 1 && dow !== 1) {
                    current.setDate(current.getDate() + (dow === 0 ? 1 : 8 - dow));
                } else {
                    current.setDate(current.getDate() + 7);
                }
            } else if (cs === 'year-month' || cs === 'quarter-month') {
                current.setMonth(current.getMonth() + 1);
                current.setDate(1);
            } else if (cs === 'year-quarter') {
                current.setMonth(current.getMonth() + 3);
                current.setDate(1);
            } else {
                current.setDate(current.getDate() + 7);
            }
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
        datesToEvaluate.add(sTimeEndOfDay);

        // ─── Task Actual Progress Timelines ─────────────────
        const taskActTimeline = new Map<string, { d: number, p: number }[]>();
        tasks.forEach(t => {
            const tl: { d: number, p: number }[] = [];
            const es = t.actualStart || t.ES || t.blES;
            if (es) {
                const startD = new Date(es); startD.setHours(0, 0, 0, 0);
                tl.push({ d: startD.getTime(), p: 0 });
            }
            history.forEach(h => {
                if (h.details && h.details[t.id] !== undefined) {
                    const hd = new Date(h.date + 'T00:00:00'); hd.setHours(0, 0, 0, 0);
                    // Progress reported on a date means progress at the END of that date.
                    // To align with our 00:00:00-based math, we push it to the next day's 00:00:00.
                    hd.setDate(hd.getDate() + 1);
                    tl.push({ d: hd.getTime(), p: h.details[t.id] });
                }
            });
            if (t.pct !== undefined) {
                // Current % complete applies to the end of the Status Date
                tl.push({ d: sTime + 86400000, p: t.pct });
            }
            tl.sort((a, b) => a.d - b.d);
            let mp = 0;
            tl.forEach(pt => { if (pt.p < mp) pt.p = mp; else mp = pt.p; });
            const unique = [];
            for (let i = 0; i < tl.length; i++) {
                if (i === tl.length - 1 || tl[i].d !== tl[i + 1].d) unique.push(tl[i]);
            }
            taskActTimeline.set(t.id, unique);
        });

        const sortedDates = Array.from(datesToEvaluate).sort((a, b) => a - b);

        sortedDates.forEach(time => {
            const d = new Date(time);
            const iso = isoDate(d);
            let actualPct: number | null = null;
            let projectedPct: number | null = null;

            if (time <= sTimeEndOfDay) {
                let actualEarned = 0;
                let actFallbackEarned = 0;

                tasks.forEach(t => {
                    const tl = taskActTimeline.get(t.id) || [];
                    let curPct = 0;
                    if (tl.length > 0) {
                        if (time <= tl[0].d) curPct = 0;
                        else if (time >= tl[tl.length - 1].d) curPct = tl[tl.length - 1].p;
                        else {
                            for (let i = 0; i < tl.length - 1; i++) {
                                const d1 = tl[i].d, d2 = tl[i + 1].d;
                                if (time >= d1 && time < d2) {
                                    const totWd = getExactWorkDays(new Date(d1), new Date(d2), t.cal || state.defCal);
                                    const elWd = getExactWorkDays(new Date(d1), new Date(time), t.cal || state.defCal);
                                    const ratio = totWd > 0 ? (elWd / totWd) : 1;
                                    curPct = tl[i].p + ratio * (tl[i + 1].p - tl[i].p);
                                    break;
                                }
                            }
                        }
                    }

                    let w = 0, wBackup = 0;
                    if (isResUsage) {
                        w = t.resources?.filter((r: any) => targetResNames.includes(r.name)).reduce((sum: number, r: any) => sum + (r.work || 0), 0) || 0;
                        wBackup = w;
                    } else if (isTaskUsage) {
                        w = t.work || 0; wBackup = t.work || 0;
                    } else {
                        const cw = t.work || 0;
                        w = (t.weight != null && t.weight > 0) ? t.weight : (cw || t.dur || 1);
                        wBackup = t.dur || 1;
                    }

                    actualEarned += w * (curPct / 100);
                    actFallbackEarned += wBackup * (curPct / 100);
                });

                if (isHoursMode) actualPct = actualEarned;
                else if (totalWeight > 0) actualPct = (actualEarned / totalWeight) * 100;
                else if (fallbackTotalWeight > 0) actualPct = (actFallbackEarned / fallbackTotalWeight) * 100;
                else actualPct = 0;

                if (time === sTimeEndOfDay) {
                    projectedPct = actualPct;
                }
            } else {
                let projEarned = 0;
                let projFallback = 0;

                tasks.forEach(t => {
                    const tl = taskActTimeline.get(t.id) || [];
                    let basePct = 0; // % at Status Date
                    if (tl.length > 0) {
                        const sTimeAct = sTimeEndOfDay;
                        if (sTimeAct >= tl[tl.length - 1].d) basePct = tl[tl.length - 1].p;
                        else if (sTimeAct <= tl[0].d) basePct = 0;
                        else {
                            for (let i = 0; i < tl.length - 1; i++) {
                                const d1 = tl[i].d, d2 = tl[i + 1].d;
                                if (sTimeAct >= d1 && sTimeAct < d2) {
                                    const totWd = getExactWorkDays(new Date(d1), new Date(d2), t.cal || state.defCal);
                                    const elWd = getExactWorkDays(new Date(d1), new Date(sTimeAct), t.cal || state.defCal);
                                    const curRatio = totWd > 0 ? (elWd / totWd) : 1;
                                    basePct = tl[i].p + curRatio * (tl[i + 1].p - tl[i].p);
                                    break;
                                }
                            }
                        }
                    }

                    let w = 0, wBackup = 0;
                    if (isResUsage) {
                        w = t.resources?.filter((r: any) => targetResNames.includes(r.name)).reduce((sum: number, r: any) => sum + (r.work || 0), 0) || 0;
                        wBackup = w;
                    } else if (isTaskUsage) {
                        w = t.work || 0; wBackup = t.work || 0;
                    } else {
                        const cw = t.work || 0;
                        w = (t.weight != null && t.weight > 0) ? t.weight : (cw || t.dur || 1);
                        wBackup = t.dur || 1;
                    }

                    let earnedHere = w * (basePct / 100);
                    let fallbackHere = wBackup * (basePct / 100);

                    if (basePct < 100) {
                        // Project remaining logic
                        const remStart = t._remES || t.ES;
                        const remEnd = t._remEF || t.EF;
                        if (remStart && remEnd) {
                            const nS = normDate(remStart);
                            const nE = normDate(remEnd);
                            if (!nS || !nE) return;
                            const sObj = new Date(nS); sObj.setHours(0, 0, 0, 0);
                            const eObj = new Date(nE); eObj.setHours(0, 0, 0, 0);
                            // _remEF / EF are already exclusive (day after last work day),
                            // so NO +1 needed — getExactWorkDays expects exclusive end.
                            const evalObj = new Date(time); evalObj.setHours(0, 0, 0, 0);
                            const actS = sObj.getTime() < sTimeEndOfDay ? new Date(sTimeEndOfDay) : sObj; // ensures rem goes strictly into the future avoiding backwards interpolation

                            let ratio = 0;
                            if (evalObj <= actS) ratio = 0;
                            else if (evalObj >= eObj) ratio = 1;
                            else {
                                const totWd = getExactWorkDays(actS, eObj, t.cal || state.defCal);
                                const elWd = getExactWorkDays(actS, evalObj, t.cal || state.defCal);
                                ratio = totWd > 0 ? (elWd / totWd) : 1;
                            }
                            earnedHere += w * (1 - basePct / 100) * ratio;
                            fallbackHere += wBackup * (1 - basePct / 100) * ratio;
                        }
                    }

                    projEarned += earnedHere;
                    projFallback += fallbackHere;
                });

                if (isHoursMode) projectedPct = projEarned;
                else if (totalWeight > 0) projectedPct = (projEarned / totalWeight) * 100;
                else if (fallbackTotalWeight > 0) projectedPct = (projFallback / fallbackTotalWeight) * 100;
                else projectedPct = 0;
            }

            points.push({
                name: d.toLocaleDateString(),
                dateISO: iso,
                dateMs: time,
                planned: parseFloat(calcPlannedPct(d).toFixed(2)),
                actual: actualPct !== null ? parseFloat(actualPct.toFixed(2)) : null,
                projected: projectedPct !== null ? parseFloat(projectedPct.toFixed(2)) : null
            });
        });

        // DO NOT mutate points here to avoid breaking histogram lookups.
        // We will just draw the status date points correctly in the render section.

        return { points, statusDateMs: sTimeEndOfDay, maxValue: totalWeight, isHoursMode };

    }, [state.activities, state.progressHistory, state.statusDate, selectedId, multiSelectIds, forcedActivityId, state.currentView, state.resourcePool, state.defCal]);

    const textColor = state.lightMode ? '#1e293b' : '#f8fafc';
    const gridColor = state.lightMode ? '#e2e8f0' : '#334155';
    const plannedColor = '#3b82f6'; // Blue
    const actualColor = '#10b981'; // Green
    const projectedColor = '#f97316'; // Orange

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
                    calScale={state.calScale}
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
                            <Line type="monotone" dataKey="projected" name={data.isHoursMode ? "HH Proyectadas" : "Avance Proyectado"} stroke={projectedColor} strokeWidth={3} strokeDasharray="5 5" dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls={true} />
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
    zoom?: ZoomLevel;
    calScale?: CalScale;
    lightMode: boolean;
    statusDate?: Date;
    points: any[];
    statusDateMs?: number;
    maxValue?: number;
    isHours?: boolean;
}

function SCurveCanvas({ width, projStart, totalDays, pxPerDay, zoom, calScale, lightMode, statusDate, points, statusDateMs, maxValue, isHours }: SCurveCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const yAxisCanvasRef = useRef<HTMLCanvasElement>(null);
    const PX = pxPerDay;
    const HDR_H = calScale === 'week-day' ? 50 : 36; // timeline axis height
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
        const actualColor = '#10b981';
        const projectedColor = '#f97316';

        // ─── Background ──────────────────────────────────
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, totalH - HDR_H);

        // ─── Legend ──────────────────────────────────────
        ctx.font = '11px Segoe UI';
        const lgY = 14;
        // Planned
        ctx.fillStyle = plannedColor;
        ctx.fillRect(width / 2 - 200, lgY - 6, 14, 3);
        ctx.beginPath(); ctx.arc(width / 2 - 193, lgY - 5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = textColor;
        ctx.fillText(isHours ? 'HH Programadas' : 'Avance Programado', width / 2 - 182, lgY);
        // Actual
        ctx.fillStyle = actualColor;
        ctx.fillRect(width / 2 - 30, lgY - 6, 14, 3);
        ctx.beginPath(); ctx.arc(width / 2 - 23, lgY - 5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = textColor;
        ctx.fillText(isHours ? 'HH Reales' : 'Avance Real', width / 2 - 10, lgY);
        // Projected
        ctx.fillStyle = projectedColor;
        ctx.setLineDash([3, 3]);
        ctx.fillRect(width / 2 + 100, lgY - 6, 14, 3);
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(width / 2 + 107, lgY - 5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = textColor;
        ctx.fillText(isHours ? 'HH Proyectadas' : 'Avance Proyectado', width / 2 + 120, lgY);

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

        // ─── Today line (amber, end-of-day like Gantt/Usage grid) ──────
        const todayNow = new Date();
        const todayX = (dayDiff(projStart, new Date(todayNow.getFullYear(), todayNow.getMonth(), todayNow.getDate())) + 1) * PX;
        if (todayX >= 0 && todayX <= width) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(todayX, chartTop, 2, chartH);
        }

        // ─── Histogram (Progreso por periodo) ──────────
        const getValAtMs = (msTarget: number, key: 'planned' | 'actual' | 'projected' = 'planned') => {
            const pastPoints = points.filter(p => p.dateMs <= msTarget && p[key] !== null && p[key] !== undefined);
            if (pastPoints.length === 0) return 0;
            return pastPoints[pastPoints.length - 1][key];
        };

        const histPeriods = [];
        const histCs = calScale || zoom;
        let iter = new Date(projStart);
        while (iter <= end) {
            const startMs = iter.getTime();
            if (histCs === 'week-day') {
                iter.setDate(iter.getDate() + 1);
            } else if (histCs === 'month-week') {
                const dow = iter.getDay();
                if (histPeriods.length === 0 && dow !== 1) {
                    iter.setDate(iter.getDate() + (dow === 0 ? 1 : 8 - dow));
                } else {
                    iter.setDate(iter.getDate() + 7);
                }
            } else if (histCs === 'year-month' || histCs === 'quarter-month') {
                iter.setMonth(iter.getMonth() + 1);
                iter.setDate(1);
            } else if (histCs === 'year-quarter') {
                iter.setMonth(iter.getMonth() + 3);
                iter.setDate(1);
            } else {
                iter.setDate(iter.getDate() + 7);
            }
            const endMs = iter.getTime();
            histPeriods.push({ startMs, endMs });
        }

        // Draw histogram bars using the SAME Y-axis scale (yMax / chartH) so that
        // bar heights align with the Y-axis labels (e.g. a 175h bar reaches the 175h mark).
        histPeriods.forEach(p => {
            const planProg = Math.max(0, getValAtMs(p.endMs, 'planned') - getValAtMs(p.startMs, 'planned'));
            const actProg = Math.max(0, getValAtMs(p.endMs, 'actual') - getValAtMs(p.startMs, 'actual'));
            const projProg = Math.max(0, getValAtMs(p.endMs, 'projected') - getValAtMs(p.startMs, 'projected'));
            const xStart = msToX(p.startMs);
            const xEnd = msToX(p.endMs);
            const rawBarW = Math.max(1, xEnd - xStart - 1);
            const barW = rawBarW / 3;

            // Draw planned bar
            if (planProg > 0) {
                const barH = (planProg / yMax) * chartH;
                ctx.fillStyle = 'rgba(59, 130, 246, 0.4)'; // Blue transparent
                ctx.fillRect(xStart + 0.5, chartBot - barH, barW, barH);
                ctx.strokeStyle = '#3b82f6';
                ctx.strokeRect(xStart + 0.5, chartBot - barH, barW, barH);
            }

            // Draw actual bar
            if (actProg > 0 && statusDateMs && p.startMs < statusDateMs) {
                const barH = (actProg / yMax) * chartH;
                ctx.fillStyle = 'rgba(16, 185, 129, 0.4)'; // Green transparent
                ctx.fillRect(xStart + 0.5 + barW, chartBot - barH, barW, barH);
                ctx.strokeStyle = '#10b981';
                ctx.strokeRect(xStart + 0.5 + barW, chartBot - barH, barW, barH);
            }

            // Draw projected bar — only for periods starting at or after the status date.
            if (projProg > 0 && (!statusDateMs || p.startMs >= statusDateMs)) {
                const barH = (projProg / yMax) * chartH;
                ctx.fillStyle = 'rgba(249, 115, 22, 0.4)'; // Orange transparent
                ctx.fillRect(xStart + 0.5 + barW * 2, chartBot - barH, barW, barH);
                ctx.strokeStyle = '#f97316';
                ctx.strokeRect(xStart + 0.5 + barW * 2, chartBot - barH, barW, barH);
            }
        });

        // ─── Value → y pixel ───────────────────────────────
        const valToY = (val: number) => chartBot - (val / yMax) * chartH;

        // ─── Draw planned curve (smooth bezier) ──────────────
        const mappedPlanned = points.map(p => ({ x: msToX(p.dateMs), y: valToY(p.planned) }));

        if (points.length > 0) {
            ctx.strokeStyle = plannedColor;
            ctx.lineWidth = 2.5;
            drawSmoothCurve(ctx, mappedPlanned, chartTop, chartBot);
            ctx.lineWidth = 1;

            // Dots
            ctx.fillStyle = plannedColor;
            mappedPlanned.forEach(p => {
                ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
            });
        }

        // ─── Draw actual curve (smooth bezier) ───────────────
        const actualPoints = points.filter(p => p.actual !== null && p.actual !== undefined);
        const mappedActual = actualPoints.map(p => ({ x: msToX(p.dateMs), y: valToY(p.actual!) }));

        if (actualPoints.length > 0) {
            ctx.strokeStyle = actualColor;
            ctx.lineWidth = 2.5;
            drawSmoothCurve(ctx, mappedActual, chartTop, chartBot);
            ctx.lineWidth = 1;

            // Dots
            ctx.fillStyle = actualColor;
            mappedActual.forEach(p => {
                ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
            });
        }

        // ─── Draw projected curve (smooth bezier) ───────────────
        const projectedPoints = points.filter(p => p.projected !== null && p.projected !== undefined);
        const mappedProjected = projectedPoints.map(p => ({ x: msToX(p.dateMs), y: valToY(p.projected!) }));

        if (projectedPoints.length > 0) {
            ctx.strokeStyle = projectedColor;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 5]);
            drawSmoothCurve(ctx, mappedProjected, chartTop, chartBot);
            ctx.setLineDash([]);
            ctx.lineWidth = 1;

            // Dots
            ctx.fillStyle = projectedColor;
            mappedProjected.forEach(p => {
                ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
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
        const cs = calScale || zoom;
        const MESES_H = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

        // Top header row (Month, Quarter, Year, or Week)
        if (cs === 'year-month' || cs === 'year-quarter') {
            for (let yr = projStart.getFullYear(); yr <= end.getFullYear(); yr++) {
                const yS = new Date(yr, 0, 1), yE = new Date(yr + 1, 0, 1);
                const ds = yS < projStart ? projStart : yS, de = yE > end ? end : yE;
                const x = dayDiff(projStart, ds) * PX, w = dayDiff(ds, de) * PX;
                ctx.fillStyle = colors.topBg; ctx.fillRect(x, axisTop, w, 17);
                ctx.strokeStyle = colors.topBorder; ctx.strokeRect(x, axisTop, w, 17);
                ctx.fillStyle = colors.topText; ctx.font = 'bold 10px Segoe UI';
                if (w > 20) ctx.fillText(String(yr), x + 4, axisTop + 12);
            }
        } else if (cs === 'quarter-month') {
            for (let yr = projStart.getFullYear(); yr <= end.getFullYear(); yr++) {
                for (let q = 0; q < 4; q++) {
                    const qS = new Date(yr, q * 3, 1), qE = new Date(yr, q * 3 + 3, 1);
                    if (qE <= projStart || qS >= end) continue;
                    const ds = qS < projStart ? projStart : qS, de = qE > end ? end : qE;
                    const x = dayDiff(projStart, ds) * PX, w = dayDiff(ds, de) * PX;
                    ctx.fillStyle = colors.topBg; ctx.fillRect(x, axisTop, w, 17);
                    ctx.strokeStyle = colors.topBorder; ctx.strokeRect(x, axisTop, w, 17);
                    ctx.fillStyle = colors.topText; ctx.font = 'bold 10px Segoe UI';
                    if (w > 20) ctx.fillText(`Q${q + 1} ${yr}`, x + 4, axisTop + 12);
                }
            }
        } else if (cs === 'week-day') {
            let curW = new Date(projStart);
            const dow = curW.getDay(); curW.setDate(curW.getDate() - (dow === 0 ? 6 : dow - 1));
            while (curW < end) {
                const wEnd = new Date(curW); wEnd.setDate(wEnd.getDate() + 7);
                const ds = curW < projStart ? projStart : curW;
                const x = dayDiff(projStart, ds) * PX, w = dayDiff(ds, wEnd > end ? end : wEnd) * PX;
                ctx.fillStyle = colors.topBg; ctx.fillRect(x, axisTop, w, 17);
                ctx.strokeStyle = colors.topBorder; ctx.strokeRect(x, axisTop, w, 17);
                ctx.fillStyle = colors.topText; ctx.font = 'bold 10px Segoe UI';
                const lbl = String(ds.getDate()).padStart(2, '0') + '-' + MESES_H[ds.getMonth()];
                if (w > 24) ctx.fillText(lbl, x + 4, axisTop + 12);
                curW.setDate(curW.getDate() + 7);
            }
        } else {
            let curM = new Date(projStart.getFullYear(), projStart.getMonth(), 1);
            while (curM < end) {
                const nm = new Date(curM.getFullYear(), curM.getMonth() + 1, 1);
                const ds = curM < projStart ? projStart : curM;
                const x = dayDiff(projStart, ds) * PX, w = Math.min(dayDiff(ds, nm) * PX, width - x);
                ctx.fillStyle = colors.topBg; ctx.fillRect(x, axisTop, w, 17);
                ctx.strokeStyle = colors.topBorder; ctx.strokeRect(x, axisTop, w, 17);
                ctx.fillStyle = colors.topText; ctx.font = 'bold 10px Segoe UI';
                const lbl = curM.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
                if (w > 24) ctx.fillText(lbl, x + 4, axisTop + 12);
                curM = nm;
            }
        }

        // Sub-headers (Bottom header)
        if (cs === 'year-month' || cs === 'quarter-month') {
            let cur = new Date(projStart);
            while (cur < end) {
                const x = dayDiff(projStart, cur) * PX;
                const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const w = Math.min(dayDiff(cur, nm) * PX, width - x);
                ctx.fillStyle = colors.botBg; ctx.fillRect(x, axisTop + 17, w, 19);
                ctx.strokeStyle = colors.botBorder; ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                ctx.fillStyle = colors.botText; ctx.font = '9px Segoe UI';
                if (w > 20) ctx.fillText(MESES_H[cur.getMonth()], x + 4, axisTop + 30);
                cur = nm;
            }
        } else if (cs === 'year-quarter') {
            let cur = new Date(projStart);
            while (cur < end) {
                const x = dayDiff(projStart, cur) * PX;
                const nq = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
                const w = Math.min(dayDiff(cur, nq) * PX, width - x);
                ctx.fillStyle = colors.botBg; ctx.fillRect(x, axisTop + 17, w, 19);
                ctx.strokeStyle = colors.botBorder; ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                const q = Math.floor(cur.getMonth() / 3) + 1;
                ctx.fillStyle = colors.botText; ctx.font = '9px Segoe UI';
                if (w > 20) ctx.fillText(`Q${q}`, x + 4, axisTop + 30);
                cur = nq;
            }
        } else if (cs === 'month-week') {
            // Week sub-ticks – align to Monday
            let cur = new Date(projStart);
            const dow = cur.getDay(); cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1));
            while (cur < end) {
                const x = dayDiff(projStart, cur) * PX;
                const w = 7 * PX;
                ctx.fillStyle = colors.botBg; ctx.fillRect(x, axisTop + 17, w, 19);
                ctx.strokeStyle = colors.botBorder; ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                const dd = String(cur.getDate()).padStart(2, '0') + '-' + MESES_H[cur.getMonth()];
                ctx.fillStyle = colors.botText; ctx.font = '9px Segoe UI';
                if (PX * 7 > 20) ctx.fillText(dd, x + 2, axisTop + 30);
                cur.setDate(cur.getDate() + 7);
            }
        } else if (cs === 'week-day') {
            let cur = new Date(projStart);
            while (cur < end) {
                const x = dayDiff(projStart, cur) * PX;
                const isSun = cur.getDay() === 0, isSat = cur.getDay() === 6;
                const wkndFill = isSun || isSat ? colors.weekend : colors.botBg;
                const wkndText = isSun || isSat ? (lightMode ? '#94a3b8' : '#374151') : colors.botText;
                ctx.fillStyle = wkndFill; ctx.fillRect(x, axisTop + 17, PX, 16);
                ctx.fillStyle = wkndFill; ctx.fillRect(x, axisTop + 33, PX, 17);
                ctx.strokeStyle = colors.botBorder; ctx.beginPath(); ctx.moveTo(x, axisTop + 17); ctx.lineTo(x, axisTop + HDR_H); ctx.stroke();
                ctx.fillStyle = wkndText; ctx.font = '9px Segoe UI';
                ctx.textAlign = 'center';
                if (PX >= 14) ctx.fillText(String(cur.getDate()), x + PX / 2, axisTop + 29);
                const days = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
                if (PX >= 10) ctx.fillText(days[cur.getDay()], x + PX / 2, axisTop + 46);
                ctx.textAlign = 'left';
                cur.setDate(cur.getDate() + 1);
            }
        } else {
            // Default fallback (day)
            let cur = new Date(projStart);
            while (cur < end) {
                const x = dayDiff(projStart, cur) * PX;
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
    }, [width, projStart, totalDays, PX, zoom, lightMode, statusDate, points, statusDateMs, calScale, HDR_H, maxValue, isHours]);

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
                    <div style={{ color: '#10b981' }}>Real: <strong>{tooltip.actual}</strong></div>
                </div>
            )}
        </div>
    );
}
