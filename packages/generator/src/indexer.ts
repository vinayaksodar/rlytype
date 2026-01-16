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
}
