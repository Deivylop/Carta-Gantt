// ═══════════════════════════════════════════════════════════════════
// Monte Carlo Simulation Engine – Pure utility functions
// Runs N iterations: vary durations per distribution → run CPM → collect stats
// ═══════════════════════════════════════════════════════════════════
import type { Activity, CalendarType, CustomCalendar } from '../types/gantt';
import type {
  DurationDistribution, RiskEvent, SimulationParams,
  IterationResult, SimulationResult, HistogramBin, RiskTaskImpact,
} from '../types/risk';
import { deepCloneActivities } from './whatIfEngine';
import { calcCPM, isoDate, calWorkDays } from './cpm';
import { computeOutlineNumbers } from './helpers';

// ─── Seeded PRNG (Mulberry32) ───────────────────────────────────
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Distribution Sampling ──────────────────────────────────────

/** Sample a single duration from a distribution */
export function sampleDuration(dist: DurationDistribution, rng: () => number): number {
  switch (dist.type) {
    case 'triangular': {
      const a = dist.min ?? 1;
      const c = dist.mostLikely ?? a;
      const b = dist.max ?? c;
      if (b <= a) return c;
      const u = rng();
      const fc = (c - a) / (b - a);
      if (u < fc) {
        return a + Math.sqrt(u * (b - a) * (c - a));
      } else {
        return b - Math.sqrt((1 - u) * (b - a) * (b - c));
      }
    }

    case 'betaPERT': {
      const a = dist.min ?? 1;
      const c = dist.mostLikely ?? a;
      const b = dist.max ?? c;
      if (b <= a) return c;
      const lambda = 4;
      const mu = (a + lambda * c + b) / (lambda + 2);
      const alpha = ((mu - a) * (2 * c - a - b)) / ((c - mu) * (b - a));
      const beta = alpha * (b - mu) / (mu - a);
      // Sample from Beta(alpha, beta) using Jöhnk's algorithm or rejection
      const aP = Math.max(alpha, 0.5);
      const bP = Math.max(beta, 0.5);
      const betaSample = sampleBeta(aP, bP, rng);
      return a + betaSample * (b - a);
    }

    case 'uniform': {
      const a = dist.min ?? 1;
      const b = dist.max ?? a;
      return a + rng() * (b - a);
    }

    case 'none':
    default:
      return -1; // signal: use deterministic
  }
}

/** Sample from Beta(a, b) using gamma variates */
function sampleBeta(a: number, b: number, rng: () => number): number {
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  return x / (x + y);
}

/** Sample from Gamma(shape, 1) using Marsaglia & Tsang's method */
function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normalSample(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Standard normal sample via Box-Muller */
function normalSample(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

// ─── Single Iteration ───────────────────────────────────────────

export function runIteration(
  masterActivities: Activity[],
  distributions: Record<string, DurationDistribution>,
  riskEvents: RiskEvent[],
  useMitigated: boolean,
  projStart: Date,
  defCal: CalendarType,
  statusDate: Date | null,
  projName: string,
  activeBaselineIdx: number,
  customCalendars: CustomCalendar[],
  rng: () => number,
): IterationResult {
  // 1. Deep clone
  const acts = deepCloneActivities(masterActivities);
  const sampledDurations: Record<string, number> = {};

  // 2. Apply duration distributions
  for (const a of acts) {
    if (a._isProjRow || a.type === 'summary') continue;
    const dist = distributions[a.id];
    if (!dist || dist.type === 'none') {
      sampledDurations[a.id] = a.dur;
      continue;
    }
    const sampled = sampleDuration(dist, rng);
    if (sampled < 0) {
      sampledDurations[a.id] = a.dur;
      continue;
    }

    const newDur = Math.max(1, Math.round(sampled));
    // If activity has progress, only vary remaining portion
    if ((a.pct || 0) > 0 && (a.pct || 0) < 100) {
      const pctDone = (a.pct || 0) / 100;
      const newRemDur = Math.max(1, Math.round(newDur * (1 - pctDone)));
      a.remDur = newRemDur;
      a.dur = Math.round(newDur);
    } else if ((a.pct || 0) >= 100) {
      // Already completed, don't vary
      sampledDurations[a.id] = a.dur;
      continue;
    } else {
      a.dur = newDur;
      a.remDur = newDur;
    }
    sampledDurations[a.id] = newDur;
  }

  // 3. Apply risk events (new P6-style risk drivers + legacy fallback)
  for (const risk of riskEvents) {
    // Determine effective probability
    const prob = useMitigated && risk.mitigated
      ? (risk.mitigatedProbability ?? risk.probability)
      : risk.probability;

    if (rng() * 100 >= prob) continue; // risk not triggered

    // ── New: Per-task impact distributions (quantified risk drivers) ──
    if (risk.quantified && risk.taskImpacts && risk.taskImpacts.length > 0) {
      for (const ti of risk.taskImpacts) {
        const act = acts.find(a => a.id === ti.taskId);
        if (!act || act._isProjRow || act.type === 'summary') continue;
        if ((act.pct || 0) >= 100) continue;

        // Sample schedule impact
        if (ti.scheduleShape && ti.scheduleShape !== 'none') {
          const schDist: DurationDistribution = {
            type: ti.scheduleShape,
            min: ti.scheduleMin,
            mostLikely: ti.scheduleLikely,
            max: ti.scheduleMax,
          };
          const sampledDays = sampleDuration(schDist, rng);
          if (sampledDays > 0) {
            const addDays = Math.max(0, Math.round(sampledDays));
            act.dur = Math.max(1, (act.dur || 0) + addDays);
            if (act.remDur != null) act.remDur = Math.max(1, (act.remDur || 0) + addDays);
            sampledDurations[ti.taskId] = act.dur;
          }
        }
      }
    } else {
      // ── Legacy fallback: simple addDays / multiply for all affected activities ──
      const impact = useMitigated && risk.mitigated
        ? (risk.mitigatedImpactValue ?? risk.impactValue)
        : risk.impactValue;

      for (const actId of risk.affectedActivityIds) {
        const act = acts.find(a => a.id === actId);
        if (!act || act._isProjRow || act.type === 'summary') continue;
        if ((act.pct || 0) >= 100) continue;

        if (risk.impactType === 'addDays') {
          const add = Math.max(0, Math.round(impact));
          act.dur = (act.dur || 0) + add;
          if (act.remDur != null) act.remDur = (act.remDur || 0) + add;
        } else {
          // multiply
          const factor = Math.max(0.1, impact);
          act.dur = Math.max(1, Math.round((act.dur || 1) * factor));
          if (act.remDur != null) act.remDur = Math.max(1, Math.round((act.remDur || 1) * factor));
        }
        sampledDurations[actId] = act.dur;
      }
    }
  }

  // 4. Run CPM
  const result = calcCPM(acts, projStart, defCal, statusDate, projName, activeBaselineIdx, customCalendars);
  computeOutlineNumbers(result.activities);

  // 5. Extract results
  const projRow = result.activities.find(a => a._isProjRow);
  const critIds: string[] = [];
  let maxEF: Date | null = null;
  for (const a of result.activities) {
    if (a._isProjRow || a.type === 'summary') continue;
    if (a.crit) critIds.push(a.id);
    if (a.EF && (!maxEF || a.EF > maxEF)) maxEF = a.EF;
  }

  const finishDate = projRow?.EF || maxEF || projStart;
  const projectDuration = calWorkDays(projStart, finishDate, defCal);

  return {
    finishDate: finishDate.toISOString(),
    projectDuration,
    criticalActivityIds: critIds,
    sampledDurations,
  };
}

// ─── Full Simulation ────────────────────────────────────────────

export function runSimulation(
  params: SimulationParams,
  masterActivities: Activity[],
  distributions: Record<string, DurationDistribution>,
  riskEvents: RiskEvent[],
  projStart: Date,
  defCal: CalendarType,
  statusDate: Date | null,
  projName: string,
  activeBaselineIdx: number,
  customCalendars: CustomCalendar[],
  onProgress?: (pct: number) => void,
): SimulationResult {
  const seed = params.seed ?? Math.floor(Math.random() * 2147483647);
  const rng = seededRandom(seed);
  const N = params.iterations;

  // Run deterministic CPM first
  const detActs = deepCloneActivities(masterActivities);
  const detResult = calcCPM(detActs, projStart, defCal, statusDate, projName, activeBaselineIdx, customCalendars);
  const detProjRow = detResult.activities.find(a => a._isProjRow);
  let detMaxEF: Date | null = null;
  for (const a of detResult.activities) {
    if (a._isProjRow || a.type === 'summary') continue;
    if (a.EF && (!detMaxEF || a.EF > detMaxEF)) detMaxEF = a.EF;
  }
  const detFinish = detProjRow?.EF || detMaxEF || projStart;
  const detDuration = calWorkDays(projStart, detFinish, defCal);

  // Run iterations
  const iterations: IterationResult[] = [];
  for (let i = 0; i < N; i++) {
    const iter = runIteration(
      masterActivities, distributions, riskEvents, params.useMitigated,
      projStart, defCal, statusDate, projName, activeBaselineIdx, customCalendars, rng,
    );
    iterations.push(iter);
    if (onProgress && i % 50 === 0) {
      onProgress(Math.round((i / N) * 100));
    }
  }
  if (onProgress) onProgress(100);

  // Compute statistics
  const stats = computeStatistics(iterations, params.confidenceLevels, detFinish, detDuration, projStart, defCal);

  const id = 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  return {
    id,
    name: `Simulación ${new Date().toLocaleDateString('es-CL')}`,
    runAt: new Date().toISOString(),
    params: { ...params, seed },
    completedIterations: N,
    deterministicDuration: detDuration,
    deterministicFinish: detFinish.toISOString(),
    ...stats,
    distributionsSnapshot: { ...distributions },
    riskEventsSnapshot: riskEvents.map(r => ({ ...r })),
  };
}

// ─── Statistics ─────────────────────────────────────────────────

function computeStatistics(
  iterations: IterationResult[],
  confidenceLevels: number[],
  _detFinish: Date,
  _detDuration: number,
  projStart: Date,
  defCal: CalendarType,
): Omit<SimulationResult, 'id' | 'name' | 'runAt' | 'params' | 'completedIterations' | 'deterministicDuration' | 'deterministicFinish' | 'distributionsSnapshot' | 'riskEventsSnapshot'> {
  const N = iterations.length;
  const durations = iterations.map(it => it.projectDuration).sort((a, b) => a - b);
  const dates = iterations.map(it => it.finishDate).sort();

  // Mean / StdDev
  const sum = durations.reduce((s, d) => s + d, 0);
  const mean = sum / N;
  const variance = durations.reduce((s, d) => s + (d - mean) ** 2, 0) / N;
  const stdDev = Math.sqrt(variance);

  // Percentiles
  const durationPercentiles: Record<number, number> = {};
  const datePercentiles: Record<number, string> = {};
  for (const p of confidenceLevels) {
    const idx = Math.min(Math.floor((p / 100) * N), N - 1);
    durationPercentiles[p] = durations[idx];
    datePercentiles[p] = dates[idx];
  }

  // Criticality Index: % of iterations each activity was critical
  const critCount: Record<string, number> = {};
  for (const iter of iterations) {
    for (const id of iter.criticalActivityIds) {
      critCount[id] = (critCount[id] || 0) + 1;
    }
  }
  const criticalityIndex: Record<string, number> = {};
  for (const [id, count] of Object.entries(critCount)) {
    criticalityIndex[id] = Math.round((count / N) * 1000) / 10; // one decimal
  }

  // Sensitivity Index: Spearman rank correlation
  const sensitivityIndex = computeSensitivity(iterations, durations);

  // Histogram (20 bins)
  const histogram = buildHistogram(durations, 20);

  return {
    meanDuration: Math.round(mean * 10) / 10,
    stdDevDuration: Math.round(stdDev * 10) / 10,
    durationPercentiles,
    datePercentiles,
    criticalityIndex,
    sensitivityIndex,
    histogram,
  };
}

/** Spearman rank correlation between each activity's sampled duration and project duration */
function computeSensitivity(iterations: IterationResult[], projectDurations: number[]): Record<string, number> {
  const N = iterations.length;
  if (N < 3) return {};

  // Collect all activity IDs
  const actIds = new Set<string>();
  for (const iter of iterations) {
    for (const id of Object.keys(iter.sampledDurations)) actIds.add(id);
  }

  // Rank the project durations
  const projRanks = rank(projectDurations);
  const result: Record<string, number> = {};

  for (const actId of actIds) {
    const values: number[] = [];
    for (let i = 0; i < N; i++) {
      values.push(iterations[i].sampledDurations[actId] ?? 0);
    }
    // Check if all the same (no variation)
    const allSame = values.every(v => v === values[0]);
    if (allSame) continue;

    const actRanks = rank(values);
    const rho = spearmanCorrelation(actRanks, projRanks);
    if (Math.abs(rho) > 0.01) {
      result[actId] = Math.round(rho * 1000) / 1000;
    }
  }

  return result;
}

function rank(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2;
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i] - mx;
    const yi = y[i] - my;
    num += xi * yi;
    dx += xi * xi;
    dy += yi * yi;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

function buildHistogram(values: number[], binCount: number): HistogramBin[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {
    return [{ binStart: min, binEnd: max + 1, count: values.length, cumPct: 100 }];
  }
  const binWidth = (max - min) / binCount;
  const bins: HistogramBin[] = [];
  let cumCount = 0;
  for (let i = 0; i < binCount; i++) {
    const bs = min + i * binWidth;
    const be = i < binCount - 1 ? bs + binWidth : max + 0.001;
    const count = sorted.filter(v => v >= bs && v < be).length;
    cumCount += count;
    bins.push({
      binStart: Math.round(bs * 10) / 10,
      binEnd: Math.round(be * 10) / 10,
      count,
      cumPct: Math.round((cumCount / values.length) * 1000) / 10,
    });
  }
  return bins;
}
