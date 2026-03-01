-- ═══════════════════════════════════════════════════════════════════
-- Risk Analysis / Monte Carlo – Supabase Schema
-- Run this in Supabase SQL Editor BEFORE using the Risk module.
-- ═══════════════════════════════════════════════════════════════════

-- Table: risk simulation runs (one row per simulation execution)
CREATE TABLE IF NOT EXISTS gantt_risk_runs (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id  UUID NOT NULL REFERENCES gantt_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Simulación',
    run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    params      JSONB NOT NULL DEFAULT '{}',          -- SimulationParams
    completed_iterations INTEGER NOT NULL DEFAULT 0,
    deterministic_duration NUMERIC,
    deterministic_finish   TEXT,                        -- ISO date
    mean_duration          NUMERIC,
    std_dev_duration       NUMERIC,
    duration_percentiles   JSONB DEFAULT '{}',          -- {10: 42, 50: 48, ...}
    date_percentiles       JSONB DEFAULT '{}',          -- {10: 'ISO', ...}
    criticality_index      JSONB DEFAULT '{}',          -- {actId: percent, ...}
    sensitivity_index      JSONB DEFAULT '{}',          -- {actId: correlation, ...}
    histogram              JSONB DEFAULT '[]',          -- HistogramBin[]
    distributions_snapshot JSONB DEFAULT '{}',          -- distributions used
    risk_events_snapshot   JSONB DEFAULT '[]',          -- risk events used
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by project
CREATE INDEX IF NOT EXISTS idx_risk_runs_project ON gantt_risk_runs(project_id);

-- Table: risk distributions (per activity, per project)
CREATE TABLE IF NOT EXISTS gantt_risk_distributions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id  UUID NOT NULL REFERENCES gantt_projects(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL,                           -- local activity ID
    dist_type   TEXT NOT NULL DEFAULT 'none',            -- triangular, betaPERT, uniform, none
    dist_min    NUMERIC,
    dist_most_likely NUMERIC,
    dist_max    NUMERIC,
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, activity_id)
);

-- Table: risk events register (per project)
CREATE TABLE IF NOT EXISTS gantt_risk_events (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id  UUID NOT NULL REFERENCES gantt_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    probability NUMERIC NOT NULL DEFAULT 50,
    affected_activity_ids JSONB DEFAULT '[]',           -- string[]
    impact_type TEXT NOT NULL DEFAULT 'addDays',         -- 'addDays' | 'multiply'
    impact_value NUMERIC NOT NULL DEFAULT 0,
    category    TEXT DEFAULT 'Otro',
    owner       TEXT DEFAULT '',
    mitigated   BOOLEAN DEFAULT false,
    mitigated_probability NUMERIC,
    mitigated_impact_value NUMERIC,
    notes       TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_events_project ON gantt_risk_events(project_id);

-- Enable RLS (Row Level Security) – adjust policies as needed
ALTER TABLE gantt_risk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_risk_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_risk_events ENABLE ROW LEVEL SECURITY;

-- Permissive policies (allow all for anon – adjust for production)
CREATE POLICY "Allow all for risk_runs" ON gantt_risk_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for risk_distributions" ON gantt_risk_distributions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for risk_events" ON gantt_risk_events FOR ALL USING (true) WITH CHECK (true);
