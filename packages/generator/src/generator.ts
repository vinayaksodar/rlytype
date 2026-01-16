import { WordIndexer } from "./indexer";

export class WordGenerator {
  constructor(private indexer: WordIndexer) {}

  generateBatch(pattern: string, batchSize: number = 10): string[] {
    const candidates = this.indexer.getWordsForPattern(pattern);

    if (candidates.length === 0) {
      return [];
    }

    const batch: string[] = [];
    for (let i = 0; i < batchSize; i++) {
      // Select a word randomly
      batch.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }

    return batch;
  }
}
