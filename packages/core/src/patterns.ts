import { PatternId } from "@rlytype/types";

// Simple QWERTY finger mapping
// 0=L-Pinky, 1=L-Ring, 2=L-Mid, 3=L-Index, 4=R-Index, 5=R-Mid, 6=R-Ring, 7=R-Pinky
const FINGER_MAP: Record<string, number> = {
  q: 0,
  a: 0,
  z: 0,
  w: 1,
  s: 1,
  x: 1,
  e: 2,
  d: 2,
  c: 2,
  r: 3,
  f: 3,
  v: 3,
  t: 3,
  g: 3,
  b: 3,
  y: 4,
  h: 4,
  n: 4,
  u: 4,
  j: 4,
  m: 4,
  i: 5,
  k: 5,
  o: 6,
  l: 6,
  p: 7,
};

export function getFinger(char: string): number | undefined {
  return FINGER_MAP[char.toLowerCase()];
}

export function extractPatternsForWord(word: string): PatternId[] {
  const patterns: PatternId[] = [];
  const lower = word.toLowerCase();

  for (let i = 0; i < lower.length - 1; i++) {
    const c1 = lower[i];
    const c2 = lower[i + 1];

    // 1. Bigram
    patterns.push(c1 + c2);

    // 2. Same Finger (Heuristic)
    const f1 = getFinger(c1);
    const f2 = getFinger(c2);

    if (f1 !== undefined && f2 !== undefined && f1 === f2 && c1 !== c2) {
      patterns.push(`same_finger:${c1}${c2}`);
    }

    // 3. Trigram (if available)
    if (i < lower.length - 2) {
      const c3 = lower[i + 2];
      patterns.push(c1 + c2 + c3);
    }
  }

  return Array.from(new Set(patterns));
}
