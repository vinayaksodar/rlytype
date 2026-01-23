export type Stage = "unigram" | "bigram" | "trigram";
export type LearningMode = "reinforced" | "sequential";

export const BATCH_SIZE = 10;

export interface PatternStat {
  id: string;
  attempts: number;
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
    stageMastery: Record<Stage, number>; // 0-100 percentage
  };
  meta: {
    targetWpm: number;
    learningMode: LearningMode;
    currentStage: Stage;
    language: string;
  };
  isLoaded: boolean;
}

export interface UserConfig {
  targetWpm: number;
  learningMode: LearningMode;
  currentStage: Stage;
  language: string;
}
