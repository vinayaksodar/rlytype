import { ScoredPattern } from "@rlytype/core";

export class HeatmapRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initStyles();
  }

  private initStyles() {
    this.container.style.display = "grid";
    this.container.style.gridTemplateColumns = "repeat(26, 1fr)";
    this.container.style.gap = "1px";
    this.container.style.padding = "10px";
    this.container.style.background = "#0a0a0a";
    this.container.style.marginTop = "1rem";
    this.container.style.marginBottom = "1rem";
    this.container.style.borderTop = "1px solid #333";
    this.container.style.borderBottom = "1px solid #333";
    // this.container.style.maxHeight = "150px"; // Remove height limit to show full grid
    this.container.style.overflowY = "visible";
  }

  render(patterns: ScoredPattern[]) {
    this.container.innerHTML = "";

    if (patterns.length === 0) {
      this.container.style.display = "flex";
      this.container.style.alignItems = "center";
      this.container.style.justifyContent = "center";
      this.container.style.minHeight = "100px";

      const msg = document.createElement("div");
      msg.textContent = "type to generate heatmap of patterns(not enough data)";
      msg.style.color = "#555";
      msg.style.fontSize = "0.9rem";
      msg.style.fontFamily = "sans-serif";
      this.container.appendChild(msg);
      return;
    }

    this.container.style.display = "grid";
    this.container.style.minHeight = ""; // Reset

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
        el.style.fontSize = "10px";
        el.style.fontFamily = "monospace";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.height = "20px";
        el.style.cursor = "default";
        el.style.color = "#444"; // Default dim color
        el.style.backgroundColor = "#111"; // Default dim bg

        if (p) {
          el.title = `Score: ${p.score.toFixed(1)}
Lat: ${Math.round(p.stat.ewmaLatency)}ms
Var: ${Math.round(p.stat.ewmaVariance)}`;

          el.style.color = "#fff"; // Visible text for active

          // Color Map logic (Absolute Scale)
          // Score 0 -> Green (120)
          // Score 300 -> Red (0)
          const clampedScore = Math.max(0, Math.min(300, p.score));
          const normalized = clampedScore / 300;
          const hue = (1 - normalized) * 120;
          el.style.backgroundColor = `hsl(${hue}, 80%, 35%)`;
        }

        this.container.appendChild(el);
      }
    }
  }
}
