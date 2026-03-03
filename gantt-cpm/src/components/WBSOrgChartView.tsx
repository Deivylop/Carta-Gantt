// WBSOrgChartView.tsx – WBS Org-Chart for project activities
// Shows summary tasks + project root in an org-chart tree, starting at Level 0
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';

// ── Layout constants ─────────────────────────────────────────────
const BOX_W = 210;
const BOX_H = 112;
const H_GAP = 36;
const V_GAP = 80;

// ── Helper: format date ──────────────────────────────────────────
function fmtD(d: Date | null | undefined): string {
    if (!d) return '—';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Interface ────────────────────────────────────────────────────
interface ChartNode {
    act: any; // raw activity object
    children: ChartNode[];
    x: number;
    y: number;
    subtreeW: number;
}

// ── Build tree from flat activity list ───────────────────────────
function buildWBSTree(activities: any[], collapsedSet: Set<string>): ChartNode[] {
    const projRow = activities.find(a => a._isProjRow);
    const rootChildren: ChartNode[] = [];
    let rootNode: ChartNode | null = null;

    if (projRow) {
        rootNode = { act: projRow, children: [], x: 0, y: 0, subtreeW: BOX_W };
    }

    const stack: { lv: number; node: ChartNode }[] = rootNode ? [{ lv: -1, node: rootNode }] : [];

    for (let i = 0; i < activities.length; i++) {
        const a = activities[i];
        if (a._isProjRow) continue;
        // Include: summary tasks, or tasks directly at lv=0 (direct under project)
        const isIncluded = a.type === 'summary' || a.lv === 0;
        if (!isIncluded) continue;

        const node: ChartNode = { act: a, children: [], x: 0, y: 0, subtreeW: BOX_W };

        while (stack.length > 0 && stack[stack.length - 1].lv >= a.lv) {
            stack.pop();
        }

        if (stack.length > 0) {
            const parentNode = stack[stack.length - 1].node;
            if (!collapsedSet.has(parentNode.act.id)) {
                parentNode.children.push(node);
            }
        } else if (rootNode) {
            if (!collapsedSet.has(rootNode.act.id)) {
                rootNode.children.push(node);
            }
        } else {
            rootChildren.push(node);
        }
        stack.push({ lv: a.lv, node });
    }

    return rootNode ? [rootNode] : rootChildren;
}

// ── Layout ───────────────────────────────────────────────────────
function measure(node: ChartNode): number {
    if (!node.children.length) { node.subtreeW = BOX_W; return BOX_W; }
    let total = 0;
    for (const child of node.children) total += measure(child) + H_GAP;
    total -= H_GAP;
    node.subtreeW = Math.max(BOX_W, total);
    return node.subtreeW;
}

function position(node: ChartNode, baseX: number, baseY: number) {
    node.x = baseX + node.subtreeW / 2;
    node.y = baseY;
    if (!node.children.length) return;
    const totalW = node.children.reduce((s, c) => s + c.subtreeW, 0) + H_GAP * (node.children.length - 1);
    let cx = baseX + (node.subtreeW - totalW) / 2;
    for (const child of node.children) {
        position(child, cx, baseY + BOX_H + V_GAP);
        cx += child.subtreeW + H_GAP;
    }
}

function computeLayout(roots: ChartNode[]) {
    let cx = 0;
    for (const r of roots) { measure(r); position(r, cx, 0); cx += r.subtreeW + H_GAP; }
}

// ── Flatten ───────────────────────────────────────────────────────
interface FlatItem { node: ChartNode; parent?: ChartNode }
function flatten(nodes: ChartNode[], parent?: ChartNode): FlatItem[] {
    const out: FlatItem[] = [];
    for (const n of nodes) { out.push({ node: n, parent }); out.push(...flatten(n.children, n)); }
    return out;
}

// ── Colors ────────────────────────────────────────────────────────
function pctColor(pct: number) {
    if (pct >= 90) return '#4ade80';
    if (pct >= 50) return '#fbbf24';
    if (pct >= 20) return '#fb923c';
    return '#f87171';
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════
interface Props {
    activities: any[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    projectName?: string;
}

export default function WBSOrgChartView({ activities, selectedId, onSelect, projectName: _p }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [scale, setScale] = useState(1.0);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const dragging = useRef(false);
    const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

    const roots = useMemo(() => {
        const tree = buildWBSTree(activities, collapsed);
        computeLayout(tree);
        return tree;
    }, [activities, collapsed]);

    const items = useMemo(() => flatten(roots), [roots]);

    const [svgW, svgH] = useMemo(() => {
        if (!items.length) return [800, 400];
        const maxX = Math.max(...items.map(i => i.node.x + BOX_W / 2));
        const maxY = Math.max(...items.map(i => i.node.y + BOX_H));
        return [maxX + 80, maxY + 80];
    }, [items]);

    // Auto-fit and center on window
    useEffect(() => {
        if (!containerRef.current || !items.length) return;
        const cW = containerRef.current.clientWidth;
        const cH = containerRef.current.clientHeight;
        const margin = 60;
        const fitScale = Math.min(1.3, Math.min((cW - margin * 2) / svgW, (cH - margin * 2) / svgH));
        const newScale = Math.max(0.15, fitScale);
        // Center the tree in the viewport
        const scaledW = svgW * newScale;
        const scaledH = svgH * newScale;
        const panX = (cW - scaledW) / 2;
        const panY = (cH - scaledH) / 2;
        setScale(newScale);
        setPan({ x: panX, y: panY });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activities.length, svgW, svgH]);

    const resetView = useCallback(() => {
        if (!containerRef.current || !items.length) return;
        const cW = containerRef.current.clientWidth;
        const cH = containerRef.current.clientHeight;
        const margin = 60;
        const fitScale = Math.min(1.3, Math.min((cW - margin * 2) / svgW, (cH - margin * 2) / svgH));
        const newScale = Math.max(0.15, fitScale);
        const scaledW = svgW * newScale;
        const scaledH = svgH * newScale;
        setScale(newScale);
        setPan({ x: (cW - scaledW) / 2, y: (cH - scaledH) / 2 });
    }, [items.length, svgW, svgH]);

    const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }, []);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as SVGElement).closest('.wbs-node')) return;
        dragging.current = true;
        dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    }, [pan]);
    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging.current) return;
        setPan({ x: dragStart.current.px + e.clientX - dragStart.current.mx, y: dragStart.current.py + e.clientY - dragStart.current.my });
    }, []);
    const onMouseUp = useCallback(() => { dragging.current = false; }, []);
    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setScale(s => Math.min(Math.max(s * (e.deltaY > 0 ? 0.88 : 1.14), 0.1), 4));
    }, []);

    if (!activities.length) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 40, opacity: 0.15 }}>🗂</span>
                <p style={{ fontSize: 13, margin: 0 }}>Sin actividades en la EDT</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-main)', cursor: 'grab', position: 'relative', userSelect: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
        >
            {/* Controls */}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                    { label: '+', fn: () => setScale(s => Math.min(s * 1.2, 4)) },
                    { label: '−', fn: () => setScale(s => Math.max(s * 0.83, 0.1)) },
                    { label: '↺', fn: resetView },
                ].map(b => (
                    <button key={b.label} onClick={b.fn} style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(4px)',
                        border: '1px solid rgba(99,102,241,0.35)',
                        color: '#e2e8f0', cursor: 'pointer', fontSize: 15, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}>{b.label}</button>
                ))}
            </div>

            {/* Legend */}
            <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, padding: '5px 12px', background: 'rgba(15,23,42,0.7)', borderRadius: 6, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: '#94a3b8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, background: '#6366f1', borderRadius: 2 }} /> Proyecto</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, background: '#0ea5e9', borderRadius: 2 }} /> Resumen</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, border: '2px solid #ef4444', borderRadius: 2, background: 'transparent' }} /> Crítico</div>
                <span style={{ color: '#475569', marginLeft: 4 }}>Doble clic: colapsar · Rueda: zoom</span>
            </div>

            {/* Scale */}
            <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 20, fontSize: 10, color: '#475569' }}>{Math.round(scale * 100)}%</div>

            <svg
                width="100%" height="100%"
                style={{ display: 'block', position: 'absolute', inset: 0 }}
            >
                <defs>
                    <filter id="wbsShadow" x="-15%" y="-15%" width="130%" height="140%">
                        <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.5)" />
                    </filter>
                    <filter id="wbsShadowSel" x="-20%" y="-20%" width="140%" height="150%">
                        <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="rgba(99,102,241,0.65)" />
                    </filter>
                    <filter id="wbsShadowCrit" x="-20%" y="-20%" width="140%" height="150%">
                        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="rgba(239,68,68,0.5)" />
                    </filter>
                </defs>

                <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
                    {/* Connectors */}
                    {items.filter(i => i.parent).map(({ node, parent }) => {
                        const px = parent!.x;
                        const py = parent!.y + BOX_H;
                        const cx = node.x;
                        const cy = node.y;
                        const midY = py + V_GAP / 2;
                        const isCrit = node.act.crit;
                        return (
                            <path
                                key={node.act.id + '-c'}
                                d={`M ${px} ${py} L ${px} ${midY} L ${cx} ${midY} L ${cx} ${cy}`}
                                fill="none"
                                stroke={isCrit ? 'rgba(239,68,68,0.35)' : 'rgba(148,163,184,0.16)'}
                                strokeWidth={isCrit ? 2 : 1.5}
                                strokeLinecap="round"
                            />
                        );
                    })}

                    {/* Nodes */}
                    {items.map(({ node }) => {
                        const { act } = node;
                        const left = node.x - BOX_W / 2;
                        const top = node.y;
                        const isSel = act.id === selectedId;
                        const isProj = !!act._isProjRow;
                        const isSummary = act.type === 'summary';
                        const isCrit = !!act.crit && !isProj;
                        const isCollapsed = collapsed.has(act.id);
                        const hasChildren = node.children.length > 0;

                        // Colors
                        const accent = isProj ? '#6366f1' : isSummary ? '#0ea5e9' : '#64748b';
                        const borderColor = isSel ? accent : isCrit ? '#ef4444' : 'rgba(255,255,255,0.07)';
                        const borderWidth = isSel ? 2.5 : isCrit ? 2 : 1;
                        const filterId = isSel ? 'url(#wbsShadowSel)' : isCrit ? 'url(#wbsShadowCrit)' : 'url(#wbsShadow)';

                        const bgFill = isProj
                            ? (isSel ? 'rgba(99,102,241,0.28)' : 'rgba(99,102,241,0.12)')
                            : isSummary
                                ? (isSel ? 'rgba(14,165,233,0.22)' : 'rgba(14,165,233,0.08)')
                                : (isSel ? 'rgba(100,116,139,0.25)' : 'rgba(15,23,42,0.88)');

                        const pct = act.pct ?? 0;
                        const label = act.outlineNum || act.id;
                        const TF = act.TF ?? null;
                        const tfStr = isProj ? '' : (TF === null ? '—' : (TF < 0 ? `${TF}d` : `+${TF}d`));
                        const startStr = fmtD(act.ES);
                        const endStr = fmtD(act.EF);

                        return (
                            <g
                                key={act.id}
                                className="wbs-node"
                                transform={`translate(${left},${top})`}
                                onClick={() => onSelect?.(act.id)}
                                onDoubleClick={e => toggleCollapse(act.id, e)}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Card */}
                                <rect
                                    width={BOX_W} height={BOX_H} rx={8} ry={8}
                                    fill={bgFill}
                                    stroke={borderColor}
                                    strokeWidth={borderWidth}
                                    filter={filterId}
                                />

                                {/* Left accent bar */}
                                <rect x={0} y={0} width={5} height={BOX_H} rx={4} ry={4} fill={isCrit ? '#ef4444' : accent} opacity={0.9} />
                                <rect x={0} y={8} width={5} height={BOX_H - 16} fill={isCrit ? '#ef4444' : accent} opacity={0.9} />

                                {/* Header stripe */}
                                <rect x={5} y={0} width={BOX_W - 5} height={22} rx={8} fill={`${isCrit ? '#ef4444' : accent}18`} />
                                <rect x={5} y={8} width={BOX_W - 5} height={14} fill={`${isCrit ? '#ef4444' : accent}18`} />

                                {/* WBS code */}
                                <text
                                    x={13} y={13}
                                    fontSize={10} fontWeight={800}
                                    fill={isCrit ? '#fca5a5' : accent}
                                    dominantBaseline="middle"
                                    style={{ fontFamily: '"JetBrains Mono", "Consolas", monospace', letterSpacing: 0.5 }}
                                >
                                    {label}
                                </text>

                                {/* Critical badge */}
                                {isCrit && (
                                    <text x={BOX_W - 8} y={13} fontSize={8} fill="#ef4444" textAnchor="end" dominantBaseline="middle" fontWeight={800} opacity={0.9}>
                                        ● CRÍTICO
                                    </text>
                                )}
                                {isProj && (
                                    <text x={BOX_W - 8} y={13} fontSize={8} fill={accent} textAnchor="end" dominantBaseline="middle" fontWeight={700} opacity={0.7}>
                                        PROYECTO
                                    </text>
                                )}

                                {/* Name */}
                                <foreignObject x={12} y={23} width={BOX_W - 20} height={26}>
                                    <div
                                        // @ts-ignore
                                        xmlns="http://www.w3.org/1999/xhtml"
                                        style={{
                                            fontSize: 10.5,
                                            color: isSel ? '#f8fafc' : '#cbd5e1',
                                            lineHeight: 1.3,
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            wordBreak: 'break-word',
                                            fontFamily: 'Inter, system-ui, sans-serif',
                                            fontWeight: isProj ? 600 : 400,
                                        } as React.CSSProperties}
                                    >
                                        {act.name}
                                    </div>
                                </foreignObject>

                                {/* Separator */}
                                <line x1={12} y1={52} x2={BOX_W - 12} y2={52} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

                                {/* Comienzo / Fin */}
                                <text x={12} y={60} fontSize={8} fill="#64748b" dominantBaseline="middle">
                                    <tspan fontWeight={600} fill="#475569">Inicio:</tspan> {startStr}
                                </text>
                                <text x={12} y={72} fontSize={8} fill="#64748b" dominantBaseline="middle">
                                    <tspan fontWeight={600} fill="#475569">Fin:</tspan>     {endStr}
                                </text>

                                {/* Holgura + Pct on same row */}
                                {!isProj && (
                                    <text x={12} y={84} fontSize={8} fill={TF !== null && TF < 0 ? '#f87171' : TF === 0 ? '#fbbf24' : '#64748b'} dominantBaseline="middle">
                                        <tspan fontWeight={600} fill="#475569">Holgura:</tspan> {tfStr}
                                    </text>
                                )}
                                <text x={BOX_W - 10} y={84} fontSize={8.5} fill={pctColor(pct)} textAnchor="end" dominantBaseline="middle" fontWeight={700}>
                                    {pct.toFixed(0)}%
                                </text>

                                {/* Progress bar */}
                                <rect x={12} y={BOX_H - 10} width={BOX_W - 24} height={4} rx={2} ry={2} fill="rgba(255,255,255,0.06)" />
                                <rect
                                    x={12} y={BOX_H - 10}
                                    width={Math.max(0, (BOX_W - 24) * (pct / 100))}
                                    height={4} rx={2} ry={2}
                                    fill={pctColor(pct)}
                                    opacity={0.85}
                                />

                                {/* Collapse toggle */}
                                {hasChildren && (
                                    <g
                                        transform={`translate(${BOX_W / 2}, ${BOX_H + 1})`}
                                        onClick={e => toggleCollapse(act.id, e)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <circle r={9} fill="rgba(15,23,42,0.95)" stroke={isCrit ? '#ef4444' : accent} strokeWidth={1.5} />
                                        <text textAnchor="middle" dominantBaseline="middle" fill={isCrit ? '#f87171' : accent} fontSize={13} fontWeight={900} y={0.5}>
                                            {isCollapsed ? '+' : '−'}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
}
