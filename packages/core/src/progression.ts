import { PatternStat, Stage } from "@rlytype/types";

export function getPatternStage(pattern: string): Stage | null {
  if (pattern.length === 1) return "unigram";
  if (pattern.length === 2) return "bigram";
  if (pattern.length === 3) return "trigram";
  return null;
}

export function calculateStageMastery(
  stats: PatternStat[],
  stage: Stage,
  targetLatency: number,
  totalPossiblePatterns: number
): number {
  if (totalPossiblePatterns === 0) return 0;

  const stageStats = stats.filter((s) => getPatternStage(s.id) === stage);

  // Criteria: Minimum samples (3) and Speed <= Target
  const masteredCount = stageStats.filter(
    (s) => s.attempts >= 3 && s.ewmaLatency <= targetLatency
  ).length;

  return Math.round((masteredCount / totalPossiblePatterns) * 100);
}
