// ═══════════════════════════════════════════════════════════════════
// Gantt Table – Left panel, editable table matching HTML exactly
// Column resize, inline editing, empty row, tooltip, all formatting
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useGantt } from '../store/GanttContext';
import { fmtDate, addDays, isoDate, newActivity, parseDate } from '../utils/cpm';
import { predsToStr, getWeightPct, strToPreds, autoId, syncResFromString } from '../utils/helpers';
import ColumnPickerModal from './ColumnPickerModal';
import RowContextMenu from './RowContextMenu';

const EditableNumberCell = ({ rawValue, displayValue, onUpdate, onFocus, isRowSelected, step, min, max }: { rawValue: string, displayValue: string, onUpdate: (val: string) => void, onFocus: () => void, isRowSelected: boolean, step?: number, min?: number, max?: number }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [val, setVal] = useState(rawValue);
    const wasSelectedRef = useRef(false);

    useEffect(() => { setVal(rawValue); }, [rawValue]);
    useEffect(() => { wasSelectedRef.current = isRowSelected; }, [isRowSelected]);

    // Exit edit mode when row is deselected
    useEffect(() => {
        if (!isRowSelected && isEditing) { setIsEditing(false); onUpdate(val); }
    }, [isRowSelected]);

    const enterEdit = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsEditing(true); onFocus();
    };

    if (isEditing) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex' }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                <input
                    type="number"
                    step={step}
                    min={min}
                    max={max}
                    style={{ background: 'transparent', outline: 'none', border: '1px solid #3b82f6', color: 'inherit', padding: 0, margin: 0, width: '100%', height: '100%', fontSize: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box', textAlign: 'inherit' }}
                    autoFocus
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    onBlur={() => { setIsEditing(false); onUpdate(val); }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setIsEditing(false);
                    }}
                    onFocus={onFocus}
                    onContextMenu={e => { e.preventDefault(); setIsEditing(false); }}
                />
            </div>
        );
    }

    return (
        <span
            style={{ cursor: 'text', display: 'flex', alignItems: 'center', justifyContent: 'inherit', width: '100%', height: '100%' }}
            onMouseDown={(e) => {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
                // Use ref to check selection (avoids React render delay)
                if (isRowSelected || wasSelectedRef.current) { enterEdit(e); return; }
                // First click: let it propagate to select the row, mark as selected for next click
                wasSelectedRef.current = true;
            }}
            onDoubleClick={(e) => { if (!isEditing) enterEdit(e); }}
            onClick={(e) => { if ((isRowSelected || wasSelectedRef.current) && !e.ctrlKey && !e.metaKey && !e.shiftKey) e.stopPropagation(); }}
        >
            {displayValue}
        </span>
    );
};

const EditableDateCell = ({ dateValue, displayValue, onUpdate, onFocus, isRowSelected }: { dateValue: Date | null | undefined, displayValue: string, onUpdate: (val: string) => void, onFocus: () => void, isRowSelected: boolean }) => {
    const [isEditing, setIsEditing] = useState(false);
    const wasSelectedRef = useRef(false);

    // Convert Date to YYYY-MM-DD for input
    const toIsoDate = (d: Date | null | undefined) => {
        if (!d) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const [val, setVal] = useState(toIsoDate(dateValue));

    useEffect(() => { setVal(toIsoDate(dateValue)); }, [dateValue]);
    useEffect(() => { wasSelectedRef.current = isRowSelected; }, [isRowSelected]);

    // Exit edit mode when row is deselected
    useEffect(() => {
        if (!isRowSelected && isEditing) { setIsEditing(false); onUpdate(val); }
    }, [isRowSelected]);

    const enterEdit = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsEditing(true); onFocus();
    };

    if (isEditing) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex' }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                <input
                    type="date"
                    style={{ background: 'transparent', outline: 'none', border: 'none', color: 'inherit', padding: 0, margin: 0, width: '100%', height: '100%', fontSize: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    autoFocus
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    onBlur={() => { setIsEditing(false); onUpdate(val); }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setIsEditing(false);
                    }}
                    onFocus={onFocus}
                    onContextMenu={e => { e.preventDefault(); setIsEditing(false); }}
                />
            </div>
        );
    }

    return (
        <span
            style={{ cursor: 'text', display: 'flex', alignItems: 'center', justifyContent: 'inherit', width: '100%', height: '100%' }}
            onMouseDown={(e) => {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
                if (isRowSelected || wasSelectedRef.current) { enterEdit(e); return; }
                wasSelectedRef.current = true;
            }}
            onDoubleClick={(e) => { if (!isEditing) enterEdit(e); }}
            onClick={(e) => { if ((isRowSelected || wasSelectedRef.current) && !e.ctrlKey && !e.metaKey && !e.shiftKey) e.stopPropagation(); }}
        >
            {displayValue}
        </span>
    );
};

export default function GanttTable() {
    const { state, dispatch } = useGantt();
    const { visRows, columns, colWidths, selIdx, selIndices, activities, lightMode, defCal, chainIds, chainTrace } = state;
    const bodyRef = useRef<HTMLDivElement>(null);
    const [colResize, setColResize] = useState<{ idx: number; startX: number; startW: number } | null>(null);
    const [colPickerOpen, setColPickerOpen] = useState(false);
    // Track rows that have been clicked (for edit-on-second-click without waiting for React re-render)
    const touchedRowsRef = useRef<Set<number>>(new Set());
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

    const visCols = columns.filter(c => c.visible);
    const totalW = visCols.reduce((s, c) => s + colWidths[columns.indexOf(c)], 0);

    const headerRef = useRef<HTMLDivElement>(null);

    // Scroll sync
    useEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        const handler = () => {
            const grBody = document.getElementById('gr-body');
            if (grBody) grBody.scrollTop = body.scrollTop;
            // Sync header horizontal scroll
            if (headerRef.current) headerRef.current.scrollLeft = body.scrollLeft;
        };
        body.addEventListener('scroll', handler);
        return () => body.removeEventListener('scroll', handler);
    }, []);

    // Column resize handler
    useEffect(() => {
        if (!colResize) return;
        const onMove = (e: MouseEvent) => {
            const newW = Math.max(20, colResize.startW + (e.clientX - colResize.startX));
            dispatch({ type: 'SET_COL_WIDTH', index: colResize.idx, width: newW });
        };
        const onUp = () => { setColResize(null); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [colResize, dispatch]);


    const isUsageView = state.currentView === 'usage';

    // Dynamic row height in usage view: activity/resource rows get taller to fit multiple metric lines
    const usageModes = state.usageModes || [];
    const LINE_H = 16;
    const MIN_ROW_H = 26;
    const usageRowH = Math.max(MIN_ROW_H, (usageModes.length || 1) * LINE_H + 4);

    const getCellValue = useCallback((a: any, c: any, vi: number): string => {
        if (a._isResourceAssignment) {
            if (c.key === 'name') return '👤 ' + (a.name || '');
            if (c.key === 'work') return (a.work || 0) + ' hrs';
            if (c.key === '_num') return '';
            if (c.key === '_mode') return '';
            // Show parent activity dates for resource assignment context
            const parent = activities[a._idx];
            if (parent) {
                if (c.key === 'startDate') return parent.ES ? fmtDate(parent.ES) : '';
                if (c.key === 'endDate') return parent.EF ? fmtDate(parent.type === 'milestone' ? parent.EF : addDays(parent.EF, -1)) : '';
                if (c.key === 'dur') {
                    if (parent.type === 'milestone') return '0 días';
                    const displayDur = (parent as any)._spanDur != null ? (parent as any)._spanDur : (parent.dur || 0);
                    return displayDur + ' días';
                }
            }
            return ''; // Leave other cells empty for resource sub-rows
        }

        if (c.key === '_num') return String(vi + 1);
        if (c.key === '_mode') {
            if (a.type === 'summary') return state.collapsed.has(a.id) ? '▶' : '▼';
            // In usage view, show expand/collapse for activities with resources
            if (isUsageView && a.resources && a.resources.length > 0) return state.expResources.has(a.id) ? '▼' : '▶';
            return '';
        }
        if (c.key === '_info') return 'ⓘ';
        if (c.key === 'outlineNum') return a.outlineNum || '';
        if (c.key === 'id') return a.id || '';
        if (c.key === 'name') return a.name || '';
        if (c.key === 'dur') {
            if (a.type === 'milestone') return '0 días';
            // Si hay span visual calculado (split por retained logic), mostrarlo
            const displayDur = (a as any)._spanDur != null ? (a as any)._spanDur : (a.dur || 0);
            return displayDur + ' días';
        }
        if (c.key === 'remDur') return a.type === 'milestone' ? '0 días' : (a.remDur != null ? a.remDur : (a.dur || 0)) + ' días';
        if (c.key === 'startDate') return a.ES ? fmtDate(a.ES) : '';
        if (c.key === 'endDate') return a.EF ? fmtDate(a.type === 'milestone' ? a.EF : addDays(a.EF, -1)) : '';
        if (c.key === 'predStr') return predsToStr(a.preds);
        if (c.key === 'pct') return Number(a.pct || 0).toFixed(1) + '%';
        if (c.key === 'plannedPct') return Number(a._plannedPct != null ? a._plannedPct : (a.pct || 0)).toFixed(1) + '%';
        if (c.key === 'res') return a.res || '';
        if (c.key === 'work') return a.type === 'milestone' ? '0 hrs' : ((a.work || 0) + ' hrs');
        if (c.key === 'earnedValue' || c.key === 'remainingWork') {
            let ev: number;
            if (a.type === 'summary' || a._isProjRow) {
                // Bottom-up: sum earned value of all leaf descendants (non-summary)
                ev = 0;
                const startJ = a._isProjRow ? 1 : activities.indexOf(a) + 1;
                for (let j = startJ; j < activities.length; j++) {
                    const ch = activities[j];
                    if (!a._isProjRow && ch.lv <= a.lv) break;
                    if (ch.type === 'summary') continue; // skip sub-summaries, count only leaves
                    ev += (ch.work || 0) * (ch.pct || 0) / 100;
                }
            } else {
                ev = (a.work || 0) * (a.pct || 0) / 100;
            }
            ev = Math.round(ev * 10) / 10;
            if (c.key === 'earnedValue') return ev + ' hrs';
            const rem = Math.round(((a.work || 0) - ev) * 10) / 10;
            return rem + ' hrs';
        }
        if (c.key === 'weight') return getWeightPct(a, activities);
        if (c.key === 'cal') {
            const cal = a.cal || defCal;
            if (typeof cal === 'string') {
                const cc = state.customCalendars.find((x: any) => x.id === cal);
                return cc ? cc.name : String(cal);
            }
            return cal + 'd';
        }
        if (c.key === 'TF') {
            if (a.type === 'summary' || a._isProjRow) return '';
            if (a.TF != null) return a.TF + 'd';
            return '';
        }
        if (c.key === 'FF') {
            if (a.type === 'summary' || a._isProjRow) return '';
            if (a._freeFloat != null) return a._freeFloat + 'd';
            return '';
        }
        if (c.key === 'floatPath') {
            if (a.type === 'summary' || a._isProjRow) return '';
            return a._floatPath != null ? String(a._floatPath) : '';
        }
        if (c.key === 'type') return a.type === 'milestone' ? 'Hito' : a.type === 'summary' ? 'Resumen' : 'Tarea';
        if (c.key === 'lv') return String(a.lv);
        if (c.key === 'actualStart') return a.actualStart ? fmtDate(new Date(a.actualStart)) : '';
        if (c.key === 'actualFinish') return a.actualFinish ? fmtDate(new Date(a.actualFinish)) : '';
        if (c.key === 'remStartDate') return a._remES ? fmtDate(a._remES) : '';
        if (c.key === 'remEndDate') return a._remEF ? fmtDate(addDays(a._remEF, -1)) : '';
        if (c.key === 'blDur') return a.blDur != null ? a.blDur + ' días' : '';
        if (c.key === 'blStart') return a.blES ? fmtDate(a.blES) : '';
        if (c.key === 'blEnd') return a.blEF ? fmtDate(addDays(a.blEF, -1)) : '';
        if (c.key === 'constraint') return a.constraint || '';
        if (c.key === 'constraintDate') return a.constraintDate || '';
        if (c.key === 'notes') return (a.notes || '').substring(0, 40);
        return a[c.key] != null ? String(a[c.key]) : '';
    }, [activities, defCal, state.collapsed, state.statusDate, isUsageView, state.expResources]);

    const getRawValue = useCallback((a: any, key: string): string => {
        if (a._isResourceAssignment) {
            if (key === 'work') return String(a.work || 0);
            return '';
        }

        if (key === 'dur') return String(a._spanDur != null ? a._spanDur : (a.dur || 0));
        if (key === 'remDur') return String(a.remDur != null ? a.remDur : '');
        if (key === 'pct') return String(a.pct || 0);
        if (key === 'work') return String(a.work || 0);
        if (key === 'weight') return a.weight != null ? String(a.weight) : '';
        if (key === 'startDate') return a.ES ? fmtDate(a.ES) : '';
        if (key === 'predStr') return predsToStr(a.preds);
        return a[key] != null ? String(a[key]) : '';
    }, []);

    const handleBlur = useCallback((idx: number, key: string, val: string) => {
        dispatch({ type: 'PUSH_UNDO' });
        dispatch({ type: 'COMMIT_EDIT', index: idx, key, value: val.trim() });
    }, [dispatch]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            (e.target as HTMLElement).blur();
        }
    }, []);

    // Tooltip moved to GanttTimeline

    const getTFColor = (a: any): string | undefined => {
        if (a.TF === 0) return '#ef4444';
        if (a.TF != null && a.TF <= 3) return '#f59e0b';
        if (a.TF != null) return '#22c55e';
        return undefined;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div ref={headerRef} style={{ display: 'flex', flexShrink: 0, overflowX: 'hidden', minWidth: '100%' }}>
                {visCols.map((c) => {
                    const ci = columns.indexOf(c);
                    return (
                        <div key={c.key} className="col-hdr" style={{ width: colWidths[ci] }}
                            onContextMenu={e => { e.preventDefault(); setColPickerOpen(true); }}
                            onDoubleClick={() => {
                                if (c.key.startsWith('txt')) {
                                    const newName = prompt('Renombrar columna "' + c.label + '":', c.label);
                                    if (newName && newName.trim()) {
                                        /* TODO: column rename in store */
                                    }
                                }
                            }}>
                            {c.label}
                            <div className="col-rsz" onMouseDown={e => { e.stopPropagation(); setColResize({ idx: ci, startX: e.clientX, startW: colWidths[ci] }); }} />
                        </div>
                    );
                })}
            </div>

            {/* Body */}
            <div ref={bodyRef} id="gl-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                <div style={{ width: totalW }}>
                    {visRows.map((vr, vi) => {
                        if (vr._isGroupHeader) {
                            return (
                                <div key={vi} className="trow trow-group" style={{ width: totalW }}>
                                    <div className="tcell" style={{ width: totalW, paddingLeft: 8 }}>
                                        ▼ <b>{vr._groupLabel}</b> <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 10 }}>({vr._groupCount} actividades)</span>
                                    </div>
                                </div>
                            );
                        }
                        const actualAct = activities[vr._idx];
                        const a = vr._isResourceAssignment ? vr : actualAct;
                        const isProj = a._isProjRow;
                        const isSummary = a.type === 'summary';
                        const isResRow = vr._isResourceAssignment;
                        const hasResources = isUsageView && !isResRow && actualAct?.resources && actualAct.resources.length > 0;
                        const rowCls = `trow ${isProj ? 'trow-proj' : `trow-lv${Math.min(a.lv, 2)}`} ${!isProj && isSummary ? 'trow-summary' : ''} ${selIndices.has(vr._idx) ? 'sel' : ''} ${isResRow ? 'trow-resource-assign' : ''}`;

                        // Chain trace highlighting
                        const chainActive = chainTrace != null && chainIds.size > 0;
                        const inChain = chainActive && chainIds.has(a.id);
                        const isChainOrigin = chainTrace != null && a.id === chainTrace.actId;
                        const chainStyle: React.CSSProperties = chainActive && !isProj
                            ? inChain
                                ? { background: isChainOrigin ? (lightMode ? '#fef9c3' : '#422006') : (lightMode ? '#eff6ff' : '#172554'), opacity: 1 }
                                : { opacity: 0.35 }
                            : {};

                        // In usage view, non-summary rows expand to fit multiple metric lines
                        const needsTallRow = isUsageView && !isProj && !isSummary && usageModes.length > 1;
                        const rowHeight = needsTallRow ? usageRowH : undefined;

                        return (
                            <div key={vi} className={rowCls} style={{
                                width: totalW,
                                ...(rowHeight ? { height: rowHeight, minHeight: rowHeight } : {}),
                                ...(isResRow ? {
                                    fontStyle: 'italic',
                                    opacity: 0.85,
                                    background: lightMode ? '#f0f9ff' : '#0c1929',
                                } : {}),
                                ...(hasResources ? { fontWeight: 600 } : {}),
                                ...chainStyle
                            }}
                                onMouseDown={() => { (document.activeElement as HTMLElement)?.blur?.(); }}
                                onClick={(e) => { touchedRowsRef.current = new Set([vr._idx]); dispatch({ type: 'SET_SELECTION', index: vr._idx, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }); }}
                                onContextMenu={(e) => { e.preventDefault(); dispatch({ type: 'SET_SELECTION', index: vr._idx }); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
                                onDoubleClick={() => { dispatch({ type: 'SET_SELECTION', index: vr._idx }); dispatch({ type: 'OPEN_ACT_MODAL' }); }}>
                                {visCols.map((c) => {
                                    const ci = columns.indexOf(c);
                                    const val = getCellValue(a, c, vi);
                                    const style: React.CSSProperties = { width: colWidths[ci] };

                                    // Name cell indent
                                    if (c.key === 'name') {
                                        style.paddingLeft = 2 + Math.max(0, a.lv) * 14;
                                        if (isResRow) {
                                            style.paddingLeft = 2 + Math.max(0, (a.lv || 0)) * 14 + 10;
                                            style.color = lightMode ? '#2563eb' : '#60a5fa';
                                        }
                                    }



                                    if (isSummary || isProj) style.fontWeight = 700;

                                    // TF coloring
                                    if (c.key === 'TF') { const tfColor = getTFColor(a); if (tfColor) style.color = tfColor; }

                                    // Weight coloring
                                    if (c.key === 'weight' && a.weight != null && a.weight > 0) style.color = '#fbbf24';

                                    // Info icon click
                                    if (c.key === '_info' && a.id) {
                                        return (
                                            <div key={c.key} className={`tcell ${c.cls}`} style={style}
                                                onClick={e => { e.stopPropagation(); dispatch({ type: 'SET_SELECTION', index: vr._idx }); dispatch({ type: 'OPEN_ACT_MODAL' }); }}>
                                                ⓘ
                                            </div>
                                        );
                                    }

                                    // Mode column (collapse/expand for summaries and resource toggles)
                                    if (c.key === '_mode' && isSummary) {
                                        return (
                                            <div key={c.key} className={`tcell ${c.cls}`} style={{ ...style, cursor: 'pointer' }}
                                                onClick={e => { e.stopPropagation(); dispatch({ type: 'TOGGLE_COLLAPSE', id: a.id }); }}>
                                                {val}
                                            </div>
                                        );
                                    }
                                    // In usage view, show expand/collapse for activities with resources
                                    if (c.key === '_mode' && hasResources) {
                                        return (
                                            <div key={c.key} className={`tcell ${c.cls}`} style={{ ...style, cursor: 'pointer', color: lightMode ? '#2563eb' : '#60a5fa' }}
                                                onClick={e => { e.stopPropagation(); dispatch({ type: 'TOGGLE_RES_COLLAPSE', id: a.id }); }}>
                                                {val}
                                            </div>
                                        );
                                    }

                                    // Calendar select dropdown
                                    if (c.key === 'cal' && c.edit === 'select') {
                                        return (
                                            <div key={c.key} className={`tcell ${c.cls}`} style={style}>
                                                <select className="fp-cell-edit" style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', color: 'inherit', fontSize: 11, outline: 'none', cursor: 'pointer' }}
                                                    value={a.cal || defCal}
                                                    onFocus={() => dispatch({ type: 'SET_SELECTION', index: vr._idx })}
                                                    onChange={e => { dispatch({ type: 'PUSH_UNDO' }); dispatch({ type: 'COMMIT_EDIT', index: vr._idx, key: 'cal', value: e.target.value }); }}>
                                                    <option value={5} style={{ background: lightMode ? '#fff' : '#1f2937' }}>5d</option>
                                                    <option value={6} style={{ background: lightMode ? '#fff' : '#1f2937' }}>6d</option>
                                                    <option value={7} style={{ background: lightMode ? '#fff' : '#1f2937' }}>7d</option>
                                                    {state.customCalendars.map(cc => (
                                                        <option key={cc.id} value={cc.id} style={{ background: lightMode ? '#fff' : '#1f2937' }}>{cc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    }

                                    // Editable cell
                                    if (c.edit === true) {
                                        const summaryReadOnly = isProj || (isSummary && (c.key === 'work' || c.key === 'pct' || c.key === 'dur'));
                                        if (summaryReadOnly) {
                                            return <div key={c.key} className={`tcell ${c.cls}`} style={{ ...style, opacity: 0.7 }}>{val}</div>;
                                        }

                                        if (['dur', 'remDur', 'pct', 'work', 'weight'].includes(c.key)) {
                                            return (
                                                <div key={c.key} className={`tcell ${c.cls}`} style={style}>
                                                    <EditableNumberCell
                                                        rawValue={getRawValue(a, c.key)}
                                                        displayValue={val}
                                                        onUpdate={(newVal) => handleBlur(vr._idx, c.key, newVal)}
                                                        onFocus={() => dispatch({ type: 'SET_SELECTION', index: vr._idx })}
                                                        isRowSelected={selIndices.has(vr._idx)}
                                                        step={c.key === 'pct' ? 5 : undefined}
                                                        min={c.key === 'pct' ? 0 : undefined}
                                                        max={c.key === 'pct' ? 100 : undefined}
                                                    />
                                                </div>
                                            );
                                        }

                                        if (['startDate', 'endDate'].includes(c.key)) {
                                            return (
                                                <div key={c.key} className={`tcell ${c.cls}`} style={style}>
                                                    <EditableDateCell
                                                        dateValue={c.key === 'startDate' ? a.ES : a.EF}
                                                        displayValue={val}
                                                        onUpdate={(newVal) => handleBlur(vr._idx, c.key, newVal)}
                                                        onFocus={() => dispatch({ type: 'SET_SELECTION', index: vr._idx })}
                                                        isRowSelected={selIndices.has(vr._idx)}
                                                    />
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={c.key} className={`tcell ${c.cls}`}
                                                style={style}
                                                contentEditable={!false}
                                                suppressContentEditableWarning
                                                spellCheck={false}
                                                onMouseDown={e => {
                                                    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) {
                                                        e.preventDefault(); return;
                                                    }
                                                    const alreadySel = selIndices.has(vr._idx) || touchedRowsRef.current.has(vr._idx);
                                                    if (!alreadySel) {
                                                        e.preventDefault(); // first click selects row
                                                        touchedRowsRef.current = new Set([vr._idx]);
                                                    }
                                                }}
                                                onContextMenu={e => { e.preventDefault(); e.currentTarget.blur(); }}
                                                onFocus={() => dispatch({ type: 'SET_SELECTION', index: vr._idx })}
                                                onBlur={e => handleBlur(vr._idx, c.key, e.currentTarget.textContent || '')}
                                                onKeyDown={handleKeyDown}
                                                dangerouslySetInnerHTML={{ __html: c.key === 'name' ? val : getRawValue(a, c.key) || val }}
                                            />
                                        );
                                    }

                                    return <div key={c.key} className={`tcell ${c.cls}`} style={style}>{val}</div>;
                                })}
                            </div>
                        );
                    })}

                    {/* Empty row for quick add */}
                    <EmptyAddRow visCols={visCols} columns={columns} colWidths={colWidths} totalW={totalW} rowNum={visRows.length + 1} dispatch={dispatch} state={state} />

                    {/* Visual empty rows */}
                    {Array.from({ length: 15 }).map((_, i) => (
                        <div key={`empty-${i}`} className="trow empty-row" style={{ width: totalW, opacity: 0.15 }}>
                            {visCols.map(c => {
                                const ci = columns.indexOf(c);
                                return <div key={c.key} className={`tcell ${c.cls}`} style={{ width: colWidths[ci] }}>
                                    {c.key === '_num' ? visRows.length + 2 + i : ''}
                                </div>;
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Tooltip moved */}

            {/* Column picker modal (P6-style) */}
            {colPickerOpen && <ColumnPickerModal onClose={() => setColPickerOpen(false)} />}

            {/* Row right-click context menu */}
            {ctxMenu && <RowContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} onOpenColumns={() => setColPickerOpen(true)} />}
        </div>
    );
}

// Empty row component for adding new activities
function EmptyAddRow({ visCols, columns, colWidths, totalW, rowNum, dispatch, state }: any) {
    const refs = useRef<Record<string, HTMLDivElement | null>>({});

    const commitNewRow = () => {
        dispatch({ type: 'PUSH_UNDO' });
        const a = newActivity('', state.defCal);
        visCols.forEach((c: any) => {
            if (!c.edit || c.edit === 'select') return;
            const cell = refs.current[c.key];
            if (!cell) return;
            const v = cell.textContent?.trim() || '';
            if (c.key === 'name') a.name = v;
            else if (c.key === 'id') a.id = v;
            else if (c.key === 'dur') { const n = parseInt(v); if (!isNaN(n)) { a.dur = n; if (n === 0) a.type = 'milestone'; } }
            else if (c.key === 'pct') { const n = parseInt(v); if (!isNaN(n)) a.pct = Math.min(100, Math.max(0, n)); }
            else if (c.key === 'predStr') a.preds = strToPreds(v);
            else if (c.key === 'startDate') { const d = parseDate(v); if (d) { a.constraint = 'MSO'; a.constraintDate = isoDate(d); a.manual = true; } }
            else if (c.key === 'res') { a.res = v; syncResFromString(a, state.resourcePool); }
            else if (c.key === 'work') { const n = parseFloat(v); if (!isNaN(n)) a.work = Math.max(0, n); }
        });
        if (!a.name) return;
        if (!a.id) a.id = autoId(state.activities);
        dispatch({ type: 'ADD_ACTIVITY', activity: a });
        // Clear cells
        Object.values(refs.current).forEach(cell => { if (cell) cell.textContent = ''; });
    };

    return (
        <div className="trow empty-row" style={{ width: totalW, opacity: 0.6 }}>
            {visCols.map((c: any) => {
                const ci = columns.indexOf(c);
                if (c.key === '_num') return <div key={c.key} className={`tcell ${c.cls}`} style={{ width: colWidths[ci] }}>{rowNum}</div>;
                if (c.edit === true) {
                    return (
                        <div key={c.key} className={`tcell ${c.cls}`} style={{ width: colWidths[ci] }}
                            contentEditable suppressContentEditableWarning spellCheck={false}
                            ref={el => { refs.current[c.key] = el; }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitNewRow(); } }}
                            onBlur={() => {
                                setTimeout(() => {
                                    const nameCell = refs.current['name'];
                                    if (nameCell && nameCell.textContent?.trim()) commitNewRow();
                                }, 100);
                            }}
                        />
                    );
                }
                return <div key={c.key} className={`tcell ${c.cls}`} style={{ width: colWidths[ci] }} />;
            })}
        </div>
    );
}
