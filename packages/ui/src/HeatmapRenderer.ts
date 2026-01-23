export interface HeatmapItem {
  id: string;
  mastery: number;
}

export class HeatmapRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Color Scale: Rose (<80%) -> Yellow (90%) -> Emerald (100%)
  private getModernColor(mastery: number): string {
    const t = Math.max(0, Math.min(100, mastery));

    if (t < 80) {
      // Strictly Rose below 80%
      return "rgb(244, 63, 94)";
    } else if (t < 90) {
      // Rose -> Yellow (80% to 90%)
      const factor = (t - 80) / 10;
      const r = Math.round(244 + (234 - 244) * factor);
      const g = Math.round(63 + (179 - 63) * factor);
      const b = Math.round(94 + (8 - 94) * factor);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow -> Emerald (90% to 100%)
      const factor = (t - 90) / 10;
      const r = Math.round(234 + (16 - 234) * factor);
      const g = Math.round(179 + (185 - 179) * factor);
      const b = Math.round(8 + (129 - 8) * factor);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  render(patterns: HeatmapItem[], mode: string = "Bigram") {
    this.container.innerHTML = "";
    this.container.className = "heatmap-container"; // Reset classes

    if (mode === "Unigram") {
      this.renderUnigram(patterns);
    } else if (mode === "Trigram") {
      this.renderBuckets(patterns, "trigram-view");
    } else {
      this.renderBuckets(patterns, "bigram-view");
    }
  }

  private renderUnigram(patterns: HeatmapItem[]) {
    this.container.classList.add("unigram-view");
    const grid = document.createElement("div");
    grid.classList.add("unigram-grid");

    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const charScores: Record<string, number> = {};

    // Check if we have explicit unigram stats (length === 1)
    const explicitUnigrams = patterns.filter((p) => p.id.length === 1);

    if (explicitUnigrams.length > 0) {
      explicitUnigrams.forEach((p) => {
        charScores[p.id] = p.mastery;
      });
    } else {
      // Fallback: Aggregation not really needed if engine provides all patterns,
      // but keep for safety if patterns are mixed.
      // Actually engine provides what is requested.
      patterns.forEach((p) => {
        if (p.id.length === 1) charScores[p.id] = p.mastery;
      });
    }

    for (const char of alphabet) {
      const node = document.createElement("div");
      node.classList.add("unigram-node");
      node.textContent = char.toUpperCase();

      if (charScores[char] > 0) {
        node.style.backgroundColor = this.getModernColor(charScores[char]);
        node.style.color = "#fff";
      }

      grid.appendChild(node);
    }
    this.container.appendChild(grid);
  }

  private renderBuckets(patterns: HeatmapItem[], viewClass: string) {
    this.container.classList.add(viewClass);
    const chart = document.createElement("div");
    chart.classList.add("mastery-chart");

    // Buckets based on Mastery %
    const buckets = { "Needs Practice": 0, "Building Speed": 0, Mastered: 0 };

    // Filter out unseen/zero-mastery patterns to prevent "Sea of Red"
    const activePatterns = patterns.filter((p) => p.mastery > 0);

    activePatterns.forEach((p) => {
      if (p.mastery >= 95) buckets.Mastered++;
      else if (p.mastery >= 60) buckets["Building Speed"]++;
      else buckets["Needs Practice"]++;
    });

    const maxVal = Math.max(...Object.values(buckets));

    Object.entries(buckets).forEach(([label, count]) => {
      const group = document.createElement("div");
      group.classList.add("chart-bar-group");

      const bar = document.createElement("div");
      bar.classList.add("chart-bar");
      // Height relative to max bucket for visual scaling
      const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
      bar.style.height = `${Math.max(4, height)}%`; // Min height for visibility

      // Color coding - Using simplified brand scale
      if (label === "Needs Practice") bar.style.backgroundColor = "rgb(244, 63, 94)"; // --accent-rose
      if (label === "Building Speed") bar.style.backgroundColor = "rgb(234, 179, 8)"; // --accent-yellow
      if (label === "Mastered") bar.style.backgroundColor = "rgb(16, 185, 129)"; // --accent-emerald

      const lbl = document.createElement("span");
      lbl.classList.add("chart-label");
      lbl.textContent = label;

      const val = document.createElement("span");
      val.classList.add("chart-value");
      val.style.fontSize = "0.7rem";
      val.style.color = "var(--text-muted)";
      val.textContent = count.toString();

      group.appendChild(val);
      group.appendChild(bar);
      group.appendChild(lbl);
      chart.appendChild(group);
    });

    this.container.appendChild(chart);
  }
}
