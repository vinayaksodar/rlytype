import { WordCandidate, PatternStat, UserConfig, PatternId, BATCH_SIZE } from "@rlytype/types";
import { WordIndexer, WordGenerator } from "@rlytype/generator";
import { storage } from "@rlytype/storage";
import {
  updatePatternStat,
  createInitialStat,
  selectTopPatterns,
  getPatternScores,
  ScoredPattern,
  getFinger,
} from "@rlytype/core";

export interface EngineState {
  words: WordCandidate[];
  activeWordIndex: number;
  activeCharIndex: number;
  typedSoFar: string;
  isError: boolean;
  stats: {
    wpm: number;
    accuracy: number; // Percentage
    sessionTime: number; // Seconds
    currentPattern: string; // ID of the pattern currently being targeted
  };
  isLoaded: boolean;
}

type Listener = (state: EngineState) => void;

export class TypingEngine {
  private state: EngineState = {
    words: [],
    activeWordIndex: 0,
    activeCharIndex: 0,
    typedSoFar: "",
    isError: false,
    stats: { wpm: 0, accuracy: 100, sessionTime: 0, currentPattern: "" },
    isLoaded: false,
  };

  private listeners: Listener[] = [];
  private patternStats: Map<PatternId, PatternStat> = new Map();
  private indexer: WordIndexer | null = null;
  private generator: WordGenerator | null = null;
  private config: UserConfig = {
    targetLatency: 200,
    w_unc: 1.0,
    w_weak: 2.0,
    w_time: 1.2,
    w_fatigue: 0,
    w_error: 5.0,
  };

  private lastKeyTime: number = 0;
  private latencyInvalidated: boolean = false;

  // Session Tracking
  private sessionStart: number = 0;
  private totalKeystrokes: number = 0;
  private correctKeystrokes: number = 0;

  // Batch Tracking
  private batchStartTime: number = 0;
  private batchCorrectChars: number = 0;
  private isBatchStarted: boolean = false;

  // Global Stats for Auto-tuning
  private globalAvgLatency: number = 300; // Start conservative

  // Stats Buffer for periodic save
  private dirtyStats: Set<PatternId> = new Set();
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  async init() {
    // Load Words from public folder
    const response = await fetch("/words.json");
    const data = await response.json();
    const wordList = data.words;

    this.indexer = new WordIndexer(wordList);
    this.generator = new WordGenerator(this.indexer);

    await storage.init();
    const loadedStats = await storage.loadAllPatternStats();
    loadedStats.forEach((s) => this.patternStats.set(s.id, s));

    // Generate initial batch
    this.generateMoreWords();
    this.updateCurrentPattern();

    this.state.isLoaded = true;
    this.sessionStart = Date.now();
    this.batchStartTime = Date.now();
    this.notify();

    // Auto-save loop
    this.saveInterval = setInterval(() => {
      this.saveDirtyStats();
      this.updateSessionStats();
    }, 1000);
  }

  private updateSessionStats() {
    if (!this.sessionStart) return;
    const now = Date.now();
    // WPM is now calculated per batch in checkBatchWpm() to avoid idle decay

    if (this.totalKeystrokes > 0) {
      this.state.stats.accuracy = Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100);
    }

    this.state.stats.sessionTime = Math.floor((now - this.sessionStart) / 1000);
    this.notify();
  }

  private checkBatchWpm() {
    // If we just started a new batch (index is multiple of BATCH_SIZE)
    if (this.state.activeWordIndex > 0 && this.state.activeWordIndex % BATCH_SIZE === 0) {
      const now = Date.now();
      const durationMin = (now - this.batchStartTime) / 60000;
      if (durationMin > 0) {
        this.state.stats.wpm = Math.round(this.batchCorrectChars / 5 / durationMin);
      }
      // Reset for next batch
      this.batchStartTime = 0;
      this.batchCorrectChars = 0;
      this.isBatchStarted = false;
    }
  }

  private updateCurrentPattern() {
    const currentWordObj = this.state.words[this.state.activeWordIndex];
    if (currentWordObj && currentWordObj.targetMatches && currentWordObj.targetMatches.length > 0) {
      this.state.stats.currentPattern = currentWordObj.targetMatches[0].pattern;
    } else {
      this.state.stats.currentPattern = "--";
    }
  }

  stop() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }

  private generateMoreWords() {
    if (!this.generator) return;

    // Bandit logic
    const allStats = Array.from(this.patternStats.values());
    // User Request: "for one set use only one pattern"
    // We select the single top pattern (k=1)
    const topPatterns = selectTopPatterns(allStats, this.config, 1);

    const history = this.state.words.slice(-20).map((w) => w.word);
    const newBatch = this.generator.generateBatch(topPatterns, history, BATCH_SIZE);

    this.state.words = [...this.state.words, ...newBatch];
  }

  private advanceWord(now: number) {
    this.state.activeWordIndex++;
    this.state.activeCharIndex = 0;
    this.state.typedSoFar = "";
    this.lastKeyTime = now;
    this.updateCurrentPattern();
    this.checkBatchWpm();

    // Maintain buffer
    if (this.state.words.length - this.state.activeWordIndex < BATCH_SIZE) {
      this.generateMoreWords();
    }
  }

  handleKey(key: string) {
    if (!this.state.isLoaded) return;

    // Start batch timer on first keystroke
    if (!this.isBatchStarted) {
      this.batchStartTime = Date.now();
      this.isBatchStarted = true;
    }

    // Reset session start on first key if idle?
    // For now, simple monolithic session

    const currentWordObj = this.state.words[this.state.activeWordIndex];
    const targetWord = currentWordObj.word;
    const now = Date.now();
    const wordFinished = this.state.activeCharIndex === targetWord.length;

    this.totalKeystrokes++;

    if (wordFinished) {
      if (key === " ") {
        // Correct Space -> Advance
        this.state.isError = false;
        this.correctKeystrokes++;
        this.batchCorrectChars++;

        // NOTE: We do NOT measure latency for Space (LastChar -> Space)
        // because our Generator/Indexer does not support patterns ending in space yet.
        // If we added them to stats, they would become bottlenecks that the generator cannot target.

        this.advanceWord(now);
      } else {
        // Error on Space
        this.state.isError = true;
        // No attribution for space error currently
      }
    } else {
      // Ignore space at the beginning of a word (often a habitual press after auto-advance)
      if (key === " " && this.state.activeCharIndex === 0) return;

      const targetChar = targetWord[this.state.activeCharIndex];
      // 1. Check Correctness
      if (key === targetChar) {
        // Correct
        this.state.isError = false;
        this.correctKeystrokes++;
        this.batchCorrectChars++;

        // Measure Latency
        // Rule: Discard first char of word
        if (this.state.activeCharIndex > 0) {
          const delta = now - this.lastKeyTime;
          // Rule: Discard > 2000ms
          // Rule: Discard if we previously errored on this character (latency is polluted)
          if (delta < 2000 && !this.latencyInvalidated) {
            // Update Global Average (Slow moving EWMA)
            this.globalAvgLatency = 0.005 * delta + (1 - 0.005) * this.globalAvgLatency;
            this.config.targetLatency = Math.max(20, this.globalAvgLatency * 0.95);

            // Attribution: Bigram (Prev -> Curr)
            const prevChar = targetWord[this.state.activeCharIndex - 1];
            const patternId = prevChar + key; // Simple bigram for now

            this.updateStat(patternId, delta, false);

            // Attribution: Same Finger
            const f1 = getFinger(prevChar);
            const f2 = getFinger(key);
            if (f1 !== undefined && f2 !== undefined && f1 === f2 && prevChar !== key) {
              this.updateStat(`same_finger:${prevChar}${key}`, delta, false);
            }
          }
        }

        this.state.typedSoFar += key;
        this.state.activeCharIndex++;
        this.lastKeyTime = now;
        this.latencyInvalidated = false; // Reset for next char

        // Auto-advance if last char of last word in batch
        const isLastCharOfWord = this.state.activeCharIndex === targetWord.length;
        const isLastWordOfBatch = (this.state.activeWordIndex + 1) % BATCH_SIZE === 0;
        if (isLastCharOfWord && isLastWordOfBatch) {
          this.advanceWord(now);
        }
      } else {
        // Error
        this.state.isError = true;
        this.latencyInvalidated = true; // Mark latency as garbage for when they finally get it right

        // Attribution
        if (this.state.activeCharIndex > 0) {
          const prevChar = targetWord[this.state.activeCharIndex - 1];
          const patternId = prevChar + targetChar;
          this.updateStat(patternId, 0, true);

          // Attribution: Same Finger Error
          const f1 = getFinger(prevChar);
          const f2 = getFinger(targetChar);
          if (f1 !== undefined && f2 !== undefined && f1 === f2 && prevChar !== targetChar) {
            this.updateStat(`same_finger:${prevChar}${targetChar}`, 0, true);
          }
        }
      }
    }

    // Immediate update for responsiveness
    this.notify();
  }

  private updateStat(id: PatternId, latency: number, isError: boolean) {
    let stat = this.patternStats.get(id);
    if (!stat) {
      stat = createInitialStat(id);
      this.patternStats.set(id, stat);
    }

    const updated = updatePatternStat(stat, latency, isError, this.config);
    this.patternStats.set(id, updated);
    this.dirtyStats.add(id);

    // Periodically recalc bottleneck if this was a slow one?
    // Let's just do it on save interval or periodically to avoid thrashing
  }

  private async saveDirtyStats() {
    if (this.dirtyStats.size === 0) return;
    const toSave: PatternStat[] = [];
    this.dirtyStats.forEach((id) => {
      const s = this.patternStats.get(id);
      if (s) toSave.push(s);
    });
    this.dirtyStats.clear();
    await storage.savePatternStats(toSave);
  }

  getPatternHeatmapData(): ScoredPattern[] {
    const allStats = Array.from(this.patternStats.values());
    // Filter out patterns with very few samples (n < 3) to avoid noise from barely-seen patterns
    const activeStats = allStats.filter((p) => p.n >= 3);
    return getPatternScores(activeStats, this.config, true);
  }
}

export const engine = new TypingEngine();
