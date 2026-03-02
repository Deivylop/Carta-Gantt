-- BORRAMOS TODAS LAS POLÍTICAS ANTERIORES QUE CAUSABAN EL BUCLE
DROP FUNCTION IF EXISTS public.is_superadmin() CASCADE;

DROP POLICY IF EXISTS "superadmin_insertar_empresa" ON public.empresas;
DROP POLICY IF EXISTS "superadmin_ver_todas_empresas" ON public.empresas;
DROP POLICY IF EXISTS "user_ver_empresa_vinculada" ON public.empresas;

DROP POLICY IF EXISTS "superadmin_insertar_usuarios" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "superadmin_ver_todos_usuarios" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "user_ver_su_relacion" ON public.usuarios_empresas;


-- 1. POLÍTICAS PARA USUARIOS_EMPRESAS (LA TABLA PROBLEMÁTICA)
-- Solución al bucle: Permitir lectura plana a cualquier usuario autenticado sin hacer subconsultas
CREATE POLICY "auth_read_usuarios_empresas" ON public.usuarios_empresas 
    FOR SELECT USING (auth.role() = 'authenticated');

-- Crear y modificar usuarios (Solo SuperAdmins)
CREATE POLICY "superadmin_insertar_usuarios" ON public.usuarios_empresas 
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE user_id = auth.uid() AND role = 'superadmin')
    );

CREATE POLICY "superadmin_update_usuarios" ON public.usuarios_empresas 
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE user_id = auth.uid() AND role = 'superadmin')
    );


-- 2. POLÍTICAS PARA EMPRESAS
-- Ver empresas: Un usuario ve su propia empresa, el SuperAdmin ve todas.
-- Como la política de arriba (usuarios_empresas) ya no tiene subconsultas, ESTO YA NO CAUSA BUCLE.
CREATE POLICY "ver_empresas_permitidas" ON public.empresas 
    FOR SELECT USING (
        id IN (SELECT empresa_id FROM public.usuarios_empresas WHERE user_id = auth.uid())
        OR 
        EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE user_id = auth.uid() AND role = 'superadmin')
    );

-- Crear empresas (Solo SuperAdmins)
CREATE POLICY "superadmin_insert_empresas" ON public.empresas 
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE user_id = auth.uid() AND role = 'superadmin')
    );
