// OrgChartView.tsx – Clean EPS-only hierarchy tree
// Shows only EPS structural nodes (no projects/activities)
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { EPSNode } from '../../types/portfolio';

// ── Layout constants ─────────────────────────────────────────────
const BOX_W = 200;
const BOX_H = 88;
const H_GAP = 36;    // horizontal gap between siblings
const V_GAP = 80;    // vertical gap between levels

// ── Internal node type ───────────────────────────────────────────
interface ChartNode {
    eps: EPSNode;
    children: ChartNode[];
    // filled during layout
    x: number;      // center x
    y: number;      // top y
    subtreeW: number;
}

// ── Build tree from flat EPS list ────────────────────────────────
function buildTree(epsNodes: EPSNode[], collapsedSet: Set<string>): ChartNode[] {
    const map = new Map<string, ChartNode>();
    for (const e of epsNodes) {
        map.set(e.id, { eps: e, children: [], x: 0, y: 0, subtreeW: BOX_W });
    }
    const roots: ChartNode[] = [];
    for (const e of epsNodes) {
        const node = map.get(e.id)!;
        if (e.parentId && map.has(e.parentId)) {
            map.get(e.parentId)!.children.push(node);
        } else {
            roots.push(node);
        }
    }
    // Sort children by order field
    function sortChildren(n: ChartNode) {
        n.children.sort((a, b) => (a.eps.order ?? 0) - (b.eps.order ?? 0));
        if (!collapsedSet.has(n.eps.id)) n.children.forEach(sortChildren);
        else n.children = []; // collapsed → treat as leaf visually
    }
    roots.sort((a, b) => (a.eps.order ?? 0) - (b.eps.order ?? 0));
    roots.forEach(sortChildren);
    return roots;
}

// ── Layout: Reingold-Tilford-style centering ─────────────────────
function computeLayout(nodes: ChartNode[], startX = 0, startY = 0): void {
    function measure(node: ChartNode): number {
        if (!node.children.length) {
            node.subtreeW = BOX_W;
            return BOX_W;
        }
        let total = 0;
        for (const child of node.children) {
            total += measure(child);
            total += H_GAP;
        }
        total -= H_GAP;
        node.subtreeW = Math.max(BOX_W, total);
        return node.subtreeW;
    }

    function position(node: ChartNode, baseX: number, baseY: number) {
        node.x = baseX + node.subtreeW / 2;
        node.y = baseY;
        if (!node.children.length) return;
        let cx = baseX + (node.subtreeW - (node.children.reduce((s, c) => s + c.subtreeW, 0) + H_GAP * (node.children.length - 1))) / 2;
        for (const child of node.children) {
            position(child, cx, baseY + BOX_H + V_GAP);
            cx += child.subtreeW + H_GAP;
        }
    }

    let cx = startX;
    for (const root of nodes) {
        measure(root);
        position(root, cx, startY);
        cx += root.subtreeW + H_GAP;
    }
}

// ── Flatten for rendering ────────────────────────────────────────
interface FlatItem { node: ChartNode; parentNode?: ChartNode }
function flatten(nodes: ChartNode[], parent?: ChartNode): FlatItem[] {
    const result: FlatItem[] = [];
    for (const n of nodes) {
        result.push({ node: n, parentNode: parent });
        result.push(...flatten(n.children, n));
    }
    return result;
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
interface Props {
    epsNodes: EPSNode[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export default function OrgChartView({ epsNodes, selectedId, onSelect }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [scale, setScale] = useState(0.85);
    const [pan, setPan] = useState({ x: 60, y: 60 });
    const dragging = useRef(false);
    const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

    const roots = useMemo(() => {
        const tree = buildTree(epsNodes, collapsed);
        computeLayout(tree, 0, 0);
        return tree;
    }, [epsNodes, collapsed]);

    const items = useMemo(() => flatten(roots), [roots]);

    // Compute svg canvas size
    const [svgW, svgH] = useMemo(() => {
        if (!items.length) return [800, 400];
        const maxX = Math.max(...items.map(i => i.node.x + BOX_W / 2));
        const maxY = Math.max(...items.map(i => i.node.y + BOX_H));
        return [maxX + 60, maxY + 60];
    }, [items]);

    // Auto-center on data change
    useEffect(() => {
        if (!containerRef.current || !items.length) return;
        const cW = containerRef.current.clientWidth;
        const cH = containerRef.current.clientHeight;
        const margin = 60;
        const fitScale = Math.min(1.3, Math.min((cW - margin * 2) / svgW, (cH - margin * 2) / svgH));
        const newScale = Math.max(0.2, fitScale);
        const scaledW = svgW * newScale;
        const scaledH = svgH * newScale;
        setScale(newScale);
        setPan({ x: (cW - scaledW) / 2, y: (cH - scaledH) / 2 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [epsNodes.length]);

    const resetView = useCallback(() => {
        if (!containerRef.current || !items.length) return;
        const cW = containerRef.current.clientWidth;
        const cH = containerRef.current.clientHeight;
        const margin = 60;
        const fitScale = Math.min(1.3, Math.min((cW - margin * 2) / svgW, (cH - margin * 2) / svgH));
        const newScale = Math.max(0.2, fitScale);
        const scaledW = svgW * newScale;
        const scaledH = svgH * newScale;
        setScale(newScale);
        setPan({ x: (cW - scaledW) / 2, y: (cH - scaledH) / 2 });
    }, [items.length, svgW, svgH]);

    const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsed(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }, []);

    // Pan
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as SVGElement).closest('.eps-node')) return;
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

    if (!epsNodes.length) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 40, opacity: 0.15 }}>🗂</span>
                <p style={{ fontSize: 13, margin: 0 }}>Sin estructura EPS definida</p>
                <p style={{ fontSize: 11, margin: 0, opacity: 0.6 }}>Cree carpetas EPS con el botón "EPS" en la barra de herramientas</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%', height: '100%', overflow: 'hidden',
                background: 'var(--bg-main)',
                cursor: 'grab', position: 'relative', userSelect: 'none',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
        >
            {/* ── Controls ── */}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                    { label: '+', action: () => setScale(s => Math.min(s * 1.2, 4)) },
                    { label: '−', action: () => setScale(s => Math.max(s * 0.83, 0.1)) },
                    { label: '↺', action: resetView },
                ].map(b => (
                    <button key={b.label} onClick={b.action} style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(4px)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        color: '#e2e8f0', cursor: 'pointer', fontSize: 15, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}>{b.label}</button>
                ))}
            </div>

            {/* ── Legend ── */}
            <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: 'rgba(15,23,42,0.7)', borderRadius: 6, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 12, height: 12, background: '#f59e0b', borderRadius: 2, opacity: 0.8 }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>EPS – Estructura de carpetas del portfolio</span>
                <span style={{ fontSize: 10, color: '#475569', marginLeft: 6 }}>Doble clic: colapsar/expandir | Rueda: zoom | Arrastrar: mover</span>
            </div>

            {/* ── Scale indicator ── */}
            <div style={{ position: 'absolute', bottom: 12, right: 10, zIndex: 20, fontSize: 10, color: '#475569' }}>
                {Math.round(scale * 100)}%
            </div>

            <svg
                width="100%" height="100%"
                style={{ display: 'block', position: 'absolute', inset: 0 }}
            >
                <defs>
                    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
                        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.45)" />
                    </filter>
                    <filter id="cardShadowSel" x="-10%" y="-10%" width="120%" height="130%">
                        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="rgba(245,158,11,0.6)" />
                    </filter>
                </defs>

                <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>

                    {/* ── Connector lines ── */}
                    {items.filter(i => i.parentNode).map(({ node, parentNode }) => {
                        const px = parentNode!.x;
                        const py = parentNode!.y + BOX_H;
                        const cx = node.x;
                        const cy = node.y;
                        const midY = py + V_GAP / 2;
                        const isSel = node.eps.id === selectedId || parentNode!.eps.id === selectedId;
                        return (
                            <path
                                key={node.eps.id + '-conn'}
                                d={`M ${px} ${py} L ${px} ${midY} L ${cx} ${midY} L ${cx} ${cy}`}
                                fill="none"
                                stroke={isSel ? 'rgba(245,158,11,0.8)' : 'rgba(148,163,184,0.22)'}
                                strokeWidth={isSel ? 2 : 1.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        );
                    })}

                    {/* ── EPS Nodes ── */}
                    {items.map(({ node }) => {
                        const { eps } = node;
                        const left = node.x - BOX_W / 2;
                        const top = node.y;
                        const isSel = eps.id === selectedId;
                        const hasChildren = node.children.length > 0 || epsNodes.some(e => e.parentId === eps.id);
                        const isCollapsed = collapsed.has(eps.id);
                        const depth = eps.parentId
                            ? (epsNodes.find(e => e.id === eps.parentId)?.parentId ? 2 : 1)
                            : 0;

                        // Accent color varies by depth
                        const accentColors = ['#f59e0b', '#fb923c', '#facc15'];
                        const accent = eps.color || accentColors[Math.min(depth, 2)];
                        const bgFill = isSel ? 'rgba(245,158,11,0.18)' : 'rgba(15,23,42,0.92)';

                        return (
                            <g
                                key={eps.id}
                                className="eps-node"
                                transform={`translate(${left},${top})`}
                                onClick={() => onSelect(eps.id)}
                                onDoubleClick={e => toggleCollapse(eps.id, e)}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Card */}
                                <rect
                                    width={BOX_W} height={BOX_H} rx={8} ry={8}
                                    fill={bgFill}
                                    stroke={isSel ? accent : 'rgba(255,255,255,0.08)'}
                                    strokeWidth={isSel ? 2 : 1}
                                    filter={isSel ? 'url(#cardShadowSel)' : 'url(#cardShadow)'}
                                />

                                {/* Left accent bar */}
                                <rect x={0} y={0} width={4} height={BOX_H} rx={8} ry={8} fill={accent} opacity={0.85} />
                                <rect x={0} y={8} width={4} height={BOX_H - 16} fill={accent} opacity={0.85} />

                                {/* Header background stripe */}
                                <rect x={4} y={0} width={BOX_W - 4} height={24} rx={0} ry={0} fill={`${accent}18`} />
                                <rect x={4} y={0} width={BOX_W - 4} height={24}
                                    style={{ borderTopRightRadius: 8, clipPath: 'inset(0 0 0 0 round 0 8px 0 0)' }}
                                    fill="none" />

                                {/* EPS Code */}
                                <text
                                    x={14} y={15}
                                    fontSize={11} fontWeight={800}
                                    fill={accent}
                                    dominantBaseline="middle"
                                    style={{ fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0.5 }}
                                >
                                    {eps.epsCode || eps.id.slice(0, 8)}
                                </text>

                                {/* Name */}
                                <foreignObject x={10} y={26} width={BOX_W - 20} height={36}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: isSel ? '#f8fafc' : '#cbd5e1',
                                            lineHeight: 1.3,
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            wordBreak: 'break-word',
                                            fontFamily: 'Inter, system-ui, sans-serif',
                                        } as React.CSSProperties}
                                    >
                                        {eps.name}
                                    </div>
                                </foreignObject>

                                {/* Sub-EPS count + depth info */}
                                <line x1={10} y1={65} x2={BOX_W - 10} y2={65} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                                <text x={14} y={76} fontSize={8} fill="#64748b" dominantBaseline="middle">
                                    <tspan fontWeight={600} fill="#475569">Sub-EPS:</tspan> {epsNodes.filter(e => e.parentId === eps.id).length}  ·  <tspan fontWeight={600} fill="#475569">Nivel:</tspan> {depth}
                                </text>

                                {/* Collapse/Expand button */}
                                {hasChildren && (
                                    <g
                                        transform={`translate(${BOX_W / 2}, ${BOX_H + 1})`}
                                        onClick={e => toggleCollapse(eps.id, e)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <circle r={9} fill="rgba(15,23,42,0.95)" stroke={accent} strokeWidth={1.5} />
                                        <text
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fill={accent}
                                            fontSize={13}
                                            fontWeight={900}
                                            y={0.5}
                                        >
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
