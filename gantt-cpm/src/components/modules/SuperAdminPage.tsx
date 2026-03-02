import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';

export default function SuperAdminPage() {
    const { role } = useAuth();
    const [empresas, setEmpresas] = useState<any[]>([]);
    const [usuarios, setUsuarios] = useState<any[]>([]);
    const [newEmpresaName, setNewEmpresaName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState('viewer');
    const [selectedEmpresa, setSelectedEmpresa] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // Load Empresas
        if (role === 'superadmin') {
            const { data: eData } = await supabase.from('empresas').select('*');
            if (eData) setEmpresas(eData);
        } else if (role === 'admin') {
            // Admin solo ve la suya (deberia venir del inner join en AuthContext, o podemos consultarla de user_empresas)
            const { data: myUser } = await supabase.from('usuarios_empresas').select('empresa_id').eq('user_id', (await supabase.auth.getUser()).data.user?.id).single();
            if (myUser) {
                const { data: eData } = await supabase.from('empresas').select('*').eq('id', myUser.empresa_id);
                if (eData) setEmpresas(eData);
            }
        }

        // Load Usuarios
        try {
            // Intenta cargar con email (si la migración sql se ejecutó)
            const { data: uData, error } = await supabase.from('usuarios_empresas')
                .select('id, user_id, role, empresa_id, empresas(name), email')
                .order('role', { ascending: true }); // Superadmins then admins

            if (uData && !error) {
                setUsuarios(uData);
            } else {
                throw error;
            }
        } catch (e: any) {
            console.warn("Columna email no encontrada o error secundario. Cayendo a select sin email.", e.message);
            // Fallback si la columna 'email' no existe aún
            const { data: uDataFallback, error: fallbackError } = await supabase.from('usuarios_empresas')
                .select('id, user_id, role, empresa_id, empresas(name)')
                .order('role', { ascending: true });

            if (uDataFallback && !fallbackError) {
                setUsuarios(uDataFallback as any);
            } else if (fallbackError) {
                console.error("Error loading users fallback:", fallbackError.message);
            }
        }
    };

    const handleCreateEmpresa = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmpresaName) return;
        setLoading(true);
        const { error } = await supabase.from('empresas').insert({ name: newEmpresaName });
        if (!error) {
            setNewEmpresaName('');
            await loadData();
        } else {
            alert('Error al crear empresa: ' + error.message);
        }
        setLoading(false);
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserEmail || !selectedEmpresa) return;

        const confirm = window.confirm(`Se enviará una invitación a ${newUserEmail}. ¿Continuar?`);
        if (!confirm) return;

        setLoading(true);
        // Invoke the secure Edge Function to bypass client-side limitations and send Auth email
        const { error } = await supabase.functions.invoke('invite-user', {
            body: {
                email: newUserEmail,
                role: selectedRole,
                empresa_id: selectedEmpresa
            }
        });

        if (error) {
            alert('Error enviando invitación: ' + (error.message || 'Desconocido'));
        } else {
            alert('Invitación enviada con éxito. El usuario recibirá un correo con el link de acceso.');
            setNewUserEmail('');
            setSelectedRole('viewer');
            await loadData();
        }
        setLoading(false);
    };

    const handleDeleteEmpresa = async (id: string, name: string) => {
        if (!window.confirm(`¿Estás seguro de eliminar la empresa ${name}? Esto eliminará TODOS sus proyectos y usuarios asociados.`)) return;
        setLoading(true);
        const { error } = await supabase.from('empresas').delete().eq('id', id);
        if (error) alert('Error al eliminar empresa: ' + error.message);
        else await loadData();
        setLoading(false);
    };

    const handleDeleteUser = async (id: string, user_role: string) => {
        if (user_role === 'superadmin' && role !== 'superadmin') {
            alert('No puedes eliminar a un Super Administrador.');
            return;
        }
        if (!window.confirm(`¿Estás seguro de eliminar a este usuario del sistema?`)) return;
        setLoading(true);
        const { error } = await supabase.from('usuarios_empresas').delete().eq('id', id);
        if (error) alert('Error al eliminar usuario: ' + error.message);
        else await loadData();
        setLoading(false);
    };

    const handleUpdateUserRole = async (id: string, newRole: string) => {
        if (role !== 'superadmin' && newRole === 'superadmin') {
            alert('No tienes permisos para asignar el rol superadmin.');
            return;
        }

        // Basic validation
        if (!['viewer', 'editor', 'admin', 'superadmin'].includes(newRole)) {
            alert('Rol inválido. Debe ser viewer, editor, o admin.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.from('usuarios_empresas').update({ role: newRole }).eq('id', id);
        if (error) alert('Error al actualizar rol: ' + error.message);
        else await loadData();
        setLoading(false);
    };

    // Protect route conceptually
    if (role !== 'superadmin' && role !== 'admin') {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-color)' }}>
                <h2>Acceso Denegado</h2>
                <p>No tienes permisos de Administrador para ver esta página.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', color: 'var(--text-color)', backgroundColor: 'var(--bg-color)', overflowY: 'auto', height: '100%' }}>
            <h1 style={{ marginBottom: '2rem' }}>{role === 'superadmin' ? 'Panel de Super Administrador' : 'Gestión de Perfiles'}</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                {role === 'superadmin' && (
                    <div style={{ backgroundColor: 'var(--panel-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <h2>Gestión de Empresas (Solo SuperAdmin)</h2>
                        <form onSubmit={handleCreateEmpresa} style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <input
                                type="text"
                                placeholder="Nombre de la nueva empresa"
                                value={newEmpresaName}
                                onChange={e => setNewEmpresaName(e.target.value)}
                                style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
                            />
                            <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem', cursor: 'pointer', backgroundColor: '#0078d4', color: 'white', border: 'none', borderRadius: '4px' }}>
                                Crear Empresa
                            </button>
                        </form>
                        <ul style={{ marginTop: '1.5rem', listStyle: 'none', padding: 0, maxHeight: '200px', overflowY: 'auto' }}>
                            {empresas.map(emp => (
                                <li key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                                    <span>
                                        {emp.name} <small style={{ color: 'var(--text-muted)' }}>({emp.id.substring(0, 8)}...)</small>
                                    </span>
                                    <button
                                        onClick={() => handleDeleteEmpresa(emp.id, emp.name)}
                                        style={{ backgroundColor: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                        title="Eliminar Empresa"
                                    >
                                        Eliminar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div style={{ backgroundColor: 'var(--panel-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <h2>Crear Usuario y Vincular</h2>
                    <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        <input
                            type="email"
                            placeholder="Correo electrónico del usuario"
                            required
                            value={newUserEmail}
                            onChange={e => setNewUserEmail(e.target.value)}
                            style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
                        />
                        <select
                            required
                            value={selectedRole}
                            onChange={e => setSelectedRole(e.target.value)}
                            style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
                        >
                            <option value="viewer">Visualizador (Lectura)</option>
                            <option value="editor">Editor (Puede modificar)</option>
                            <option value="admin">Administrador (Puede gestionar usuarios)</option>
                            {role === 'superadmin' && <option value="superadmin">Super Administrador (Global)</option>}
                        </select>
                        <select
                            required
                            value={selectedEmpresa}
                            onChange={e => setSelectedEmpresa(e.target.value)}
                            style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
                        >
                            <option value="">Seleccione Empresa...</option>
                            {empresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                        <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem', cursor: 'pointer', backgroundColor: '#107c10', color: 'white', border: 'none', borderRadius: '4px' }}>
                            Crear y Vincular
                        </button>
                    </form>
                </div>
            </div>

            <div style={{ marginTop: '2rem', backgroundColor: 'var(--panel-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h2>Usuarios y sus Empresas</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', fontSize: '13px' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>ID Sistema</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Correo Electrónico</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Rol</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Empresa</th>
                            <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usuarios.map(u => (
                            <tr key={u.id} style={{ '&:hover': { backgroundColor: 'var(--bg-hover)' } } as any}>
                                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px' }}>{u.user_id.substring(0, 13)}...</td>
                                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', fontWeight: 500 }}>{u.email || '—'}</td>
                                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                                    {(role === 'superadmin' || (role === 'admin' && u.role !== 'superadmin')) ? (
                                        <select
                                            value={u.role}
                                            onChange={(e) => {
                                                if (confirm(`¿Estás seguro de cambiar el rol a ${e.target.value.toUpperCase()}?`)) {
                                                    handleUpdateUserRole(u.id, e.target.value);
                                                }
                                            }}
                                            style={{
                                                padding: '2px 4px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                                                backgroundColor: u.role === 'superadmin' ? '#ef444422' : u.role === 'admin' ? '#f59e0b22' : '#3b82f622',
                                                color: u.role === 'superadmin' ? '#ef4444' : u.role === 'admin' ? '#f59e0b' : '#3b82f6',
                                                border: '1px solid var(--border-color)'
                                            }}
                                        >
                                            <option value="viewer" style={{ color: 'var(--text-color)', backgroundColor: 'var(--bg-color)' }}>VIEWER</option>
                                            <option value="editor" style={{ color: 'var(--text-color)', backgroundColor: 'var(--bg-color)' }}>EDITOR</option>
                                            <option value="admin" style={{ color: 'var(--text-color)', backgroundColor: 'var(--bg-color)' }}>ADMIN</option>
                                            {role === 'superadmin' && <option value="superadmin" style={{ color: 'var(--text-color)', backgroundColor: 'var(--bg-color)' }}>SUPERADMIN</option>}
                                        </select>
                                    ) : (
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold',
                                            backgroundColor: u.role === 'superadmin' ? '#ef444422' : u.role === 'admin' ? '#f59e0b22' : '#3b82f622',
                                            color: u.role === 'superadmin' ? '#ef4444' : u.role === 'admin' ? '#f59e0b' : '#3b82f6'
                                        }}>
                                            {u.role.toUpperCase()}
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>{u.empresas?.name || 'Desconocida'}</td>
                                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                                    {/* Mostrar botones solo si tenemos permiso sobre ese usuario (no podemos tocar superadmins si somos admin normal) */}
                                    {(role === 'superadmin' || (role === 'admin' && u.role !== 'superadmin')) && (
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => handleDeleteUser(u.id, u.role)}
                                                style={{ backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '11px' }}
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {usuarios.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay usuarios vinculados</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
