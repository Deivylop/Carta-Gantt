// ═══════════════════════════════════════════════════════════════════
// Risk Analysis Types – Monte Carlo Simulation
// Inspired by Oracle Primavera Risk Analysis (Pertmaster)
// ═══════════════════════════════════════════════════════════════════

// ─── Qualitative Scoring ────────────────────────────────────────
/** Impact / Probability level  (Very Low → Very High) */
export type ImpactLevel = 'VL' | 'L' | 'M' | 'H' | 'VH';

export const IMPACT_LABELS: Record<ImpactLevel, string> = {
  VL: 'Muy Bajo', L: 'Bajo', M: 'Medio', H: 'Alto', VH: 'Muy Alto',
};

/** Numeric weight per level for matrix score */
export const IMPACT_WEIGHT: Record<ImpactLevel, number> = {
  VL: 1, L: 2, M: 4, H: 8, VH: 16,
};

export const PROB_RANGES: Record<ImpactLevel, string> = {
  VL: '1-10%', L: '11-30%', M: '31-50%', H: '51-70%', VH: '71-99%',
};

export type ThreatOrOpportunity = 'threat' | 'opportunity';
export type RiskStatus = 'proposed' | 'open' | 'closed' | 'mitigated';
export type MitigationResponse = 'accept' | 'mitigate' | 'transfer' | 'avoid' | 'exploit' | 'enhance';

/** Qualitative scoring for one dimension */
export interface QualitativeScore {
  probability: ImpactLevel;
  schedule: ImpactLevel;
  cost: ImpactLevel;
  performance: ImpactLevel;
}

// ─── Quantitative / Distribution Types ──────────────────────────
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

/** Per-task impact for a quantitative risk driver */
export interface RiskTaskImpact {
  taskId: string;
  /** Schedule impact distribution */
  scheduleShape: DistributionType;
  scheduleMin?: number;
  scheduleLikely?: number;
  scheduleMax?: number;
  /** Cost impact distribution */
  costShape: DistributionType;
  costMin?: number;
  costLikely?: number;
  costMax?: number;
  /** Correlate schedule & cost */
  correlate: boolean;
  /** Use impact ranges (checkbox) */
  impactRanges: boolean;
  /** Model as discrete event existence */
  eventExistence: boolean;
}

/** Risk event categories */
export type RiskCategory =
  | 'Técnico' | 'Externo' | 'Organizacional' | 'Gestión'
  | 'Clima' | 'Suministro' | 'Regulatorio' | 'Diseño'
  | 'Subcontrato' | 'Otro';

/** A discrete risk event (full P6-style) */
export interface RiskEvent {
  id: string;
  name: string;
  description: string;
  cause: string;
  effect: string;
  /** Threat or Opportunity */
  threatOrOpportunity: ThreatOrOpportunity;
  /** Status */
  status: RiskStatus;
  /** Category */
  category: RiskCategory;
  /** Owner / responsible */
  owner: string;
  notes: string;

  // ── Qualitative Assessment ──
  /** Pre-mitigation qualitative scores */
  preMitigation: QualitativeScore;
  /** Post-mitigation qualitative scores */
  postMitigation: QualitativeScore;
  /** Mitigation response strategy */
  mitigationResponse: MitigationResponse;
  /** Mitigation title / description */
  mitigationTitle: string;
  /** Mitigation cost */
  mitigationCost: number;

  // ── Quantitative Assessment ──
  /** Quantified risk (show in quantitative analysis) */
  quantified: boolean;
  /** Overall probability for MC simulation (0-100%) */
  probability: number;
  /** Per-task impact definitions (risk drivers) */
  taskImpacts: RiskTaskImpact[];

  // ── Legacy compat ──
  /** Affected activity IDs (derived from taskImpacts) */
  affectedActivityIds: string[];
  /** Simple impact type (legacy fallback) */
  impactType: 'addDays' | 'multiply';
  /** Simple impact value (legacy fallback) */
  impactValue: number;
  mitigated: boolean;
  mitigatedProbability?: number;
  mitigatedImpactValue?: number;

  // ── Dates ──
  startDate?: string;
  endDate?: string;
  /** RBS (Risk Breakdown Structure) code */
  rbs?: string;
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
  /** Duration distributions per activity (inherent uncertainty) */
  distributions: Record<string, DurationDistribution>;
  /** Risk events register (qualitative + quantitative) */
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

/** Default qualitative score (medium across the board) */
export const DEFAULT_QUALITATIVE: QualitativeScore = {
  probability: 'M', schedule: 'M', cost: 'M', performance: 'M',
};

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

/** Compute qualitative score  (probability weight × max impact weight) */
export function computeQualScore(qs: QualitativeScore): number {
  const pW = IMPACT_WEIGHT[qs.probability];
  const maxI = Math.max(IMPACT_WEIGHT[qs.schedule], IMPACT_WEIGHT[qs.cost], IMPACT_WEIGHT[qs.performance]);
  return pW * maxI;
}

/** Score → color */
export function scoreColor(score: number): string {
  if (score >= 64) return '#ef4444';   // Very High (red)
  if (score >= 32) return '#f97316';   // High (orange)
  if (score >= 16) return '#f59e0b';   // Medium (yellow-amber)
  if (score >= 4) return '#22c55e';    // Low (green)
  return '#3b82f6';                    // Very Low (blue)
}

/** Score → label */
export function scoreLabel(score: number): string {
  if (score >= 64) return 'Muy Alto';
  if (score >= 32) return 'Alto';
  if (score >= 16) return 'Medio';
  if (score >= 4) return 'Bajo';
  return 'Muy Bajo';
}

/** Create a new blank RiskEvent */
export function createBlankRiskEvent(partial?: Partial<RiskEvent>): RiskEvent {
  return {
    id: 'risk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
    name: '',
    description: '',
    cause: '',
    effect: '',
    threatOrOpportunity: 'threat',
    status: 'proposed',
    category: 'Otro',
    owner: '',
    notes: '',
    preMitigation: { ...DEFAULT_QUALITATIVE },
    postMitigation: { ...DEFAULT_QUALITATIVE },
    mitigationResponse: 'accept',
    mitigationTitle: '',
    mitigationCost: 0,
    quantified: false,
    probability: 50,
    taskImpacts: [],
    affectedActivityIds: [],
    impactType: 'addDays',
    impactValue: 5,
    mitigated: false,
    mitigatedProbability: undefined,
    mitigatedImpactValue: undefined,
    startDate: undefined,
    endDate: undefined,
    rbs: '',
    ...partial,
  };
}
