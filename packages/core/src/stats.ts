import { PatternStat } from "@rlytype/types";

// Separate alphas for speed.
const LATENCY_ALPHA = 0.15;

export function isPatternMastered(stat: PatternStat, targetLatency: number): boolean {
  // Check Speed directly (must be effectively 100% of target)
  const score = calculateMasteryScore(stat, targetLatency);
  return score >= 98;
}

export function calculateMasteryScore(stat: PatternStat, targetLatency: number): number {
  if (stat.attempts === 0) return 0;

  // Speed Score (0 to 100)
  // Mastery is now purely speed-based.
  // We cap speed contribution at 100%.
  const speedRatio = Math.min(1, targetLatency / stat.ewmaLatency);
  const speedScore = speedRatio * 100;

  return Math.max(0, Math.round(speedScore));
}

export function calculateStageMastery(stats: PatternStat[], targetLatency: number): number {
  if (stats.length === 0) return 0;
  const masteredCount = stats.filter((s) => isPatternMastered(s, targetLatency)).length;
  return Math.round((masteredCount / stats.length) * 100);
}

export function updatePatternStat(stat: PatternStat, latency: number): PatternStat {
  const next = { ...stat };
  next.attempts += 1;

  // Update Latency EWMA
  const delta = latency - next.ewmaLatency;
  next.ewmaLatency += LATENCY_ALPHA * delta;

  return next;
}

export function createInitialStat(id: string): PatternStat {
  return {
    id,
    attempts: 0,
    ewmaLatency: 300,
  };
}
