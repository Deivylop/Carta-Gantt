-- ==========================================
-- SCRIPT DE SEGURIDAD Y RBAC MULTI-TENANT
-- ==========================================

-- 1. ASEGURARNOS DE QUE LA TABLA GANTT_PROJECTS TENGA EMPRESA_ID
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gantt_projects' AND column_name='empresa_id') THEN
        ALTER TABLE public.gantt_projects ADD COLUMN empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. LIMPIEZA DE POLÍTICAS ANTERIORES PARA EVITAR CONFLICTOS
DROP POLICY IF EXISTS "auth_read_usuarios_empresas" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "superadmin_insertar_usuarios" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "superadmin_update_usuarios" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "ver_empresas_permitidas" ON public.empresas;
DROP POLICY IF EXISTS "superadmin_insert_empresas" ON public.empresas;

-- Limpieza de políticas en proyectos por si existían
DROP POLICY IF EXISTS "leer_proyectos_empresa" ON public.gantt_projects;
DROP POLICY IF EXISTS "escribir_proyectos_empresa" ON public.gantt_projects;

-- Limpieza de las políticas nuevas (RBAC) para que este script sea idempotente (se pueda correr varias veces sin error)
DROP POLICY IF EXISTS "rbac_select_usuarios" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "rbac_insert_usuarios" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "rbac_update_usuarios" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "rbac_delete_usuarios" ON public.usuarios_empresas;

DROP POLICY IF EXISTS "rbac_select_empresas" ON public.empresas;
DROP POLICY IF EXISTS "rbac_all_empresas_superadmin" ON public.empresas;

DROP POLICY IF EXISTS "rbac_select_proyectos" ON public.gantt_projects;
DROP POLICY IF EXISTS "rbac_insert_proyectos" ON public.gantt_projects;
DROP POLICY IF EXISTS "rbac_update_proyectos" ON public.gantt_projects;
DROP POLICY IF EXISTS "rbac_delete_proyectos" ON public.gantt_projects;

DROP POLICY IF EXISTS "rbac_select_portfolio" ON public.portfolio_state;
DROP POLICY IF EXISTS "rbac_insert_portfolio" ON public.portfolio_state;
DROP POLICY IF EXISTS "rbac_update_portfolio" ON public.portfolio_state;
DROP POLICY IF EXISTS "rbac_delete_portfolio" ON public.portfolio_state;


-- ==========================================
-- POLÍTICAS PARA: usuarios_empresas
-- ==========================================

-- ==========================================
-- FUNCIONES AUXILIARES PARA EVITAR RECURSIÓN
-- ==========================================
-- Para que `usuarios_empresas` no se lea a sí misma y se quede en un bucle infinito, creamos
-- funciones `SECURITY DEFINER` (que saltan las reglas RLS) para obtener el rol del usuario conectado.
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS text AS $$
    SELECT role FROM public.usuarios_empresas WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_user_empresa()
RETURNS uuid AS $$
    SELECT empresa_id FROM public.usuarios_empresas WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- LECTURA: Un usuario puede ver los registros de usuarios_empresas si:
-- a) Es el mismo
-- b) Es superadmin (ve todo)
-- c) Pertenece a la misma empresa (para ver a sus colegas)
CREATE POLICY "rbac_select_usuarios" ON public.usuarios_empresas
    FOR SELECT USING (
        user_id = auth.uid()
        OR public.get_auth_user_role() = 'superadmin'
        OR empresa_id = public.get_auth_user_empresa()
    );

-- INSERCIÓN (CREAR USUARIOS):
CREATE POLICY "rbac_insert_usuarios" ON public.usuarios_empresas
    FOR INSERT WITH CHECK (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            public.get_auth_user_role() = 'admin' 
            AND empresa_id = public.get_auth_user_empresa()
            AND role != 'superadmin'
        )
    );

-- ACTUALIZACIÓN y BORRADO:
CREATE POLICY "rbac_update_usuarios" ON public.usuarios_empresas
    FOR UPDATE USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            public.get_auth_user_role() = 'admin' 
            AND empresa_id = public.get_auth_user_empresa()
            AND role != 'superadmin'
        )
    );

CREATE POLICY "rbac_delete_usuarios" ON public.usuarios_empresas
    FOR DELETE USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            public.get_auth_user_role() = 'admin' 
            AND empresa_id = public.get_auth_user_empresa()
            AND role != 'superadmin'
        )
    );


-- ==========================================
-- POLÍTICAS PARA: empresas
-- ==========================================

-- LECTURA:
-- a) Superadmin ve todas.
-- b) Usuarios regulares ven solo la empresa a la que pertenecen.
CREATE POLICY "rbac_select_empresas" ON public.empresas
    FOR SELECT USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        id = public.get_auth_user_empresa()
    );

-- INSERCIÓN / ACTUALIZACIÓN / BORRADO de EMPRESAS:
-- Solo Superadmin.
CREATE POLICY "rbac_all_empresas_superadmin" ON public.empresas
    FOR ALL USING (
        public.get_auth_user_role() = 'superadmin'
    ) WITH CHECK (
        public.get_auth_user_role() = 'superadmin'
    );


-- ==========================================
-- POLÍTICAS PARA: gantt_projects
-- ==========================================
ALTER TABLE public.gantt_projects ENABLE ROW LEVEL SECURITY;

-- LECTURA DE PROYECTOS: Superadmins ven todos, el resto (admin, editor, viewer) ve los de su empresa.
CREATE POLICY "rbac_select_proyectos" ON public.gantt_projects
    FOR SELECT USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        empresa_id = public.get_auth_user_empresa()
    );

-- CREACIÓN DE PROYECTOS: Superadmin y Admin y Editor. (Viewer NO).
CREATE POLICY "rbac_insert_proyectos" ON public.gantt_projects
    FOR INSERT WITH CHECK (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            empresa_id = public.get_auth_user_empresa() AND public.get_auth_user_role() IN ('admin', 'editor')
        )
    );

-- ACTUALIZACIÓN Y BORRADO DE PROYECTOS: Superadmin y Admin y Editor.
CREATE POLICY "rbac_update_proyectos" ON public.gantt_projects
    FOR UPDATE USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            empresa_id = public.get_auth_user_empresa() AND public.get_auth_user_role() IN ('admin', 'editor')
        )
    );

CREATE POLICY "rbac_delete_proyectos" ON public.gantt_projects
    FOR DELETE USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            empresa_id = public.get_auth_user_empresa() AND public.get_auth_user_role() IN ('admin', 'editor')
        )
    );

-- ==========================================
-- POLÍTICAS PARA: portfolio_state
-- ==========================================
ALTER TABLE public.portfolio_state ENABLE ROW LEVEL SECURITY;

-- LECTURA DE PORTFOLIO: Superadmins ven todos, el resto ve los de su empresa.
CREATE POLICY "rbac_select_portfolio" ON public.portfolio_state
    FOR SELECT USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        empresa_id = public.get_auth_user_empresa()
    );

-- CREACIÓN DE PORTFOLIO: Superadmin y Admin y Editor.
CREATE POLICY "rbac_insert_portfolio" ON public.portfolio_state
    FOR INSERT WITH CHECK (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            empresa_id = public.get_auth_user_empresa() AND public.get_auth_user_role() IN ('admin', 'editor')
        )
    );

-- ACTUALIZACIÓN Y BORRADO DE PORTFOLIO: Superadmin y Admin y Editor.
CREATE POLICY "rbac_update_portfolio" ON public.portfolio_state
    FOR UPDATE USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            empresa_id = public.get_auth_user_empresa() AND public.get_auth_user_role() IN ('admin', 'editor')
        )
    );

CREATE POLICY "rbac_delete_portfolio" ON public.portfolio_state
    FOR DELETE USING (
        public.get_auth_user_role() = 'superadmin'
        OR
        (
            empresa_id = public.get_auth_user_empresa() AND public.get_auth_user_role() IN ('admin', 'editor')
        )
    );
