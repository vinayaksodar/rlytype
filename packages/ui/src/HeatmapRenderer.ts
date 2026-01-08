import { ScoredPattern } from "@rlytype/core";

export class HeatmapRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initStyles();
  }

  private initStyles() {
    this.container.style.display = "grid";
    this.container.style.gridTemplateColumns = "repeat(auto-fill, minmax(30px, 1fr))";
    this.container.style.gap = "2px";
    this.container.style.padding = "10px";
    this.container.style.background = "#0a0a0a";
    this.container.style.marginTop = "1rem";
    this.container.style.marginBottom = "1rem";
    this.container.style.borderTop = "1px solid #333";
    this.container.style.borderBottom = "1px solid #333";
    this.container.style.maxHeight = "150px"; // Limit height
    this.container.style.overflowY = "auto";
  }

  render(patterns: ScoredPattern[]) {
    this.container.innerHTML = "";

    if (patterns.length === 0) {
      this.container.textContent = "No patterns yet.";
      this.container.style.color = "#666";
      this.container.style.textAlign = "center";
      return;
    }

    // Find range for color normalization
    const scores = patterns.map((p) => p.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore || 1;

    patterns.forEach((p) => {
      const el = document.createElement("div");
      el.textContent = p.id;
      el.title = `Score: ${p.score.toFixed(1)}
Lat: ${Math.round(p.stat.ewmaLatency)}ms
Var: ${Math.round(p.stat.ewmaVariance)}`;
      el.style.fontSize = "9px";
      el.style.fontFamily = "monospace";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.height = "20px";
      el.style.cursor = "default";
      el.style.borderRadius = "2px";
      el.style.color = "#fff";
      el.style.overflow = "hidden";

      // Color Map
      // High Score (Worst) -> Red (0)
      // Low Score (Best) -> Blue (240) or Green (120)
      // Normalized 0..1 where 1 is MAX score (Worst) -> Red.
      // So: normalized = (score - min) / range
      // hue = (1 - normalized) * 120 (Green)

      const normalized = (p.score - minScore) / range;
      const hue = (1 - normalized) * 120;

      el.style.backgroundColor = `hsl(${hue}, 80%, 35%)`;

      this.container.appendChild(el);
    });
  }
}
