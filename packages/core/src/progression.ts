import { PatternStat, Stage, PatternId } from "@rlytype/types";

export function getPatternStage(id: PatternId): Stage | null {
  if (id.startsWith("same_finger:")) return "bigram";
  if (id.length === 1) return "unigram";
  if (id.length === 2) return "bigram";
  if (id.length === 3) return "trigram";
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
  const masteredCount = stageStats.filter((s) => s.n >= 3 && s.ewmaLatency <= targetLatency).length;

  return Math.round((masteredCount / totalPossiblePatterns) * 100);
}

export function getUnlockStatus(
  stats: PatternStat[],
  targetLatency: number,
  counts: { unigram: number; bigram: number; trigram: number }
): Record<Stage, boolean> {
  const unigramMastery = calculateStageMastery(stats, "unigram", targetLatency, counts.unigram);
  const bigramMastery = calculateStageMastery(stats, "bigram", targetLatency, counts.bigram);

  return {
    unigram: true, // Always unlocked
    bigram: unigramMastery >= 85,
    trigram: unigramMastery >= 85 && bigramMastery >= 85,
  };
}
