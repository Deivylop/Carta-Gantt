// ═══════════════════════════════════════════════════════════════════
// useResizable – hook for mouse-resizable modals / panels
// Attach the returned ref to the modal container element.
// CSS: the container MUST have position: relative (or absolute).
// ═══════════════════════════════════════════════════════════════════
import { useRef, useEffect, useCallback, useState } from 'react';

interface UseResizableOptions {
    /** Initial width (px). Defaults to auto/CSS. */
    initW?: number;
    /** Initial height (px). Defaults to auto/CSS. */
    initH?: number;
    /** Minimum width (px). Default: 280 */
    minW?: number;
    /** Minimum height (px). Default: 200 */
    minH?: number;
    /** Maximum width (px). Default: 95vw */
    maxW?: number;
    /** Maximum height (px). Default: 92vh */
    maxH?: number;
    /** Size of the hit-test border zone (px). Default: 6 */
    edgeSize?: number;
}

type Edge = '' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const CURSORS: Record<Edge, string> = {
    '': '', n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
    ne: 'ne-resize', nw: 'nw-resize', se: 'se-resize', sw: 'sw-resize',
};

export function useResizable(opts: UseResizableOptions = {}) {
    const {
        initW, initH,
        minW = 280, minH = 200,
        maxW = Math.round(window.innerWidth * 0.95),
        maxH = Math.round(window.innerHeight * 0.92),
        edgeSize = 6,
    } = opts;

    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ w: number | null; h: number | null }>({
        w: initW ?? null,
        h: initH ?? null,
    });

    // Mutable refs for drag state (avoid re-renders during drag)
    const drag = useRef<{
        active: boolean;
        edge: Edge;
        startX: number; startY: number;
        startW: number; startH: number;
        startLeft: number; startTop: number;
    }>({ active: false, edge: '', startX: 0, startY: 0, startW: 0, startH: 0, startLeft: 0, startTop: 0 });

    const detectEdge = useCallback((el: HTMLElement, cx: number, cy: number): Edge => {
        const r = el.getBoundingClientRect();
        const t = cy - r.top < edgeSize;
        const b = r.bottom - cy < edgeSize;
        const l = cx - r.left < edgeSize;
        const ri = r.right - cx < edgeSize;
        if (t && l) return 'nw'; if (t && ri) return 'ne';
        if (b && l) return 'sw'; if (b && ri) return 'se';
        if (t) return 'n'; if (b) return 's';
        if (l) return 'w'; if (ri) return 'e';
        return '';
    }, [edgeSize]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const onMouseMove = (e: MouseEvent) => {
            if (drag.current.active) {
                e.preventDefault();
                const dx = e.clientX - drag.current.startX;
                const dy = e.clientY - drag.current.startY;
                const edge = drag.current.edge;
                let newW = drag.current.startW;
                let newH = drag.current.startH;
                let newLeft = drag.current.startLeft;
                let newTop = drag.current.startTop;

                if (edge.includes('e')) newW = Math.max(minW, Math.min(maxW, drag.current.startW + dx));
                if (edge.includes('w')) {
                    const delta = Math.min(dx, drag.current.startW - minW);
                    newW = Math.max(minW, Math.min(maxW, drag.current.startW - delta));
                    newLeft = drag.current.startLeft + delta;
                }
                if (edge.includes('s')) newH = Math.max(minH, Math.min(maxH, drag.current.startH + dy));
                if (edge.includes('n')) {
                    const delta = Math.min(dy, drag.current.startH - minH);
                    newH = Math.max(minH, Math.min(maxH, drag.current.startH - delta));
                    newTop = drag.current.startTop + delta;
                }

                el.style.width = newW + 'px';
                el.style.height = newH + 'px';
                el.style.left = newLeft + 'px';
                el.style.top = newTop + 'px';
                el.style.margin = '0';
                el.style.position = 'fixed';
                return;
            }
            // Hover: update cursor
            const edge = detectEdge(el, e.clientX, e.clientY);
            el.style.cursor = CURSORS[edge] || '';
        };

        const onMouseDown = (e: MouseEvent) => {
            const edge = detectEdge(el, e.clientX, e.clientY);
            if (!edge) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = el.getBoundingClientRect();
            drag.current = {
                active: true,
                edge,
                startX: e.clientX,
                startY: e.clientY,
                startW: rect.width,
                startH: rect.height,
                startLeft: rect.left,
                startTop: rect.top,
            };
            document.body.style.cursor = CURSORS[edge];
            document.body.style.userSelect = 'none';
        };

        const onMouseUp = () => {
            if (!drag.current.active) return;
            drag.current.active = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Persist final size
            const rect = el.getBoundingClientRect();
            setSize({ w: rect.width, h: rect.height });
        };

        el.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        return () => {
            el.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [minW, minH, maxW, maxH, detectEdge]);

    // Apply initial size
    const style: React.CSSProperties = {};
    if (size.w) style.width = size.w;
    if (size.h) style.height = size.h;

    return { ref, style, size };
}
