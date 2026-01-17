import { PatternStat, EngineState, LearningMode, Stage } from "@rlytype/types";
import { WordIndexer, WordGenerator } from "@rlytype/generator";
import { storage } from "@rlytype/storage";
import {
  createInitialStat,
  updatePatternStat,
  calculateMasteryScore,
  calculateStageMastery,
} from "@rlytype/core";

const BATCH_SIZE = 10;

type Listener = (state: EngineState) => void;

export class TypingEngine {
  // ------------------------
  // Engine State
  // ------------------------

  private state: EngineState = {
    words: [],
    activeWordIndex: 0,
    activeCharIndex: 0,
    typedSoFar: "",
    isError: false,
    stats: {
      wpm: 0,
      accuracy: 100,
      sessionTime: 0,
      currentPattern: "",
      topBottleneck: "",
      stageMastery: { unigram: 0, bigram: 0, trigram: 0 },
    },
    meta: {
      targetWpm: 80,
      learningMode: "reinforced",
      currentStage: "unigram",
    },
    isLoaded: false,
  };

  private listeners: Listener[] = [];

  // ------------------------
  // Core components
  // ------------------------

  private patternStats = new Map<string, PatternStat>();
  private indexer!: WordIndexer;
  private generator!: WordGenerator;

  // ------------------------
  // Timing
  // ------------------------

  private lastKeyTime = 0;
  private batchKeystrokes = 0;
  private batchErrors = 0;
  private batchStartTime = 0;
  private isBatchStarted = false;

  // ------------------------
  // Initialization
  // ------------------------

  // Dependency Injection: Pass the word list (or indexer) here
  async init(words: string[]) {
    this.indexer = new WordIndexer(words);
    this.generator = new WordGenerator(this.indexer);

    await storage.init();
    const loadedStats = await storage.loadAllPatternStats();
    loadedStats.forEach((s) => this.patternStats.set(s.id, s));

    const config = await storage.loadConfig();
    if (config) {
      this.state.meta.targetWpm = config.targetWpm;
      this.state.meta.learningMode = config.learningMode;
      this.state.meta.currentStage = config.currentStage;
    }

    this.updateStageMastery();
    this.generateMoreWords();
    this.state.isLoaded = true;
    this.notify();
  }

  // ------------------------
  // Public API
  // ------------------------

  setLearningMode(mode: LearningMode) {
    this.state.meta.learningMode = mode;
    this.saveConfig();
    if (this.state.isLoaded) {
      this.resetWords();
    }
  }

  setTargetWpm(wpm: number) {
    this.state.meta.targetWpm = wpm;
    this.saveConfig();
    if (this.state.isLoaded) {
      this.updateStageMastery(); // Target changed, mastery changes
      this.notify();
    }
  }

  setStage(stage: Stage) {
    this.state.meta.currentStage = stage;
    this.saveConfig();
    if (this.state.isLoaded) {
      this.resetWords();
    }
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getPatternHeatmapData() {
    // Return data for all patterns in current stage, even if not yet practiced
    const stage = this.state.meta.currentStage;
    if (!this.indexer) return [];

    const allPatterns = this.indexer.getAllPatterns(stage);
    const targetLatency = this.getTargetLatency();

    return allPatterns.map((id) => {
      const stat = this.patternStats.get(id) || createInitialStat(id);
      const mastery = calculateMasteryScore(stat, targetLatency);
      return {
        id,
        stat,
        mastery,
      };
    });
  }

  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }

  // ------------------------
  // Word generation
  // ------------------------

  private resetWords() {
    this.state.words = [];
    this.state.activeWordIndex = 0;
    this.state.activeCharIndex = 0;
    this.state.typedSoFar = "";
    this.state.isError = false;

    // We do NOT reset session stats here, only batch stats
    if (this.state.isLoaded) {
      this.generateMoreWords();
    }
    this.notify();
  }

  private generateMoreWords() {
    this.batchKeystrokes = 0;
    this.batchErrors = 0;
    this.isBatchStarted = false;
    this.batchStartTime = 0;

    const targetPattern = this.selectTargetPattern();
    this.state.stats.currentPattern = targetPattern;

    const batch = this.generator.generateBatch(targetPattern, BATCH_SIZE);
    this.state.words = batch;
    this.state.activeWordIndex = 0;
  }

  private selectTargetPattern(): string {
    const stage = this.state.meta.currentStage;
    if (!this.indexer) return "th";

    const allPatterns = this.indexer.getAllPatterns(stage);
    const targetLatency = this.getTargetLatency();

    // Map to candidates with mastery score
    const candidates = allPatterns.map((id) => {
      const stat = this.patternStats.get(id) || createInitialStat(id);
      return {
        id,
        mastery: calculateMasteryScore(stat, targetLatency),
        stat,
      };
    });

    if (candidates.length === 0) {
      // Fallback if indexer is empty? Should not happen if words.json is valid.
      console.warn("No patterns found for stage:", stage);
      return "th"; // safe fallback
    }

    if (this.state.meta.learningMode === "sequential") {
      // 1. Sort by Mastery Ascending (Weakest first)
      candidates.sort((a, b) => {
        return a.mastery - b.mastery;
      });

      // 2. Pick the first one that isn't fully mastered (100%)?
      // Or just the absolute weakest.
      const target = candidates.find((c) => c.mastery < 100) || candidates[0];
      return target.id;
    }

    // Reinforced: Weighted Random
    // Weight = 100 - Mastery (min 1 to allow some chance)
    const weighted = candidates.map((c) => {
      return {
        pattern: c.id,
        weight: Math.max(5, 100 - c.mastery), // ensure at least small weight
      };
    });

    return weightedRandom(weighted) || candidates[0].id;
  }

  // ------------------------
  // Input handling
  // ------------------------

  handleKey(key: string) {
    if (!this.state.isLoaded) return;

    if (!this.isBatchStarted) {
      this.isBatchStarted = true;
      this.batchStartTime = Date.now();
    }

    const word = this.state.words[this.state.activeWordIndex];
    if (!word) return; // Should not happen

    const now = Date.now();

    // End of word → expect space
    if (this.state.activeCharIndex === word.length) {
      this.batchKeystrokes++;
      if (key === " ") {
        this.advanceWord();
      } else {
        this.batchErrors++;
        this.state.isError = true;
      }
      this.notify();
      return;
    }

    const expected = word[this.state.activeCharIndex];
    this.batchKeystrokes++;

    if (key === expected) {
      this.state.isError = false;

      if (this.state.activeCharIndex > 0) {
        const delta = now - this.lastKeyTime;
        // Ignore very long pauses (distractions)
        if (delta < 2000) {
          this.attributeStats(word, this.state.activeCharIndex, delta);
        }
      }

      this.state.typedSoFar += key;
      this.state.activeCharIndex++;
      this.lastKeyTime = now;
    } else {
      this.batchErrors++;
      this.state.isError = true;
    }

    this.notify();
  }

  private finalizeBatchStats() {
    if (!this.isBatchStarted || this.batchKeystrokes === 0) {
      return;
    }

    // Accuracy
    const rawAcc = ((this.batchKeystrokes - this.batchErrors) / this.batchKeystrokes) * 100;
    this.state.stats.accuracy = Math.max(0, Math.round(rawAcc));

    // WPM
    const durationMinutes = (Date.now() - this.batchStartTime) / 60000;
    if (durationMinutes > 0) {
      this.state.stats.wpm = Math.round(this.batchKeystrokes / 5 / durationMinutes);
    }

    this.isBatchStarted = false;
    this.batchStartTime = 0;
  }

  private advanceWord() {
    this.state.activeWordIndex++;
    this.state.activeCharIndex = 0;
    this.state.typedSoFar = "";

    if (this.state.activeWordIndex >= this.state.words.length) {
      this.finalizeBatchStats();
      this.generateMoreWords();
      this.updateStageMastery();
    }
  }

  // ------------------------
  // Stats attribution
  // ------------------------

  private attributeStats(word: string, idx: number, latency: number) {
    const char = word[idx];
    const prev = word[idx - 1];

    this.updateStat(char, latency);
    this.updateStat(prev + char, latency);

    if (idx > 1) {
      const prevPrev = word[idx - 2];
      this.updateStat(prevPrev + prev + char, latency);
    }
  }

  private updateStat(pattern: string, latency: number) {
    let stat = this.patternStats.get(pattern);
    if (!stat) {
      stat = createInitialStat(pattern);
      this.patternStats.set(pattern, stat);
    }

    const updated = updatePatternStat(stat, latency);
    this.patternStats.set(pattern, updated);
    storage.savePatternStats([updated]);
  }

  private saveConfig() {
    storage.saveConfig({
      targetWpm: this.state.meta.targetWpm,
      learningMode: this.state.meta.learningMode,
      currentStage: this.state.meta.currentStage,
    });
  }

  private updateStageMastery() {
    if (!this.indexer) return;

    const targetLatency = this.getTargetLatency();
    const stages: Stage[] = ["unigram", "bigram", "trigram"];

    for (const stage of stages) {
      const patterns = this.indexer.getAllPatterns(stage);
      const stats = patterns.map((p) => this.patternStats.get(p) || createInitialStat(p));
      this.state.stats.stageMastery[stage] = calculateStageMastery(stats, targetLatency);
    }
  }

  private getTargetLatency() {
    // 5 chars per word standard. WPM = (Chars / 5) / Min
    // CPC (Chars per minute) = WPM * 5
    // MS per Char = 60000 / (WPM * 5)
    return 60000 / (this.state.meta.targetWpm * 5);
  }
}

// ------------------------
// Weighted random helper
// ------------------------

function weightedRandom(items: { pattern: string; weight: number }[]): string | null {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.pattern;
  }
  return items[items.length - 1].pattern;
}
