import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    empresaId: string | null;
    empresaName: string | null;
    role: string | null;
    loading: boolean;
    error: string | null;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    empresaId: null,
    empresaName: null,
    role: null,
    loading: true,
    error: null,
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [empresaId, setEmpresaId] = useState<string | null>(null);
    const [empresaName, setEmpresaName] = useState<string | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load empresa/role data for a user.
    // CRITICAL: This function must NEVER be called synchronously from inside
    // onAuthStateChange — doing so causes a navigator.locks deadlock in Supabase JS.
    // Always call this via setTimeout(fn, 0) to defer execution outside the auth lock.
    const loadUserData = async (u: User) => {
        try {
            setError(null);
            // Query 1: Get empresa_id and role (no join to avoid nested RLS policy evaluation)
            const { data: ueData, error: ueError } = await supabase
                .from('usuarios_empresas')
                .select('empresa_id, role')
                .eq('user_id', u.id)
                .single();

            if (ueError && ueError.code !== 'PGRST116') {
                setError(ueError.message);
                setLoading(false);
                return;
            }

            if (!ueData) {
                setLoading(false);
                return;
            }

            setEmpresaId(ueData.empresa_id);
            setRole(ueData.role);
            localStorage.setItem('gantt_current_empresa_id', ueData.empresa_id);

            // Query 2: Get empresa name separately
            const { data: empData } = await supabase
                .from('empresas')
                .select('name')
                .eq('id', ueData.empresa_id)
                .single();

            if (empData) {
                setEmpresaName(empData.name);
            }
        } catch (err: any) {
            setError(err.message || 'Error loading user data');
        }
        setLoading(false);
    };

    useEffect(() => {
        // Listen to all auth events.
        // onAuthStateChange fires INITIAL_SESSION on page load if a session exists in localStorage.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user ?? null);

            if (newSession?.user) {
                // CRITICAL FIX: Use setTimeout to defer loadUserData OUTSIDE the auth callback.
                // Calling supabase DB methods synchronously inside onAuthStateChange causes a
                // navigator.locks deadlock — the DB request waits for the auth lock to release,
                // but the auth callback is waiting for the DB request, causing infinite hang.
                setTimeout(() => {
                    loadUserData(newSession.user!);
                }, 0);
            } else {
                // User signed out or session expired
                setEmpresaId(null);
                setEmpresaName(null);
                setRole(null);
                setLoading(false);
                localStorage.removeItem('gantt_current_empresa_id');
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, empresaId, empresaName, role, loading, error, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
