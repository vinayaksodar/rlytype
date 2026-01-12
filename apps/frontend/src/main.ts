import { inject } from "@vercel/analytics";
import { engine } from "./engine";
import { BatchRenderer, HeatmapRenderer } from "@rlytype/ui";
import { BATCH_SIZE } from "@rlytype/types";

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

// 1. Renderers
const renderer = new BatchRenderer(wordStreamEl);
// Re-use HeatmapRenderer for the Visualizer box
visualizerContainer.innerHTML = "";
const heatmapRenderer = new HeatmapRenderer(visualizerContainer);

// 2. UI State
let lastPage = -1;
let targetWpm = 80; // Default
let currentMode = "Unigram";

// Initialize UI with defaults
targetSlider.value = targetWpm.toString();
updateMasteryDisplay();

// --- Interaction Handlers ---

// Mode Selector
modeItems.forEach((item) => {
  item.addEventListener("click", () => {
    // 1. UI Update
    modeItems.forEach((el) => el.classList.remove("active"));
    item.classList.add("active");

    // 2. State Update
    const label = item.querySelector(".mode-label")?.textContent;
    if (label) {
      currentMode = label;
      console.log("Mode switched to:", currentMode);
      updateMasteryDisplay();

      // Trigger Visualizer update
      heatmapRenderer.render(engine.getPatternHeatmapData(), currentMode);
    }
  });
});

function updateMasteryDisplay() {
  // Label is static "Mastery" now
  // Mock data for now
  const percent = 0;
  masteryPercentEl.textContent = `${percent}%`;
  masteryBarEl.style.width = `${percent}%`;
}

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

// Sidebar Toggle
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

// Strategy Selector
strategyOptions.forEach((option) => {
  option.addEventListener("click", () => {
    strategyOptions.forEach((el) => el.classList.remove("active"));
    option.classList.add("active");

    const strategy = (option as HTMLElement).dataset.value;
    if (strategy === "reinforced") {
      descReinforced.style.display = "block";
      descSequential.style.display = "none";
    } else {
      descReinforced.style.display = "none";
      descSequential.style.display = "block";
    }
    console.log("Strategy switched to:", strategy);
  });
});

// Target Slider
targetSlider.addEventListener("input", (e) => {
  const val = (e.target as HTMLInputElement).value;
  targetValueDisplay.textContent = val;
  targetWpm = parseInt(val, 10);
  // TODO: Update engine config if exposed
});

// --- Engine Subscription ---

// Loading indicator (temp overlay or just text in stream)
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
  statsPatternEl.textContent = state.stats.currentPattern || "--";

  // 3. Update Heatmap (Page-based to reduce jitter)
  const currentPage = Math.floor(state.activeWordIndex / BATCH_SIZE);
  if (currentPage !== lastPage) {
    // Standard Satellite View (respecting mode)
    heatmapRenderer.render(engine.getPatternHeatmapData(), currentMode);

    lastPage = currentPage;

    // Update Priority Queue
    updatePriorityQueue();
  }
});

// Mock Priority Queue Update (until engine exposes it)
function updatePriorityQueue() {
  if (!priorityListEl) return;

  // Get all patterns sorted by score (descending)
  const patterns = engine.getPatternHeatmapData();
  // patterns are already sorted by getPatternScores

  priorityListEl.innerHTML = "";

  patterns.forEach((p) => {
    const li = document.createElement("li");
    li.classList.add("priority-item");

    // Determine Status
    let statusClass = "";
    let statusText = "";
    const errorRate = p.stat.errorBeta / (p.stat.errorAlpha + p.stat.errorBeta);

    if (errorRate > 0.1) {
      statusClass = "bottleneck";
      statusText = "Bottleneck";
    } else if (p.score > 50) {
      statusClass = "drilling";
      statusText = "Drilling";
    } else if (p.score < 0) {
      statusClass = "mastered";
      statusText = "Mastered";
    } else {
      // Neutral/Queued - maybe no badge or just text
      statusText = "Queued";
    }

    if (statusClass) li.classList.add(statusClass);

    // Fluidity Calculation: Target / Current
    // We don't have direct access to config.targetLatency here easily unless we export it or infer it.
    // Let's assume ~200ms or infer from score?
    // Actually, let's use a rough heuristic: 100ms is master speed (100%), 500ms is 20%.
    // Better: 200ms / p.stat.ewmaLatency.
    // If ewma is 200, fluidity is 100%. If 400, 50%.
    const fluidity = Math.min(100, Math.round((200 / Math.max(1, p.stat.ewmaLatency)) * 100));

    li.innerHTML = `
        <span class="p-pattern">${p.id}</span>
        <div class="p-stats">
          <div class="p-bar-bg"><div class="p-bar-fill" style="width: ${fluidity}%"></div></div>
          ${statusText !== "Queued" ? `<span class="status-badge ${statusClass}">${statusText}</span>` : `<span style="font-size:0.65rem; color:#666; text-transform:uppercase; font-weight:600;">${statusText}</span>`}
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
    // Prevent default scrolling for Space

    if (e.key === " ") e.preventDefault();

    engine.handleKey(e.key);
  }
});
