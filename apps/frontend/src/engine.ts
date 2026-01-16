import { PatternStat, EngineState, LearningMode, Stage } from "@rlytype/types";
import { WordIndexer, WordGenerator } from "@rlytype/generator";
import { storage } from "@rlytype/storage";
import {
  createInitialStat,
  updatePatternStat,
  isPatternMastered,
  calculateMasteryScore,
} from "@rlytype/core";

const BATCH_SIZE = 10;
const MIN_ATTEMPTS = 20;

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
    stats: { wpm: 0, accuracy: 100, sessionTime: 0, currentPattern: "", topBottleneck: "" },
    progression: {
      currentStage: "unigram",
      learningMode: "reinforced",
      mastery: { unigram: 0, bigram: 0, trigram: 0 },
    },
    meta: {
      targetWpm: 200,
      learningMode: "sequential",
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

  // ------------------------
  // Initialization
  // ------------------------

  async init() {
    const response = await fetch("/words.json");
    const data = await response.json();

    this.indexer = new WordIndexer(data.words);
    this.generator = new WordGenerator(this.indexer);

    await storage.init();
    const loaded = await storage.loadAllPatternStats();
    loaded.forEach((s) => this.patternStats.set(s.id, s));

    this.generateMoreWords();
    this.state.isLoaded = true;
    this.notify();
  }

  // ------------------------
  // Public API
  // ------------------------

  setLearningMode(mode: LearningMode) {
    this.state.meta.learningMode = mode;
    this.resetWords();
  }

  setTargetWpm(Wpm: number) {
    this.state.meta.targetWpm = Wpm;
    this.resetWords();
  }

  setStage(stage: Stage) {
    this.state.progression.currentStage = stage;
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

  // ------------------------
  // Word generation
  // ------------------------

  private resetWords() {
    this.state.words = [];
    this.state.activeWordIndex = 0;
    this.state.activeCharIndex = 0;
    this.state.typedSoFar = "";
    this.state.isError = false;

    this.generateMoreWords();
    this.notify();
  }

  private generateMoreWords() {
    const targetPattern = this.selectTargetPattern();

    const batch = this.generator.generateBatch(targetPattern, BATCH_SIZE);

    this.state.words.push(...batch);
  }

  /**
   * Pattern selection:
   * - Sequential: weakest (lowest mastery score)
   * - Reinforced: weighted random by weakness
   */
  private selectTargetPattern(): string {
    const candidates = Array.from(this.patternStats.values())
      .filter((s) => s.attempts >= MIN_ATTEMPTS)
      .filter((s) => !isPatternMastered(s, this.state.meta.targetWpm));

    if (candidates.length === 0) throw new Error("No candidates for Target Pattern");

    if (this.state.meta.learningMode === "sequential") {
      candidates.sort(
        (a, b) =>
          calculateMasteryScore(a, this.state.meta.targetWpm) -
          calculateMasteryScore(b, this.state.meta.targetWpm)
      );
      return candidates[0].id;
    }

    // reinforced: weighted by weakness
    const weighted = candidates.map((s) => {
      const mastery = calculateMasteryScore(s, this.state.meta.targetWpm);
      const weakness = Math.max(1, 100 - mastery); // avoid zero weight
      return { pattern: s.id, weight: weakness };
    });

    const chosen = weightedRandom(weighted);
    return chosen;
  }

  // ------------------------
  // Input handling
  // ------------------------

  handleKey(key: string) {
    if (!this.state.isLoaded) return;

    const word = this.state.words[this.state.activeWordIndex];

    const now = Date.now();

    // End of word → expect space
    if (this.state.activeCharIndex === word.length) {
      if (key === " ") {
        this.advanceWord();
      } else {
        this.state.isError = true;
      }
      this.notify();
      return;
    }

    const expected = word[this.state.activeCharIndex];

    if (key === expected) {
      this.state.isError = false;

      if (this.state.activeCharIndex > 0) {
        const delta = now - this.lastKeyTime;
        this.attributeStats(word, this.state.activeCharIndex, delta);
      }

      this.state.typedSoFar += key;
      this.state.activeCharIndex++;
      this.lastKeyTime = now;
    } else {
      this.state.isError = true;
      this.attributeError(word, this.state.activeCharIndex);
    }

    this.notify();
  }

  private advanceWord() {
    this.state.activeWordIndex++;
    this.state.activeCharIndex = 0;
    this.state.typedSoFar = "";

    if (this.state.words.length - this.state.activeWordIndex < BATCH_SIZE) {
      this.generateMoreWords();
    }
  }

  // ------------------------
  // Stats attribution
  // ------------------------

  private attributeStats(word: string, idx: number, latency: number) {
    const char = word[idx];
    const prev = word[idx - 1];

    this.updateStat(char, latency, false);
    this.updateStat(prev + char, latency, false);

    if (idx > 1) {
      const prevPrev = word[idx - 2];
      this.updateStat(prevPrev + prev + char, latency, false);
    }
  }

  private attributeError(word: string, idx: number) {
    const char = word[idx];
    this.updateStat(char, 0, true);

    if (idx > 0) {
      const prev = word[idx - 1];
      this.updateStat(prev + char, 0, true);
    }
  }

  private updateStat(pattern: string, latency: number, isError: boolean) {
    let stat = this.patternStats.get(pattern);
    if (!stat) {
      stat = createInitialStat(pattern);
      this.patternStats.set(pattern, stat);
    }

    const updated = updatePatternStat(stat, latency, isError);
    this.patternStats.set(pattern, updated);
    storage.savePatternStats([updated]);
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

export const engine = new TypingEngine();
