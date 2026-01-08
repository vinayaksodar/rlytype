import { PatternId } from "@rlytype/types";
import { extractPatternsForWord } from "@rlytype/core";

export class WordIndexer {
  // PatternId -> List of words containing it
  private index: Map<PatternId, string[]> = new Map();
  // private allWords: string[] = [];

  // Cache for common words (top 100)
  private flowWords: string[] = [];

  constructor(words: string[]) {
    // this.allWords = words;
    this.flowWords = words.slice(0, 100);
    this.buildIndex(words);
  }

  private buildIndex(words: string[]) {
    for (const word of words) {
      const patterns = extractPatternsForWord(word);
      for (const p of patterns) {
        if (!this.index.has(p)) {
          this.index.set(p, []);
        }
        this.index.get(p)!.push(word);
      }
    }
  }

  getWordsForPattern(pattern: PatternId): string[] {
    return this.index.get(pattern) || [];
  }

  getFlowWords(): string[] {
    return this.flowWords;
  }
}
