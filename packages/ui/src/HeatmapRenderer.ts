import { ScoredPattern } from "@rlytype/core";

export class HeatmapRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initStyles();
  }

  private initStyles() {
    this.container.style.position = "relative";
    this.container.style.padding = "10px";
    this.container.style.background = "#0a0a0a";
    this.container.style.marginTop = "1rem";
    this.container.style.marginBottom = "1rem";
    this.container.style.borderTop = "1px solid #333";
    this.container.style.borderBottom = "1px solid #333";
    this.container.style.overflowY = "visible";
    this.container.style.maxWidth = "500px";
    this.container.style.width = "100%";
    this.container.style.marginLeft = "auto";
    this.container.style.marginRight = "auto";
  }

  render(patterns: ScoredPattern[]) {
    this.container.innerHTML = "";

    // Create the grid wrapper
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(26, 1fr)";
    grid.style.gridTemplateRows = "repeat(26, 1fr)";
    grid.style.gap = "1px";
    grid.style.aspectRatio = "1 / 1";

    // Map for quick lookup
    const patternMap = new Map<string, ScoredPattern>();
    patterns.forEach((p) => {
      patternMap.set(p.id, p);
    });

    const alphabet = "abcdefghijklmnopqrstuvwxyz";

    for (let i = 0; i < alphabet.length; i++) {
      for (let j = 0; j < alphabet.length; j++) {
        const char1 = alphabet[i];
        const char2 = alphabet[j];
        const bigram = char1 + char2;
        const p = patternMap.get(bigram);

        const el = document.createElement("div");
        el.textContent = bigram;
        el.style.fontSize = "12px"; // Slightly smaller font to fit square cells
        el.style.fontFamily = "monospace";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.cursor = "default";
        el.style.color = "#444"; // Default dim color

        if (p) {
          el.title = `Score: ${p.score.toFixed(1)}
Lat: ${Math.round(p.stat.ewmaLatency)}ms
Var: ${Math.round(p.stat.ewmaVariance)}`;

          el.style.color = "#fff"; // Visible text for active

          // Color Map logic (Absolute Scale)
          const clampedScore = Math.max(0, Math.min(300, p.score));
          const normalized = clampedScore / 300;
          const hue = (1 - normalized) * 120;
          el.style.backgroundColor = `hsl(${hue}, 80%, 35%)`;
        }

        grid.appendChild(el);
      }
    }

    // Handle empty state (blurred background + message)
    if (patterns.length === 0) {
      grid.style.filter = "blur(4px)";
      grid.style.opacity = "0.4";
      grid.style.pointerEvents = "none"; // Disable tooltips on empty state

      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "10";

      const msg = document.createElement("div");
      msg.textContent = "type to generate heatmap of patterns(not enough data)";
      msg.style.color = "#eee";
      msg.style.fontSize = "0.9rem";
      msg.style.fontFamily = "sans-serif";
      msg.style.background = "rgba(0, 0, 0, 0.6)";
      msg.style.padding = "8px 16px";
      msg.style.borderRadius = "4px";

      overlay.appendChild(msg);
      this.container.appendChild(overlay);
    }

    this.container.appendChild(grid);
  }
}
