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

/** Numeric weight per level for matrix score (defaults – overridden by RiskScoringConfig) */
export const IMPACT_WEIGHT: Record<ImpactLevel, number> = {
  VL: 1, L: 2, M: 4, H: 8, VH: 16,
};

export const PROB_RANGES: Record<ImpactLevel, string> = {
  VL: '1-10%', L: '11-30%', M: '31-50%', H: '51-70%', VH: '71-99%',
};

// ─── Customizable Risk Scoring Configuration ────────────────────

/** A single level in a probability or impact scale */
export interface ScaleLevel {
  key: ImpactLevel;
  label: string;         // Display name (e.g. 'Very High', 'Muy Alto')
  weight: number;        // Numeric weight for score calculation
  threshold: string;     // Threshold description (e.g. '>70%', '>20 days')
}

/** An impact type (dimension) with its own scale thresholds */
export interface ImpactType {
  id: string;            // e.g. 'schedule', 'cost', 'performance'
  label: string;         // e.g. 'Programa', 'Costo', 'Desempeño'
  scored: boolean;       // Whether this type is scored (checkbox in P6)
  levels: Record<ImpactLevel, string>;  // Threshold labels per level
}

/** Tolerance band for color-coding the matrix */
export interface ToleranceLevel {
  label: string;
  color: string;
  minScore: number;      // score >= minScore → this band
}

/** How the PID score is computed from multiple impact dimensions */
export type PIDScoreMode = 'highest' | 'average_impacts' | 'average_scores';

/** Complete Risk Scoring Configuration – stored per project */
export interface RiskScoringConfig {
  /** Probability scale (5 levels with weights & thresholds) */
  probabilityScale: ScaleLevel[];
  /** Impact types / dimensions (Schedule, Cost, Performance, etc.) */
  impactTypes: ImpactType[];
  /** Tolerance scale for matrix cell coloring */
  toleranceLevels: ToleranceLevel[];
  /** How PID score is calculated */
  pidScoreMode: PIDScoreMode;
}

/** Default probability scale (P6-style) */
export const DEFAULT_PROBABILITY_SCALE: ScaleLevel[] = [
  { key: 'VH', label: 'Muy Alto', weight: 16, threshold: '>70%' },
  { key: 'H',  label: 'Alto',     weight: 8,  threshold: '>50%' },
  { key: 'M',  label: 'Medio',    weight: 4,  threshold: '>30%' },
  { key: 'L',  label: 'Bajo',     weight: 2,  threshold: '>10%' },
  { key: 'VL', label: 'Muy Bajo', weight: 1,  threshold: '<=10%' },
];

/** Default impact types (P6-style: Schedule, Cost, Performance) */
export const DEFAULT_IMPACT_TYPES: ImpactType[] = [
  {
    id: 'schedule', label: 'Programa', scored: true,
    levels: { VL: '<=5', L: '>5', M: '>10', H: '>20', VH: '>40' },
  },
  {
    id: 'cost', label: 'Costo', scored: true,
    levels: { VL: '<=$30.000', L: '>$30.000', M: '>$75.000', H: '>$150.000', VH: '>$600.000' },
  },
  {
    id: 'performance', label: 'Desempeño', scored: false,
    levels: {
      VL: 'Falla menor en aceptación',
      L: 'Falla en más de un criterio menor',
      M: 'Déficit en cumplir criterios de aceptación',
      H: 'Déficit significativo en aceptación',
      VH: 'Falla en cumplir criterios de aceptación',
    },
  },
];

/** Default tolerance levels (3 bands: Low / Medium / High) */
export const DEFAULT_TOLERANCE_LEVELS: ToleranceLevel[] = [
  { label: 'Alto',   color: '#ef4444', minScore: 24 },  // >23
  { label: 'Medio',  color: '#f59e0b', minScore: 6 },   // >5
  { label: 'Bajo',   color: '#22c55e', minScore: 0 },   // <=5
];

/** Default Risk Scoring Configuration */
export const DEFAULT_RISK_SCORING: RiskScoringConfig = {
  probabilityScale: DEFAULT_PROBABILITY_SCALE,
  impactTypes: DEFAULT_IMPACT_TYPES,
  toleranceLevels: DEFAULT_TOLERANCE_LEVELS,
  pidScoreMode: 'highest',
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
  /** User-visible code (e.g. R001, RSK-05) */
  code: string;
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
  /** Per-activity finish dates after CPM recalc (ISO) */
  activityFinishDates: Record<string, string>;
  /** Per-activity start dates after CPM recalc (ISO) */
  activityStartDates: Record<string, string>;
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

  /** Per-activity percentiles (finish dates & durations at each confidence level) */
  activityPercentiles: Record<string, {
    deterministicFinish: string;
    deterministicStart: string;
    deterministicDuration: number;
    datePercentiles: Record<number, string>;
    startDatePercentiles: Record<number, string>;
    durationPercentiles: Record<number, number>;
  }>;

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
  /** Customizable risk scoring scales (stored per project) */
  riskScoring: RiskScoringConfig;
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
  riskScoring: { ...DEFAULT_RISK_SCORING },
};

/** Build weight lookup from config (probability or impact) */
function buildWeightMap(cfg?: RiskScoringConfig): Record<ImpactLevel, number> {
  if (!cfg) return IMPACT_WEIGHT;
  const map: Record<string, number> = {};
  for (const s of cfg.probabilityScale) map[s.key] = s.weight;
  return map as Record<ImpactLevel, number>;
}

/** Compute qualitative score using config-based weights & PID mode */
export function computeQualScore(qs: QualitativeScore, cfg?: RiskScoringConfig): number {
  const wMap = buildWeightMap(cfg);
  const pW = wMap[qs.probability] ?? IMPACT_WEIGHT[qs.probability];

  // Determine which impact dimensions are scored
  const impactTypes = cfg?.impactTypes ?? DEFAULT_IMPACT_TYPES;
  const scoredDims = impactTypes.filter(t => t.scored);
  // Map dimension id → QualitativeScore key
  const dimKey = (id: string): keyof QualitativeScore =>
    id === 'schedule' ? 'schedule' : id === 'cost' ? 'cost' : 'performance';

  if (scoredDims.length === 0) return 0;

  const mode: PIDScoreMode = cfg?.pidScoreMode ?? 'highest';
  const impactWeights = scoredDims.map(d => wMap[qs[dimKey(d.id)]] ?? IMPACT_WEIGHT[qs[dimKey(d.id)]]);

  let impactVal: number;
  if (mode === 'highest') {
    impactVal = Math.max(...impactWeights);
  } else if (mode === 'average_impacts') {
    impactVal = impactWeights.reduce((a, b) => a + b, 0) / impactWeights.length;
  } else {
    // average_scores: average of individual P×I scores
    const scores = impactWeights.map(iw => pW * iw);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  return Math.round(pW * impactVal);
}

/** Score → color using tolerance levels */
export function scoreColor(score: number, cfg?: RiskScoringConfig): string {
  const tols = cfg?.toleranceLevels ?? DEFAULT_TOLERANCE_LEVELS;
  // Tolerance levels are sorted high→low by minScore
  const sorted = [...tols].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (score >= t.minScore) return t.color;
  }
  return '#3b82f6';
}

/** Score → label using tolerance levels */
export function scoreLabel(score: number, cfg?: RiskScoringConfig): string {
  const tols = cfg?.toleranceLevels ?? DEFAULT_TOLERANCE_LEVELS;
  const sorted = [...tols].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (score >= t.minScore) return t.label;
  }
  return 'Muy Bajo';
}

/** Create a new blank RiskEvent */
export function createBlankRiskEvent(partial?: Partial<RiskEvent>): RiskEvent {
  return {
    id: 'risk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
    code: 'R' + String(Math.floor(Math.random() * 900) + 100),
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
