export function extractPatternsForWord(word: string): string[] {
  const lower = word.toLowerCase();
  const patterns = new Set<string>();

  for (let i = 0; i < lower.length; i++) {
    // Unigram
    patterns.add(lower[i]);

    // Bigram
    if (i + 1 < lower.length) {
      patterns.add(lower.slice(i, i + 2));
    }

    // Trigram
    if (i + 2 < lower.length) {
      patterns.add(lower.slice(i, i + 3));
    }
  }

  return Array.from(patterns);
}
