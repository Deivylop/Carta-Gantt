// ThresholdsPage – TEST v3 con fondo rojo para detectar si renderiza
export default function ThresholdsPage() {
    return (
        <div style={{
            background: '#ff0000',
            color: '#ffffff',
            width: '100%',
            height: '100%',
            minHeight: '500px',
            padding: 40,
            fontSize: 24,
            fontWeight: 'bold',
        }}>
            CONTROL - TEST v3 - Si ves este fondo ROJO, el componente renderiza.
        </div>
    );
}
