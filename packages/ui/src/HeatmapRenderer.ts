import { ScoredPattern } from "@rlytype/core";

export class HeatmapRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(patterns: ScoredPattern[], mode: string = "Bigram") {
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

  private renderUnigram(patterns: ScoredPattern[]) {
    this.container.classList.add("unigram-view");
    const grid = document.createElement("div");
    grid.classList.add("unigram-grid");

    const alphabet = "abcdefghijklmnopqrstuvwxyz";

    // Simple aggregation: score of 'a' = avg score of patterns starting with 'a'
    const charScores: Record<string, { total: number; count: number }> = {};
    patterns.forEach((p) => {
      const char = p.id[0];
      if (!charScores[char]) charScores[char] = { total: 0, count: 0 };
      charScores[char].total += p.score;
      charScores[char].count++;
    });

    for (const char of alphabet) {
      const node = document.createElement("div");
      node.classList.add("unigram-node");
      node.textContent = char.toUpperCase();

      const data = charScores[char];
      if (data && data.count > 0) {
        const avgScore = data.total / data.count;
        const clampedScore = Math.max(0, Math.min(300, avgScore));
        const normalized = clampedScore / 300;
        const hue = (1 - normalized) * 120;
        node.style.backgroundColor = `hsl(${hue}, 80%, 35%)`;
        node.style.color = "#fff";
      }

      grid.appendChild(node);
    }
    this.container.appendChild(grid);
  }

  private renderTrigram(patterns: ScoredPattern[]) {
    this.container.classList.add("trigram-view");
    const chart = document.createElement("div");
    chart.classList.add("mastery-chart");

    // Buckets: Volatile (<50), Uncertain (50-100), Stable (100-200), Mastered (>200)
    // Note: Score metric might differ, using heuristic ranges for now.
    const buckets = { Volatile: 0, Uncertain: 0, Stable: 0, Mastered: 0 };

    patterns.forEach((p) => {
      if (p.score < 0)
        buckets.Mastered++; // Mastery penalty sends score negative
      else if (p.score > 200) buckets.Volatile++;
      else if (p.score > 100) buckets.Uncertain++;
      else buckets.Stable++;
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

      // Color coding
      if (label === "Volatile") bar.style.backgroundColor = "var(--accent-rose)";
      if (label === "Uncertain") bar.style.backgroundColor = "var(--accent-yellow)"; // Use variable if available or blue
      if (label === "Stable") bar.style.backgroundColor = "var(--accent-blue)";
      if (label === "Mastered") bar.style.backgroundColor = "var(--accent-emerald)";

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

  private renderBigram(patterns: ScoredPattern[]) {
    // Satellite View Logic with Headers
    this.container.classList.add("bigram-view");
    const grid = document.createElement("div");
    grid.classList.add("satellite-grid");

    // Explicitly set grid template for headers + 26 columns
    // We can do this in CSS, but dynamic columns are easier here if we want flexibility.
    // However, CSS is cleaner. Let's rely on CSS updates for the grid layout
    // (grid-template-columns: 14px repeat(26, 1fr)).

    const patternMap = new Map<string, ScoredPattern>();
    patterns.forEach((p) => {
      patternMap.set(p.id, p);
    });

    const alphabet = "abcdefghijklmnopqrstuvwxyz";

    // 1. Corner
    const corner = document.createElement("div");
    corner.classList.add("satellite-header"); // Re-use or new class
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
          el.title = `${bigram}: ${Math.round(p.score)}`;
          const clampedScore = Math.max(0, Math.min(300, p.score));
          const normalized = clampedScore / 300;
          const hue = (1 - normalized) * 120;
          el.style.backgroundColor = `hsl(${hue}, 80%, 35%)`;
        }

        grid.appendChild(el);
      }
    }
    this.container.appendChild(grid);
  }
}
