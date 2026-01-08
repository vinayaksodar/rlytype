import { PatternId, WordCandidate } from "@rlytype/types";
import { WordIndexer } from "./indexer";

export class WordGenerator {
  private indexer: WordIndexer;

  constructor(indexer: WordIndexer) {
    this.indexer = indexer;
  }

  generateBatch(
    topPatterns: PatternId[],
    historyBuffer: string[],
    batchSize: number = 10
  ): WordCandidate[] {
    const batch: WordCandidate[] = [];
    const flowWords = this.indexer.getFlowWords();
    const historySet = new Set(historyBuffer);

    // Focus Mode: If topPatterns are provided, we strictly use the first one (highest priority).
    // The user requested: "for one set use only one pattern... and only select words with those patterns"
    const focusPattern = topPatterns.length > 0 ? topPatterns[0] : null;

    for (let i = 0; i < batchSize; i++) {
      let candidateWord: string | null = null;
      const targetMatches: Array<{ pattern: PatternId; startIndex: number }> = [];

      if (focusPattern) {
        // STRICT FOCUS MODE: 100% words must match the focus pattern
        const pattern = focusPattern;
        const candidates = this.indexer.getWordsForPattern(pattern);

        // Filter out history
        const validCandidates = candidates.filter((w) => !historySet.has(w));

        if (validCandidates.length > 0) {
          candidateWord = validCandidates[Math.floor(Math.random() * validCandidates.length)];
          const index = candidateWord.toLowerCase().indexOf(pattern.replace("same_finger:", ""));

          if (index >= 0) {
            targetMatches.push({ pattern, startIndex: index });
          }
        } else {
          // Fallback if we exhausted words for this pattern in the history buffer?
          // Try to pick any word for this pattern even if in history
          if (candidates.length > 0) {
            candidateWord = candidates[Math.floor(Math.random() * candidates.length)];
            const index = candidateWord.toLowerCase().indexOf(pattern.replace("same_finger:", ""));
            if (index >= 0) targetMatches.push({ pattern, startIndex: index });
          }
        }
      }

      // Final Fallback to flow word (only if no focus pattern or database empty for pattern)
      if (!candidateWord) {
        const validFlow = flowWords.filter((w) => !historySet.has(w));
        if (validFlow.length > 0) {
          candidateWord = validFlow[Math.floor(Math.random() * validFlow.length)];
        } else {
          candidateWord = flowWords[Math.floor(Math.random() * flowWords.length)];
        }
      }

      batch.push({
        word: candidateWord!,
        targetMatches,
        isFlowWord: !focusPattern, // It's a flow word only if we weren't trying to target
      });

      // Update local history for this batch
      historySet.add(candidateWord!);
    }

    return batch;
  }
}
