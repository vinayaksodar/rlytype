import { PatternId } from "@rlytype/types";
import { extractPatternsForWord } from "@rlytype/core";

export class WordIndexer {
  // PatternId -> List of words containing it
  private index: Map<PatternId, string[]> = new Map();
  private flowWords: string[] = [];

  // Cache counts
  private patternCounts: { unigram: number; bigram: number; trigram: number } = {
    unigram: 0,
    bigram: 0,
    trigram: 0,
  };

  constructor(words: string[]) {
    // this.allWords = words;
    this.flowWords = words.slice(0, 100);
    this.buildIndex(words);
  }

  private buildIndex(words: string[]) {
    const allUnigrams = new Set<string>();
    const allBigrams = new Set<string>();
    const allTrigrams = new Set<string>();

    for (const word of words) {
      const patterns = extractPatternsForWord(word);
      for (const p of patterns) {
        if (!this.index.has(p)) {
          this.index.set(p, []);
        }
        this.index.get(p)!.push(word);

        // Track unique counts
        if (p.length === 1) allUnigrams.add(p);
        else if (p.length === 2 && !p.startsWith("same_finger:")) allBigrams.add(p);
        else if (p.length === 3 && !p.startsWith("same_finger:")) allTrigrams.add(p);
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

  getWordsForPattern(pattern: PatternId): string[] {
    return this.index.get(pattern) || [];
  }

  getFlowWords(): string[] {
    return this.flowWords;
  }
}
