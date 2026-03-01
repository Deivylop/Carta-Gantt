// ═══════════════════════════════════════════════════════════════════
// riskSync.ts – Supabase persistence for Risk Analysis module
// Saves/loads simulation runs, distributions, and risk events.
// ═══════════════════════════════════════════════════════════════════
import { supabase } from '../lib/supabase';
import type { SimulationResult, DurationDistribution, RiskEvent, RiskAnalysisState } from '../types/risk';

// ─── Save a simulation run to Supabase ──────────────────────────
export async function saveRiskRunToSupabase(
  projectId: string,
  result: SimulationResult,
): Promise<void> {
  const { error } = await supabase.from('gantt_risk_runs').insert({
    id: result.id,
    project_id: projectId,
    name: result.name,
    run_at: result.runAt,
    params: result.params,
    completed_iterations: result.completedIterations,
    deterministic_duration: result.deterministicDuration,
    deterministic_finish: result.deterministicFinish,
    mean_duration: result.meanDuration,
    std_dev_duration: result.stdDevDuration,
    duration_percentiles: result.durationPercentiles,
    date_percentiles: result.datePercentiles,
    criticality_index: result.criticalityIndex,
    sensitivity_index: result.sensitivityIndex,
    histogram: result.histogram,
    distributions_snapshot: result.distributionsSnapshot,
    risk_events_snapshot: result.riskEventsSnapshot,
  });
  if (error) throw error;
}

// ─── Load simulation runs from Supabase ─────────────────────────
export async function loadRiskRunsFromSupabase(
  projectId: string,
): Promise<SimulationResult[]> {
  const { data, error } = await supabase
    .from('gantt_risk_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('run_at', { ascending: false });
  if (error) throw error;
  if (!data) return [];

  return data.map((row: any) => ({
    id: row.id,
    name: row.name || 'Simulación',
    runAt: row.run_at,
    params: row.params || { iterations: 1000, seed: null, useMitigated: false, confidenceLevels: [10, 50, 80, 90] },
    completedIterations: row.completed_iterations || 0,
    deterministicDuration: row.deterministic_duration || 0,
    deterministicFinish: row.deterministic_finish || '',
    meanDuration: row.mean_duration || 0,
    stdDevDuration: row.std_dev_duration || 0,
    durationPercentiles: row.duration_percentiles || {},
    datePercentiles: row.date_percentiles || {},
    criticalityIndex: row.criticality_index || {},
    sensitivityIndex: row.sensitivity_index || {},
    histogram: row.histogram || [],
    distributionsSnapshot: row.distributions_snapshot || {},
    riskEventsSnapshot: row.risk_events_snapshot || [],
  }));
}

// ─── Delete a simulation run from Supabase ──────────────────────
export async function deleteRiskRunFromSupabase(
  projectId: string,
  runId: string,
): Promise<void> {
  const { error } = await supabase
    .from('gantt_risk_runs')
    .delete()
    .eq('id', runId)
    .eq('project_id', projectId);
  if (error) throw error;
}

// ─── Save risk config (distributions + events) to Supabase ──────
export async function saveRiskConfigToSupabase(
  projectId: string,
  distributions: Record<string, DurationDistribution>,
  riskEvents: RiskEvent[],
): Promise<void> {
  // Upsert distributions
  const distEntries = Object.entries(distributions);
  if (distEntries.length > 0) {
    // Delete existing first
    await supabase.from('gantt_risk_distributions').delete().eq('project_id', projectId);
    const rows = distEntries
      .filter(([, d]) => d.type !== 'none')
      .map(([actId, d]) => ({
        project_id: projectId,
        activity_id: actId,
        dist_type: d.type,
        dist_min: d.min ?? null,
        dist_most_likely: d.mostLikely ?? null,
        dist_max: d.max ?? null,
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from('gantt_risk_distributions').insert(rows);
      if (error) console.warn('[riskSync] Failed to save distributions:', error);
    }
  }

  // Upsert risk events
  await supabase.from('gantt_risk_events').delete().eq('project_id', projectId);
  if (riskEvents.length > 0) {
    const evtRows = riskEvents.map(r => ({
      id: r.id,
      project_id: projectId,
      name: r.name,
      description: r.description,
      probability: r.probability,
      affected_activity_ids: r.affectedActivityIds,
      impact_type: r.impactType,
      impact_value: r.impactValue,
      category: r.category,
      owner: r.owner,
      mitigated: r.mitigated,
      mitigated_probability: r.mitigatedProbability ?? null,
      mitigated_impact_value: r.mitigatedImpactValue ?? null,
      notes: r.notes,
    }));
    const { error } = await supabase.from('gantt_risk_events').insert(evtRows);
    if (error) console.warn('[riskSync] Failed to save risk events:', error);
  }
}

// ─── Load risk config (distributions + events) from Supabase ────
export async function loadRiskConfigFromSupabase(
  projectId: string,
): Promise<Partial<RiskAnalysisState> | null> {
  // Load distributions
  const { data: distData } = await supabase
    .from('gantt_risk_distributions')
    .select('*')
    .eq('project_id', projectId);

  // Load risk events
  const { data: evtData } = await supabase
    .from('gantt_risk_events')
    .select('*')
    .eq('project_id', projectId);

  const distributions: Record<string, DurationDistribution> = {};
  const riskEvents: RiskEvent[] = [];

  if (distData && distData.length > 0) {
    for (const row of distData) {
      distributions[row.activity_id] = {
        type: row.dist_type as any,
        min: row.dist_min ?? undefined,
        mostLikely: row.dist_most_likely ?? undefined,
        max: row.dist_max ?? undefined,
      };
    }
  }

  if (evtData && evtData.length > 0) {
    for (const row of evtData) {
      riskEvents.push({
        id: row.id,
        name: row.name,
        description: row.description || '',
        probability: row.probability || 50,
        affectedActivityIds: row.affected_activity_ids || [],
        impactType: row.impact_type || 'addDays',
        impactValue: row.impact_value || 0,
        category: row.category || 'Otro',
        owner: row.owner || '',
        mitigated: row.mitigated || false,
        mitigatedProbability: row.mitigated_probability ?? undefined,
        mitigatedImpactValue: row.mitigated_impact_value ?? undefined,
        notes: row.notes || '',
      });
    }
  }

  if (Object.keys(distributions).length === 0 && riskEvents.length === 0) return null;

  return { distributions, riskEvents };
}
