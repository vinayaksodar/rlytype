# RlyType

An adaptive, client-side typing tutor that focuses on mastering **keyboard patterns** (bigrams, trigrams, and finger movements) rather than just words.

## 🎯 Project Goal

Most typing tutors focus on words or random characters. **RlyType** treats words merely as "delivery vehicles" for specific motor-skill patterns. By identifying exactly which key transitions (e.g., `th`, `ing`, `ed`) are slowing you down, the engine adapts in real-time to drill your weaknesses until they become muscle memory.

## 🚀 How it Works

### 1. Pattern-Based Learning

Instead of tracking WPM per word, RlyType tracks performance (latency and error rate) for every character transition (bigram). It maps these to:

- **Physical Layout:** Understanding same-finger jumps or hand-alternation.
- **Statistical Frequency:** Prioritizing common English patterns.

### 2. The Bandit Algorithm (Thompson Sampling)

The engine uses a Thompson-Sampling bandit to decide which patterns to show you next. Each pattern is assigned a priority score based on several weighted factors:

- **Uncertainty (Exploration):** Favors patterns with high variance or few samples. The system "explores" these to gain confidence in your true skill level.
- **Weakness (The Gap):** Calculates the gap between your sampled latency and your **Auto-Tuned Target**. Slower patterns get higher priority.
- **Accuracy (Error Rate):** Patterns with frequent typos are heavily penalized and prioritized for drilling, ensuring speed doesn't come at the cost of precision.
- **Biomechanical Leniancy:** The engine applies a 15% latency discount to "Same-Finger Jumps" (e.g., `ed`, `lo`), acknowledging that these are naturally slower than hand-alternation patterns.
- **Recency (Spaced Repetition):** Applies a "Time Boost" to patterns you haven't seen recently, preventing muscle-memory decay.
- **Mastery Suppression:** Once a pattern demonstrates consistent high speed and < 2% error rate over many samples, it is assigned a "Mastery Penalty" to move it out of the active drill queue.

### 3. Auto-Tuning Baseline

RlyType doesn't use a fixed target speed. It constantly calculates your **Global Average Latency** and sets your "Target" to be ~5% faster than your current average. This ensures the challenge scales perfectly with your skill level.

### 4. Interactive Heatmap

A real-time heatmap visualizes your performance across the entire alphabet.

- **Green:** Patterns where you are at or above your target speed.
- **Red:** Bottlenecks that are currently being targeted by the generator.

### 5. Batch-based Pagination UI

To maintain focus and provide clear milestones, the UI renders words in fixed, discrete pages (batches).

- **Focus:** You see one page of words at a time.
- **Milestones:** Completing a batch triggers a refresh to the next set of words, giving a sense of accomplishment.
- **Progress Tracking:** Stats and the heatmap are updated at these natural break points.

## 🛠 Tech Stack

- **Monorepo:** Turborepo
- **Frontend:** Vite + TypeScript
- **Engine Logic:** Framework-agnostic TypeScript packages (`@rlytype/core`, `@rlytype/generator`)
- **Storage:** IndexedDB (all data stays locally on your machine)
- **Styling:** Plain CSS with a focus on high-contrast, low-latency rendering.

## 🏃 Running Locally

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start development server:**

   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

## 📄 License

MIT
