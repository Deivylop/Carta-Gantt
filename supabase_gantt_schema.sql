-- ==============================================================================
-- BASE DE DATOS PARA CARTA GANTT CPM EN SUPABASE / POSTGRESQL
-- ==============================================================================

-- Habilitar extensión UUID si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA: gantt_projects
-- Almacena la configuración global de un proyecto.
CREATE TABLE IF NOT EXISTS public.gantt_projects (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    projName text NOT NULL DEFAULT 'Mi Proyecto',
    projStart date,
    defCal int DEFAULT 6,
    statusDate date
);

-- 2. TABLA: gantt_resources
-- Almacena la hoja de recursos (resource pool) del proyecto.
CREATE TABLE IF NOT EXISTS public.gantt_resources (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    rid int NOT NULL, -- ID local usado en la UI
    name text,
    type text, -- 'Trabajo', 'Material', 'Costo'
    materialLabel text,
    initials text,
    resource_group text, -- 'group' es palabra reservada en SQL
    maxCapacity text,
    stdRate text,
    overtimeRate text,
    costPerUse text,
    accrual text,
    calendar text,
    code text,
    UNIQUE(project_id, rid)
);

-- 3. TABLA: gantt_activities
-- Almacena todas las actividades, hitos y resúmenes de la Carta Gantt.
-- Incluye todos los campos calculados y manuales definidos en el código JS.
CREATE TABLE IF NOT EXISTS public.gantt_activities (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    local_id text NOT NULL, -- El ID visible en la UI (ej: 'A', '1.1')
    sort_order int NOT NULL, -- Para mantener el orden de las filas en la tabla
    name text,
    type text, -- 'task', 'milestone', 'summary'
    dur numeric,
    remDur numeric,
    cal int,
    pct numeric,
    notes text,
    res text, -- representación en texto de los recursos
    work numeric,
    weight numeric,
    lv int, -- WBS nivel (0-5)
    constraint_type text, -- 'SNET', 'MSO', etc. ('constraint' es reservada)
    constraintDate date,
    manual boolean,
    "ES" timestamp, -- Fechas calculadas CPM
    "EF" timestamp,
    "LS" timestamp,
    "LF" timestamp,
    "TF" numeric,
    crit boolean,
    blDur numeric, -- Baseline variables
    blES timestamp,
    blEF timestamp,
    txt1 text, -- Agrupadores/Textos personalizables
    txt2 text,
    txt3 text,
    txt4 text,
    txt5 text,
    UNIQUE(project_id, local_id)
);

-- 4. TABLA: gantt_dependencies
-- Almacena las vinculaciones lógicas entre las actividades (FS, SS, FF, SF) y sus retardos.
CREATE TABLE IF NOT EXISTS public.gantt_dependencies (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    from_activity_id uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,
    to_activity_id uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,
    type text NOT NULL, -- 'FS', 'SS', 'FF', 'SF'
    lag numeric DEFAULT 0,
    UNIQUE(from_activity_id, to_activity_id)
);

-- 5. TABLA: gantt_activity_resources
-- Almacena la relación N:M entre una actividad y los recursos asignados.
CREATE TABLE IF NOT EXISTS public.gantt_activity_resources (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    activity_id uuid NOT NULL REFERENCES public.gantt_activities(id) ON DELETE CASCADE,
    resource_id uuid NOT NULL REFERENCES public.gantt_resources(id) ON DELETE CASCADE,
    work numeric DEFAULT 0,
    units text,
    UNIQUE(activity_id, resource_id)
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) - Opcional, pero recomendado en Supabase
-- ==============================================================================
-- Descomentar y ajustar si usas autenticación en tu proyecto Supabase:

/*
ALTER TABLE public.gantt_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_activity_resources ENABLE ROW LEVEL SECURITY;

-- Ejemplo de políticas (todos pueden leer/escribir si están autenticados)
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.gantt_projects FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.gantt_resources FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.gantt_activities FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.gantt_dependencies FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.gantt_activity_resources FOR ALL USING (auth.role() = 'authenticated');
*/
