export type PatternId = string; // e.g. "th" or "ing" or "same_finger:jk"

export const BATCH_SIZE = 10;

export interface PatternStat {
  id: PatternId;
  n: number; // Total samples
  ewmaLatency: number; // in ms
  ewmaVariance: number;
  errorAlpha: number; // beta prior alpha (successes)
  errorBeta: number; // beta prior beta (failures)
  lastSeen: number; // timestamp
  trend: number; // short-term EWMA slope
}

export interface WordCandidate {
  word: string;
  // Specific patterns this word was chosen to target
  targetMatches: Array<{ pattern: PatternId; startIndex: number }>;
  isFlowWord: boolean; // True if this is a "palate cleanser" word
}

export interface UserConfig {
  targetLatency: number;
  w_unc: number;
  w_weak: number;
  w_time: number;
  w_fatigue: number;
  w_error: number;
}
