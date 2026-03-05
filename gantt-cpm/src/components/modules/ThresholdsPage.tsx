// ThresholdsPage – MINIMAL TEST (si ves esto, el routing funciona)
export default function ThresholdsPage() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            padding: 40,
            color: '#e2e8f0',
            fontSize: 16,
        }}>
            <h2 style={{ color: '#818cf8', marginBottom: 16 }}>🚦 Control de Proyecto</h2>
            <p>Si ves este texto, el routing funciona correctamente.</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                ProjectID: {localStorage.getItem('GANTT_ACTIVE_PROJECT_ID') || localStorage.getItem('supabase_project_id') || '(ninguno)'}
            </p>
        </div>
    );
}
