import { WordCandidate, PatternStat, UserConfig, PatternId, BATCH_SIZE } from "@rlytype/types";
import { WordIndexer, WordGenerator } from "@rlytype/generator";
import { storage } from "@rlytype/storage";
import {
  updatePatternStat,
  createInitialStat,
  selectTopPatterns,
  getPatternScores,
  ScoredPattern,
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
    topBottleneck: string; // ID of pattern with high latency
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
    stats: { wpm: 0, accuracy: 100, sessionTime: 0, topBottleneck: "" },
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
  };

  private lastKeyTime: number = 0;

  // Session Tracking
  private sessionStart: number = 0;
  private totalKeystrokes: number = 0;
  private correctKeystrokes: number = 0;

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

    this.recalcBottleneck();

    // Generate initial batch
    this.generateMoreWords();

    this.state.isLoaded = true;
    this.sessionStart = Date.now();
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
    const durationMin = (now - this.sessionStart) / 60000;

    if (durationMin > 0) {
      // WPM = (All characters / 5) / Time in Minutes
      this.state.stats.wpm = Math.round(this.correctKeystrokes / 5 / durationMin);
    }

    if (this.totalKeystrokes > 0) {
      this.state.stats.accuracy = Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100);
    }

    this.state.stats.sessionTime = Math.floor((now - this.sessionStart) / 1000);
    this.notify();
  }

  private recalcBottleneck() {
    // Find pattern with highest EWMA Latency that has samples > 5
    let worstId = "";
    let maxLat = 0;
    this.patternStats.forEach((p) => {
      if (p.n > 5 && p.ewmaLatency > maxLat) {
        maxLat = p.ewmaLatency;
        worstId = p.id;
      }
    });
    if (worstId) {
      this.state.stats.topBottleneck = `${worstId} (${Math.round(maxLat)}ms)`;
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

  handleKey(key: string) {
    if (!this.state.isLoaded) return;

    // Reset session start on first key if idle?
    // For now, simple monolithic session

    const currentWordObj = this.state.words[this.state.activeWordIndex];
    const targetWord = currentWordObj.word;
    const targetChar = targetWord[this.state.activeCharIndex];
    const now = Date.now();

    this.totalKeystrokes++;

    // 1. Check Correctness
    if (key === targetChar) {
      // Correct
      this.state.isError = false;
      this.correctKeystrokes++;

      // Measure Latency
      // Rule: Discard first char of word
      if (this.state.activeCharIndex > 0) {
        const delta = now - this.lastKeyTime;
        // Rule: Discard > 2000ms
        if (delta < 2000) {
          // Attribution: Bigram (Prev -> Curr)
          const prevChar = targetWord[this.state.activeCharIndex - 1];
          const patternId = prevChar + key; // Simple bigram for now

          this.updateStat(patternId, delta, false);
        }
      }

      this.state.typedSoFar += key;
      this.state.activeCharIndex++;
      this.lastKeyTime = now;

      // Word Complete
      if (this.state.activeCharIndex >= targetWord.length) {
        this.state.activeWordIndex++;
        this.state.activeCharIndex = 0;
        this.state.typedSoFar = "";
        // this.wordStartTime = now;

        // Maintain buffer
        if (this.state.words.length - this.state.activeWordIndex < BATCH_SIZE) {
          this.generateMoreWords();
        }
      }
    } else {
      // Error
      this.state.isError = true;
      // Attribution
      if (this.state.activeCharIndex > 0) {
        const prevChar = targetWord[this.state.activeCharIndex - 1];
        const patternId = prevChar + targetChar;
        this.updateStat(patternId, 0, true);
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
    this.recalcBottleneck();
  }

  getPatternHeatmapData(): ScoredPattern[] {
    const allStats = Array.from(this.patternStats.values());
    // Filter out patterns with very few samples (n < 3) to avoid noise from barely-seen patterns
    const activeStats = allStats.filter((p) => p.n >= 3);
    return getPatternScores(activeStats, this.config, true);
  }
}

export const engine = new TypingEngine();
