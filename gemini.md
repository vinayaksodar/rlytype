# Typing Tutor — LLM Agent Context & Architecture

**Purpose:** This document describes the current architecture and implementation details of the client-side adaptive typing tutor engine. It serves as the primary context for the LLM agent to understand the codebase.

---

## 0. High-level Overview

- **Architecture:** Client-side only (Offline-first).
- **Data Source:** Language files in `apps/frontend/public/languages/*.json` (plus `languages.json` index). Word lists are cached in IndexedDB.
- **Learning Unit:** **Patterns** (Unigrams, Bigrams, Trigrams). Words are dynamically selected to target specific patterns.
- **Algorithm:**
  - **Stats:** Exponential Weighted Moving Average (EWMA) for latency tracking.
  - **Selection:** Weighted random selection based on pattern mastery (Reinforced Learning) or sequential weakness targeting.
- **Storage:** IndexedDB for persistent stats and user configuration.
- **Tech Stack:**
  - **Monorepo:** Turborepo
  - **Build:** Vite (Frontend), TSC (Packages)
  - **Language:** TypeScript
  - **UI Framework:** Vanilla DOM (No React/Vue) for maximum performance and zero overhead.

---

## 1. Monorepo Structure

```
/ (repo root)
├─ apps/
│  ├─ frontend/            # Vite app. Glues engine, UI, and storage together.
├─ packages/
│  ├─ core/                # Pure logic: Pattern extraction, Stat calculations (EWMA).
│  ├─ storage/             # IndexedDB wrapper (Patterns, Config).
│  ├─ generator/           # Inverted Index & Word Selection logic.
│  ├─ engine/              # The "Game Loop" & State Management (Platform agnostic).
│  ├─ ui/                  # Vanilla DOM Renderers (Batch, Stats, Heatmap).
│  └─ types/               # Shared TypeScript interfaces.
├─ apps/frontend/public/languages/  # Language word-list JSON assets.
```

---

## 2. Package Responsibilities

### `packages/core`

- **Pattern Extraction:** Breaks words into Unigrams, Bigrams, and Trigrams.
- **Mastery Logic:** Calculates mastery scores based on target WPM.
  - Mastery is purely **speed-based** (Latency vs Target Latency).
  - Capped at 100% (speed > target doesn't yield > 100% score).
- **Stat Updates:** Handles EWMA calculations for latency.

### `packages/storage`

- **IndexedDB Wrapper:**
  - **`patterns` store:** Stores `PatternStat` (attempts, ewmaLatency).
  - **`config` store:** Stores `UserConfig` (targetWpm, learningMode, currentStage, language).
  - **`languages` store:** Caches language word arrays by filename (`english_10k.json`, etc.).
- **Resilience:** Gracefully handles non-browser environments (SSR/Node) by doing nothing.

### `packages/generator`

- **Indexer:** Builds an inverted index (`Pattern -> Word[]`) on startup.
- **Generator:**
  - **`generateBatch(pattern)`:** Returns a list of words containing the specific target pattern.
  - Does _not_ currently implement complex flow/interleaving logic. It focuses purely on the target pattern.

### `packages/engine` (The Brain)

- **`TypingEngine`:** The central controller.
  - **State Management:** Holds current words, active index, and session stats (`EngineState`).
  - **Coordinator:** Orchestrates `generator`, `storage`, and `core` logic.
  - **Input Handling:** Processes strings (single or multi-char), calculates stats, and handles error tracking. Correctly handles `Backspace` to reset error states and move the cursor back.
  - **Attribution:** Maps keystrokes to specific patterns and updates stats in `core`.
  - **Dependency Injection:** Accepts raw word data in `init()` to remain environment-agnostic.

### `packages/ui`

- **`BatchRenderer`:** Renders the active word batch. Handles cursor, correct/incorrect states, and error highlighting.
- **`StatsRenderer`:** Simple dashboard for WPM, Accuracy, and Current Pattern.
- **`HeatmapRenderer`:** (Visual component) Displays grid of pattern mastery.

### `apps/frontend` (The "Face")

- **`main.ts`:** Entry point.
  - Loads `languages.json`, fetches selected language file, caches words in IndexedDB, and injects into `TypingEngine`.
  - **Language switching UX:**
    - Shows a loading indicator in the word stream while a different language is loading.
    - Disables the language selector during load.
    - Refocuses the hidden input after selection.
    - Guards against accidental language cycling when typing while the selector still has focus.
  - **Input Strategy:** Employs a **Hidden Input** element to capture text. This ensures robust support for IME, dead keys (accents), and mobile virtual keyboards.
  - **Event Logic:**
    - `input` event: Captures resolved characters (including composed ones like `í`).
    - `keydown` event: Captures functional keys like `Backspace` and `Space`.
    - `composition` events: Manages `isComposing` state to prevent premature engine updates.
  - Initializes `BatchRenderer` and `HeatmapRenderer`.
  - Manages UI event listeners (sidebar, settings, sliders).
  - Subscribes to engine state changes to update the DOM.

---

## 3. Core Algorithms

### Word Generation & Pattern Selection

The engine operates in **Batches** (default 10 words). For each batch:

1.  **Select Target Pattern:**
    - **Reinforced Mode:** Weighted random selection. Weaker patterns (higher latency) have higher weight.
    - **Sequential Mode:** Sorts patterns by mastery (ascending) and picks the weakest non-mastered pattern.
2.  **Generate Words:**
    - Queries the `Indexer` for words containing the target pattern.
    - Randomly selects words from that list to fill the batch.
3.  **Language Changes:**
    - Frontend reloads words for the selected language and re-initializes the engine.
    - Engine resets transient typing state (`activeCharIndex`, `typedSoFar`, `errorBuffer`, `isError`) on init/language reset to avoid stale error carryover.

### Latency Attribution

**Metric:** Inter-Key Stroke Interval (IKSI).

- **Events:** `input` (for characters) and `keydown` (for space).
- **Logic:**
  1.  **Skip First Char:** The first character of a word is "Reading Time", not "Motor Time". It is ignored.
  2.  **Outlier Filter:** Latencies > 2000ms are discarded (assumed distraction).
  3.  **Dead Key Handling:** Single dead-key strokes are ignored until they resolve into a character.
  4.  **Multi-Pattern Update:** A single keystroke updates multiple patterns:
      - **Unigram:** The character itself.
      - **Bigram:** The pair `(PrevChar + Char)`.
      - **Trigram:** The triplet `(PrevPrevChar + PrevChar + Char)`.

### Mastery Scoring

- **Target Latency:** Calculated from Target WPM.
  - `MS_PER_CHAR = 60000 / (TARGET_WPM * 5)`
- **Score:** `(TargetLatency / ActualEWMA) * 100`.
- **Threshold:** A score >= 98 is considered "Mastered".

---

## 4. Data Persistence

- **Database:** `rlytype_db` (Version 1)
- **Stores:**
  - `patterns`: Key path `id`. Stores performance history.
  - `config`: Key-value store for user settings.
- **Sync:** Stats are saved to IndexedDB immediately upon update (debouncing strategy may be added later).
- **Language Cache:** Fetched language files are persisted and loaded from IndexedDB when available.

---

## 5. Usage & Extension

- **Adding Features:** Logic should be placed in `packages/core` if pure, or `packages/engine` if stateful/orchestrational.
- **New Renderers:** Add to `packages/ui` and instantiate in `main.ts`.
- **Modifying Stats:** Update `packages/core/src/stats.ts` and ensure `types` package reflects changes.
