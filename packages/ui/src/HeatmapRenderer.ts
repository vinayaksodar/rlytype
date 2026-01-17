export interface HeatmapItem {
  id: string;
  mastery: number;
}

export class HeatmapRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Color Scale: Rose (0%) -> Yellow (50%) -> Emerald (100%)
  private getModernColor(mastery: number): string {
    const t = Math.max(0, Math.min(100, mastery)) / 100;

    const stops = [
      { t: 0.0, r: 244, g: 63, b: 94 }, // --accent-rose (Urgent / 0%)
      { t: 0.5, r: 234, g: 179, b: 8 }, // --accent-yellow (Mid / 50%)
      { t: 1.0, r: 16, g: 185, b: 129 }, // --accent-emerald (Mastered / 100%)
    ];

    let lower = stops[0];
    let upper = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].t && t <= stops[i + 1].t) {
        lower = stops[i];
        upper = stops[i + 1];
        break;
      }
    }

    const range = upper.t - lower.t;
    const factor = range === 0 ? 0 : (t - lower.t) / range;

    const r = Math.round(lower.r + (upper.r - lower.r) * factor);
    const g = Math.round(lower.g + (upper.g - lower.g) * factor);
    const b = Math.round(lower.b + (upper.b - lower.b) * factor);

    return `rgb(${r}, ${g}, ${b})`;
  }

  render(patterns: HeatmapItem[], mode: string = "Bigram") {
    this.container.innerHTML = "";
    this.container.className = "heatmap-container"; // Reset classes

    if (mode === "Unigram") {
      this.renderUnigram(patterns);
    } else if (mode === "Trigram") {
      this.renderTrigram(patterns);
    } else {
      this.renderBigram(patterns);
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

      if (charScores[char] !== undefined) {
        node.style.backgroundColor = this.getModernColor(charScores[char]);
        node.style.color = "#fff";
      }

      grid.appendChild(node);
    }
    this.container.appendChild(grid);
  }

  private renderTrigram(patterns: HeatmapItem[]) {
    this.container.classList.add("trigram-view");
    const chart = document.createElement("div");
    chart.classList.add("mastery-chart");

    // Buckets based on Mastery %
    const buckets = { "Needs Practice": 0, "Building Speed": 0, Mastered: 0 };

    patterns.forEach((p) => {
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

  private renderBigram(patterns: HeatmapItem[]) {
    // Satellite View Logic with Headers
    this.container.classList.add("bigram-view");
    const grid = document.createElement("div");
    grid.classList.add("satellite-grid");

    const patternMap = new Map<string, HeatmapItem>();
    patterns.forEach((p) => {
      patternMap.set(p.id, p);
    });

    const alphabet = "abcdefghijklmnopqrstuvwxyz";

    // 1. Corner
    const corner = document.createElement("div");
    corner.classList.add("satellite-header");
    grid.appendChild(corner);

    // 2. Top Headers
    for (const char of alphabet) {
      const header = document.createElement("div");
      header.classList.add("satellite-header");
      header.textContent = char.toUpperCase();
      grid.appendChild(header);
    }

    // 3. Rows
    for (let i = 0; i < alphabet.length; i++) {
      const char1 = alphabet[i];

      // Left Header
      const rowHeader = document.createElement("div");
      rowHeader.classList.add("satellite-header");
      rowHeader.textContent = char1.toUpperCase();
      grid.appendChild(rowHeader);

      // Cells
      for (let j = 0; j < alphabet.length; j++) {
        const char2 = alphabet[j];
        const bigram = char1 + char2;
        const p = patternMap.get(bigram);

        const el = document.createElement("div");
        el.classList.add("satellite-node");

        if (p) {
          el.title = `${bigram}: ${Math.round(p.mastery)}%`;
          el.style.backgroundColor = this.getModernColor(p.mastery);
        }

        grid.appendChild(el);
      }
    }
    this.container.appendChild(grid);
  }
}
