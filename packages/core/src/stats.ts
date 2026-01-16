import { PatternStat } from "@rlytype/types";

export function isPatternMastered(stat: PatternStat, targetLatency: number): boolean {
  if (stat.attempts < 20) return false;

  const errorRate = stat.errors / stat.attempts;

  return (
    errorRate <= 0.02 && // ≤ 2% errors
    stat.ewmaLatency <= targetLatency // fast enough
  );
}

export function calculateMasteryScore(stat: PatternStat, targetLatency: number): number {
  if (stat.attempts === 0) return 0;

  const accuracy = 1 - stat.errors / stat.attempts;
  const speed = Math.min(1, targetLatency / stat.ewmaLatency);

  return Math.round(accuracy * speed * 100);
}

const EWMA_ALPHA = 0.15;

export function updatePatternStat(
  stat: PatternStat,
  latency: number,
  isError: boolean
): PatternStat {
  const next = { ...stat };
  next.attempts += 1;

  if (isError) {
    next.errors += 1;
    return next;
  }

  const delta = latency - next.ewmaLatency;
  next.ewmaLatency += EWMA_ALPHA * delta;

  return next;
}

export function createInitialStat(id: string): PatternStat {
  return {
    id,
    attempts: 0,
    errors: 0,
    ewmaLatency: 300, // neutral starting guess
  };
}
