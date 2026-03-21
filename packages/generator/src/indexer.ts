import { extractPatternsForWord } from "@rlytype/core";

export class WordIndexer {
  // Pattern -> List of words containing it
  private index: Map<string, string[]> = new Map();

  // Cache counts
  private patternCounts: { unigram: number; bigram: number; trigram: number } = {
    unigram: 0,
    bigram: 0,
    trigram: 0,
  };

  constructor(words: string[]) {
    // this.allWords = words;
    this.buildIndex(words);
  }

  private buildIndex(words: string[]) {
    const fullIndex: Map<string, string[]> = new Map();

    for (const word of words) {
      const patterns = extractPatternsForWord(word);
      for (const p of patterns) {
        if (!fullIndex.has(p)) {
          fullIndex.set(p, []);
        }
        fullIndex.get(p)!.push(word);
      }
    }

    // Filter based on hardcoded frequency thresholds
    // We only keep patterns that appear in at least N words.
    const allUnigrams = new Set<string>();
    const allBigrams = new Set<string>();
    const allTrigrams = new Set<string>();

    for (const [p, wordsForPattern] of fullIndex.entries()) {
      let minFreq = 1;
      if (p.length === 1) minFreq = 1;
      else if (p.length === 2) minFreq = 3;
      else if (p.length === 3) minFreq = 3;

      if (wordsForPattern.length >= minFreq) {
        this.index.set(p, wordsForPattern);
        if (p.length === 1) allUnigrams.add(p);
        else if (p.length === 2) allBigrams.add(p);
        else if (p.length === 3) allTrigrams.add(p);
      }
    }

    this.patternCounts = {
      unigram: allUnigrams.size,
      bigram: allBigrams.size,
      trigram: allTrigrams.size,
    };
  }

  getPatternCounts() {
    return this.patternCounts;
  }

  getWordsForPattern(pattern: string): string[] {
    return this.index.get(pattern) || [];
  }

  getAllPatterns(stage: "unigram" | "bigram" | "trigram"): string[] {
    const len = stage === "unigram" ? 1 : stage === "bigram" ? 2 : 3;
    const out: string[] = [];
    for (const k of this.index.keys()) {
      if (k.length === len) out.push(k);
    }
    return out;
  }
}
