import { PatternStat, UserConfig, PatternId, Stage } from "@rlytype/types";
import { getPatternStage } from "./progression";

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

export function calculatePatternScore(
  p: PatternStat,
  config: UserConfig,
  deterministic = false,
  includeTimeBoost = true
): number {
  const sampleLatency = deterministic ? p.ewmaLatency : sampleNormal(p.ewmaLatency, p.ewmaVariance);

  // Leniancy for biomechanically difficult patterns (Same Finger Jumps)
  // We discount their latency by 15% because they are naturally slower.
  let adjustedLatency = sampleLatency;
  if (p.id.startsWith("same_finger:")) {
    adjustedLatency *= 0.85;
  }

  // 3. Weakness (Gap)
  const gap = Math.max(0, adjustedLatency - config.targetLatency);

  // 4. Time Decay
  const timeBoost = includeTimeBoost ? timeBoostFunc(Date.now() - p.lastSeen) : 0;

  // 5. Mastery Detection
  // We use the helper but ignore the specific latency check here because 'Gap' handles the latency component of the score.
  // The penalty is specifically for "Confident + Stable + High Accuracy".
  const totalEvidence = p.errorAlpha + p.errorBeta;
  const successRate = p.errorAlpha / totalEvidence;
  const isMasteredStable =
    totalEvidence > 10 && successRate > 0.98 && p.ewmaVariance < LOW_VAR_THRESHOLD;

  const masteryPenalty = isMasteredStable ? 1000 : 0;

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
    score: calculatePatternScore(p, config, false, true), // Bandit selection REQUIRES time boost
  }));

  // Sort descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, k).map((c) => c.id);
}

export function selectNextSequentialPattern(
  allStats: PatternStat[],
  stage: Stage,
  targetLatency: number
): PatternId | null {
  // Filter by stage
  const stageStats = allStats.filter((s) => getPatternStage(s.id) === stage);

  // Filter those that are NOT mastered
  // We drill anything that fails the robust mastery check
  const candidates = stageStats.filter((s) => !isPatternMastered(s, targetLatency));

  if (candidates.length === 0) return null;

  // Sort by "Worst" first (Highest Latency)
  candidates.sort((a, b) => {
    // Sequential mode typically ignores time boost because it's a "fix-it" mode
    const gapA = a.ewmaLatency - targetLatency;
    const gapB = b.ewmaLatency - targetLatency;
    return gapB - gapA; // Descending
  });

  return candidates[0].id;
}

export interface ScoredPattern {
  id: PatternId;
  score: number;
  stat: PatternStat;
}

export function getPatternScores(
  allStats: PatternStat[],
  config: UserConfig,
  deterministic = true,
  includeTimeBoost = false // Default to false for visualizers
): ScoredPattern[] {
  const candidates = allStats.map((p) => ({
    id: p.id,
    score: calculatePatternScore(p, config, deterministic, includeTimeBoost),
    stat: p,
  }));
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
