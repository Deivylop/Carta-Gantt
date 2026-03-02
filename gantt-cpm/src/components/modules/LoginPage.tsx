import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import './LoginPage.css';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [resetMsg, setResetMsg] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResetMsg('');
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError) throw signInError;
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError('Por favor, ingresa tu correo electrónico primero.');
            return;
        }
        setLoading(true);
        setError(null);
        setResetMsg('');
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin,
            });
            if (resetError) throw resetError;
            setResetMsg('Se ha enviado un enlace a tu correo para restablecer tu contraseña. Revisa también tu carpeta de Spam.');
        } catch (err: any) {
            setError(err.message || 'Error al enviar enlace de recuperación');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <img src="/montec-logo.png" alt="Montec Gantt" style={{ width: '120px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    <h2>Montec Gantt CPM</h2>
                    <p>Plataforma Multi-Empresa</p>
                </div>
                {error && <div className="login-error">{error}</div>}
                {resetMsg && <div className="login-message" style={{ color: '#16a34a', marginBottom: '1rem', textAlign: 'center', fontSize: '14px', background: '#dcfce7', padding: '10px', borderRadius: '5px' }}>{resetMsg}</div>}

                {isResetting ? (
                    <form onSubmit={handleReset} className="login-form">
                        <div className="form-group">
                            <label>Correo Electrónico</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="usuario@empresa.com"
                            />
                        </div>
                        <button type="submit" disabled={loading} className="login-button">
                            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                        </button>
                        <button type="button" className="login-button" style={{ background: 'transparent', color: '#64748b', marginTop: '0.5rem', border: '1px solid #cbd5e1' }} onClick={() => { setIsResetting(false); setError(null); setResetMsg('') }}>
                            Volver al inicio de sesión
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleLogin} className="login-form">
                        <div className="form-group">
                            <label>Correo Electrónico</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="usuario@empresa.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="******"
                            />
                        </div>
                        <div style={{ textAlign: 'right', marginTop: '-10px', marginBottom: '10px' }}>
                            <a href="#" onClick={(e) => { e.preventDefault(); setIsResetting(true); setError(null); }} style={{ fontSize: '12px', color: '#0ea5e9', textDecoration: 'none' }}>¿Olvidaste tu contraseña?</a>
                        </div>
                        <button type="submit" disabled={loading} className="login-button">
                            {loading ? 'Iniciando...' : 'Iniciar Sesión'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
