-- ==============================================================================
-- MIGRACIÓN SUPABASE: ANÁLISIS DE RIESGO / MONTE CARLO
--
-- Proyecto : Carta Gantt CPM  (React + TypeScript)
-- Fecha    : 2026-03-01
-- Autor    : Auto-generado
--
-- Este script crea las tablas necesarias para persistir en Supabase toda la
-- información del módulo de Análisis de Riesgo y Simulación Monte Carlo:
--
--   1. risk_scoring_config      – Configuración de escalas de puntuación por proyecto
--   2. risk_events                – Registro de riesgos (Cualitativo + Cuantitativo)
--   3. risk_task_impacts          – Impacto cuantitativo por actividad (risk drivers)
--   3. risk_distributions         – Distribución de duración por actividad (incertidumbre)
--   4. risk_sim_params            – Parámetros de simulación del proyecto
--   5. risk_simulation_runs       – Historial de corridas de simulación
--   6. risk_run_percentiles       – Percentiles de proyecto por corrida
--   7. risk_run_date_percentiles  – Percentiles de fechas de proyecto por corrida
--   8. risk_run_histogram         – Histograma de duración por corrida
--   9. risk_run_activity_stats    – Estadísticas por actividad por corrida
--  10. risk_run_act_date_pctls    – Percentiles de fechas por actividad por corrida
--  11. risk_run_act_start_pctls   – Percentiles de fecha inicio por actividad por corrida
--  12. risk_run_act_dur_pctls     – Percentiles de duración por actividad por corrida
--  13. risk_run_criticality       – Índice de Criticidad por actividad por corrida
--  14. risk_run_sensitivity       – Índice de Sensibilidad por actividad por corrida
--  15. risk_run_dist_snapshot     – Snapshot de distribuciones usadas en la corrida
--  16. risk_run_events_snapshot   – Snapshot de eventos de riesgo usados en la corrida
--
-- PRERREQUISITOS:
--   • Las tablas gantt_projects y gantt_activities del esquema base deben
--     existir antes de ejecutar este script (supabase_gantt_schema.sql).
--
-- NOTA: Ejecutar en orden. El script es idempotente (IF NOT EXISTS).
-- ==============================================================================

-- Habilitar extensión UUID si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ==============================================================================
-- 1. RISK_SCORING_CONFIG – Escalas de Puntuación de Riesgo por Proyecto
-- Corresponde a: RiskScoringConfig (risk.ts)
-- Almacena la configuración personalizable de escalas de probabilidad,
-- tipos de impacto, tolerancias y modo de cálculo PID.
-- ==============================================================================

-- 1a. Configuración principal (1 fila por proyecto)
CREATE TABLE IF NOT EXISTS public.risk_scoring_config (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id     uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    -- Modo de cálculo PID: 'highest', 'average_impacts', 'average_scores'
    pid_score_mode text NOT NULL DEFAULT 'highest'
        CHECK (pid_score_mode IN ('highest', 'average_impacts', 'average_scores')),

    updated_at     timestamptz DEFAULT now(),

    UNIQUE(project_id)
);

-- 1b. Escala de Probabilidad (5 niveles por proyecto)
CREATE TABLE IF NOT EXISTS public.risk_probability_scale (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    config_id      uuid NOT NULL REFERENCES public.risk_scoring_config(id) ON DELETE CASCADE,

    level_key      text NOT NULL CHECK (level_key IN ('VL','L','M','H','VH')),
    label          text NOT NULL DEFAULT '',
    weight         numeric NOT NULL DEFAULT 1,
    threshold      text NOT NULL DEFAULT '',     -- e.g. '>70%', '<=10%'

    sort_order     int DEFAULT 0,

    UNIQUE(config_id, level_key)
);

CREATE INDEX IF NOT EXISTS idx_risk_prob_scale_config
    ON public.risk_probability_scale(config_id);

-- 1c. Tipos de Impacto (Schedule, Cost, Performance, custom...)
CREATE TABLE IF NOT EXISTS public.risk_impact_types (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    config_id      uuid NOT NULL REFERENCES public.risk_scoring_config(id) ON DELETE CASCADE,

    type_id        text NOT NULL,                -- 'schedule', 'cost', 'performance', 'custom_xx'
    label          text NOT NULL DEFAULT '',      -- 'Programa', 'Costo', 'Desempeño'
    scored         boolean NOT NULL DEFAULT true, -- ¿Incluir en cálculo de score?

    -- Umbrales por nivel (texto descriptivo)
    threshold_vl   text DEFAULT '',
    threshold_l    text DEFAULT '',
    threshold_m    text DEFAULT '',
    threshold_h    text DEFAULT '',
    threshold_vh   text DEFAULT '',

    sort_order     int DEFAULT 0,

    UNIQUE(config_id, type_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_impact_types_config
    ON public.risk_impact_types(config_id);

-- 1d. Escala de Tolerancia (bandas de color para la matriz)
CREATE TABLE IF NOT EXISTS public.risk_tolerance_levels (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    config_id      uuid NOT NULL REFERENCES public.risk_scoring_config(id) ON DELETE CASCADE,

    label          text NOT NULL DEFAULT '',      -- 'Alto', 'Medio', 'Bajo'
    color          text NOT NULL DEFAULT '#22c55e', -- hex color
    min_score      numeric NOT NULL DEFAULT 0,    -- score >= min_score → this band

    sort_order     int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_risk_tolerance_config
    ON public.risk_tolerance_levels(config_id);


-- ==============================================================================
-- 2. RISK_EVENTS – Registro de Riesgos (Cualitativo + Cuantitativo)
-- Corresponde a: RiskEvent (risk.ts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_events (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id     uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    -- Identificación
    local_id       text NOT NULL,          -- ID interno (ej: 'risk_m1abc_x2y')
    code           text NOT NULL,          -- Código visible (ej: 'R001', 'RSK-05')
    name           text NOT NULL DEFAULT '',
    description    text DEFAULT '',
    cause          text DEFAULT '',
    effect         text DEFAULT '',

    -- Clasificación
    threat_or_opportunity text NOT NULL DEFAULT 'threat'
        CHECK (threat_or_opportunity IN ('threat', 'opportunity')),
    status         text NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'open', 'closed', 'mitigated')),
    category       text NOT NULL DEFAULT 'Otro'
        CHECK (category IN (
            'Técnico', 'Externo', 'Organizacional', 'Gestión',
            'Clima', 'Suministro', 'Regulatorio', 'Diseño',
            'Subcontrato', 'Otro'
        )),
    owner          text DEFAULT '',
    notes          text DEFAULT '',
    rbs            text DEFAULT '',        -- Risk Breakdown Structure code

    -- Evaluación Cualitativa (Pre-Mitigación)
    pre_probability    text DEFAULT 'M' CHECK (pre_probability IN ('VL','L','M','H','VH')),
    pre_schedule       text DEFAULT 'M' CHECK (pre_schedule IN ('VL','L','M','H','VH')),
    pre_cost           text DEFAULT 'M' CHECK (pre_cost IN ('VL','L','M','H','VH')),
    pre_performance    text DEFAULT 'M' CHECK (pre_performance IN ('VL','L','M','H','VH')),

    -- Evaluación Cualitativa (Post-Mitigación)
    post_probability   text DEFAULT 'M' CHECK (post_probability IN ('VL','L','M','H','VH')),
    post_schedule      text DEFAULT 'M' CHECK (post_schedule IN ('VL','L','M','H','VH')),
    post_cost          text DEFAULT 'M' CHECK (post_cost IN ('VL','L','M','H','VH')),
    post_performance   text DEFAULT 'M' CHECK (post_performance IN ('VL','L','M','H','VH')),

    -- Mitigación
    mitigation_response text DEFAULT 'accept'
        CHECK (mitigation_response IN ('accept', 'mitigate', 'transfer', 'avoid', 'exploit', 'enhance')),
    mitigation_title    text DEFAULT '',
    mitigation_cost     numeric DEFAULT 0,

    -- Evaluación Cuantitativa
    quantified         boolean DEFAULT false,
    probability        numeric DEFAULT 50,     -- Probabilidad para MC (0-100%)

    -- Legacy / Compatibilidad
    impact_type        text DEFAULT 'addDays' CHECK (impact_type IN ('addDays', 'multiply')),
    impact_value       numeric DEFAULT 5,
    mitigated          boolean DEFAULT false,
    mitigated_probability  numeric,
    mitigated_impact_value numeric,

    -- Fechas del riesgo
    start_date         date,
    end_date           date,

    -- Metadata
    sort_order         int DEFAULT 0,
    created_at         timestamptz DEFAULT now(),
    updated_at         timestamptz DEFAULT now(),

    UNIQUE(project_id, local_id)
);

-- Índice para búsqueda rápida por proyecto
CREATE INDEX IF NOT EXISTS idx_risk_events_project
    ON public.risk_events(project_id);


-- ==============================================================================
-- 2. RISK_TASK_IMPACTS – Impacto cuantitativo por actividad (Risk Drivers)
-- Corresponde a: RiskTaskImpact[] dentro de RiskEvent
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_task_impacts (
    id               uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    risk_event_id    uuid NOT NULL REFERENCES public.risk_events(id) ON DELETE CASCADE,
    project_id       uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    -- Actividad afectada (local_id de gantt_activities)
    task_local_id    text NOT NULL,

    -- Distribución de impacto en Schedule
    schedule_shape   text DEFAULT 'none'
        CHECK (schedule_shape IN ('triangular', 'betaPERT', 'uniform', 'none')),
    schedule_min     numeric,
    schedule_likely  numeric,
    schedule_max     numeric,

    -- Distribución de impacto en Costo
    cost_shape       text DEFAULT 'none'
        CHECK (cost_shape IN ('triangular', 'betaPERT', 'uniform', 'none')),
    cost_min         numeric,
    cost_likely      numeric,
    cost_max         numeric,

    -- Opciones
    correlate        boolean DEFAULT false,
    impact_ranges    boolean DEFAULT false,
    event_existence  boolean DEFAULT false,

    sort_order       int DEFAULT 0,

    UNIQUE(risk_event_id, task_local_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_task_impacts_event
    ON public.risk_task_impacts(risk_event_id);

CREATE INDEX IF NOT EXISTS idx_risk_task_impacts_project
    ON public.risk_task_impacts(project_id);


-- ==============================================================================
-- 3. RISK_DISTRIBUTIONS – Distribución de duración por actividad
-- Corresponde a: distributions: Record<string, DurationDistribution>
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_distributions (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id     uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    -- Actividad (local_id de gantt_activities)
    activity_local_id text NOT NULL,

    -- Tipo de distribución
    dist_type      text NOT NULL DEFAULT 'none'
        CHECK (dist_type IN ('triangular', 'betaPERT', 'uniform', 'none')),

    -- Parámetros (en días hábiles, basados en duración remanente)
    dist_min       numeric,       -- Optimista
    most_likely    numeric,       -- Más probable
    dist_max       numeric,       -- Pesimista

    updated_at     timestamptz DEFAULT now(),

    UNIQUE(project_id, activity_local_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_distributions_project
    ON public.risk_distributions(project_id);


-- ==============================================================================
-- 4. RISK_SIM_PARAMS – Parámetros de simulación del proyecto
-- Corresponde a: SimulationParams (risk.ts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_sim_params (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id     uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    iterations     int NOT NULL DEFAULT 1000,
    seed           int,                   -- NULL = aleatorio
    use_mitigated  boolean DEFAULT false,
    confidence_levels int[] DEFAULT '{10,25,50,75,80,90}',

    updated_at     timestamptz DEFAULT now(),

    UNIQUE(project_id)
);


-- ==============================================================================
-- 5. RISK_SIMULATION_RUNS – Historial de corridas de simulación
-- Corresponde a: SimulationResult (campos escalares)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_simulation_runs (
    id                    uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id            uuid NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,

    -- Identificación
    local_id              text NOT NULL,        -- ID local de la corrida
    name                  text DEFAULT '',       -- Nombre dado por el usuario
    run_at                timestamptz NOT NULL,  -- Fecha/hora de ejecución

    -- Parámetros utilizados
    param_iterations      int NOT NULL DEFAULT 1000,
    param_seed            int,
    param_use_mitigated   boolean DEFAULT false,
    param_confidence_levels int[] DEFAULT '{10,25,50,75,80,90}',

    -- Resultados escalares
    completed_iterations  int NOT NULL,
    deterministic_duration numeric NOT NULL,   -- Duración remanente determinística
    deterministic_finish  date NOT NULL,       -- Fecha fin determinística (inclusiva)
    mean_duration         numeric NOT NULL,    -- Media de duración del proyecto
    std_dev_duration      numeric NOT NULL,    -- Desviación estándar

    -- Estado activo
    is_active             boolean DEFAULT false, -- ¿Es la corrida seleccionada?

    created_at            timestamptz DEFAULT now(),

    UNIQUE(project_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_sim_runs_project
    ON public.risk_simulation_runs(project_id);


-- ==============================================================================
-- 6. RISK_RUN_PERCENTILES – Percentiles de duración del proyecto
-- Corresponde a: durationPercentiles: Record<number, number>
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_percentiles (
    id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id      uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,

    percentile  int NOT NULL,     -- 10, 25, 50, 75, 80, 90
    duration    numeric NOT NULL,  -- Duración remanente en días hábiles

    UNIQUE(run_id, percentile)
);


-- ==============================================================================
-- 7. RISK_RUN_DATE_PERCENTILES – Percentiles de fecha fin del proyecto
-- Corresponde a: datePercentiles: Record<number, string>
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_date_percentiles (
    id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id      uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,

    percentile  int NOT NULL,      -- 10, 25, 50, 75, 80, 90
    finish_date date NOT NULL,     -- Fecha fin (inclusiva)

    UNIQUE(run_id, percentile)
);


-- ==============================================================================
-- 8. RISK_RUN_HISTOGRAM – Histograma de distribución de duración
-- Corresponde a: histogram: HistogramBin[]
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_histogram (
    id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id     uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,

    bin_start  numeric NOT NULL,   -- Inicio del bin (días)
    bin_end    numeric NOT NULL,   -- Fin del bin (días)
    count      int NOT NULL,       -- Frecuencia
    cum_pct    numeric NOT NULL,   -- Porcentaje acumulado (0-100)

    sort_order int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_risk_run_histogram_run
    ON public.risk_run_histogram(run_id);


-- ==============================================================================
-- 9. RISK_RUN_ACTIVITY_STATS – Estadísticas por actividad por corrida
-- Corresponde a: activityPercentiles (campos determinísticos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_activity_stats (
    id                    uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id                uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,

    activity_local_id     text NOT NULL,

    -- Valores determinísticos de la actividad
    deterministic_start   date,        -- ES determinístico (inclusivo)
    deterministic_finish  date,        -- EF determinístico (inclusivo)
    deterministic_duration numeric,    -- Duración remanente determinística

    UNIQUE(run_id, activity_local_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_run_act_stats_run
    ON public.risk_run_activity_stats(run_id);


-- ==============================================================================
-- 10. RISK_RUN_ACT_DATE_PCTLS – Percentiles de fecha fin por actividad
-- Corresponde a: datePercentiles dentro de activityPercentiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_act_date_pctls (
    id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id            uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,
    activity_local_id text NOT NULL,

    percentile        int NOT NULL,
    finish_date       date NOT NULL,

    UNIQUE(run_id, activity_local_id, percentile)
);

CREATE INDEX IF NOT EXISTS idx_risk_run_act_date_pctls_run
    ON public.risk_run_act_date_pctls(run_id);


-- ==============================================================================
-- 11. RISK_RUN_ACT_START_PCTLS – Percentiles de fecha inicio por actividad
-- Corresponde a: startDatePercentiles dentro de activityPercentiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_act_start_pctls (
    id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id            uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,
    activity_local_id text NOT NULL,

    percentile        int NOT NULL,
    start_date        date NOT NULL,

    UNIQUE(run_id, activity_local_id, percentile)
);

CREATE INDEX IF NOT EXISTS idx_risk_run_act_start_pctls_run
    ON public.risk_run_act_start_pctls(run_id);


-- ==============================================================================
-- 12. RISK_RUN_ACT_DUR_PCTLS – Percentiles de duración por actividad
-- Corresponde a: durationPercentiles dentro de activityPercentiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_act_dur_pctls (
    id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id            uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,
    activity_local_id text NOT NULL,

    percentile        int NOT NULL,
    duration          numeric NOT NULL,   -- Duración remanente en días hábiles

    UNIQUE(run_id, activity_local_id, percentile)
);

CREATE INDEX IF NOT EXISTS idx_risk_run_act_dur_pctls_run
    ON public.risk_run_act_dur_pctls(run_id);


-- ==============================================================================
-- 13. RISK_RUN_CRITICALITY – Índice de Criticidad por actividad
-- Corresponde a: criticalityIndex: Record<string, number>
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_criticality (
    id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id            uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,
    activity_local_id text NOT NULL,

    criticality_index numeric NOT NULL,   -- 0-100 (% de iteraciones en ruta crítica)

    UNIQUE(run_id, activity_local_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_run_criticality_run
    ON public.risk_run_criticality(run_id);


-- ==============================================================================
-- 14. RISK_RUN_SENSITIVITY – Índice de Sensibilidad por actividad
-- Corresponde a: sensitivityIndex: Record<string, number>
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_sensitivity (
    id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id            uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,
    activity_local_id text NOT NULL,

    sensitivity_index numeric NOT NULL,   -- Correlación de Spearman (-1 a 1)

    UNIQUE(run_id, activity_local_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_run_sensitivity_run
    ON public.risk_run_sensitivity(run_id);


-- ==============================================================================
-- 15. RISK_RUN_DIST_SNAPSHOT – Snapshot de distribuciones usadas
-- Corresponde a: distributionsSnapshot: Record<string, DurationDistribution>
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_dist_snapshot (
    id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id            uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,

    activity_local_id text NOT NULL,
    dist_type         text NOT NULL,
    dist_min          numeric,
    most_likely       numeric,
    dist_max          numeric,

    UNIQUE(run_id, activity_local_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_run_dist_snapshot_run
    ON public.risk_run_dist_snapshot(run_id);


-- ==============================================================================
-- 16. RISK_RUN_EVENTS_SNAPSHOT – Snapshot de eventos de riesgo usados
-- Corresponde a: riskEventsSnapshot: RiskEvent[]
-- Se almacena como JSONB para capturar el estado completo del riesgo
-- al momento de la corrida, sin necesidad de recrear la estructura completa.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.risk_run_events_snapshot (
    id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id      uuid NOT NULL REFERENCES public.risk_simulation_runs(id) ON DELETE CASCADE,

    -- Snapshot completo del riesgo en formato JSON
    event_data  jsonb NOT NULL,

    sort_order  int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_risk_run_events_snapshot_run
    ON public.risk_run_events_snapshot(run_id);


-- ==============================================================================
-- FUNCIONES AUXILIARES
-- ==============================================================================

-- Función: Actualizar updated_at en risk_events
CREATE OR REPLACE FUNCTION public.update_risk_events_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_risk_events_updated_at ON public.risk_events;
CREATE TRIGGER trg_risk_events_updated_at
    BEFORE UPDATE ON public.risk_events
    FOR EACH ROW
    EXECUTE FUNCTION public.update_risk_events_updated_at();

-- Función: Actualizar updated_at en risk_distributions
CREATE OR REPLACE FUNCTION public.update_risk_distributions_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_risk_distributions_updated_at ON public.risk_distributions;
CREATE TRIGGER trg_risk_distributions_updated_at
    BEFORE UPDATE ON public.risk_distributions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_risk_distributions_updated_at();

-- Función: Asegurar que solo 1 corrida sea activa por proyecto
CREATE OR REPLACE FUNCTION public.ensure_single_active_run()
RETURNS trigger AS $$
BEGIN
    IF NEW.is_active = true THEN
        UPDATE public.risk_simulation_runs
        SET is_active = false
        WHERE project_id = NEW.project_id
          AND id != NEW.id
          AND is_active = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_run ON public.risk_simulation_runs;
CREATE TRIGGER trg_single_active_run
    BEFORE INSERT OR UPDATE OF is_active ON public.risk_simulation_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_single_active_run();


-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) – Habilitar para todas las tablas nuevas
-- ==============================================================================
-- Si utilizas RLS con auth.uid(), descomenta y adapta las políticas.
-- Por defecto se habilita RLS pero con acceso total (ajustar según tu setup).

ALTER TABLE public.risk_scoring_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_probability_scale      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_impact_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_tolerance_levels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_task_impacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_distributions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_sim_params            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_simulation_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_percentiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_date_percentiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_histogram         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_activity_stats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_act_date_pctls    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_act_start_pctls   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_act_dur_pctls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_criticality       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_sensitivity       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_dist_snapshot     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_run_events_snapshot   ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso completo (anon + authenticated) – ajustar según necesidad
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'risk_scoring_config', 'risk_probability_scale', 'risk_impact_types',
            'risk_tolerance_levels',
            'risk_events', 'risk_task_impacts', 'risk_distributions',
            'risk_sim_params', 'risk_simulation_runs',
            'risk_run_percentiles', 'risk_run_date_percentiles',
            'risk_run_histogram', 'risk_run_activity_stats',
            'risk_run_act_date_pctls', 'risk_run_act_start_pctls',
            'risk_run_act_dur_pctls', 'risk_run_criticality',
            'risk_run_sensitivity', 'risk_run_dist_snapshot',
            'risk_run_events_snapshot'
        ])
    LOOP
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS "%1$s_select" ON public.%1$I FOR SELECT USING (true);',
            tbl
        );
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS "%1$s_insert" ON public.%1$I FOR INSERT WITH CHECK (true);',
            tbl
        );
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS "%1$s_update" ON public.%1$I FOR UPDATE USING (true) WITH CHECK (true);',
            tbl
        );
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS "%1$s_delete" ON public.%1$I FOR DELETE USING (true);',
            tbl
        );
    END LOOP;
END;
$$;


-- ==============================================================================
-- COMENTARIOS DE TABLAS (documentación en BD)
-- ==============================================================================
COMMENT ON TABLE public.risk_scoring_config IS
    'Configuración de escalas de puntuación de riesgo por proyecto (modo PID).';
COMMENT ON TABLE public.risk_probability_scale IS
    'Escala de Probabilidad: 5 niveles con peso y umbral personalizado por proyecto.';
COMMENT ON TABLE public.risk_impact_types IS
    'Tipos de Impacto (Programa, Costo, Desempeño, custom) con umbrales por nivel.';
COMMENT ON TABLE public.risk_tolerance_levels IS
    'Bandas de tolerancia para la matriz de riesgos (color y score mínimo).';
COMMENT ON TABLE public.risk_events IS
    'Registro de riesgos – evaluación cualitativa (matriz) y cuantitativa (MC).';
COMMENT ON TABLE public.risk_task_impacts IS
    'Risk Drivers: impacto cuantitativo de cada riesgo sobre actividades específicas.';
COMMENT ON TABLE public.risk_distributions IS
    'Distribución de duración inherente por actividad (incertidumbre sin riesgos).';
COMMENT ON TABLE public.risk_sim_params IS
    'Parámetros de simulación Monte Carlo del proyecto.';
COMMENT ON TABLE public.risk_simulation_runs IS
    'Historial de corridas de simulación Monte Carlo.';
COMMENT ON TABLE public.risk_run_percentiles IS
    'Percentiles de duración remanente del proyecto por corrida.';
COMMENT ON TABLE public.risk_run_date_percentiles IS
    'Percentiles de fecha de término del proyecto por corrida.';
COMMENT ON TABLE public.risk_run_histogram IS
    'Histograma de distribución de duración del proyecto por corrida.';
COMMENT ON TABLE public.risk_run_activity_stats IS
    'Valores determinísticos por actividad capturados en la corrida.';
COMMENT ON TABLE public.risk_run_act_date_pctls IS
    'Percentiles de fecha fin (EF) por actividad por corrida.';
COMMENT ON TABLE public.risk_run_act_start_pctls IS
    'Percentiles de fecha inicio (ES) por actividad por corrida.';
COMMENT ON TABLE public.risk_run_act_dur_pctls IS
    'Percentiles de duración remanente por actividad por corrida.';
COMMENT ON TABLE public.risk_run_criticality IS
    'Índice de Criticidad: % de iteraciones donde la actividad estuvo en ruta crítica.';
COMMENT ON TABLE public.risk_run_sensitivity IS
    'Índice de Sensibilidad: correlación de Spearman entre duración actividad y proyecto.';
COMMENT ON TABLE public.risk_run_dist_snapshot IS
    'Snapshot de las distribuciones de duración usadas al momento de la corrida.';
COMMENT ON TABLE public.risk_run_events_snapshot IS
    'Snapshot completo (JSONB) de los eventos de riesgo usados al momento de la corrida.';


-- ==============================================================================
-- FIN DEL SCRIPT
-- ==============================================================================
-- Para ejecutar: copiar y pegar en el SQL Editor de Supabase Dashboard
-- o ejecutar con: psql -f supabase_montecarlo_schema.sql
-- ==============================================================================
