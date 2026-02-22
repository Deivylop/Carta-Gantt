// ═══════════════════════════════════════════════════════════════════
// useResizable – hook for mouse-resizable modals / panels
// Uses a *callback ref* so that listeners are attached / detached
// correctly even when the component conditionally renders (modals).
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useRef } from 'react';

interface UseResizableOptions {
    /** Initial width (px). */
    initW?: number;
    /** Initial height (px). */
    initH?: number;
    /** Minimum width (px). Default 280 */
    minW?: number;
    /** Minimum height (px). Default 200 */
    minH?: number;
    /** Size of the hit-test border zone (px). Default 7 */
    edgeSize?: number;
}

type Edge = '' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const CURSORS: Record<Edge, string> = {
    '': '', n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
    ne: 'ne-resize', nw: 'nw-resize', se: 'se-resize', sw: 'sw-resize',
};

/**
 * Returns a **callback ref** — use it as `ref={resizeRef}`.
 * Listeners are attached the moment the DOM node appears and
 * removed when it disappears (perfect for conditional modals).
 */
export function useResizable(opts: UseResizableOptions = {}) {
    const {
        initW, initH,
        minW = 280, minH = 200,
        edgeSize = 7,
    } = opts;

    // Cleanup function for the previous element
    const cleanupRef = useRef<(() => void) | null>(null);

    const resizeRef = useCallback((el: HTMLDivElement | null) => {
        // Detach previous listeners
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
        if (!el) return;

        // ── helpers ──
        const detectEdge = (cx: number, cy: number): Edge => {
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
        };

        // ── mutable drag state (no React re-renders during drag) ──
        let active = false;
        let edge: Edge = '';
        let startX = 0, startY = 0, startW = 0, startH = 0, startLeft = 0, startTop = 0;

        const mxW = () => Math.round(window.innerWidth * 0.95);
        const mxH = () => Math.round(window.innerHeight * 0.92);

        const onMouseDown = (e: MouseEvent) => {
            const det = detectEdge(e.clientX, e.clientY);
            if (!det) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = el.getBoundingClientRect();
            active = true; edge = det;
            startX = e.clientX; startY = e.clientY;
            startW = rect.width; startH = rect.height;
            startLeft = rect.left; startTop = rect.top;
            document.body.style.cursor = CURSORS[det];
            document.body.style.userSelect = 'none';
        };

        const onMouseMove = (e: MouseEvent) => {
            if (active) {
                e.preventDefault();
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                let nw = startW, nh = startH, nl = startLeft, nt = startTop;

                if (edge.includes('e')) nw = Math.max(minW, Math.min(mxW(), startW + dx));
                if (edge.includes('w')) {
                    const d = Math.min(dx, startW - minW);
                    nw = Math.max(minW, Math.min(mxW(), startW - d));
                    nl = startLeft + d;
                }
                if (edge.includes('s')) nh = Math.max(minH, Math.min(mxH(), startH + dy));
                if (edge.includes('n')) {
                    const d = Math.min(dy, startH - minH);
                    nh = Math.max(minH, Math.min(mxH(), startH - d));
                    nt = startTop + d;
                }

                el.style.width = nw + 'px';
                el.style.height = nh + 'px';
                el.style.left = nl + 'px';
                el.style.top = nt + 'px';
                el.style.margin = '0';
                el.style.position = 'fixed';
                return;
            }
            // Hover: show resize cursor when near edges
            const det = detectEdge(e.clientX, e.clientY);
            el.style.cursor = CURSORS[det] || '';
        };

        const onMouseUp = () => {
            if (!active) return;
            active = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        el.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        cleanupRef.current = () => {
            el.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [minW, minH, edgeSize]);

    // Initial inline style
    const style: React.CSSProperties = {};
    if (initW) style.width = initW;
    if (initH) style.height = initH;

    return { ref: resizeRef, style };
}
