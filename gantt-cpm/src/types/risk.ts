// ═══════════════════════════════════════════════════════════════════
// Risk Analysis Types – Monte Carlo Simulation
// Inspired by Oracle Primavera Risk Analysis (Pertmaster)
// ═══════════════════════════════════════════════════════════════════

/** Probability distribution types */
export type DistributionType =
  | 'triangular'   // min, mostLikely, max
  | 'betaPERT'     // min, mostLikely, max (smoothed)
  | 'uniform'      // min, max
  | 'none';        // deterministic (no uncertainty)

/** Duration distribution assigned to an activity */
export interface DurationDistribution {
  type: DistributionType;
  /** Optimistic duration (minimum) in work days */
  min?: number;
  /** Most likely duration in work days */
  mostLikely?: number;
  /** Pessimistic duration (maximum) in work days */
  max?: number;
}

/** Risk event categories */
export type RiskCategory =
  | 'Técnico' | 'Externo' | 'Organizacional' | 'Gestión'
  | 'Clima' | 'Suministro' | 'Regulatorio' | 'Diseño'
  | 'Subcontrato' | 'Otro';

/** A discrete risk event that can affect activities */
export interface RiskEvent {
  id: string;
  name: string;
  description: string;
  /** Probability of occurrence (0-100%) */
  probability: number;
  /** Affected activity IDs */
  affectedActivityIds: string[];
  /** Impact type: add days or multiply duration */
  impactType: 'addDays' | 'multiply';
  /** Impact value (days to add, or multiplier factor) */
  impactValue: number;
  /** Category */
  category: RiskCategory;
  /** Owner / responsible */
  owner: string;
  /** Is risk mitigated? */
  mitigated: boolean;
  /** Post-mitigation probability (0-100%) */
  mitigatedProbability?: number;
  /** Post-mitigation impact value */
  mitigatedImpactValue?: number;
  notes: string;
}

/** Simulation parameters */
export interface SimulationParams {
  /** Number of iterations (typically 1000-10000) */
  iterations: number;
  /** Random seed for reproducibility (null = random) */
  seed: number | null;
  /** Use mitigated risk values */
  useMitigated: boolean;
  /** Confidence levels to report (e.g. [10, 50, 80, 90]) */
  confidenceLevels: number[];
}

/** Result of a single iteration */
export interface IterationResult {
  /** Project finish date */
  finishDate: string;  // ISO date string for serialization
  /** Project duration in work days */
  projectDuration: number;
  /** IDs of activities on critical path */
  criticalActivityIds: string[];
  /** Sampled duration per activity */
  sampledDurations: Record<string, number>;
}

/** Histogram bin */
export interface HistogramBin {
  binStart: number;  // duration in work days
  binEnd: number;
  count: number;
  cumPct: number;    // cumulative percentage 0-100
}

/** Complete simulation result (stored per run) */
export interface SimulationResult {
  /** Unique ID for this run */
  id: string;
  /** Name for the run (user-given or auto) */
  name: string;
  /** Timestamp of execution (ISO) */
  runAt: string;
  /** Parameters used */
  params: SimulationParams;
  /** Number of iterations completed */
  completedIterations: number;

  // ── Pre-computed metrics ──
  /** Percentiles of project duration {10: 42, 50: 48, ...} */
  durationPercentiles: Record<number, number>;
  /** Percentiles of finish date {10: 'ISO', 50: 'ISO', ...} */
  datePercentiles: Record<number, string>;
  /** Deterministic duration (CPM without uncertainty) */
  deterministicDuration: number;
  /** Deterministic finish date (ISO) */
  deterministicFinish: string;
  /** Mean project duration */
  meanDuration: number;
  /** Standard deviation of project duration */
  stdDevDuration: number;

  /** Criticality index per activity (0-100%) */
  criticalityIndex: Record<string, number>;
  /** Sensitivity index per activity (Spearman correlation) */
  sensitivityIndex: Record<string, number>;

  /** Histogram bins for duration distribution */
  histogram: HistogramBin[];

  /** Snapshot of distributions used */
  distributionsSnapshot: Record<string, DurationDistribution>;
  /** Snapshot of risk events used */
  riskEventsSnapshot: RiskEvent[];
}

/** Full risk analysis state for a project */
export interface RiskAnalysisState {
  /** Duration distributions per activity */
  distributions: Record<string, DurationDistribution>;
  /** Risk events register */
  riskEvents: RiskEvent[];
  /** Simulation parameters */
  params: SimulationParams;
  /** History of simulation runs (most recent first) */
  simulationRuns: SimulationResult[];
  /** Currently selected run ID for display */
  activeRunId: string | null;
  /** Is simulation running? */
  running: boolean;
  /** Progress 0-100 */
  progress: number;
}

/** Default simulation parameters */
export const DEFAULT_SIM_PARAMS: SimulationParams = {
  iterations: 1000,
  seed: null,
  useMitigated: false,
  confidenceLevels: [10, 25, 50, 75, 80, 90],
};

/** Default risk analysis state */
export const DEFAULT_RISK_STATE: RiskAnalysisState = {
  distributions: {},
  riskEvents: [],
  params: { ...DEFAULT_SIM_PARAMS },
  simulationRuns: [],
  activeRunId: null,
  running: false,
  progress: 0,
};
