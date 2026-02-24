import { useEffect, useRef, useState } from 'react';
import { useGantt } from '../store/GanttContext';

interface Props {
    x: number;
    y: number;
    onClose: () => void;
    onOpenColumns: () => void;
    colKey: string | null;
    selCount: number;
    onFillDown: () => void;
}

export default function RowContextMenu({ x, y, onClose, onOpenColumns, colKey, selCount, onFillDown }: Props) {
    const { state, dispatch } = useGantt();
    const menuRef = useRef<HTMLDivElement>(null);
    const [collapseSubOpen, setCollapseSubOpen] = useState(false);

    const hasSelection = state.selIdx >= 0;
    const hasClipboard = (state.clipboardMulti && state.clipboardMulti.length > 0) || state.clipboard != null;
    const selAct = hasSelection ? state.activities[state.selIdx] : null;
    const isProj = selAct?._isProjRow;

    /* Close on outside click or Escape */
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
        };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    /* Ensure menu doesn't overflow the viewport */
    useEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth) el.style.left = `${window.innerWidth - rect.width - 8}px`;
        if (rect.bottom > window.innerHeight) el.style.top = `${window.innerHeight - rect.height - 8}px`;
    }, [x, y]);

    const act = (fn: () => void) => { fn(); onClose(); };

    return (
        <div ref={menuRef} className="row-ctx-menu" style={{ left: x, top: y }}>
            {/* Detalles de actividad */}
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'OPEN_ACT_MODAL' }))}>
                <span className="row-ctx-label">Detalles de actividad...</span>
            </div>

            <div className="row-ctx-sep" />

            {/* Cortar */}
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'CUT_ACTIVITY' }))}>
                <span className="row-ctx-label">Cortar</span>
                <span className="row-ctx-shortcut">Ctrl+X</span>
            </div>

            {/* Copiar */}
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'COPY_ACTIVITY' }))}>
                <span className="row-ctx-label">Copiar</span>
                <span className="row-ctx-shortcut">Ctrl+C</span>
            </div>

            {/* Pegar */}
            <div className={`row-ctx-item${!hasClipboard ? ' disabled' : ''}`}
                onClick={() => hasClipboard && act(() => dispatch({ type: 'PASTE_ACTIVITY' }))}>
                <span className="row-ctx-label">Pegar</span>
                <span className="row-ctx-shortcut">Ctrl+V</span>
            </div>

            {/* Rellenar hacia abajo */}
            <div className={`row-ctx-item${(!colKey || selCount < 2) ? ' disabled' : ''}`}
                onClick={() => (!colKey || selCount < 2) ? undefined : act(() => onFillDown())}>
                <span className="row-ctx-label">Rellenar hacia abajo</span>
                <span className="row-ctx-shortcut">Ctrl+D</span>
            </div>

            <div className="row-ctx-sep" />

            {/* Agregar */}
            <div className="row-ctx-item"
                onClick={() => act(() => dispatch({ type: 'ADD_ACTIVITY' }))}>
                <span className="row-ctx-label">Agregar</span>
                <span className="row-ctx-shortcut">Ins</span>
            </div>

            {/* Suprimir */}
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'DELETE_ACTIVITY' }))}>
                <span className="row-ctx-label">Suprimir</span>
                <span className="row-ctx-shortcut">Del</span>
            </div>

            <div className="row-ctx-sep" />

            {/* Indentar / Des-indentar */}
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'INDENT', dir: 1 }))}>
                <span className="row-ctx-label">Indentar</span>
                <span className="row-ctx-shortcut">Alt+→</span>
            </div>
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'INDENT', dir: -1 }))}>
                <span className="row-ctx-label">Des-indentar</span>
                <span className="row-ctx-shortcut">Alt+←</span>
            </div>

            <div className="row-ctx-sep" />

            {/* Subir / Bajar */}
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'MOVE_ROW', dir: -1 }))}>
                <span className="row-ctx-label">Subir fila</span>
                <span className="row-ctx-shortcut">Alt+↑</span>
            </div>
            <div className={`row-ctx-item${!hasSelection || isProj ? ' disabled' : ''}`}
                onClick={() => hasSelection && !isProj && act(() => dispatch({ type: 'MOVE_ROW', dir: 1 }))}>
                <span className="row-ctx-label">Bajar fila</span>
                <span className="row-ctx-shortcut">Alt+↓</span>
            </div>

            <div className="row-ctx-sep" />

            {/* Columnas */}
            <div className="row-ctx-item"
                onClick={() => act(() => onOpenColumns())}>
                <span className="row-ctx-label">Columnas...</span>
            </div>

            {/* Filtros */}
            <div className="row-ctx-item"
                onClick={() => act(() => dispatch({ type: 'OPEN_FILTERS_MODAL' }))}>
                <span className="row-ctx-label">Filtros...</span>
            </div>

            <div className="row-ctx-sep" />

            {/* Ampliar todo */}
            <div className="row-ctx-item"
                onClick={() => act(() => dispatch({ type: 'EXPAND_ALL' }))}>
                <span className="row-ctx-label">Ampliar todo</span>
                <span className="row-ctx-shortcut">Ctrl++</span>
            </div>

            {/* Reducir todo */}
            <div className="row-ctx-item"
                onClick={() => act(() => dispatch({ type: 'COLLAPSE_ALL' }))}>
                <span className="row-ctx-label">Reducir todo</span>
                <span className="row-ctx-shortcut">Ctrl+−</span>
            </div>

            {/* Reducir a... (submenu) */}
            <div className="row-ctx-item row-ctx-has-sub"
                onMouseEnter={() => setCollapseSubOpen(true)}
                onMouseLeave={() => setCollapseSubOpen(false)}>
                <span className="row-ctx-label">Reducir a...</span>
                <span className="row-ctx-arrow">▶</span>
                {collapseSubOpen && (
                    <div className="row-ctx-submenu">
                        {[1, 2, 3, 4, 5].map(lv => (
                            <div key={lv} className="row-ctx-item"
                                onClick={() => act(() => dispatch({ type: 'COLLAPSE_TO_LEVEL', level: lv }))}>
                                <span className="row-ctx-label">Nivel {lv}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="row-ctx-sep" />

            {/* Deshacer */}
            <div className={`row-ctx-item${!state.undoStack || state.undoStack.length === 0 ? ' disabled' : ''}`}
                onClick={() => state.undoStack && state.undoStack.length > 0 && act(() => dispatch({ type: 'UNDO' }))}>
                <span className="row-ctx-label">Deshacer</span>
                <span className="row-ctx-shortcut">Ctrl+Z</span>
            </div>
        </div>
    );
}
