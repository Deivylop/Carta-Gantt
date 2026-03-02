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

    // Verificamos si el usuario actual es admin o superadmin
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('No autorizado');

    const { data: profile } = await supabaseClient
      .from('usuarios_empresas')
      .select('role, empresa_id')
      .eq('user_id', user.id)
      .single()

    if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
      throw new Error('Permisos insuficientes para listar usuarios');
    }

    // Cliente Admin para saltar RLS y poder leer de auth.users y cruzar datos
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Buscar usuarios en auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers()
    if (authError) throw authError;

    // Construir un diccionario con el Email
    const emailMap: Record<string, string> = {};
    authUsers.users.forEach(u => {
      emailMap[u.id] = u.email || '';
    });

    // Buscar la tabla principal pero filtrada por Rol
    let query = supabaseAdmin.from('usuarios_empresas').select('id, user_id, role, empresa_id, empresas(name), email');

    if (profile.role !== 'superadmin') {
      query = query.eq('empresa_id', profile.empresa_id);
    }

    const { data: users, error: dbError } = await query.order('role', { ascending: true });
    if (dbError) throw dbError;

    // Mezclar emails en caso de que no lo tengan
    const enrichedUsers = users.map(u => ({
      ...u,
      email: u.email || emailMap[u.user_id] || 'Sin correo'
    }));

    return new Response(
      JSON.stringify(enrichedUsers),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
