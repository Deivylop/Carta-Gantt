-- ==============================================================================
-- FUNCIONES SECURITY DEFINER PARA UMBRALES
-- Estas funciones bypasean RLS y hacen sus propias verificaciones de acceso.
-- Si algo está mal, dan un mensaje de error descriptivo.
-- ==============================================================================

-- 1. UPSERT (INSERT o UPDATE) de una regla de umbral
CREATE OR REPLACE FUNCTION public.upsert_project_threshold(
    p_id UUID DEFAULT NULL,
    p_project_id UUID DEFAULT NULL,
    p_parameter TEXT DEFAULT NULL,
    p_operator TEXT DEFAULT NULL,
    p_limit_value NUMERIC DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa_id UUID;
    v_project_empresa_id UUID;
    v_result_id UUID;
BEGIN
    -- 1. Verificar que el usuario está autenticado
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado: auth.uid() es NULL';
    END IF;

    -- 2. Verificar empresa del usuario
    v_empresa_id := public.get_user_empresa_id();
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Usuario sin empresa asignada (uid=%)', auth.uid();
    END IF;

    -- 3. Verificar que el proyecto existe y pertenece a la empresa
    SELECT empresa_id INTO v_project_empresa_id
    FROM public.gantt_projects WHERE id = p_project_id;

    IF v_project_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Proyecto no encontrado o sin empresa_id (project_id=%)', p_project_id;
    END IF;

    IF v_project_empresa_id != v_empresa_id THEN
        RAISE EXCEPTION 'Acceso denegado: empresa proyecto (%) != empresa usuario (%)',
            v_project_empresa_id, v_empresa_id;
    END IF;

    -- 4. INSERT o UPDATE según si p_id viene informado
    IF p_id IS NULL THEN
        INSERT INTO public.project_thresholds
            (project_id, parameter, operator, limit_value, severity, active)
        VALUES
            (p_project_id, p_parameter, p_operator, p_limit_value, p_severity, p_active)
        RETURNING id INTO v_result_id;
    ELSE
        UPDATE public.project_thresholds
        SET parameter   = p_parameter,
            operator    = p_operator,
            limit_value = p_limit_value,
            severity    = p_severity,
            active      = p_active,
            updated_at  = now()
        WHERE id = p_id AND project_id = p_project_id
        RETURNING id INTO v_result_id;

        IF v_result_id IS NULL THEN
            RAISE EXCEPTION 'Regla no encontrada para actualizar (id=%, project_id=%)', p_id, p_project_id;
        END IF;
    END IF;

    RETURN v_result_id;
END;
$$;

-- 2. DELETE de una regla de umbral
CREATE OR REPLACE FUNCTION public.delete_project_threshold(
    p_id UUID,
    p_project_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa_id UUID;
    v_project_empresa_id UUID;
    v_deleted INT;
BEGIN
    -- 1. Verificar autenticación
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- 2. Verificar empresa del usuario
    v_empresa_id := public.get_user_empresa_id();
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Usuario sin empresa asignada';
    END IF;

    -- 3. Verificar proyecto
    SELECT empresa_id INTO v_project_empresa_id
    FROM public.gantt_projects WHERE id = p_project_id;

    IF v_project_empresa_id IS NULL OR v_project_empresa_id != v_empresa_id THEN
        RAISE EXCEPTION 'Acceso denegado al proyecto';
    END IF;

    -- 4. Eliminar
    DELETE FROM public.project_thresholds
    WHERE id = p_id AND project_id = p_project_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted > 0;
END;
$$;
