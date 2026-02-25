-- ==============================================================================
-- MIGRACIÓN SUPABASE: PANEL LOOK AHEAD / LAST PLANNER SYSTEM
--
-- Proyecto : Carta Gantt CPM  (React + TypeScript)
-- Fecha    : 2026-02-25
-- Autor    : Auto-generado
--
-- Este script crea las tablas necesarias para persistir en Supabase toda la
-- información del panel "Look Ahead" del Last Planner System, incluyendo:
--
--   1. lean_restrictions      – Restricciones por actividad (Make Ready)
--   2. ppc_weeks              – Registros semanales PPC
--   3. ppc_week_activities    – Actividades planificadas/cumplidas por semana
--   4. cnc_entries            – Causas de No Cumplimiento (CNC)
--   5. progress_history       – Historial de progreso (Curva S)
--   6. progress_snapshots     – Detalle por actividad de cada corte de progreso
--   7. baselines              – Líneas base (hasta 11 por actividad)
--   8. custom_calendars       – Calendarios personalizados del proyecto
--   9. calendar_exceptions    – Excepciones (días no laborables) por calendario
--  10. custom_filters         – Filtros personalizados
--  11. custom_filter_conditions – Condiciones de cada filtro
--
-- PRERREQUISITOS:
--   • Las tablas gantt_projects y gantt_activities del esquema base deben
--     existir antes de ejecutar este script (supabase_gantt_schema.sql).
--   • Si se migra con un esquema limpio, ejecutar primero el esquema base.
--
-- NOTA: Se agregan columnas faltantes a gantt_activities para Last Planner.
-- ==============================================================================

-- Habilitar extensión UUID si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ==============================================================================
-- A) COLUMNAS ADICIONALES EN gantt_activities (Last Planner / Avance)
-- ==============================================================================
-- Agrega campos de Last Planner que no existían en el esquema base original.

DO $$
BEGIN
    -- Encargado / Responsable (Last Planner)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'encargado'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN encargado text DEFAULT '';
    END IF;

    -- Actual Start (fecha real de inicio)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'actual_start'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN actual_start date;
    END IF;

    -- Actual Finish (fecha real de fin)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'actual_finish'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN actual_finish date;
    END IF;

    -- Suspend Date
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'suspend_date'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN suspend_date date;
    END IF;

    -- Resume Date
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'resume_date'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN resume_date date;
    END IF;

    -- Baseline calendar
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'bl_cal'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN bl_cal text;
    END IF;

    -- Active baseline index (0-10)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'active_baseline_idx'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN active_baseline_idx int DEFAULT 0;
    END IF;

    -- Outline Number / EDT
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gantt_activities' AND column_name = 'outline_num'
    ) THEN
        ALTER TABLE public.gantt_activities ADD COLUMN outline_num text;
    END IF;
END $$;


-- ==============================================================================
-- 1. TABLA: lean_restrictions
--    Restricciones del proceso Make Ready (Last Planner System)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.lean_restrictions (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    activity_id     uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,

    -- Clasificación
    category        text NOT NULL DEFAULT 'Sin Restricción',
        -- Valores: 'Sin Restricción', 'Material', 'Mano de Obra', 'Equipos',
        --          'Información', 'Espacio', 'Actividad Previa', 'Permisos',
        --          'Diseño', 'Subcontrato', 'Calidad', 'Seguridad', 'Otro'

    description     text DEFAULT '',
    responsible     text DEFAULT '',       -- persona responsable de liberar

    -- Fechas
    planned_release_date  date,            -- fecha prevista de liberación
    actual_release_date   date,            -- fecha real de liberación

    -- Estado del ciclo de vida
    status          text NOT NULL DEFAULT 'Pendiente',
        -- Valores: 'Pendiente', 'En Gestión', 'Liberada', 'No Liberada'

    notes           text DEFAULT '',
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_lean_restrictions_project
    ON public.lean_restrictions(project_id);
CREATE INDEX IF NOT EXISTS idx_lean_restrictions_activity
    ON public.lean_restrictions(activity_id);
CREATE INDEX IF NOT EXISTS idx_lean_restrictions_status
    ON public.lean_restrictions(status);

-- Validar categorías permitidas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_restriction_category'
    ) THEN
        ALTER TABLE public.lean_restrictions
        ADD CONSTRAINT chk_restriction_category CHECK (
            category IN (
                'Sin Restricción', 'Material', 'Mano de Obra', 'Equipos',
                'Información', 'Espacio', 'Actividad Previa', 'Permisos',
                'Diseño', 'Subcontrato', 'Calidad', 'Seguridad', 'Otro'
            )
        );
    END IF;
END $$;

-- Validar estados permitidos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_restriction_status'
    ) THEN
        ALTER TABLE public.lean_restrictions
        ADD CONSTRAINT chk_restriction_status CHECK (
            status IN ('Pendiente', 'En Gestión', 'Liberada', 'No Liberada')
        );
    END IF;
END $$;


-- ==============================================================================
-- 2. TABLA: ppc_weeks
--    Registros semanales PPC (Percent Plan Complete)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ppc_weeks (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    week_start      date NOT NULL,       -- fecha de corte (fin del período semanal)
    ppc             numeric NOT NULL DEFAULT 0,  -- PPC calculado (0-100)
    notes           text DEFAULT '',
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),

    -- Evitar registrar el mismo período dos veces por proyecto
    UNIQUE(project_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ppc_weeks_project
    ON public.ppc_weeks(project_id);
CREATE INDEX IF NOT EXISTS idx_ppc_weeks_date
    ON public.ppc_weeks(week_start DESC);


-- ==============================================================================
-- 3. TABLA: ppc_week_activities
--    Actividades planificadas y/o cumplidas en cada semana PPC
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ppc_week_activities (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    ppc_week_id     uuid NOT NULL REFERENCES public.ppc_weeks(id) ON DELETE CASCADE,
    activity_id     uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,

    is_planned      boolean NOT NULL DEFAULT true,    -- fue planificada para la semana
    is_completed    boolean NOT NULL DEFAULT false,   -- fue cumplida en la semana

    UNIQUE(ppc_week_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_ppc_week_activities_week
    ON public.ppc_week_activities(ppc_week_id);


-- ==============================================================================
-- 4. TABLA: cnc_entries
--    Causas de No Cumplimiento (raíz de análisis Pareto)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cnc_entries (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    ppc_week_id     uuid NOT NULL REFERENCES public.ppc_weeks(id) ON DELETE CASCADE,
    activity_id     uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,

    category        text NOT NULL DEFAULT 'Otro',
        -- Valores CNC: 'Programación', 'Material', 'Mano de Obra', 'Equipos',
        --              'Subcontrato', 'Clima', 'Diseño', 'Cliente',
        --              'Actividad Previa', 'Calidad', 'Seguridad', 'Otro'

    description     text DEFAULT '',
    responsible     text DEFAULT '',
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnc_entries_week
    ON public.cnc_entries(ppc_week_id);
CREATE INDEX IF NOT EXISTS idx_cnc_entries_category
    ON public.cnc_entries(category);

-- Validar categorías CNC permitidas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_cnc_category'
    ) THEN
        ALTER TABLE public.cnc_entries
        ADD CONSTRAINT chk_cnc_category CHECK (
            category IN (
                'Programación', 'Material', 'Mano de Obra', 'Equipos',
                'Subcontrato', 'Clima', 'Diseño', 'Cliente',
                'Actividad Previa', 'Calidad', 'Seguridad', 'Otro'
            )
        );
    END IF;
END $$;


-- ==============================================================================
-- 5. TABLA: progress_history
--    Historial de progreso global (cortes de avance para Curva S)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.progress_history (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    snapshot_date   date NOT NULL,             -- fecha del corte de avance
    actual_pct      numeric NOT NULL DEFAULT 0, -- % avance global promedio (0-100)
    created_at      timestamptz DEFAULT now(),

    UNIQUE(project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_progress_history_project
    ON public.progress_history(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_history_date
    ON public.progress_history(snapshot_date);


-- ==============================================================================
-- 6. TABLA: progress_snapshots
--    Detalle por actividad de cada corte de progreso (ProgressActivitySnapshot)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.progress_snapshots (
    id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    progress_id       uuid NOT NULL REFERENCES public.progress_history(id) ON DELETE CASCADE,
    activity_id       uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,

    -- Snapshot de la actividad al momento del corte
    pct               numeric DEFAULT 0,        -- % avance de la actividad
    dur               numeric DEFAULT 0,        -- duración al momento del corte
    rem_dur           numeric,                   -- duración restante
    work              numeric DEFAULT 0,        -- horas de trabajo
    weight            numeric,                   -- peso ponderado
    res               text DEFAULT '',           -- recursos asignados (texto)
    manual            boolean DEFAULT false,
    constraint_type   text DEFAULT '',
    constraint_date   date,
    actual_start      date,
    actual_finish     date,

    -- Recursos asignados (JSON array de ActivityResource)
    resources_json    jsonb DEFAULT '[]'::jsonb,

    UNIQUE(progress_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_snapshots_progress
    ON public.progress_snapshots(progress_id);


-- ==============================================================================
-- 7. TABLA: baselines
--    Líneas base de actividades (hasta 11 por actividad: BL0 a BL10)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.baselines (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    activity_id     uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,

    baseline_idx    int NOT NULL,               -- 0-10 (BL0, BL1, ..., BL10)
    dur             numeric DEFAULT 0,
    "ES"            timestamp,                  -- Early Start de la línea base
    "EF"            timestamp,                  -- Early Finish de la línea base
    cal             text,                       -- Calendario de la línea base
    saved_at        date,                       -- Fecha en que se guardó la LB
    name            text DEFAULT '',            -- Nombre descriptivo
    description     text DEFAULT '',            -- Observaciones
    pct             numeric DEFAULT 0,          -- % avance al salvar LB
    work            numeric DEFAULT 0,          -- Horas de trabajo al salvar LB
    weight          numeric,                    -- Peso al salvar LB
    status_date     date,                       -- Status date al salvar LB

    UNIQUE(activity_id, baseline_idx)
);

CREATE INDEX IF NOT EXISTS idx_baselines_project
    ON public.baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_baselines_activity
    ON public.baselines(activity_id);


-- ==============================================================================
-- 8. TABLA: custom_calendars
--    Calendarios personalizados del proyecto
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.custom_calendars (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    local_id        text NOT NULL,              -- ID local ('cal_1', 'montec', etc.)
    name            text NOT NULL DEFAULT 'Nuevo Calendario',
    is_default      boolean DEFAULT false,

    -- Días laborables (array de 7 booleanos: [dom, lun, mar, mié, jue, vie, sáb])
    work_days       jsonb NOT NULL DEFAULT '[false,true,true,true,true,true,false]'::jsonb,

    -- Horas por día (array de 7 números)
    hours_per_day   jsonb NOT NULL DEFAULT '[0,8,8,8,8,8,0]'::jsonb,

    created_at      timestamptz DEFAULT now(),

    UNIQUE(project_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_calendars_project
    ON public.custom_calendars(project_id);


-- ==============================================================================
-- 9. TABLA: calendar_exceptions
--    Fechas no laborables (excepciones) por calendario
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.calendar_exceptions (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    calendar_id     uuid NOT NULL REFERENCES public.custom_calendars(id) ON DELETE CASCADE,

    exception_date  date NOT NULL,              -- Fecha de la excepción
    description     text DEFAULT '',

    UNIQUE(calendar_id, exception_date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_exceptions_calendar
    ON public.calendar_exceptions(calendar_id);


-- ==============================================================================
-- 10. TABLA: custom_filters
--     Filtros personalizados para vistas Look Ahead / Carta Gantt
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.custom_filters (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    name            text NOT NULL DEFAULT 'Nuevo Filtro',
    match_all       boolean DEFAULT true,       -- true = AND, false = OR
    active          boolean DEFAULT false,       -- si está aplicado actualmente
    builtin         boolean DEFAULT false,       -- filtro del sistema (solo lectura)

    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_filters_project
    ON public.custom_filters(project_id);


-- ==============================================================================
-- 11. TABLA: custom_filter_conditions
--     Condiciones individuales de cada filtro personalizado
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.custom_filter_conditions (
    id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    filter_id       uuid NOT NULL REFERENCES public.custom_filters(id) ON DELETE CASCADE,

    field           text NOT NULL,              -- columna a filtrar ('name', 'pct', 'ES', etc.)
    operator        text NOT NULL DEFAULT 'equals',
        -- Valores: 'equals', 'not_equals', 'contains', 'not_contains',
        --          'greater_than', 'less_than', 'greater_than_or_equal',
        --          'less_than_or_equal', 'is_empty', 'is_not_empty'
    value           text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_filter_conditions_filter
    ON public.custom_filter_conditions(filter_id);


-- ==============================================================================
-- TRIGGER: updated_at automático
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas con updated_at
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'lean_restrictions', 'ppc_weeks'
    ])
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || tbl || '_updated_at'
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
                tbl, tbl
            );
        END IF;
    END LOOP;
END $$;


-- ==============================================================================
-- VISTAS ÚTILES
-- ==============================================================================

-- Vista: Resumen PPC semanal con conteo de planificadas/cumplidas/CNC
CREATE OR REPLACE VIEW public.v_ppc_summary AS
SELECT
    pw.id,
    pw.project_id,
    pw.week_start,
    pw.ppc,
    pw.notes,
    pw.created_at,
    COUNT(DISTINCT pwa.activity_id) FILTER (WHERE pwa.is_planned)   AS total_planned,
    COUNT(DISTINCT pwa.activity_id) FILTER (WHERE pwa.is_completed) AS total_completed,
    COUNT(DISTINCT ce.id)                                            AS total_cnc
FROM public.ppc_weeks pw
LEFT JOIN public.ppc_week_activities pwa ON pwa.ppc_week_id = pw.id
LEFT JOIN public.cnc_entries ce ON ce.ppc_week_id = pw.id
GROUP BY pw.id, pw.project_id, pw.week_start, pw.ppc, pw.notes, pw.created_at
ORDER BY pw.week_start DESC;


-- Vista: Análisis Pareto de CNC (conteo por categoría)
CREATE OR REPLACE VIEW public.v_cnc_pareto AS
SELECT
    pw.project_id,
    ce.category,
    COUNT(*) AS count,
    ROUND(
        COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY pw.project_id), 0) * 100,
        1
    ) AS pct_of_total,
    SUM(COUNT(*)) OVER (
        PARTITION BY pw.project_id
        ORDER BY COUNT(*) DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_count
FROM public.cnc_entries ce
JOIN public.ppc_weeks pw ON pw.id = ce.ppc_week_id
GROUP BY pw.project_id, ce.category
ORDER BY pw.project_id, count DESC;


-- Vista: Estado de restricciones por proyecto
CREATE OR REPLACE VIEW public.v_restriction_summary AS
SELECT
    lr.project_id,
    lr.status,
    lr.category,
    COUNT(*) AS count,
    COUNT(*) FILTER (WHERE lr.planned_release_date < CURRENT_DATE AND lr.status != 'Liberada') AS overdue
FROM public.lean_restrictions lr
GROUP BY lr.project_id, lr.status, lr.category
ORDER BY lr.project_id, lr.status, count DESC;


-- Vista: Actividades del Look Ahead con su restricción más crítica
CREATE OR REPLACE VIEW public.v_lookahead_activities AS
SELECT
    ga.id AS activity_id,
    ga.project_id,
    ga.local_id,
    ga.name,
    ga.encargado,
    ga.pct,
    ga."ES",
    ga."EF",
    ga.dur,
    ga.crit,
    -- Restricción más urgente (Pendiente > En Gestión > No Liberada > Liberada)
    COALESCE(
        (SELECT lr.category
         FROM public.lean_restrictions lr
         WHERE lr.activity_id = ga.id
           AND lr.status IN ('Pendiente', 'En Gestión')
         ORDER BY
            CASE lr.status
                WHEN 'Pendiente' THEN 1
                WHEN 'En Gestión' THEN 2
                ELSE 3
            END,
            lr.planned_release_date ASC NULLS LAST
         LIMIT 1),
        'Sin Restricción'
    ) AS restriction_category,
    COALESCE(
        (SELECT lr.status
         FROM public.lean_restrictions lr
         WHERE lr.activity_id = ga.id
           AND lr.status IN ('Pendiente', 'En Gestión')
         ORDER BY
            CASE lr.status
                WHEN 'Pendiente' THEN 1
                WHEN 'En Gestión' THEN 2
                ELSE 3
            END
         LIMIT 1),
        CASE
            WHEN EXISTS (SELECT 1 FROM public.lean_restrictions lr2 WHERE lr2.activity_id = ga.id AND lr2.status = 'Liberada')
            THEN 'Liberada'
            ELSE 'Sin Restricción'
        END
    ) AS restriction_status,
    -- Kanban status derivado
    CASE
        WHEN ga.pct >= 100 THEN 'Completada'
        WHEN ga.pct > 0 THEN 'En Ejecución'
        WHEN EXISTS (
            SELECT 1 FROM public.lean_restrictions lr3
            WHERE lr3.activity_id = ga.id AND lr3.status IN ('Pendiente', 'En Gestión')
        ) THEN 'Con Restricciones'
        ELSE 'Libre'
    END AS kanban_status
FROM public.gantt_activities ga
WHERE ga.type != 'summary';


-- ==============================================================================
-- FUNCIONES RPC (Remote Procedure Calls para Supabase JS Client)
-- ==============================================================================

-- Función: Registrar una semana PPC completa (atómica)
CREATE OR REPLACE FUNCTION public.register_ppc_week(
    p_project_id uuid,
    p_week_start date,
    p_planned_ids uuid[],
    p_completed_ids uuid[],
    p_notes text DEFAULT '',
    p_cnc_entries jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_week_id uuid;
    v_ppc numeric;
    v_entry jsonb;
BEGIN
    -- Calcular PPC
    IF array_length(p_planned_ids, 1) IS NULL OR array_length(p_planned_ids, 1) = 0 THEN
        v_ppc := 0;
    ELSE
        v_ppc := ROUND(
            (array_length(p_completed_ids, 1)::numeric / array_length(p_planned_ids, 1)::numeric) * 100
        );
    END IF;

    -- Insertar semana PPC (falla si ya existe el período → UNIQUE constraint)
    INSERT INTO public.ppc_weeks (project_id, week_start, ppc, notes)
    VALUES (p_project_id, p_week_start, v_ppc, p_notes)
    RETURNING id INTO v_week_id;

    -- Insertar actividades planificadas
    INSERT INTO public.ppc_week_activities (ppc_week_id, activity_id, is_planned, is_completed)
    SELECT v_week_id, unnest(p_planned_ids), true,
           unnest(p_planned_ids) = ANY(p_completed_ids);

    -- Insertar entradas CNC
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_cnc_entries)
    LOOP
        INSERT INTO public.cnc_entries (ppc_week_id, activity_id, category, description, responsible)
        VALUES (
            v_week_id,
            (v_entry->>'activity_id')::uuid,
            COALESCE(v_entry->>'category', 'Otro'),
            COALESCE(v_entry->>'description', ''),
            COALESCE(v_entry->>'responsible', '')
        );
    END LOOP;

    RETURN v_week_id;
END;
$$;


-- Función: Actualizar una semana PPC existente (atómica)
CREATE OR REPLACE FUNCTION public.update_ppc_week(
    p_week_id uuid,
    p_planned_ids uuid[],
    p_completed_ids uuid[],
    p_notes text DEFAULT '',
    p_cnc_entries jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_ppc numeric;
    v_entry jsonb;
BEGIN
    -- Calcular PPC
    IF array_length(p_planned_ids, 1) IS NULL OR array_length(p_planned_ids, 1) = 0 THEN
        v_ppc := 0;
    ELSE
        v_ppc := ROUND(
            (array_length(p_completed_ids, 1)::numeric / array_length(p_planned_ids, 1)::numeric) * 100
        );
    END IF;

    -- Actualizar semana
    UPDATE public.ppc_weeks
    SET ppc = v_ppc, notes = p_notes
    WHERE id = p_week_id;

    -- Eliminar actividades anteriores y re-insertar
    DELETE FROM public.ppc_week_activities WHERE ppc_week_id = p_week_id;
    INSERT INTO public.ppc_week_activities (ppc_week_id, activity_id, is_planned, is_completed)
    SELECT p_week_id, unnest(p_planned_ids), true,
           unnest(p_planned_ids) = ANY(p_completed_ids);

    -- Eliminar CNC anteriores y re-insertar
    DELETE FROM public.cnc_entries WHERE ppc_week_id = p_week_id;
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_cnc_entries)
    LOOP
        INSERT INTO public.cnc_entries (ppc_week_id, activity_id, category, description, responsible)
        VALUES (
            p_week_id,
            (v_entry->>'activity_id')::uuid,
            COALESCE(v_entry->>'category', 'Otro'),
            COALESCE(v_entry->>'description', ''),
            COALESCE(v_entry->>'responsible', '')
        );
    END LOOP;
END;
$$;


-- Función: Guardar snapshot de progreso (atómica)
CREATE OR REPLACE FUNCTION public.save_progress_snapshot(
    p_project_id uuid,
    p_snapshot_date date,
    p_actual_pct numeric,
    p_snapshots jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_progress_id uuid;
    v_key text;
    v_snap jsonb;
BEGIN
    -- Upsert del registro principal
    INSERT INTO public.progress_history (project_id, snapshot_date, actual_pct)
    VALUES (p_project_id, p_snapshot_date, p_actual_pct)
    ON CONFLICT (project_id, snapshot_date)
    DO UPDATE SET actual_pct = EXCLUDED.actual_pct
    RETURNING id INTO v_progress_id;

    -- Eliminar snapshots anteriores para esta fecha
    DELETE FROM public.progress_snapshots WHERE progress_id = v_progress_id;

    -- Insertar snapshots por actividad
    FOR v_key, v_snap IN SELECT * FROM jsonb_each(p_snapshots)
    LOOP
        INSERT INTO public.progress_snapshots (
            progress_id, activity_id, pct, dur, rem_dur, work, weight,
            res, manual, constraint_type, constraint_date,
            actual_start, actual_finish, resources_json
        )
        VALUES (
            v_progress_id,
            v_key::uuid,
            COALESCE((v_snap->>'pct')::numeric, 0),
            COALESCE((v_snap->>'dur')::numeric, 0),
            (v_snap->>'remDur')::numeric,
            COALESCE((v_snap->>'work')::numeric, 0),
            (v_snap->>'weight')::numeric,
            COALESCE(v_snap->>'res', ''),
            COALESCE((v_snap->>'manual')::boolean, false),
            COALESCE(v_snap->>'constraint', ''),
            (v_snap->>'constraintDate')::date,
            (v_snap->>'actualStart')::date,
            (v_snap->>'actualFinish')::date,
            COALESCE(v_snap->'resources', '[]'::jsonb)
        );
    END LOOP;

    RETURN v_progress_id;
END;
$$;


-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) — Descomentar si usas autenticación Supabase
-- ==============================================================================
/*
ALTER TABLE public.lean_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppc_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppc_week_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnc_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_filter_conditions ENABLE ROW LEVEL SECURITY;

-- Políticas: todos los usuarios autenticados pueden CRUD
CREATE POLICY "auth_all" ON public.lean_restrictions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.ppc_weeks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.ppc_week_activities FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.cnc_entries FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.progress_history FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.progress_snapshots FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.baselines FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.custom_calendars FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.calendar_exceptions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.custom_filters FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.custom_filter_conditions FOR ALL USING (auth.role() = 'authenticated');
*/


-- ==============================================================================
-- FIN DEL SCRIPT DE MIGRACIÓN LOOK AHEAD / LAST PLANNER SYSTEM
-- ==============================================================================
-- Resumen de objetos creados:
--
-- TABLAS (11):
--   • lean_restrictions          – Restricciones Make Ready
--   • ppc_weeks                  – Registros semanales PPC
--   • ppc_week_activities        – Actividades plan/cumple por semana
--   • cnc_entries                – Causas de No Cumplimiento
--   • progress_history           – Cortes de progreso (Curva S)
--   • progress_snapshots         – Snapshot por actividad
--   • baselines                  – Líneas base (BL0-BL10)
--   • custom_calendars           – Calendarios personalizados
--   • calendar_exceptions        – Excepciones de calendario
--   • custom_filters             – Filtros personalizados
--   • custom_filter_conditions   – Condiciones de filtros
--
-- VISTAS (3):
--   • v_ppc_summary              – Resumen PPC con conteos
--   • v_cnc_pareto               – Análisis Pareto CNC
--   • v_restriction_summary      – Estado de restricciones
--   • v_lookahead_activities     – Actividades con Kanban status
--
-- FUNCIONES RPC (3):
--   • register_ppc_week()        – Registro atómico de semana PPC
--   • update_ppc_week()          – Actualización atómica de semana PPC
--   • save_progress_snapshot()   – Guardar corte de progreso
--
-- COLUMNAS AGREGADAS A gantt_activities:
--   • encargado, actual_start, actual_finish, suspend_date, resume_date,
--     bl_cal, active_baseline_idx, outline_num
-- ==============================================================================
