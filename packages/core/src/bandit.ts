import { PatternStat, UserConfig, PatternId } from "@rlytype/types";

// Box-Muller transform for normal distribution sampling
function sampleNormal(mean: number, variance: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * Math.sqrt(variance) + mean;
}

function timeBoostFunc(deltaMs: number): number {
  // Linearly or log increase with time
  // e.g. boost 1 point per minute
  return deltaMs / 60000;
}

const LOW_VAR_THRESHOLD = 400; // ms^2, implies std dev 20ms

export function calculatePatternScore(
  p: PatternStat,
  config: UserConfig,
  deterministic = false
): number {
  const sampleLatency = deterministic ? p.ewmaLatency : sampleNormal(p.ewmaLatency, p.ewmaVariance);

  // 3. Weakness (Gap)
  const gap = Math.max(0, sampleLatency - config.targetLatency);

  // 4. Time Decay
  const timeBoost = timeBoostFunc(Date.now() - p.lastSeen);

  // 5. Mastery Detection
  // Confident (low variance) and High Success Rate
  const totalEvidence = p.errorAlpha + p.errorBeta;
  const successRate = p.errorAlpha / totalEvidence;
  const isMastered =
    totalEvidence > 10 &&
    successRate > 0.98 && // < 2% error
    p.ewmaVariance < LOW_VAR_THRESHOLD;

  const masteryPenalty = isMastered ? 1000 : 0;

  const errorRate = p.errorBeta / (p.errorAlpha + p.errorBeta);

  return (
    config.w_unc * Math.sqrt(p.ewmaVariance) +
    config.w_weak * gap +
    config.w_time * timeBoost +
    config.w_error * errorRate * 100 -
    masteryPenalty
  );
}

export function selectTopPatterns(allStats: PatternStat[], config: UserConfig, k = 3): PatternId[] {
  const candidates = allStats.map((p) => ({
    id: p.id,
    score: calculatePatternScore(p, config, false), // Use stochastic for selection
  }));

  // Sort descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, k).map((c) => c.id);
}

export interface ScoredPattern {
  id: PatternId;
  score: number;
  stat: PatternStat;
}

export function getPatternScores(
  allStats: PatternStat[],
  config: UserConfig,
  deterministic = true
): ScoredPattern[] {
  const candidates = allStats.map((p) => ({
    id: p.id,
    score: calculatePatternScore(p, config, deterministic),
    stat: p,
  }));
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
