import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Check if the current user is a superadmin or admin
        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user) throw new Error('No autorizado');

        const { data: profile } = await supabaseClient
            .from('usuarios_empresas')
            .select('role, empresa_id')
            .eq('user_id', user.id)
            .single()

        if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
            throw new Error('Permisos insuficientes para invitar usuarios');
        }

        const { email, role, empresa_id } = await req.json()

        if (!email) throw new Error('Se requiere un correo electrónico');

        // Make sure 'admin' is not trying to cheat by inviting to another company or creating superadmins
        let finalEmpresaId = empresa_id;
        if (profile.role === 'admin') {
            finalEmpresaId = profile.empresa_id; // Forced to their own company
            if (role === 'superadmin') throw new Error('Un admin no puede crear superadministradores');
            // Admin could potentially create 'admin', 'editor', 'viewer' only
        }

        // Now instantiate a SERVICE_ROLE client to bypass RLS and create the user
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Invite the user by email
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)

        if (error) throw error;

        const newUserId = data.user.id;

        // Create the relationship
        const { error: relError } = await supabaseAdmin.from('usuarios_empresas').insert({
            user_id: newUserId,
            empresa_id: finalEmpresaId,
            role: role || 'viewer', // Fallback to viewer
            email: email
        })

        if (relError) throw relError;

        return new Response(
            JSON.stringify({ message: 'Invitación enviada exitosamente', user: data.user }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
