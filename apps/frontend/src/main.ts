import { engine } from "./engine";
import { BatchRenderer, StatsRenderer, HeatmapRenderer } from "@rlytype/ui";
import { BATCH_SIZE } from "@rlytype/types";

const streamContainer = document.getElementById("stream-container")!;
const statsContainer = document.getElementById("stats-container")!;
const heatmapContainer = document.getElementById("heatmap-container")!;

const renderer = new BatchRenderer(streamContainer);
const statsRenderer = new StatsRenderer(statsContainer);
const heatmapRenderer = new HeatmapRenderer(heatmapContainer);

let lastPage = -1;

// Loading State
const statusDiv = document.createElement("div");
statusDiv.style.textAlign = "center";
statusDiv.style.marginTop = "2rem";
statusDiv.style.opacity = "0.5";
statusDiv.style.fontFamily = "sans-serif";
statusDiv.textContent = "Loading Dictionary...";
document.body.appendChild(statusDiv);

// Subscribe to engine updates
engine.subscribe((state) => {
  if (!state.isLoaded) {
    statusDiv.textContent = "Loading...";
    return;
  }

  statusDiv.textContent = "Start typing to begin. Data is saved locally.";
  renderer.render(state);
  statsRenderer.render({
    wpm: state.stats.wpm,
    accuracy: state.stats.accuracy,
    topBottleneck: state.stats.topBottleneck,
  });

  // Update heatmap only when a new batch (page) starts to avoid jarring updates
  const currentPage = Math.floor(state.activeWordIndex / BATCH_SIZE);
  if (currentPage !== lastPage) {
    heatmapRenderer.render(engine.getPatternHeatmapData());
    lastPage = currentPage;
  }
});

// Init Engine
engine.init();

// Global Key Listener
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1) {
    engine.handleKey(e.key);
  }
});
