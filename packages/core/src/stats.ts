import { PatternStat, UserConfig } from "@rlytype/types";

export const LOW_VAR_THRESHOLD = 400; // ms^2, implies std dev 20ms

export function isPatternMastered(p: PatternStat, targetLatency: number): boolean {
  const totalEvidence = p.errorAlpha + p.errorBeta;
  const successRate = p.errorAlpha / totalEvidence;

  // Criteria:
  // 1. Enough samples (> 10)
  // 2. High Success Rate (> 98%)
  // 3. Stable (Low Variance)
  // 4. Fast (EWMA Latency <= Target) -- Added this check explicitly for helper utility

  return (
    totalEvidence > 10 &&
    successRate > 0.98 &&
    p.ewmaVariance < LOW_VAR_THRESHOLD &&
    p.ewmaLatency <= targetLatency
  );
}

export function calculateMasteryScore(stat: PatternStat, targetLatency: number): number {
  const totalSamples = stat.errorAlpha + stat.errorBeta;
  const accuracy = totalSamples > 0 ? stat.errorAlpha / totalSamples : 1.0;
  const speedFactor = Math.min(1, targetLatency / Math.max(1, stat.ewmaLatency));
  return Math.round(speedFactor * accuracy * 100);
}

const EWMA_ALPHA = 0.15; // Default if not in config, though we usually pass config

export function createInitialStat(id: string): PatternStat {
  return {
    id,
    n: 0,
    ewmaLatency: 300, // conservative start
    ewmaVariance: 1000,
    errorAlpha: 1, // Beta(1,1) is uniform prior
    errorBeta: 1,
    lastSeen: 0,
    trend: 0,
  };
}

export function updatePatternStat(
  stat: PatternStat,
  latency: number,
  isError: boolean,
  _config?: Partial<UserConfig>
): PatternStat {
  const newStat = { ...stat };
  newStat.n += 1;
  newStat.lastSeen = Date.now();

  if (isError) {
    newStat.errorBeta += 1;
  } else {
    newStat.errorAlpha += 1;

    // Update Latency EWMA
    const delta = latency - newStat.ewmaLatency;
    newStat.ewmaLatency += EWMA_ALPHA * delta;

    // Update Variance EWMA
    // Var(t) = (1-a)*Var(t-1) + a*(delta^2)
    newStat.ewmaVariance = (1 - EWMA_ALPHA) * newStat.ewmaVariance + EWMA_ALPHA * (delta * delta);

    // Update Trend (derivative of EWMA)
    // Positive trend means getting slower
    newStat.trend = (1 - EWMA_ALPHA) * newStat.trend + EWMA_ALPHA * delta;
  }

  return newStat;
}
