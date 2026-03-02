-- ==============================================================================
-- MIGRACIÓN SUPABASE: ARQUITECTURA MULTI-EMPRESA (MULTI-TENANT)
-- ==============================================================================

-- 1. Tabla de Empresas
CREATE TABLE IF NOT EXISTS public.empresas (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 2. Tabla de relación Usuarios -> Empresas
CREATE TABLE IF NOT EXISTS public.usuarios_empresas (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    role text DEFAULT 'member', -- Ej: 'admin', 'member'
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, empresa_id)
);

-- 3. Modificar `gantt_projects` para apuntar a la empresa
ALTER TABLE public.gantt_projects 
ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE;

-- 4. Modificar `portfolio_state` para apuntar a la empresa
ALTER TABLE public.portfolio_state 
ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE;

-- 5. Función de ayuda para RLS (Row Level Security)
CREATE OR REPLACE FUNCTION public.get_user_empresa_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT empresa_id FROM public.usuarios_empresas WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ==============================================================================
-- TRIGGERS PARA AUTO-ASIGNAR EMPRESA AL CREAR REGISTROS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.empresa_id IS NULL THEN
        NEW.empresa_id := public.get_user_empresa_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_set_empresa_id_projects') THEN
        CREATE TRIGGER tg_set_empresa_id_projects
        BEFORE INSERT ON public.gantt_projects
        FOR EACH ROW EXECUTE FUNCTION public.set_empresa_id();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_set_empresa_id_portfolio') THEN
        CREATE TRIGGER tg_set_empresa_id_portfolio
        BEFORE INSERT ON public.portfolio_state
        FOR EACH ROW EXECUTE FUNCTION public.set_empresa_id();
    END IF;
END $$;

-- ==============================================================================
-- APLICAR ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_state ENABLE ROW LEVEL SECURITY;

-- Evitar errores si la política ya existe, eliminándolas primero o creándolas si no existen
DO $$
BEGIN
    -- Empresas
    DROP POLICY IF EXISTS "user_ver_empresa" ON public.empresas;
    CREATE POLICY "user_ver_empresa" ON public.empresas 
        FOR SELECT USING (id = public.get_user_empresa_id());

    -- Usuarios Empresas
    DROP POLICY IF EXISTS "user_ver_su_relacion" ON public.usuarios_empresas;
    CREATE POLICY "user_ver_su_relacion" ON public.usuarios_empresas 
        FOR SELECT USING (user_id = auth.uid());

    -- Gantt Projects
    DROP POLICY IF EXISTS "user_ver_proyectos" ON public.gantt_projects;
    CREATE POLICY "user_ver_proyectos" ON public.gantt_projects 
        FOR SELECT USING (empresa_id = public.get_user_empresa_id());

    DROP POLICY IF EXISTS "user_insertar_proyectos" ON public.gantt_projects;
    CREATE POLICY "user_insertar_proyectos" ON public.gantt_projects 
        FOR INSERT WITH CHECK (empresa_id = public.get_user_empresa_id() OR public.get_user_empresa_id() IS NOT NULL);

    DROP POLICY IF EXISTS "user_actualizar_proyectos" ON public.gantt_projects;
    CREATE POLICY "user_actualizar_proyectos" ON public.gantt_projects 
        FOR UPDATE USING (empresa_id = public.get_user_empresa_id());

    DROP POLICY IF EXISTS "user_borrar_proyectos" ON public.gantt_projects;
    CREATE POLICY "user_borrar_proyectos" ON public.gantt_projects 
        FOR DELETE USING (empresa_id = public.get_user_empresa_id());

    -- Portfolio State
    DROP POLICY IF EXISTS "user_ver_portfolio" ON public.portfolio_state;
    CREATE POLICY "user_ver_portfolio" ON public.portfolio_state 
        FOR SELECT USING (empresa_id = public.get_user_empresa_id() OR id = public.get_user_empresa_id()::text);

    DROP POLICY IF EXISTS "user_insertar_portfolio" ON public.portfolio_state;
    CREATE POLICY "user_insertar_portfolio" ON public.portfolio_state 
        FOR INSERT WITH CHECK (empresa_id = public.get_user_empresa_id() OR id = public.get_user_empresa_id()::text OR public.get_user_empresa_id() IS NOT NULL);

    DROP POLICY IF EXISTS "user_actualizar_portfolio" ON public.portfolio_state;
    CREATE POLICY "user_actualizar_portfolio" ON public.portfolio_state 
        FOR UPDATE USING (empresa_id = public.get_user_empresa_id() OR id = public.get_user_empresa_id()::text);

END $$;

-- Por seguridad, también podrías extender RLS a las demás tablas de negocio (gantt_activities, etc.)
-- usando el parent project_id si es necesario, pero actualmente si gantt_projects tiene RLS
-- la seguridad básica de la visualización del proyecto está cubierta.
