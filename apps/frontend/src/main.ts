import { inject } from "@vercel/analytics";
import { engine } from "./engine";
import { BatchRenderer, HeatmapRenderer } from "@rlytype/ui";
import { BATCH_SIZE, Stage, LearningMode } from "@rlytype/types";
import { calculateMasteryScore } from "@rlytype/core";

// Initialize Vercel Web Analytics
inject();

// --- DOM References ---
const sidebar = document.getElementById("sidebar")!;
const sidebarToggle = document.getElementById("sidebar-toggle")!;
const targetSlider = document.getElementById("target-slider") as HTMLInputElement;
const targetValueDisplay = document.getElementById("target-value")!;

const wordStreamEl = document.getElementById("word-stream")!;
const statsWpmEl = document.getElementById("stat-wpm")!;
const statsAccEl = document.getElementById("stat-acc")!;
const statsPatternEl = document.getElementById("stat-pattern")!;
const visualizerContainer = document.getElementById("visualizer-container")!;
const priorityListEl = document.getElementById("priority-list")!;

// Footer Toggle
const footerToggleBtn = document.getElementById("footer-toggle")!;
const footerEl = document.getElementById("adaptive-footer")!;

const modeItems = document.querySelectorAll(".mode-item");
const strategyOptions = document.querySelectorAll(".segmented-option");
const descReinforced = document.getElementById("desc-reinforced")!;
const descSequential = document.getElementById("desc-sequential")!;

const masteryPercentEl = document.getElementById("mastery-percent")!;
const masteryBarEl = document.getElementById("mastery-bar")!;

// --- Initialization ---

const formatPattern = (id: string) => id.replace("same_finger:", "");

// 1. Renderers
const renderer = new BatchRenderer(wordStreamEl);
// Re-use HeatmapRenderer for the Visualizer box
visualizerContainer.innerHTML = "";
const heatmapRenderer = new HeatmapRenderer(visualizerContainer);

// 2. UI State
let lastPage = -1;
let lastTargetWpm = -1;
let lastStage: Stage | null = null;
let targetWpm = 80; // Default

// Initialize UI with defaults
targetSlider.value = targetWpm.toString();
engine.setTargetWpm(targetWpm);

// --- Interaction Handlers ---

// Mode Selector (Unigram/Bigram/Trigram)
modeItems.forEach((item) => {
  item.addEventListener("click", () => {
    const label = item.querySelector(".mode-label")?.textContent?.toLowerCase();
    if (label) {
      engine.setStage(label as Stage);
    }
  });
});

// Sidebar Toggle
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

// Footer Toggle
footerToggleBtn.addEventListener("click", () => {
  footerEl.classList.toggle("collapsed");
  const svg = footerToggleBtn.querySelector("svg");
  if (svg) {
    if (footerEl.classList.contains("collapsed")) {
      svg.style.transform = "rotate(180deg)";
    } else {
      svg.style.transform = "rotate(0deg)";
    }
  }
});

// Strategy Selector (Reinforced/Sequential)
strategyOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const strategy = (option as HTMLElement).dataset.value as LearningMode;
    engine.setMode(strategy);
    updateMasteryQueue();
  });
});

// Target Slider
targetSlider.addEventListener("input", (e) => {
  const val = (e.target as HTMLInputElement).value;
  targetValueDisplay.textContent = val;
  targetWpm = parseInt(val, 10);
  engine.setTargetWpm(targetWpm);
});

// --- Engine Subscription ---

// Loading indicator
const loadingMsg = document.createElement("div");
loadingMsg.style.opacity = "0.5";
loadingMsg.textContent = "Loading Dictionary...";

engine.subscribe((state) => {
  if (!state.isLoaded) {
    if (wordStreamEl.innerHTML === "") wordStreamEl.appendChild(loadingMsg);
    return;
  }

  // 1. Render Word Stream
  renderer.render(state);

  // 2. Update Stats Pill
  const wpm = state.stats.wpm;
  statsWpmEl.textContent = wpm.toString();
  statsAccEl.textContent = state.stats.accuracy + "%";

  // Sync Slider (One-way binding from state to UI to respect loaded config)
  // Check if value differs to avoid loop (though input event drives the other way)
  if (parseInt(targetSlider.value, 10) !== state.meta.targetWpm) {
    targetSlider.value = state.meta.targetWpm.toString();
    targetValueDisplay.textContent = state.meta.targetWpm.toString();
    targetWpm = state.meta.targetWpm; // Sync local var
  }

  if (state.progression.isStageFinished) {
    statsPatternEl.textContent = "Stage Cleared";
    statsPatternEl.style.color = "var(--accent-emerald)";
    statsPatternEl.style.fontWeight = "bold";
  } else {
    statsPatternEl.textContent = formatPattern(state.stats.currentPattern || "--");
    statsPatternEl.style.color = ""; // Reset
    statsPatternEl.style.fontWeight = "";
  }

  // 3. Update Mastery Widget
  const currentStage = state.progression.currentStage;
  const mastery = state.progression.mastery[currentStage];
  masteryPercentEl.textContent = `${mastery}%`;
  masteryBarEl.style.width = `${mastery}%`;

  // 4. Update Mode Selectors (Locking & Active)
  modeItems.forEach((item) => {
    const label = item.querySelector(".mode-label")?.textContent?.toLowerCase() as Stage;
    if (!label) return;

    // Active State
    if (label === currentStage) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }

    // Locked State
    const isUnlocked = state.progression.isUnlocked[label];
    const el = item as HTMLElement;
    if (!isUnlocked) {
      el.classList.add("locked");
      el.style.cursor = "not-allowed";

      // Explicit Tooltip logic
      if (label === "bigram") {
        el.setAttribute("data-tooltip", "Unlock Bigrams by mastering 85% of Unigrams");
      } else if (label === "trigram") {
        el.setAttribute("data-tooltip", "Unlock Trigrams by mastering 85% of Bigrams");
      }
    } else {
      el.classList.remove("locked");
      el.style.cursor = "pointer";
      el.removeAttribute("data-tooltip");
    }
    // Remove inline opacity to let CSS handle partial dimming
    el.style.opacity = "";
  });

  // 5. Update Strategy UI
  strategyOptions.forEach((opt) => {
    const val = (opt as HTMLElement).dataset.value;
    if (val === state.progression.learningMode) {
      opt.classList.add("active");
      if (val === "reinforced") {
        descReinforced.style.display = "block";
        descSequential.style.display = "none";
      } else {
        descReinforced.style.display = "none";
        descSequential.style.display = "block";
      }
    } else {
      opt.classList.remove("active");
    }
  });

  // 6. Update Heatmap (Page-based to reduce jitter OR when target fluidity or stage changes)
  const currentPage = Math.floor(state.activeWordIndex / BATCH_SIZE);
  if (
    currentPage !== lastPage ||
    state.meta.targetWpm !== lastTargetWpm ||
    state.progression.currentStage !== lastStage
  ) {
    // Capitalize for renderer
    const modeCap = currentStage.charAt(0).toUpperCase() + currentStage.slice(1);
    heatmapRenderer.render(engine.getPatternHeatmapData(), modeCap);

    lastPage = currentPage;
    lastTargetWpm = state.meta.targetWpm;
    lastStage = state.progression.currentStage;

    // Update Mastery Queue
    updateMasteryQueue();
  }
});

// Mock Priority Queue Update
function updateMasteryQueue() {
  if (!priorityListEl) return;

  const currentStage =
    (document
      .querySelector(".mode-item.active .mode-label")
      ?.textContent?.toLowerCase() as Stage) || "unigram";

  priorityListEl.innerHTML = "";

  if (
    engine["state"].progression.isStageFinished &&
    currentStage === engine["state"].progression.currentStage
  ) {
    priorityListEl.innerHTML = `<li class="priority-item" style="justify-content:center; color:var(--text-muted); padding: 1rem; text-align:center;">

          <div>

            <div style="font-weight:600; color:var(--accent-emerald); margin-bottom:0.25rem;">Stage Cleared!</div>

            <div style="font-size:0.8rem;">Maintenance Mode Active</div>

          </div>

        </li>`;

    return;
  }

  const patterns = engine.getPatternHeatmapData();

  // Filter patterns by stage (rudimentary check on ID length)
  const relevantPatterns = patterns.filter((p) => {
    if (currentStage === "unigram") return p.id.length === 1;
    if (currentStage === "bigram") return p.id.length === 2 || p.id.startsWith("same_finger:");
    if (currentStage === "trigram") return p.id.length === 3;
    return false;
  });

  // 2. Map patterns to mastery values for sorting and rendering
  const targetLatency = 60000 / (targetWpm * 5);
  const patternMastery = relevantPatterns.map((p) => {
    const mastery = calculateMasteryScore(p.stat, targetLatency);
    // Recalculate accuracy just for the sorting tie-breaker or display if needed,
    // but the mastery score itself is now standardized.
    // The UI uses 'accuracy' for nothing? No, it's not used in the HTML template below.
    // Actually, check the HTML template... it only uses 'p.mastery'.
    // Wait, the template uses 'p.id' and 'p.mastery'.
    // The previous code also returned 'accuracy' but it wasn't used in the template string I see in the context?
    // Let's verify. The template is:
    /*
        <span class="p-pattern">${formatPattern(p.id)}</span>
        <div class="p-stats">
          <div class="p-bar-bg"><div class="p-bar-fill" style="width: ${p.mastery}%"></div></div>
          <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); min-width: 4ch; text-align: right;">${p.mastery}%</span>
        </div>
    */
    // So 'accuracy' is unused.
    return { ...p, mastery };
  });

  // 3. Sort by Mastery Ascending (Worst mastery at top)
  patternMastery.sort((a, b) => a.mastery - b.mastery);

  // If in Sequential Mode, only show the one being drilled (Top 1)
  const limit = engine["state"].progression.learningMode === "sequential" ? 1 : 8;

  patternMastery.slice(0, limit).forEach((p) => {
    const li = document.createElement("li");
    li.classList.add("priority-item");

    li.innerHTML = `
        <span class="p-pattern">${formatPattern(p.id)}</span>
        <div class="p-stats">
          <div class="p-bar-bg"><div class="p-bar-fill" style="width: ${p.mastery}%"></div></div>
          <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); min-width: 4ch; text-align: right;">${p.mastery}%</span>
        </div>
    `;

    priorityListEl.appendChild(li);
  });
}

// --- Start Engine ---
engine.init();

// --- Global Key Listener ---
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1 || e.key === "Backspace") {
    if (e.key === " ") e.preventDefault();
    engine.handleKey(e.key);
  }
});
