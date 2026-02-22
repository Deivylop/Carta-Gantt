import { useEffect, useRef } from 'react';
import { useGantt } from '../store/GanttContext';

/* ── Metric options (same order as MS Project) ── */
const METRIC_OPTIONS: { value: string; label: string }[] = [
    { value: 'Trabajo',                   label: 'Trabajo' },
    { value: 'Trabajo real',              label: 'Trabajo real' },
    { value: 'Trabajo acumulado',         label: 'Trabajo acumulado' },
    { value: 'Trabajo previsto',          label: 'Trabajo previsto' },
    { value: 'Trabajo real acumulado',     label: 'Trabajo real acumulado' },
    { value: 'Trabajo previsto acumulado', label: 'Trabajo previsto acumulado' },
    { value: 'Trabajo restante',          label: 'Trabajo restante' },
    { value: 'Trabajo restante acumulado', label: 'Trabajo restante acumulado' },
];

interface Props {
    x: number;
    y: number;
    onClose: () => void;
}

export default function DetailContextMenu({ x, y, onClose }: Props) {
    const { state, dispatch } = useGantt();
    const menuRef = useRef<HTMLDivElement>(null);

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

    const toggle = (val: string) => {
        dispatch({ type: 'TOGGLE_USAGE_MODE', mode: val });
    };

    return (
        <div ref={menuRef} className="detail-ctx-menu" style={{ left: x, top: y }}>
            <div className="detail-ctx-header">Estilos de detalle...</div>
            <div className="detail-ctx-sep" />
            {METRIC_OPTIONS.map(opt => {
                const active = state.usageModes.includes(opt.value);
                return (
                    <div key={opt.value}
                        className={`detail-ctx-item${active ? ' active' : ''}`}
                        onClick={() => toggle(opt.value)}>
                        <span className="detail-ctx-check">{active ? '✓' : ''}</span>
                        <span className="detail-ctx-label">{opt.label}</span>
                    </div>
                );
            })}
            <div className="detail-ctx-sep" />
            <div className="detail-ctx-item disabled">
                <span className="detail-ctx-check" />
                <span className="detail-ctx-label" style={{ color: 'var(--text-muted)' }}>Mostrar escala de tiempo</span>
            </div>
            <div className="detail-ctx-item disabled">
                <span className="detail-ctx-check">✓</span>
                <span className="detail-ctx-label" style={{ color: 'var(--text-muted)' }}>Mostrar división</span>
            </div>
        </div>
    );
}
