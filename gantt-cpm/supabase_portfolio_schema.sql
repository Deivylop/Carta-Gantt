-- ═══════════════════════════════════════════════════════════════════
-- Portfolio State table — stores EPS tree + project metadata
-- Run this in the Supabase SQL Editor before using the sync feature
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portfolio_state (
    id text PRIMARY KEY DEFAULT 'default',
    eps_nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
    projects jsonb NOT NULL DEFAULT '[]'::jsonb,
    expanded_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    active_project_id text,
    updated_at timestamptz DEFAULT now()
);

-- Seed with a default row so upsert always works
INSERT INTO portfolio_state (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;
