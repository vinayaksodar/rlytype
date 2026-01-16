export type Stage = "unigram" | "bigram" | "trigram";
export type LearningMode = "reinforced" | "sequential";

export const BATCH_SIZE = 10;

export interface PatternStat {
  id: string;
  attempts: number;
  errors: number;
  ewmaLatency: number;
}

export interface EngineState {
  words: string[];
  activeWordIndex: number;
  activeCharIndex: number;
  typedSoFar: string;
  isError: boolean;
  stats: {
    wpm: number;
    accuracy: number;
    sessionTime: number;
    topBottleneck: string;
    currentPattern: string;
  };
  progression: {
    currentStage: Stage;
    learningMode: LearningMode;
    mastery: Record<Stage, number>; // 0-100 percentage
  };
  meta: {
    targetWpm: number;
    learningMode: string;
  };
  isLoaded: boolean;
}

export interface UserConfig {
  targetLatency: number;
}
