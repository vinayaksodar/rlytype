# Typing Tutor — LLM Agent Implementation Plan

**Purpose:** This markdown describes a complete implementation plan for a client-side adaptive typing tutor engine using a turborepo monorepo, Vite for the frontend app, plain HTML/CSS/TypeScript for the engine UI, and a small shared core library implementing pattern extraction, statistics, and a Thompson-Sampling bandit. The LLM agent will use this plan to generate code, tests, and scaffolding.

---

## 0\. High-level requirements & assumptions

- **Architecture:** Entirely client-side. No server required.
- **Data Source:** You will provide a `words.json` containing frequency-sorted words (highest frequency first). The generator will query this local corpus to assemble valid words that cover requested patterns.
- **Learning Unit:** The atomic unit of learning is the _pattern_ (bigrams/trigrams/keyboard-geometry patterns), not the word. Words are merely delivery vehicles.
- **Algorithm:** Thompson Sampling per-pattern, EWMA + variance for latency, Beta distribution for error rate.
- **Storage:** Persistent storage via IndexedDB.
- **UX:** Batch-based (paragraph view) interface. No "flashcard" or single-word displays.
- **Metrics:** Success is defined by minimizing the upper tail of latency/error distributions, not just maximizing average WPM.
- **Technology Stack:**
  - **Monorepo:** Turborepo
  - **Package Manager:** NPM
  - **Language:** TypeScript
  - **Framework:** Vanilla (No React/Vue/Angular). Direct DOM manipulation.
  - **Build Tool:** Vite

---

## 1\. Monorepo layout (turborepo)

```
/ (repo root)
├─ apps/
│  ├─ frontend/                 # front-end app (Vite) — UI + engine bundle
├─ packages/
│  ├─ core/                # plain TS logic: patterns, bandit, stats, attribution
│  ├─ storage/             # IndexedDB wrapper + schema
│  ├─ generator/           # word selection & mapping logic (uses words.json)
│  ├─ ui/                  # small DOM utilities, components, CSS tokens
│  └─ types/               # shared TS types
├─ scripts/
├─ words.json              # frequency-sorted words (provided by you)
├─ package.json
└─ turbo.json
```

Notes:

- `apps/frontend` is a Vite app that imports `packages/*` to assemble the shipped client.
- Keep `core` framework-agnostic so it can be embedded into other hosts or packaged later.

---

## 2\. Packages and responsibilities

### packages/core

- **Pattern Definition:** Extract bigrams/trigrams and heuristic patterns (same-finger jumps).
- **Statistics:** Maintain EWMA mean latency, variance, sample count, and trend per pattern.
- **Bandit Logic:** Implement Thompson Sampling to select patterns based on uncertainty and weakness.
- **Attribution:** Map raw keystroke timestamps to specific patterns (IKSI logic).

### packages/storage

- **Persistence:** Lightweight IndexedDB wrapper (promises-based).
- **Schema:** `PatternStat`, `Session`, `Config`.
- **Utilities:** Export/import JSON for debugging/backup.

### packages/generator

- **Indexing:** Inverted index mapping `PatternID -> List<Word>`.
- **Selection:** "Priority-Weighted Interleaving" algorithm.
- **Flow Control:** Mixes "Target Words" (heavy on requested patterns) with "Flow Words" (common high-freq words) to prevent fatigue.
- **Strict Focus Mode (Implemented):** Forces 100% of words in a batch to target a single pattern if requested.

### packages/ui

- **Rendering:** `BatchRenderer` uses direct DOM manipulation.
- **Stats:** `StatsRenderer` displays WPM, Accuracy, and Bottlenecks.
- **Heatmap:** `HeatmapRenderer` visualizes pattern scores in a grid.
- **Visuals:** Subtle highlighting of target patterns _within_ words.
- **Layout:** Flexbox-based paragraph view with text wrapping (replacing horizontal scroll).

### apps/frontend

- **Glue Code:** Session lifecycle, keyboard listeners, engine integration.
- **Settings:** Adjust target latency, alpha/beta weights.
- **Main Entry:** `main.ts` initializes `TypingEngine`, `BatchRenderer`, and `StatsRenderer`.

---

## 3\. Data models (TypeScript interfaces)

```ts
// packages/types/index.ts
export type PatternId = string; // e.g. "th" or "ing" or "same_finger:jk"

export interface PatternStat {
  id: PatternId;
  n: number; // Total samples
  ewmaLatency: number; // in ms
  ewmaVariance: number;
  errorAlpha: number; // beta prior alpha (successes)
  errorBeta: number; // beta prior beta (failures)
  lastSeen: number; // timestamp
  trend: number; // short-term EWMA slope
}

export interface WordCandidate {
  word: string;
  // Specific patterns this word was chosen to target
  targetMatches: Array<{ pattern: PatternId; startIndex: number }>;
  isFlowWord: boolean; // True if this is a "palate cleanser" word
}

export interface EngineState {
  words: WordCandidate[];
  activeWordIndex: number;
  activeCharIndex: number;
  typedSoFar: string;
  isError: boolean;
  stats: {
    wpm: number;
    accuracy: number;
    sessionTime: number;
    topBottleneck: string;
  };
  isLoaded: boolean;
}
```

---

## 4\. IndexedDB schema (high-level)

- `patterns` store: key = `pattern_id`, value = `PatternStat`
- `sessions` store: session metadata and event logs (optional)
- `config` store: user settings

_Strategy:_ Make every write idempotent and batch writes with debounce (every N keystrokes or every 2s) to prevent I/O thrashing.

---

## 5\. Pattern extraction

Responsibilities:

- Build canonical set of patterns at install time.
- **Bigrams:** All adjacent character pairs in `words.json`.
- **Heuristics:** Map characters to fingers (QWERTY default). Identify "Same-Finger" sequences (e.g., `ed`, `dec`) and "Hand-Alternation" sequences.

APIs:

```ts
function extractPatternsForWord(word: string): PatternId[];
```

---

## 6\. Bandit + scoring logic (detailed)

### Posterior modeling

- **Latency:** Normal(EWMA, Variance). Keep `n` for confidence.
- **Error:** Beta(α, β). α = Valid execution, β = Error or High Latency (\> 3x user median).

### Thompson Sampling priority

For each pattern `p`:

1.  **Error Sample:** $S_{err} \sim Beta(\alpha, \beta)$ (Probability of failure).
2.  **Latency Sample:** $S_{lat} \sim N(\mu, \sigma^2)$ (Projected cost).
3.  **Gap:** $G = \max(0, S_{lat} - TargetLatency)$.
4.  **Recency Boost:** Increases linearly with `Time.now - lastSeen`.
5.  **Mastery Penalty:** If $S_{err} < 0.01$ and $\sigma^2$ is low, apply a heavy penalty to suppress mastered patterns.

### Final priority score

Sort by descending score:

```ts
score =
  w_unc * sampleStd + w_weak * Gap + w_time * TimeBoost - w_fatigue * Fatigue - MasteryPenalty;
```

---

## 7\. Word generator (The "Flow" Engine)

**Algorithm: Priority-Weighted Interleaving**
The generator must not just output dense, difficult words. It must maintain rhythm.

1.  **Input:** `TopPatterns` (from Bandit).
2.  **Ratio Check:** Target a 70/30 split between "Target Words" and "Flow Words".
    - **Flow Words:** Top 100 most common words (e.g., "the", "and", "is"). Used to reset hand position and confidence.
    - **Target Words:** Words containing the `TopPatterns`.
3.  **Search:** Query the Inverted Index for words containing the target patterns.
    - _Constraint:_ Avoid "Toxic Clusters" (words containing multiple high-uncertainty patterns at once) in early levels.
    - _Constraint:_ Variation. If target is `th`, ensure a mix of Prefix (`th`e), Infix (o`th`er), and Suffix (wi`th`).
4.  **Buffer:** Maintain a generic "History Buffer" (last 20 words) to prevent immediate repetition.

**Focus Mode Implementation:**
When strict focus is enabled (currently default):

- Select ONLY the #1 top-scoring pattern.
- Generator forces 100% of words in the batch to match this pattern.
- Fallbacks to flow words only occur if the database has no unique words left for that pattern.

---

## 8\. Measurement & Attribution (Critical)

**Metric:** Inter-Key Stroke Interval (IKSI).

**Rules:**

1.  **Startup Exception:** **Discard** the latency of the first keystroke of every word. This is "Reading Time," not "Motor Time."
2.  **Outlier Cap:** Discard any interval $> 2000ms$ (Distraction filter).
3.  **Strict Attribution:**
    - Event: `Key[n]` down.
    - Delta: `Time[n] - Time[n-1]`.
    - Attribution: This delta belongs **exclusively** to the bigram `(Char[n-1] -> Char[n])`.
    - _Do not average latency across the word._

**Handling Errors:**

- If `Backspace` is pressed, the previous pattern attempt is marked as `Failure` (increment Beta).
- Latency during correction is discarded to avoid polluting the stats.

---

## 9\. Persistence & performance

- Keep in-memory caches for `PatternStat` for hot patterns (top 200).
- Use `requestIdleCallback` to sync stats to IndexedDB.
- Keep memory footprint small (\< 5MB).

---

## 10\. Session lifecycle

1.  **Warm-up:** First 10 words are always "Flow Words" (common English) to calibrate baseline WPM.
2.  **Live Loop:**
    - Bandit requests patterns.
    - Generator yields stream.
    - UI renders.
    - User types.
    - Measurement updates stats.
    - Bandit refines belief.
3.  **Cooldown:** End session with a summary of "Most Improved Pattern."

---

## 11\. UI behaviour / UX rules

**The "Batch" View:**

- **Layout:** Paragraph view with text wrapping (replacing horizontal scroll).
- **Look-ahead:** Render fixed page size (10 words, matching engine batch). Refresh only when page is complete.
- **Target Highlighting:**
  - The UI must know _why_ a word was chosen.
  - Example: If "Father" was chosen for `th`, render `Fa`**`th`**`er`.
  - Use a subtle color shift (e.g., slate-blue) for the target bigram. Do not use distracting animations.
- **Feedback:**
  - **Live Stats Dashboard:** Displays WPM, Accuracy, and Top Bottleneck (Slowest Pattern) in real-time.
  - **Pattern Heatmap:** A grid displaying the score of all practiced patterns (filtered for n >= 3). Updates only on batch completion to prevent visual noise.
  - Discrete error flash (red character) on typo. Cursor does not block; user must correct or move on (configurable).

---

## 12\. TypeScript pseudocode: selection and update

```ts
// core/bandit.ts (simplified)
function selectTopPatterns(allStats: PatternStat[], k = 3) {
  const target = settings.targetLatency;
  return allStats
    .map((p) => {
      // 1. Thompson Sampling
      const sampleLatency = sampleNormal(p.ewmaLatency, effectiveVar(p));

      // 2. Weakness (Gap)
      const gap = Math.max(0, sampleLatency - target);

      // 3. Time Decay (Spaced Repetition)
      const timeBoost = timeBoostFunc(Date.now() - p.lastSeen);

      // 4. Mastery Detection
      // If error rate is negligible and we are confident, suppress it.
      const isMastered =
        p.errorAlpha / (p.errorAlpha + p.errorBeta) > 0.99 && p.ewmaVariance < LOW_VAR_THRESHOLD;
      const masteryPenalty = isMastered ? 1000 : 0;

      const score =
        settings.w_unc * Math.sqrt(p.ewmaVariance) +
        settings.w_weak * gap +
        settings.w_time * timeBoost -
        masteryPenalty;

      return { id: p.id, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.id);
}
```

---

## 13\. Testing strategy

- **Core:** Unit tests for `extractPatternsForWord` ensuring correct indices.
- **Attribution:** Integration test simulating a keystroke stream (including pauses and backspaces) and verifying the correct bigrams receive the `latency` and `error` updates.
- **Generator:** "Fuzz" test the generator to ensure it never returns `undefined` or endless loops, even with rare pattern requests.
  Use Vitest for all unit and integration tests to align with the Vite ecosystem. Configure jsdom for packages/storage and packages/ui to simulate browser environments.

---

## 14\. Metrics & telemetry (local-only)

- **Heatmap:** Visual keyboard map showing latency hotspots.
- **Top Bottlenecks:** List of "Worst 5 Patterns" impacting global speed.
- **Trend:** Graph showing Latency reduction over Time for specific targeted patterns.

---

## 15\. Implementation Status (As of Jan 2026)

### Completed

- [x] Monorepo Structure (Turbo + NPM)
- [x] `packages/types` (Shared interfaces)
- [x] `packages/core` (Bandit, Stats, Patterns)
- [x] `packages/storage` (IndexedDB persistence)
- [x] `packages/generator` (Inverted Index, Word Selection)
- [x] `packages/ui` (Vanilla DOM `BatchRenderer`, `StatsRenderer`)
- [x] `apps/frontend` (Vite, Main Loop, Keyboard Handling)
- [x] **Refactor:** Removal of React dependencies (Pure Vanilla TS).
- [x] **Feature:** Static Paragraph View (Text Wrapping, Page-based refresh).
- [x] **Feature:** Live Statistics (WPM, Accuracy, Bottleneck).
- [x] **Feature:** Strict Focus Mode (100% density for top pattern).
- [x] **Feature:** Visual Pattern Heatmap (Grid view, color-coded by score).
- [x] **Refactor:** Synchronized Batch Size (10 words) across Engine and UI.

### Pending / Next Steps

- [ ] User Settings UI (to toggle Focus Mode, set Target Latency).
- [ ] Unit Tests (Vitest) for Core logic.
- [ ] Offline PWA capability (Service Worker).

---

## 16\. Implementation constraints & best practices

- **Deterministic Seeds:** For testing the Bandit, allow seeding the random number generator.
- **Lazy Loading:** `words.json` might be large. Load it asynchronously.
- **Security:** Do not send keystrokes to any remote server.

---

## 17\. Acceptance criteria

- [x] App runs offline.
- [x] Bandit visibly adapts: consistently failing a pattern causes it to appear more often.
- [x] Generator never outputs nonsense (unless in explicit "Drill Mode").
- [x] "Startup Latency" (first char) is successfully ignored in stats.
- [x] UI displays words in batches (Page View).
