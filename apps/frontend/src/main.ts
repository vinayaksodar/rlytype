import { inject } from "@vercel/analytics";
import { TypingEngine } from "@rlytype/engine";
import { BatchRenderer, HeatmapRenderer } from "@rlytype/ui";
import { Stage, LearningMode } from "@rlytype/types";

// Initialize Vercel Web Analytics
inject();

// --- DOM References ---
const sidebar = document.getElementById("sidebar")!;
const sidebarToggle = document.getElementById("sidebar-toggle")!;
const targetSlider = document.getElementById("target-slider") as HTMLInputElement;
const targetValueDisplay = document.getElementById("target-value")!;

const wordStreamEl = document.getElementById("word-stream")!;
const statsWpmEl = document.getElementById("stat-wpm")!;
const statsPatternEl = document.getElementById("stat-pattern")!;
const statsAccEl = document.getElementById("stat-acc")!;

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

// 1. Instantiate Engine
const engine = new TypingEngine();

// 2. Renderers
const renderer = new BatchRenderer(wordStreamEl);
// Re-use HeatmapRenderer for the Visualizer box
visualizerContainer.innerHTML = "";
const heatmapRenderer = new HeatmapRenderer(visualizerContainer);

// 3. UI State
let lastTargetWpm = -1;
let lastStage: Stage | null = null;
let lastWordIndex = -1;
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
    engine.setLearningMode(strategy);
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
  statsPatternEl.textContent = state.stats.currentPattern || "--";
  statsAccEl.textContent = state.stats.accuracy + "%";

  // Sync Slider (One-way binding from state to UI to respect loaded config)
  if (parseInt(targetSlider.value, 10) !== state.meta.targetWpm) {
    targetSlider.value = state.meta.targetWpm.toString();
    targetValueDisplay.textContent = state.meta.targetWpm.toString();
    targetWpm = state.meta.targetWpm; // Sync local var
  }

  // 3. Update Mastery Widget
  const currentStage = state.meta.currentStage;
  const mastery = state.stats.stageMastery[currentStage];
  masteryPercentEl.textContent = `${mastery}%`;
  masteryBarEl.style.width = `${mastery}%`;

  // 5. Update Strategy UI
  strategyOptions.forEach((opt) => {
    const val = (opt as HTMLElement).dataset.value;
    if (val === state.meta.learningMode) {
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

  // Highlight active stage in sidebar
  modeItems.forEach((item) => {
    const label = item.querySelector(".mode-label")?.textContent?.toLowerCase();
    if (label === currentStage) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // 6. Update Heatmap (When a new batch starts OR when target fluidity or stage changes)
  if (
    (state.activeWordIndex === 0 && lastWordIndex !== 0) ||
    state.meta.targetWpm !== lastTargetWpm ||
    state.meta.currentStage !== lastStage
  ) {
    // Capitalize for renderer
    const modeCap = currentStage.charAt(0).toUpperCase() + currentStage.slice(1);

    // Engine now returns exactly what we need
    const heatmapData = engine.getPatternHeatmapData();
    heatmapRenderer.render(heatmapData, modeCap);

    lastTargetWpm = state.meta.targetWpm;
    lastStage = state.meta.currentStage;

    // Update Mastery Queue
    updateMasteryQueue();
  }

  // Update tracking for next render
  lastWordIndex = state.activeWordIndex;
});

// Mastery Queue Update
function updateMasteryQueue() {
  if (!priorityListEl) return;

  // Get data directly from engine
  const patternMastery = engine.getPatternHeatmapData();

  // 3. Sort by Mastery Ascending (Worst mastery at top)
  // Logic: Push 0-attempt patterns to the bottom so we focus on active bottlenecks.
  patternMastery.sort((a, b) => {
    const aAttempts = a.stat.attempts;
    const bAttempts = b.stat.attempts;

    if (aAttempts > 0 && bAttempts === 0) return -1;
    if (aAttempts === 0 && bAttempts > 0) return 1;

    // Both have attempts or both are 0: sort by mastery
    return a.mastery - b.mastery;
  });

  // If in Sequential Mode, only show the one being drilled (Top 1)
  // Accessing private state is hacky in TS but common in JS.
  // Let's use the UI state we have via subscription or DOM.
  // Actually, we can check the active class in DOM or just assume the queue logic.
  // Better: engine exposes state via subscribe. But here we are outside.
  // We can just check the active strategy element.
  const isSequential =
    document.querySelector(".segmented-option.active")?.getAttribute("data-value") === "sequential";
  const limit = isSequential ? 1 : patternMastery.length;

  priorityListEl.innerHTML = "";

  patternMastery.slice(0, limit).forEach((p) => {
    const li = document.createElement("li");
    li.classList.add("priority-item");

    const masteryDisplay = p.stat.attempts === 0 ? "--" : `${p.mastery}%`;

    li.innerHTML = `
        <span class="p-pattern">${p.id}</span>
        <div class="p-stats">
          <div class="p-bar-bg"><div class="p-bar-fill" style="width: ${p.mastery}%"></div></div>
          <div style="display: flex; align-items: center;">
            <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); min-width: 4ch; text-align: right;">${masteryDisplay}</span>
          </div>
        </div>
    `;

    priorityListEl.appendChild(li);
  });
}

// --- Start Engine ---
// Fetch words and init
fetch("/words.json")
  .then((res) => res.json())
  .then((data) => {
    engine.init(data.words);
  });

// --- Global Key Listener ---
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1 || e.key === "Backspace") {
    if (e.key === " ") e.preventDefault();
    engine.handleKey(e.key);
  }
});
