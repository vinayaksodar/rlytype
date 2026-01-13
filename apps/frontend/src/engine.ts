import {
  PatternStat,
  UserConfig,
  PatternId,
  BATCH_SIZE,
  EngineState,
  Stage,
  LearningMode,
} from "@rlytype/types";
import { WordIndexer, WordGenerator } from "@rlytype/generator";
import { storage } from "@rlytype/storage";
import {
  updatePatternStat,
  createInitialStat,
  selectTopPatterns,
  ScoredPattern,
  getFinger,
  selectNextSequentialPattern,
  getUnlockStatus,
  calculateStageMastery,
  getPatternStage,
  calculateMasteryScore,
} from "@rlytype/core";

type Listener = (state: EngineState) => void;

export class TypingEngine {
  private state: EngineState = {
    words: [],
    activeWordIndex: 0,
    activeCharIndex: 0,
    typedSoFar: "",
    isError: false,
    stats: { wpm: 0, accuracy: 100, sessionTime: 0, currentPattern: "", topBottleneck: "" },
    progression: {
      currentStage: "unigram",
      learningMode: "reinforced",
      mastery: { unigram: 0, bigram: 0, trigram: 0 },
      isUnlocked: { unigram: true, bigram: false, trigram: false },
      isStageFinished: false,
    },
    meta: {
      targetWpm: 60, // Default derived from 200ms
    },
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
  private batchTotalKeystrokes: number = 0;
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

    const loadedConfig = await storage.loadConfig();
    if (loadedConfig) {
      this.config = { ...this.config, ...loadedConfig };
      // Sync state meta
      this.state.meta.targetWpm = Math.round(60000 / (this.config.targetLatency * 5));
    }

    // Initial Progression Check
    this.checkProgression();

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

  // --- Public API for UI Control ---
  setStage(stage: Stage) {
    if (this.state.progression.isUnlocked[stage]) {
      this.state.progression.currentStage = stage;

      // If we haven't started typing the current word (or just finished one), replace it too!
      if (this.state.activeCharIndex === 0) {
        this.state.words = this.state.words.slice(0, this.state.activeWordIndex);
      } else {
        // Keep current word, replace subsequent
        this.state.words = this.state.words.slice(0, this.state.activeWordIndex + 1);
      }

      this.generateMoreWords();
      this.updateCurrentPattern(); // Force update display
      this.notify();
    }
  }

  setMode(mode: LearningMode) {
    this.state.progression.learningMode = mode;
    this.resetWords();
  }

  setTargetWpm(wpm: number) {
    // 1 char = 5 keystrokes? No, standard is 5 chars/word.
    // WPM = (Chars / 5) / Minutes
    // Chars/Min = WPM * 5
    // ms/Char = 60000 / (WPM * 5)
    this.config.targetLatency = Math.round(60000 / (wpm * 5));
    this.state.meta.targetWpm = wpm;

    // Persist config
    storage.saveConfig(this.config);

    // Trigger re-eval of mastery
    this.checkProgression();

    // Enforce Stage Locking: Downgrade if current stage is no longer unlocked
    if (!this.state.progression.isUnlocked[this.state.progression.currentStage]) {
      if (this.state.progression.isUnlocked.bigram) {
        this.setStage("bigram");
      } else {
        this.setStage("unigram");
      }
    }

    this.notify();
  }
  // ---------------------------------

  private resetWords() {
    this.state.words = [];
    this.state.activeWordIndex = 0;
    this.state.activeCharIndex = 0;
    this.state.typedSoFar = "";
    this.state.isError = false;

    this.batchStartTime = 0;
    this.batchCorrectChars = 0;
    this.batchTotalKeystrokes = 0;
    this.isBatchStarted = false;

    this.generateMoreWords();
    this.updateCurrentPattern();
    this.notify();
  }

  private updateSessionStats() {
    if (!this.sessionStart) return;
    const now = Date.now();
    // WPM is now calculated per batch in checkBatchWpm() to avoid idle decay

    this.state.stats.sessionTime = Math.floor((now - this.sessionStart) / 1000);
    this.checkProgression(); // Check periodically
    this.notify();
  }

  private checkProgression() {
    const stats = Array.from(this.patternStats.values());
    const counts = this.indexer
      ? this.indexer.getPatternCounts()
      : { unigram: 26, bigram: 100, trigram: 100 };

    const unlock = getUnlockStatus(stats, this.config.targetLatency, counts);
    this.state.progression.isUnlocked = unlock;

    this.state.progression.mastery.unigram = calculateStageMastery(
      stats,
      "unigram",
      this.config.targetLatency,
      counts.unigram
    );
    this.state.progression.mastery.bigram = calculateStageMastery(
      stats,
      "bigram",
      this.config.targetLatency,
      counts.bigram
    );
    this.state.progression.mastery.trigram = calculateStageMastery(
      stats,
      "trigram",
      this.config.targetLatency,
      counts.trigram
    );
  }

  private checkBatchWpm() {
    // If we just started a new batch (index is multiple of BATCH_SIZE)
    if (this.state.activeWordIndex > 0 && this.state.activeWordIndex % BATCH_SIZE === 0) {
      const now = Date.now();
      const durationMin = (now - this.batchStartTime) / 60000;
      if (durationMin > 0) {
        this.state.stats.wpm = Math.round(this.batchCorrectChars / 5 / durationMin);

        // Batch Accuracy
        if (this.batchTotalKeystrokes > 0) {
          this.state.stats.accuracy = Math.round(
            (this.batchCorrectChars / this.batchTotalKeystrokes) * 100
          );
        }
      }
      // Reset for next batch
      this.batchStartTime = 0;
      this.batchCorrectChars = 0;
      this.batchTotalKeystrokes = 0;
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

    const allStats = Array.from(this.patternStats.values());
    let topPatterns: PatternId[] = [];

    // Filter stats by current stage
    const stageStats = allStats.filter(
      (s) => getPatternStage(s.id) === this.state.progression.currentStage
    );

    // If stageStats is empty (new install?), we might need to seed it or just let it pick randomly?
    // If empty, the generator won't be able to pick "Target Words". It will pick Flow Words.
    // But as user types Flow Words, stats will be created.

    if (this.state.progression.learningMode === "sequential") {
      const p = selectNextSequentialPattern(
        allStats,
        this.state.progression.currentStage,
        this.config.targetLatency
      );
      if (p) {
        topPatterns = [p];
        this.state.progression.isStageFinished = false;
      } else {
        // No patterns left to drill in this stage -> Stage Finished
        this.state.progression.isStageFinished = true;
      }
    } else {
      // Reinforced
      // Use filtered stageStats
      topPatterns = selectTopPatterns(stageStats, this.config, 1);
      this.state.progression.isStageFinished = false; // Reinforced is never "finished", just maintenance
    }

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
    this.batchTotalKeystrokes++;

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
            // NOTE: We are NOT auto-updating targetLatency anymore based on globalAvg
            // because the user now explicitly sets their target speed.
            // this.config.targetLatency = Math.max(20, this.globalAvgLatency * 0.95);

            // Attribution: Bigram (Prev -> Curr)
            const prevChar = targetWord[this.state.activeCharIndex - 1];
            const patternId = prevChar + key; // Simple bigram for now

            this.updateStat(patternId, delta, false);

            // Attribution: Unigram (Curr)
            this.updateStat(key, delta, false);

            // Attribution: Trigram (PrevPrev -> Prev -> Curr)
            if (this.state.activeCharIndex > 1) {
              const prevPrevChar = targetWord[this.state.activeCharIndex - 2];
              this.updateStat(prevPrevChar + prevChar + key, delta, false);
            }

            // Attribution: Same Finger
            const f1 = getFinger(prevChar);
            const f2 = getFinger(key);
            if (f1 !== undefined && f2 !== undefined && f1 === f2 && prevChar !== key) {
              this.updateStat(`same_finger:${prevChar}${key}`, delta, false);
            }
          }
        } else {
          // It's the first char. We can still attribute Unigram stats for it?
          // No, "Startup Latency" is reading time. Unigram speed should be motor speed.
          // So we only count unigrams inside words.
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
        // For Unigram/Bigram/Trigram errors
        if (this.state.activeCharIndex > 0) {
          const prevChar = targetWord[this.state.activeCharIndex - 1];
          const patternId = prevChar + targetChar;
          this.updateStat(patternId, 0, true);
          this.updateStat(targetChar, 0, true); // Unigram error

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

    // Convert to Visual Score based on Mastery
    // Mastery: 0-100 (Higher is Better)
    // Visual Score: 0 (Green) - 300 (Red) (Higher is Worse/More Urgent)
    // We use a steeper curve (* 10) so that 85% Mastery (Gap 15) maps to 150 (Yellow).
    // Anything below 70% Mastery (Gap 30) will be fully Red (300).
    const candidates = activeStats.map((p) => {
      const mastery = calculateMasteryScore(p, this.config.targetLatency); // 0-100
      const visualScore = (100 - mastery) * 10;
      return { id: p.id, score: visualScore, stat: p };
    });

    // Sort by Visual Score Descending (Red/Worst first)
    candidates.sort((a, b) => b.score - a.score);

    return candidates;
  }
}

export const engine = new TypingEngine();
