import { PatternStat, UserConfig } from "@rlytype/types";

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
